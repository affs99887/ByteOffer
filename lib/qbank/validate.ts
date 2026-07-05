// lib/qbank/validate.ts
// §5 two-phase validation. Pure, dependency-free, NEVER throws to the caller.
// Uses `any` internally for raw parsing; public surface is strongly typed.

import { deriveId } from "./id";
import { migrate, SchemaTooNewError } from "./migrate";
import { FORMAT_ID, SCHEMA_VERSION } from "./types";
import type { Accept, Media, QuestionRecord, QuestionType } from "./types";

export interface RecordIssue { level: "error" | "warning"; path: string; code: string; msg: string }
export interface RecordReport {
  index: number;
  id: string | null;
  ok: boolean;
  issues: RecordIssue[];
  record?: QuestionRecord;
}
export interface ImportReport {
  fileOk: boolean;
  envelopeIssues: RecordIssue[];
  records: RecordReport[];
  accepted: QuestionRecord[]; // zero-error records (warnings ok)
  counts: { total: number; accepted: number; rejected: number; warned: number };
}

const QUESTION_TYPES: ReadonlySet<string> = new Set<QuestionType>([
  "single_choice", "multiple_choice", "true_false",
  "fill_blank", "numeric", "code_output",
  "ordering", "matching",
  "short_answer", "essay", "code_writing",
  "scenario", "cloze",
]);
const DIFFICULTIES: ReadonlySet<string> = new Set(["easy", "medium", "hard"]);
const OPTION_KEYS: ReadonlySet<string> = new Set(["A", "B", "C", "D", "E", "F", "G", "H"]);

const MEDIA_MAX_BYTES = 512 * 1024;       // per-payload strip threshold (§3.4)
const ENVELOPE_MAX_BYTES = 3.5 * 1024 * 1024; // whole-envelope hard cap (§3.4)

const isObject = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Approx byte length of a data: URI's payload (base64 → *3/4 of the b64 portion). */
function dataUriBytes(src: string): number {
  const comma = src.indexOf(",");
  const payload = comma >= 0 ? src.slice(comma + 1) : src;
  // base64 → bytes ≈ len * 3/4 (good enough for the budget check).
  return Math.floor((payload.length * 3) / 4);
}

/** Collector that tracks whether any error was recorded. */
class Issues {
  list: RecordIssue[] = [];
  hasError = false;
  add(level: "error" | "warning", path: string, code: string, msg: string): void {
    this.list.push({ level, path, code, msg });
    if (level === "error") this.hasError = true;
  }
}

function stemToString(stem: any): string {
  if (typeof stem === "string") return stem;
  if (isObject(stem)) {
    const first = Object.values(stem)[0];
    return typeof first === "string" ? first : "";
  }
  return "";
}

/** Count blank markers in a stem: each maximal run of 6+ underscores = one blank. */
function countBlankMarkers(stem: string): number {
  const m = stem.match(/_{6,}/g);
  return m ? m.length : 0;
}

/**
 * Validate + normalize media in place on `rec`. Returns the byte count of surviving media.
 * Non data:image/* → error. Oversized single payload → warning + strip.
 */
function checkMedia(rec: any, iss: Issues, pathBase: string): number {
  if (rec.media === undefined) return 0;
  if (!Array.isArray(rec.media)) {
    iss.add("warning", `${pathBase}.media`, "media_not_array", "media 不是数组，已忽略");
    delete rec.media;
    return 0;
  }
  const surviving: Media[] = [];
  let bytes = 0;
  rec.media.forEach((m: any, i: number) => {
    const p = `${pathBase}.media[${i}]`;
    if (!isObject(m) || typeof m.src !== "string") {
      iss.add("error", p, "bad_media", "media 项缺少 src");
      return;
    }
    if (m.kind === "image") {
      if (!/^data:image\//.test(m.src)) {
        iss.add("error", p, "bad_media_uri", "图片必须是 data:image/* URI（禁外链/防 XSS）");
        return;
      }
      const b = dataUriBytes(m.src);
      if (b > MEDIA_MAX_BYTES) {
        iss.add("warning", p, "media_too_large", "图片超过 512KB，已剥离（题目仍导入）");
        return; // strip this media entry
      }
      bytes += b;
    }
    surviving.push(m as Media);
  });
  if (surviving.length > 0) rec.media = surviving;
  else delete rec.media;
  return bytes;
}

/** Validate the accept[] array of a blank; drops bad regex, flags empties. Returns kept count. */
function checkAccepts(accepts: any, iss: Issues, path: string): number {
  if (!Array.isArray(accepts) || accepts.length === 0) {
    iss.add("error", path, "empty_accept", "该空的 accept 为空");
    return 0;
  }
  let kept = 0;
  const keep: Accept[] = [];
  accepts.forEach((a: any, i: number) => {
    if (isObject(a) && typeof a.text === "string") {
      keep.push({ text: a.text });
      kept++;
    } else if (isObject(a) && typeof a.regex === "string") {
      try {
        // Compile-check the regex at import time.
        // eslint-disable-next-line no-new
        new RegExp(a.regex, typeof a.flags === "string" ? a.flags : undefined);
        keep.push(typeof a.flags === "string" ? { regex: a.regex, flags: a.flags } : { regex: a.regex });
        kept++;
      } catch {
        iss.add("warning", `${path}.accept[${i}]`, "bad_regex", "正则无法编译，已丢弃该候选");
      }
    } else {
      iss.add("warning", `${path}.accept[${i}]`, "bad_accept", "无法识别的 accept 候选，已丢弃");
    }
  });
  if (kept === 0) {
    iss.add("error", path, "blank_became_empty", "该空的候选全部无效");
  } else {
    accepts.length = 0;
    accepts.push(...keep);
  }
  return kept;
}

/** Per-type consistency checks. `path` is the record's base path (for scenario recursion). */
function checkByType(rec: any, iss: Issues, path: string): void {
  const type: string = rec.type;

  switch (type) {
    case "single_choice": {
      if (!Array.isArray(rec.options) || rec.options.length < 2) {
        iss.add("error", `${path}.options`, "too_few_options", "单选题至少需要 2 个选项");
        break;
      }
      const keys = collectOptionKeys(rec.options, iss, path);
      if (!OPTION_KEYS.has(rec.answer) || !keys.has(rec.answer)) {
        iss.add("error", `${path}.answer`, "answer_not_in_options", "answer 不在选项键集合中");
      }
      break;
    }
    case "multiple_choice": {
      if (!Array.isArray(rec.options) || rec.options.length < 2) {
        iss.add("error", `${path}.options`, "too_few_options", "多选题至少需要 2 个选项");
        break;
      }
      const keys = collectOptionKeys(rec.options, iss, path);
      if (!Array.isArray(rec.answer) || rec.answer.length === 0) {
        iss.add("error", `${path}.answer`, "empty_answer", "多选题答案不能为空");
        break;
      }
      const seen = new Set<string>();
      for (const k of rec.answer) {
        if (seen.has(k)) {
          iss.add("error", `${path}.answer`, "dup_answer", "多选题答案有重复项");
          break;
        }
        seen.add(k);
        if (!keys.has(k)) {
          iss.add("error", `${path}.answer`, "answer_not_in_options", `答案 ${k} 不在选项键集合中`);
        }
      }
      break;
    }
    case "true_false": {
      if (typeof rec.answer !== "boolean") {
        const coerced = coerceBoolean(rec.answer);
        if (coerced === null) {
          iss.add("error", `${path}.answer`, "bad_boolean", "判断题答案必须是布尔值");
        } else {
          iss.add("warning", `${path}.answer`, "coerced_boolean", "判断题答案已归一为布尔值");
          rec.answer = coerced;
        }
      }
      break;
    }
    case "fill_blank": {
      if (rec.mode !== "ordered" && rec.mode !== "unordered") {
        iss.add("error", `${path}.mode`, "bad_mode", "mode 必须是 ordered 或 unordered");
      }
      if (!Array.isArray(rec.blanks) || rec.blanks.length === 0) {
        iss.add("error", `${path}.blanks`, "empty_blanks", "填空题至少需要一个空");
        break;
      }
      rec.blanks.forEach((b: any, i: number) => {
        if (!isObject(b)) {
          iss.add("error", `${path}.blanks[${i}]`, "bad_blank", "空定义无效");
          return;
        }
        checkAccepts(b.accept, iss, `${path}.blanks[${i}]`);
      });
      const markerCount = countBlankMarkers(stemToString(rec.stem));
      if (markerCount !== rec.blanks.length) {
        iss.add(
          "error",
          `${path}.stem`,
          "blank_count_mismatch",
          `题干中 ______ 数量(${markerCount})与 blanks 数量(${rec.blanks.length})不一致`,
        );
      }
      break;
    }
    case "numeric": {
      if (typeof rec.value !== "number" || !Number.isFinite(rec.value)) {
        iss.add("error", `${path}.value`, "bad_value", "numeric value 必须是有限数");
      }
      if (isObject(rec.tolerance)) {
        if (rec.tolerance.abs !== undefined && !(typeof rec.tolerance.abs === "number" && rec.tolerance.abs >= 0)) {
          iss.add("error", `${path}.tolerance.abs`, "bad_tolerance", "tolerance.abs 必须 ≥ 0");
        }
        if (rec.tolerance.rel !== undefined && !(typeof rec.tolerance.rel === "number" && rec.tolerance.rel >= 0)) {
          iss.add("error", `${path}.tolerance.rel`, "bad_tolerance", "tolerance.rel 必须 ≥ 0");
        }
      }
      break;
    }
    case "code_output": {
      if (typeof rec.expected !== "string") {
        iss.add("error", `${path}.expected`, "bad_expected", "code_output expected 必须是字符串");
      }
      // code_output.accept is OPTIONAL extra candidates on top of `expected`;
      // an empty `accept: []` is valid (no extras). Only validate non-empty arrays.
      if (rec.accept !== undefined) {
        if (!Array.isArray(rec.accept)) {
          iss.add("warning", `${path}.accept`, "bad_accept_array", "accept 不是数组，已忽略");
          delete rec.accept;
        } else if (rec.accept.length > 0) {
          checkAccepts(rec.accept, iss, path);
        }
      }
      break;
    }
    case "ordering": {
      if (!Array.isArray(rec.items) || rec.items.length === 0) {
        iss.add("error", `${path}.items`, "empty_items", "排序题至少需要一个项");
        break;
      }
      const ids = new Set<string>();
      let dup = false;
      for (const it of rec.items) {
        if (!isObject(it) || typeof it.id !== "string") {
          iss.add("error", `${path}.items`, "bad_item", "排序项缺少 id");
          continue;
        }
        if (ids.has(it.id)) dup = true;
        ids.add(it.id);
      }
      if (dup) iss.add("error", `${path}.items`, "dup_item_id", "排序项 id 有重复");
      if (!Array.isArray(rec.order) || rec.order.length !== rec.items.length) {
        iss.add("error", `${path}.order`, "bad_order", "order 长度必须等于 items 数量");
      } else {
        const orderSet = new Set(rec.order);
        const isPerm = orderSet.size === ids.size && [...orderSet].every((id) => ids.has(id as string));
        if (!isPerm) iss.add("error", `${path}.order`, "order_not_permutation", "order 必须是 items id 的一个排列");
      }
      break;
    }
    case "matching": {
      const leftIds = collectSideIds(rec.left, iss, `${path}.left`);
      const rightIds = collectSideIds(rec.right, iss, `${path}.right`);
      if (!Array.isArray(rec.pairs)) {
        iss.add("error", `${path}.pairs`, "bad_pairs", "pairs 必须是数组");
        break;
      }
      const usedRight = new Set<string>();
      const usedLeft = new Set<string>();
      for (const p of rec.pairs) {
        if (!Array.isArray(p) || p.length !== 2) {
          iss.add("error", `${path}.pairs`, "bad_pair", "每个 pair 必须是 [leftId, rightId]");
          continue;
        }
        const [l, r] = p;
        if (!leftIds.has(l)) iss.add("error", `${path}.pairs`, "pair_left_unknown", `pair 左项 ${l} 不存在`);
        if (!rightIds.has(r)) iss.add("error", `${path}.pairs`, "pair_right_unknown", `pair 右项 ${r} 不存在`);
        if (rec.manyToOne !== true) {
          if (usedLeft.has(l) || usedRight.has(r)) {
            iss.add("error", `${path}.pairs`, "not_one_to_one", "匹配必须 1:1（除非 manyToOne）");
          }
        }
        usedLeft.add(l);
        usedRight.add(r);
      }
      break;
    }
    case "short_answer":
    case "essay":
    case "code_writing": {
      const ref = rec.reference;
      const empty = ref === undefined || (typeof ref === "string" && ref.trim() === "");
      if (empty) {
        iss.add("warning", `${path}.reference`, "missing_reference", "缺少参考答案（仍可使用）");
      }
      break;
    }
    case "scenario": {
      if (!Array.isArray(rec.parts) || rec.parts.length === 0) {
        iss.add("error", `${path}.parts`, "empty_parts", "情景题至少需要一个 part");
        break;
      }
      rec.parts.forEach((part: any, i: number) => {
        const pp = `${path}.parts[${i}]`;
        if (!isObject(part)) {
          iss.add("error", pp, "bad_part", "part 无效");
          return;
        }
        if (part.type === "scenario") {
          iss.add("error", pp, "nested_scenario", "情景题不得嵌套情景题");
          return;
        }
        if (!QUESTION_TYPES.has(part.type)) {
          iss.add("error", `${pp}.type`, "unknown_type", `未知题型：${String(part.type)}`);
          return;
        }
        // Generic checks for the part.
        checkGeneric(part, iss, pp);
        checkByType(part, iss, pp);
      });
      break;
    }
    case "cloze": {
      if (!Array.isArray(rec.blanks) || rec.blanks.length === 0) {
        iss.add("error", `${path}.blanks`, "empty_blanks", "完形填空至少需要一个空");
      }
      if (typeof rec.template !== "string" && !isObject(rec.template)) {
        iss.add("error", `${path}.template`, "bad_template", "cloze template 必须是字符串");
      }
      // Structural pass → force an unsupported warning (§5).
      iss.add("warning", path, "cloze_unsupported", "完形填空 v1 暂不判分，仅展示参考");
      break;
    }
    default:
      // type already validated in the generic phase; unreachable here.
      break;
  }
}

function collectOptionKeys(options: any[], iss: Issues, path: string): Set<string> {
  const keys = new Set<string>();
  options.forEach((o: any, i: number) => {
    if (!isObject(o) || typeof o.k !== "string") {
      iss.add("error", `${path}.options[${i}]`, "bad_option", "选项缺少键 k");
      return;
    }
    if (!OPTION_KEYS.has(o.k)) {
      iss.add("error", `${path}.options[${i}]`, "bad_option_key", `选项键 ${o.k} 不在 A–H`);
    }
    if (keys.has(o.k)) {
      iss.add("error", `${path}.options[${i}]`, "dup_option_key", `选项键 ${o.k} 重复`);
    }
    keys.add(o.k);
  });
  return keys;
}

function collectSideIds(side: any, iss: Issues, path: string): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(side)) {
    iss.add("error", path, "bad_side", "匹配一侧必须是数组");
    return ids;
  }
  side.forEach((s: any, i: number) => {
    if (!isObject(s) || typeof s.id !== "string") {
      iss.add("error", `${path}[${i}]`, "bad_side_item", "匹配项缺少 id");
      return;
    }
    if (ids.has(s.id)) iss.add("error", `${path}[${i}]`, "dup_side_id", `匹配项 id ${s.id} 重复`);
    ids.add(s.id);
  });
  return ids;
}

function coerceBoolean(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === "对" || v === "正确" || v === "是") return true;
  if (v === "false" || v === "错" || v === "错误" || v === "否") return false;
  return null;
}

/** Generic per-record checks; mutates `rec` for tolerant fixups (id/difficulty/tags). */
function checkGeneric(rec: any, iss: Issues, path: string): void {
  // id (missing → generate deterministic + warning)
  if (typeof rec.id !== "string" || rec.id === "") {
    const gen = deriveId(String(rec.type ?? "unknown"), stemToString(rec.stem));
    iss.add("warning", `${path}.id`, "missing_id", `缺少 id，已生成 ${gen}`);
    rec.id = gen;
  }
  // difficulty (illegal → medium + warning)
  if (!DIFFICULTIES.has(rec.difficulty)) {
    iss.add("warning", `${path}.difficulty`, "bad_difficulty", "难度非法，已回退为 medium");
    rec.difficulty = "medium";
  }
  // tags (not string[] → [] + warning)
  if (!Array.isArray(rec.tags) || !rec.tags.every((t: any) => typeof t === "string")) {
    iss.add("warning", `${path}.tags`, "bad_tags", "tags 非字符串数组，已置空");
    rec.tags = [];
  }
  // stem non-empty
  if (stemToString(rec.stem).trim() === "") {
    iss.add("error", `${path}.stem`, "empty_stem", "题干不能为空");
  }
}

/** Validate one top-level record (already known to have a valid type). */
function validateRecord(raw: any, index: number, seenIds: Map<string, number>): RecordReport {
  const iss = new Issues();
  const rec = raw; // mutate a shallow-safe copy provided by caller

  checkGeneric(rec, iss, `questions[${index}]`);
  checkByType(rec, iss, `questions[${index}]`);
  checkMedia(rec, iss, `questions[${index}]`);

  // Duplicate id across file → warning from the 2nd occurrence.
  const id: string | null = typeof rec.id === "string" ? rec.id : null;
  if (id !== null) {
    const prev = seenIds.get(id);
    if (prev !== undefined) {
      iss.add("warning", `questions[${index}].id`, "dup_id", `文件内重复 id ${id}（合并时 last-wins）`);
    }
    seenIds.set(id, index);
  }

  const ok = !iss.hasError;
  return {
    index,
    id,
    ok,
    issues: iss.list,
    ...(ok ? { record: rec as QuestionRecord } : {}),
  };
}

/**
 * validateEnvelope(raw) — §5 two-phase validation. Never throws.
 * Phase 1: envelope-level (fatal → fileOk:false). Phase 2: per-record with try/catch isolation.
 */
export function validateEnvelope(raw: unknown): ImportReport {
  const envelopeIssues: RecordIssue[] = [];
  const emptyReport = (): ImportReport => ({
    fileOk: false,
    envelopeIssues,
    records: [],
    accepted: [],
    counts: { total: 0, accepted: 0, rejected: 0, warned: 0 },
  });

  // Phase 1.1 — object
  if (!isObject(raw)) {
    envelopeIssues.push({ level: "error", path: "$", code: "not_object", msg: "文件不是合法 JSON 对象" });
    return emptyReport();
  }

  // Phase 1.2 — format magic string
  if ((raw as any).format !== FORMAT_ID) {
    envelopeIssues.push({ level: "error", path: "$.format", code: "bad_format", msg: "这不是 ByteOffer 题库文件" });
    return emptyReport();
  }

  // Phase 1.3 — schemaVersion; migrate when older
  let env: any = raw;
  const sv = (raw as any).schemaVersion;
  if (typeof sv !== "number" || !Number.isInteger(sv) || sv < 1) {
    envelopeIssues.push({ level: "error", path: "$.schemaVersion", code: "bad_version", msg: "schemaVersion 必须是正整数" });
    return emptyReport();
  }
  if (sv > SCHEMA_VERSION) {
    envelopeIssues.push({ level: "error", path: "$.schemaVersion", code: "version_too_new", msg: "版本过新，请升级应用" });
    return emptyReport();
  }
  if (sv < SCHEMA_VERSION) {
    try {
      env = migrate(raw);
    } catch (e) {
      if (e instanceof SchemaTooNewError) {
        envelopeIssues.push({ level: "error", path: "$.schemaVersion", code: "version_too_new", msg: "版本过新，请升级应用" });
      } else {
        envelopeIssues.push({ level: "error", path: "$", code: "migrate_failed", msg: "迁移失败" });
      }
      return emptyReport();
    }
  }

  // Phase 1.4 — questions is an array
  if (!Array.isArray(env.questions)) {
    envelopeIssues.push({ level: "error", path: "$.questions", code: "questions_not_array", msg: "questions 必须是数组" });
    return emptyReport();
  }

  // Phase 1.5 — counts.total mismatch → warning (non-blocking)
  const declaredTotal = env?.counts?.total;
  if (typeof declaredTotal === "number" && declaredTotal !== env.questions.length) {
    envelopeIssues.push({
      level: "warning",
      path: "$.counts.total",
      code: "counts_mismatch",
      msg: `counts.total(${declaredTotal}) 与实际题目数(${env.questions.length}) 不一致`,
    });
  }

  // Phase 2 — per record, isolated.
  const records: RecordReport[] = [];
  const accepted: QuestionRecord[] = [];
  const seenIds = new Map<string, number>();
  let acceptedCount = 0;
  let rejectedCount = 0;
  let warnedCount = 0;
  let mediaBytesTotal = 0;

  env.questions.forEach((rawRec: any, index: number) => {
    let report: RecordReport;
    try {
      // Unknown type → error + discard (checked before deep validation).
      if (!isObject(rawRec)) {
        report = {
          index,
          id: null,
          ok: false,
          issues: [{ level: "error", path: `questions[${index}]`, code: "bad_record", msg: "记录不是对象" }],
        };
      } else if (!QUESTION_TYPES.has(rawRec.type)) {
        report = {
          index,
          id: typeof rawRec.id === "string" ? rawRec.id : null,
          ok: false,
          issues: [{ level: "error", path: `questions[${index}].type`, code: "unknown_type", msg: `未知题型：${String(rawRec.type)}` }],
        };
      } else {
        report = validateRecord(rawRec, index, seenIds);
      }
    } catch (e) {
      // Per-record isolation: an exception becomes a single error issue.
      report = {
        index,
        id: typeof rawRec?.id === "string" ? rawRec.id : null,
        ok: false,
        issues: [{ level: "error", path: `questions[${index}]`, code: "record_exception", msg: `校验记录异常：${String((e as Error)?.message ?? e)}` }],
      };
    }

    records.push(report);
    const hasWarning = report.issues.some((x) => x.level === "warning");
    if (hasWarning) warnedCount++;
    if (report.ok && report.record) {
      accepted.push(report.record);
      acceptedCount++;
      // Accumulate surviving media bytes for the envelope budget.
      const media = (report.record as any).media as Media[] | undefined;
      if (media) for (const m of media) if (typeof m.src === "string") mediaBytesTotal += dataUriBytes(m.src);
    } else {
      rejectedCount++;
    }
  });

  // Envelope media budget (§3.4): total base64 > 3.5MB → envelope error.
  if (mediaBytesTotal > ENVELOPE_MAX_BYTES) {
    envelopeIssues.push({
      level: "error",
      path: "$",
      code: "media_budget_exceeded",
      msg: "题库图片总量超出上限（3.5MB），请精简图片",
    });
  }

  const fileOk = !envelopeIssues.some((x) => x.level === "error");

  return {
    fileOk,
    envelopeIssues,
    records,
    accepted: fileOk ? accepted : [],
    counts: { total: env.questions.length, accepted: acceptedCount, rejected: rejectedCount, warned: warnedCount },
  };
}
