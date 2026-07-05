# ByteOffer 题库导入/导出 — 权威设计规范 (Authoritative Design Spec, v1)

> Single source of truth for the question-bank import/export feature. Grounded in the verified codebase: `lib/data.ts` (`PracticeQuestion`/`Opt`/`Analysis`/`ListItem`/`examQ` + pure style helpers), the single `computeVals(state, actions)` hub in `lib/app-context.tsx`, boolean-flag routing in `components/main-area.tsx`, `NavItem`-based `components/sidebar.tsx`, inline-style + CSS-var theming (`lib/theme.ts`), `localStorage` (only `fe_exam_remain` today). **No test runner exists** (deps are only `next`/`react`/`react-dom`/`typescript`; scripts are `dev`/`build`/`start`/`lint`).
>
> The hardcoded seed (`practiceBank`, `examQ`, `wrongItems`, `favItems`, `recentItems`) is throwaway demo. This spec defines a **fresh** interchange format that supersedes it while coexisting via a one-time `adaptSeed()` layer.
>
> **Decisive rulings made in this doc** (do not relitigate): grading class is **derived by lookup** `GRADING_CLASS_OF[type]`, never stored inline per record — authors cannot lie about it and validation cannot be fooled; a thin per-record `grading:{ partial? }` override is the only author knob. `cloze` is **deferred** to v2 (kept in the type union + JSON Schema as a reserved variant, but has **no grader and no authoring path** in v1) to keep the v1 taxonomy honest. Cloze placeholder token, when implemented, is `[[n]]` (single decision, no `{{n}}`). Format adapters (Markdown/GIFT/CSV) and the LocalizedString i18n path are **post-MVP roadmap**, present in types/validator but not wired into the v1 UI. The single merge point is `lib/app-context.tsx`.

---

## 1. 题型分类 Question-Type Taxonomy

13 types. `type` is the ASCII discriminator; Chinese is display-only via `TYPE_LABEL`. Ordered most-objective → most-subjective (mirrors the grading spectrum §2). `OptionKey = "A".."H"`.

| stable key (ASCII) | 中文名 | answer data shape | grading class (default) | note |
|---|---|---|---|---|
| `single_choice` | 单选题 | `options: Opt[]`; `answer: OptionKey` | `auto_exact` | 现有核心题型。 |
| `multiple_choice` | 多选题 | `options: Opt[]`; `answer: OptionKey[]` (集合) | `auto_set` (opt-in `auto_partial` via `grading.partial`) | 现有核心。集合判等，可开部分给分。 |
| `true_false` | 判断题 | `answer: boolean` | `auto_exact` | 独立于单选：渲染为 对/错 双态，判分为 boolean。 |
| `fill_blank` | 填空题 | `blanks: BlankSpec[]`; `mode: "ordered"\|"unordered"` | `auto_normalized` (`auto_partial` when `blanks.length>1` or `grading.partial`) | 单/多空、有序/无序；归一化匹配。 |
| `numeric` | 数值题 | `value: number`; `tolerance?: {abs?,rel?}`; `unit?` | `auto_normalized` | 容差判分；单位仅展示，解析前剥离。 |
| `code_output` | 输出预测题 | `expected: string`; `accept?: Accept[]`; `normalize?` | `auto_normalized` | 代码 console 输出是确定字符串；FE 最高信噪比自动判题。 |
| `ordering` | 排序题 | `items: OrderItem[]`; `order: string[]` (item id 正确序) | `auto_set` (strict) / `auto_partial` (Kendall, opt-in) | 渲染流水线、生命周期顺序。 |
| `matching` | 匹配题 | `left/right: MatchSide[]`; `pairs: [leftId,rightId][]` | `auto_set` (strict) / `auto_partial` (per-pair, opt-in) | 状态码↔含义等；映射判等。 |
| `short_answer` | 简答题 | `reference: string`; `keywords?: string[]` | `self_assess` | 关键词仅为自评提示，**不**自动计分。 |
| `essay` | 问答题 | `reference: string`; `rubric?: RubricItem[]` | `self_assess` (rubric-checklist) / `manual_reference` when `selfAssess:false` | 开放长答；勾选量规得分或三档自评。 |
| `code_writing` | 编程题 | `reference: string`; `lang?`; `tests?` (reserved, 不执行) | `self_assess` / `manual_reference` | 客户端无沙箱，`tests` 仅为将来预留。 |
| `scenario` | 情景多问题 | `parts: (Leaf & {points?})[]` (无嵌套) | `composite` (聚合器, 非独立类) | 一题多问，逐 part 按各自类判分后加权求和。 |
| `cloze` | 完形填空 | `template: string`; `blanks: BlankSpec[]` (占位符 `[[n]]`) | **RESERVED (v1 无判分)** → 导入即 warning，作答走 `manual_reference` | v1 保留于类型联合/JSON Schema，**不实现判分与作答**；v2 复用 `fill_blank` 判分。 |

**Deliberately excluded (anti-padding):** 图片热区 / 拖拽画布 / 语音口述 — 非文本产品价值，破坏纯 JSON + 无重依赖约束。连线并入 `matching`；带并列的排名并入 `ordering` 的 `unordered`。

**Coverage of the 5 advertised filter types:** 单选/多选/判断/填空/问答 全部 1:1 落到 `single_choice`/`multiple_choice`/`true_false`/`fill_blank`/`essay`。

---

## 2. 判分模型 Grading Model

### 2.1 判分类 (6 classes, closed set) — derived by lookup, never stored per record

```ts
// lib/qbank/enums.ts
export const GRADING_CLASS_OF: Record<QuestionType, GradingClass> = {
  single_choice: "auto_exact",
  true_false: "auto_exact",
  multiple_choice: "auto_set",     // upgraded to auto_partial at grade-time if grading.partial
  fill_blank: "auto_normalized",   // upgraded to auto_partial when multi-blank / grading.partial
  numeric: "auto_normalized",
  code_output: "auto_normalized",
  ordering: "auto_set",            // upgraded to auto_partial if grading.partial
  matching: "auto_set",            // upgraded to auto_partial if grading.partial
  short_answer: "self_assess",
  essay: "self_assess",            // manual_reference if selfAssess:false
  code_writing: "self_assess",     // manual_reference if selfAssess:false
  scenario: "composite",
  cloze: "manual_reference",       // v1 reserved: no grader
};
```

| gradingClass | 语义 | score 范围 |
|---|---|---|
| `auto_exact` | 单值严格相等 | {0,1} |
| `auto_set` | 集合/映射判等，全对满分 | {0,1} |
| `auto_normalized` | 归一化后相等（含数值容差） | {0,1} |
| `auto_partial` | 部分给分，明确公式 | [0,1] 连续 |
| `self_assess` | 出参考答案 → 用户自评 → {0, 0.5, 1} | 用户选择 |
| `manual_reference` | 仅展示参考答案，不产出机器分 | `null` (不计入正确率) |

`composite` 是**聚合器**非判分类：对每个 part 用 `GRADING_CLASS_OF[part.type]` 判分后加权。

**Author knob:** the only grading field an author may write is `grading?: { partial?: boolean }`. The class is always computed. `effectiveClass(q)` = base lookup, upgraded to `auto_partial` iff `grading.partial===true` (multiple_choice/ordering/matching) or the type auto-upgrades (fill_blank with >1 blank).

### 2.2 客观/主观边界 (airtight)

- **完全客观**: `single_choice`, `multiple_choice`, `true_false`, `fill_blank`, `numeric`, `code_output`, `ordering`, `matching` — 答案有限可枚举或可归一化到规范形。
- **完全主观**: `short_answer`, `essay`, `code_writing` — 机器不裁决，`score=null` 直到用户自评。关键词/量规仅辅助自评，**默认不进客观正确率分母**。
- **组合**: `scenario` — 客观 parts 自动判，主观 parts 走自评；整题若含主观 part，UI 标"混合"徽标。

### 2.3 逐类精确规则与边界

**`auto_exact` (single_choice / true_false)** — `answer === userAnswer`。true_false 的 UI 双态强制转 boolean；未作答=错，永不判对。

**`auto_set`**
- `multiple_choice` (全对): `sort(sel).join(",") === sort(answer).join(",")`。空选=0。
- `ordering` (strict): 用户排列 === `order`。
- `matching` (strict): 用户 link 集合 === 正确 link 集合（pair 顺序无关）。

**`auto_partial` (全部 clamp 到 [0,1])**
- **`multiple_choice` 部分给分 — 净命中防蒙公式 (权威)**:
  设正确集大小 `C`，干扰项数 `W = options.length − C`。
  `score = clamp((correctHits / C) − (wrongHits / W), 0, 1)`。
  - 全对无误选 → 1；选满全部选项 → `1 − 1 = 0`（防全选骗分）。
  - **退化 `W===0`**（无干扰项）→ `score = correctHits / C`。
- **`fill_blank` 多空**: `score = 命中空数 / 总空数`。`ordered` 逐位；`unordered` 做**贪心一一匹配**（每个用户答案至多认领一个未匹配的 accept 组）。缺空计为该空错。
- **`matching` 逐对**: `score = 正确对数 / 总对数`。
- **`ordering` — `orderScoring: "position" | "kendall"`**（默认 `position`）:
  - `position`: `score = 位置正确元素数 / N`。
  - `kendall`: `score = clamp(1 − inversions / (N·(N−1)/2), 0, 1)`（归一化 Kendall-tau，对整体偏移一位更宽容）。

**`auto_normalized`**
- `fill_blank` 单空 / `code_output`: 归一化(§2.4)用户输入与每个 `accept`，命中任一 → 1。
- `numeric`: 解析用户串为数（NaN → 0 且 warning）。命中条件 `|u − value| ≤ abs`（若给 `abs`）**或** `|u − value| ≤ rel·|value|`（若给 `rel`）；满足其一即可；两者皆无 → 严格相等。

**`self_assess`**
- 展示 `reference`（+ short_answer 的 `keywords` 作灰色提示，+ essay 的 `rubric` 作勾选表）。
- 若有 `rubric`: `score = 勾选 points 之和 / 总 points`（覆盖三档控件）。否则三档控件 对(1.0)/半对(0.5)/错(0) → 写 `progress[id].selfScore`。
- 主观题**未自评 = ungraded**，不计入客观正确率，也不标记连对为"错"。

**`manual_reference` (essay/code_writing when `selfAssess:false`; cloze v1)** — `score=null`，仅展示参考答案/量规。

**`scenario`** — `score = Σ(partScore_i · weight_i) / Σ weight_i`（`weight` 默认 `points ?? 1`）。**规范聚合规则 (single canonical rule)**: 主观/未判 part 在**分母中被排除**——即 `score` 只在客观 parts 上归一（`Σ objective partScore·w / Σ objective w`），主观 parts 单独走各自自评、以"混合"徽标呈现，绝不把 `null` 当 0 污染客观分。若无客观 part，整题 `score=null`。

### 2.4 归一化管线 Normalize (客观文本判定核心)

`normalize(raw, opts) => string`，`opts` 来自题目 `normalize` 字段。作者与每个 `accept` 候选都过同一管线。

| 选项 | 默认 | 作用 |
|---|---|---|
| `trim` | true | 去首尾空白 |
| `collapseWhitespace` | true | 连续空白（含全角空格 `\u3000`）折叠为一个 |
| `caseInsensitive` | true (code_output 默认 **false**) | ASCII 小写化；中文无影响 |
| `fullwidthToHalfwidth` | true | 全角字母数字标点 → 半角（`（）`→`()`，`１`→`1`）— **中文输入正确性关键** |
| `ignoreChinesePunctVariant` | true | 中英标点等价（`，`≡`,`，`、`≡`;`，`；`≡`;`，`（）`≡`()`） |
| `stripPunctuation` | false | 去标点（谨慎，按题开启） |
| `trimTrailingWhitespace` | true (code_output) | 逐行去行尾空白 |
| `collapseBlankLines` | false (code_output) | 折叠连续空行 |
| `synonyms` | `[]` | 同义组 `[["子","子元素","直接子代"]]`，命中同组任一即等价 |

**`Accept` 候选三形态**（一个 blank 的 `accept: Accept[]`，命中任一即该空正确）:
1. `{ text: string }` — 归一化后字符串相等。
2. `{ regex: string, flags?: string }` — 对归一化后的用户输入做正则匹配。导入期 `new RegExp` 编译校验（坏正则丢弃+warning；若使 blank 变空则 error）。
3. **推荐默认用 `text`+`synonyms`**（安全、可读、可 diff）；regex 供高级作者。

**numeric 用户输入解析规则**: 剥离 `unit`、千分位 `,`、支持 `1024`/`1,024`/`1.024e3`/`1_000`；全角数字转半角；解析失败 → 0 + warning。

### 2.5 判分器契约

`export function grade(q: QuestionRecord, a: UserAnswer): GradeResult` — 纯函数，无 locale/time 依赖，dispatch on `effectiveClass(q)`。**假定输入已过校验**（§5 保证判分器永不见脏数据）。归一化是唯一模糊源且完全声明式，故 import/export 判分可复现。

---

## 3. 导入导出 JSON 结构 Interchange Envelope

### 3.1 顶层信封

```json
{
  "format": "byteoffer.qbank",
  "schemaVersion": 1,
  "exportedAt": "2026-07-05T09:12:00.000Z",
  "source": { "app": "ByteOffer", "appVersion": "0.1.0", "author": "Ainsley" },
  "meta": { "title": "前端高频面试题库 v1", "locale": "zh-CN" },
  "counts": { "total": 13, "byType": { "single_choice": 1, "multiple_choice": 1 } },
  "questions": [ /* QuestionRecord[] — 判别联合，见 3.3 */ ]
}
```

- `format` 固定魔术串 — 校验**首要**检查项，拒绝任意 JSON。
- `schemaVersion` 整数，驱动 §6 迁移。
- `counts` 冗余校验：与 `questions.length` 不符 → warning（不阻断）。
- `meta.locale`/LocalizedString 为 i18n 预留（§3.4）；v1 仅 `zh-CN` 纯串。

### 3.2 共享字段 (所有 leaf 记录)

```jsonc
{
  "id": "js-eventloop-001",       // 稳定 id, §3.3
  "type": "single_choice",         // 判别式, ASCII 枚举
  "difficulty": "medium",          // easy | medium | hard
  "tags": ["事件循环", "异步"],
  "stem": "关于事件循环，以下说法错误的是？",
  "source": { "company": "字节跳动", "year": 2024, "position": "前端" }, // 可选
  "explanation": { "explain": "…", "points": ["…"], "pitfalls": ["…"], "related": ["…"], "ai": "…" }, // 可选，取代旧 Analysis
  "media": [{ "kind": "image", "src": "data:image/png;base64,…", "alt": "示意图" }], // 可选
  "grading": { "partial": false }, // 可选，唯一作者判分开关
  "x": {}                          // 扩展包，round-trip 原样保留
  // + 按 type 的 answer 字段（3.3）
}
```

### 3.3 判别联合 per-type 记录 (真实 JSON — 含每种类型)

```jsonc
// single_choice
{ "id": "js-eventloop-001", "type": "single_choice", "difficulty": "medium", "tags": ["事件循环"],
  "stem": "关于事件循环，以下说法错误的是？",
  "options": [ {"k":"A","t":"JS 是单线程"}, {"k":"B","t":"宏任务优先于微任务"}, {"k":"C","t":"微任务在当前宏任务后执行"} ],
  "answer": "B" }

// multiple_choice (部分给分)
{ "id": "http2-001", "type": "multiple_choice", "difficulty": "medium", "tags": ["HTTP"],
  "stem": "HTTP/2 相比 1.1 的改进有哪些？",
  "options": [ {"k":"A","t":"多路复用"}, {"k":"B","t":"头部压缩"}, {"k":"C","t":"服务器推送"}, {"k":"D","t":"明文传输"}, {"k":"E","t":"请求优先级"} ],
  "answer": ["A","B","C","E"], "grading": { "partial": true } }

// true_false
{ "id": "css-transform-tf", "type": "true_false", "difficulty": "easy", "tags": ["CSS"],
  "stem": "CSS 的 transform 属性不会触发重排。", "answer": true }

// fill_blank (多空 + 有序 + 归一化 + 同义 + regex)
{ "id": "css-combinator-fill", "type": "fill_blank", "difficulty": "medium", "tags": ["CSS选择器"],
  "stem": "选择器 .a > .b 表示 ______ 选择器；.a .b 表示 ______ 选择器。",
  "mode": "ordered",
  "normalize": { "synonyms": [["子","子元素","直接子代"]] },
  "blanks": [
    { "accept": [ {"text":"子"}, {"text":"子元素"}, {"regex":"^直接子(元素|代)?$"} ] },
    { "accept": [ {"text":"后代"}, {"text":"后代元素"} ] }
  ] }

// numeric
{ "id": "byte-kb", "type": "numeric", "difficulty": "easy", "tags": ["计算机基础"],
  "stem": "1 KiB 等于多少字节？", "value": 1024, "unit": "字节", "tolerance": { "abs": 0 } }

// code_output
{ "id": "js-hoisting-out", "type": "code_output", "difficulty": "medium", "tags": ["作用域"],
  "stem": "console.log(typeof null) 输出？", "expected": "object",
  "normalize": { "caseInsensitive": false }, "accept": [] }

// ordering
{ "id": "render-pipeline-order", "type": "ordering", "difficulty": "hard", "tags": ["浏览器渲染"],
  "stem": "将浏览器渲染流水线阶段按执行顺序排列：",
  "items": [ {"id":"style","t":"样式计算"}, {"id":"layout","t":"布局"}, {"id":"paint","t":"绘制"}, {"id":"composite","t":"合成"} ],
  "order": ["style","layout","paint","composite"],
  "grading": { "partial": true }, "orderScoring": "kendall" }

// matching
{ "id": "http-status-match", "type": "matching", "difficulty": "medium", "tags": ["HTTP"],
  "stem": "将状态码与含义配对：",
  "left":  [ {"id":"l1","t":"301"}, {"id":"l2","t":"304"}, {"id":"l3","t":"404"} ],
  "right": [ {"id":"r1","t":"永久重定向"}, {"id":"r2","t":"未修改"}, {"id":"r3","t":"未找到"} ],
  "pairs": [ ["l1","r1"], ["l2","r2"], ["l3","r3"] ],
  "grading": { "partial": true } }

// short_answer
{ "id": "debounce-throttle-sa", "type": "short_answer", "difficulty": "medium", "tags": ["性能"],
  "stem": "简述防抖与节流的区别。",
  "reference": "防抖：事件触发后延迟执行，期间再次触发则重新计时；节流：固定窗口内最多执行一次。",
  "keywords": ["防抖重新计时","节流固定频率"], "selfAssess": true }

// essay (rubric checklist)
{ "id": "vue3-ref-reactive", "type": "essay", "difficulty": "hard", "tags": ["Vue"],
  "stem": "阐述 Vue3 中 ref 与 reactive 的区别及使用场景。",
  "reference": "ref 包裹任意值（含原始类型），通过 .value 访问……",
  "rubric": [ {"point":"ref 适用原始类型","weight":2}, {"point":"reactive 适用对象","weight":2}, {"point":"给出选型建议","weight":1} ],
  "selfAssess": true }

// code_writing (reference-only self-assess)
{ "id": "deepclone-coding", "type": "code_writing", "difficulty": "hard", "tags": ["JS"],
  "stem": "手写 deepClone，支持循环引用。", "lang": "javascript",
  "reference": "function deepClone(o, map = new WeakMap()) { /* … */ }",
  "tests": [ { "desc": "循环引用不栈溢出" } ], "selfAssess": true }

// scenario (composite, 无嵌套)
{ "id": "closure-scenario", "type": "scenario", "difficulty": "hard", "tags": ["闭包"],
  "stem": "阅读代码：for(var i=0;i<3;i++) setTimeout(()=>console.log(i))",
  "parts": [
    { "id": "closure-scenario.1", "type": "code_output", "difficulty": "hard", "tags": [],
      "stem": "输出什么？", "expected": "3 3 3", "points": 1 },
    { "id": "closure-scenario.2", "type": "short_answer", "difficulty": "hard", "tags": [],
      "stem": "为什么？如何修正？", "reference": "var 无块级作用域……用 let 或 IIFE。",
      "keywords": ["let 块级作用域"], "selfAssess": true, "points": 1 }
  ] }

// cloze (v1 RESERVED — imports with a warning, no grading; placeholder token [[n]])
{ "id": "promise-states-cloze", "type": "cloze", "difficulty": "easy", "tags": ["Promise"],
  "stem": "Promise 有 [[1]]、[[2]]、[[3]] 三种状态。",
  "template": "Promise 有 [[1]]、[[2]]、[[3]] 三种状态。",
  "blanks": [ { "accept": [{"text":"pending"}] }, { "accept": [{"text":"fulfilled"}] }, { "accept": [{"text":"rejected"}] } ] }
```

### 3.4 稳定 id / 枚举 / media / i18n

- **id**: 作者提供、不可变，推荐 `<domain>-<topic>-<seq>`（`js-eventloop-001`）。缺失 → 导入器**确定性生成** `q_` + FNV-1a(type + "|" + stem).toString(36)（无依赖），使同题干同 id → 幂等重导入。scenario part id 建议 `<parentId>.<n>`，全文件唯一。
- **type 枚举**: §1 的 13 键；未知 type → 该记录 error 丢弃（其余照常）。
- **difficulty 枚举**: `easy | medium | hard`；显示映射 `{easy:"简单", medium:"中等", hard:"困难"}`（对齐 `diffStyle` 的中文键，见 §6.3 桥接）。
- **media**: `{kind:"image"|"code", src, alt?}`。图片 `src` **必须**是 `data:image/*` URI（客户端 CSP 安全，禁外链）；导入期强制 `src` 前缀匹配 `/^data:image\//`（否则 error，防 `data:text/html` XSS）。
- **media 体积预算 (硬约束)**: 单条 `data:` 载荷 > **512 KB** → 该记录 warning + `media` 字段剥离（题目仍导入，图丢弃）；整个信封 base64 总量 > **3.5 MB** → envelope error（`~5MB localStorage 上限`留余量）。写库时 `saveBank` catch `QuotaExceededError` → 回滚 + 明确提示"题库超出浏览器存储上限，请精简图片"。
- **i18n (roadmap)**: `LocalizedString = string | Record<locale,string>`，类型与校验器**接受两者且不需版本升级**；v1 UI 只渲染 `string` 或 `resolveLocale(field, meta.locale)`。

---

## 4. TypeScript 类型定义

`lib/qbank/types.ts`（strict 编译通过）:

```ts
export const SCHEMA_VERSION = 1 as const;
export const FORMAT_ID = "byteoffer.qbank" as const;

export type Difficulty = "easy" | "medium" | "hard";
export type OptionKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type QuestionType =
  | "single_choice" | "multiple_choice" | "true_false"
  | "fill_blank" | "numeric" | "code_output"
  | "ordering" | "matching"
  | "short_answer" | "essay" | "code_writing"
  | "scenario" | "cloze";

export type GradingClass =
  | "auto_exact" | "auto_set" | "auto_normalized"
  | "auto_partial" | "self_assess" | "manual_reference" | "composite";

export type LocalizedString = string | Record<string, string>;

export interface Opt { k: OptionKey; t: LocalizedString }
export interface Media { kind: "image" | "code"; src: string; alt?: string }
export interface Explanation {
  explain?: string; points?: string[]; pitfalls?: string[]; related?: string[]; ai?: string;
}
export interface Source { company?: string; year?: number; position?: string }

export interface NormalizeOpts {
  trim?: boolean; collapseWhitespace?: boolean; caseInsensitive?: boolean;
  fullwidthToHalfwidth?: boolean; ignoreChinesePunctVariant?: boolean;
  stripPunctuation?: boolean; trimTrailingWhitespace?: boolean;
  collapseBlankLines?: boolean; synonyms?: string[][];
}
export interface AcceptText { text: string }
export interface AcceptRegex { regex: string; flags?: string }
export type Accept = AcceptText | AcceptRegex;
export interface BlankSpec { accept: Accept[]; label?: string }
export interface RubricItem { point: LocalizedString; weight: number }
export interface OrderItem { id: string; t: LocalizedString }
export interface MatchSide { id: string; t: LocalizedString }

interface BaseRecord {
  id: string;
  difficulty: Difficulty;
  tags: string[];
  stem: LocalizedString;
  source?: Source;
  explanation?: Explanation;
  media?: Media[];
  grading?: { partial?: boolean };
  x?: Record<string, unknown>;
}

export interface SingleChoiceQ extends BaseRecord {
  type: "single_choice"; options: Opt[]; answer: OptionKey;
}
export interface MultipleChoiceQ extends BaseRecord {
  type: "multiple_choice"; options: Opt[]; answer: OptionKey[];
}
export interface TrueFalseQ extends BaseRecord {
  type: "true_false"; answer: boolean;
}
export interface FillBlankQ extends BaseRecord {
  type: "fill_blank"; mode: "ordered" | "unordered"; blanks: BlankSpec[]; normalize?: NormalizeOpts;
}
export interface NumericQ extends BaseRecord {
  type: "numeric"; value: number; unit?: string; tolerance?: { abs?: number; rel?: number };
}
export interface CodeOutputQ extends BaseRecord {
  type: "code_output"; expected: string; accept?: Accept[]; normalize?: NormalizeOpts;
}
export interface OrderingQ extends BaseRecord {
  type: "ordering"; items: OrderItem[]; order: string[]; orderScoring?: "position" | "kendall";
}
export interface MatchingQ extends BaseRecord {
  type: "matching"; left: MatchSide[]; right: MatchSide[]; pairs: [string, string][]; manyToOne?: boolean;
}
export interface ShortAnswerQ extends BaseRecord {
  type: "short_answer"; reference: LocalizedString; keywords?: string[]; selfAssess?: boolean;
}
export interface EssayQ extends BaseRecord {
  type: "essay"; reference: LocalizedString; rubric?: RubricItem[]; selfAssess?: boolean;
}
export interface CodeWritingQ extends BaseRecord {
  type: "code_writing"; reference: string; lang?: string; tests?: { desc: string }[]; selfAssess?: boolean;
}
export interface ClozeQ extends BaseRecord { // v1 reserved: no grader
  type: "cloze"; template: LocalizedString; blanks: BlankSpec[]; mode?: "ordered" | "unordered"; normalize?: NormalizeOpts;
}

export type LeafRecord =
  | SingleChoiceQ | MultipleChoiceQ | TrueFalseQ
  | FillBlankQ | NumericQ | CodeOutputQ
  | OrderingQ | MatchingQ
  | ShortAnswerQ | EssayQ | CodeWritingQ | ClozeQ;

export interface ScenarioQ extends BaseRecord {
  type: "scenario"; parts: (LeafRecord & { points?: number })[];
}

export type QuestionRecord = LeafRecord | ScenarioQ;

export interface QBankEnvelope {
  format: typeof FORMAT_ID;
  schemaVersion: number;
  exportedAt: string;
  source?: { app?: string; appVersion?: string; author?: string };
  meta?: { title?: string; locale?: string };
  counts?: { total: number; byType?: Partial<Record<QuestionType, number>> };
  questions: QuestionRecord[];
}

// ---------- user answer (UI-produced) ----------
export type UserAnswer =
  | { kind: "choice"; value: OptionKey }
  | { kind: "multi"; value: OptionKey[] }
  | { kind: "boolean"; value: boolean }
  | { kind: "blanks"; values: string[] }
  | { kind: "numeric"; raw: string }
  | { kind: "text"; value: string }
  | { kind: "order"; order: string[] }
  | { kind: "pairs"; pairs: [string, string][] }
  | { kind: "self"; selfScore: 0 | 0.5 | 1; rubricTicks?: number[] }
  | { kind: "composite"; parts: Record<string, UserAnswer> };

// ---------- grade result ----------
export type GradeStatus = "correct" | "incorrect" | "partial" | "ungraded";
export interface GradeResult {
  gradingClass: GradingClass;
  status: GradeStatus;
  score: number | null;      // [0,1]; null = manual_reference / unrated subjective
  max: number;               // usually 1; scenario = Σ objective weights
  answered: boolean;
  needsSelfGrade?: boolean;
  advisory?: { score: number; note: string }; // short_answer keyword hint (never in objective stats)
  detail?: { blanks?: boolean[]; pairs?: boolean[]; order?: boolean[]; parts?: Record<string, GradeResult> };
}
```

`lib/qbank/enums.ts` 另存 `GRADING_CLASS_OF`（§2.1）、`TYPE_LABEL: Record<QuestionType,string>`、`DIFF_LABEL: Record<Difficulty,string>`、`effectiveClass(q): GradingClass`。

判分器签名（`lib/qbank/grade.ts`）: `export function grade(q: QuestionRecord, a: UserAnswer | undefined): GradeResult`。

---

## 5. 校验与错误模型 Validation

`lib/qbank/validate.ts`，纯函数、无依赖、**不抛出到调用方**。

```ts
export interface RecordIssue { level: "error" | "warning"; path: string; code: string; msg: string }
export interface RecordReport { index: number; id: string | null; ok: boolean; issues: RecordIssue[]; record?: QuestionRecord }
export interface ImportReport {
  fileOk: boolean;
  envelopeIssues: RecordIssue[];
  records: RecordReport[];
  accepted: QuestionRecord[]; // zero-error records (warnings ok)
  counts: { total: number; accepted: number; rejected: number; warned: number };
}
export function validateEnvelope(raw: unknown): ImportReport;
```

**两阶段，per-record `try/catch` 隔离**（一条抛错变一个 error issue，绝不中断循环）。每个 issue 带机器 `code`（未来 i18n）+ 人类 `msg`（中文）。

**Phase 1 — 信封级（error → 整体失败，`fileOk:false`）:**
1. `raw` 是对象；否则 `code:"not_object"` "文件不是合法 JSON 对象"。
2. `format === "byteoffer.qbank"`；否则 `code:"bad_format"` "这不是 ByteOffer 题库文件"。
3. `schemaVersion` 正整数；`> SCHEMA_VERSION` → `code:"version_too_new"` "版本过新，请升级应用"；`< SCHEMA_VERSION` → 先过 `migrate`（§6.4）再校验。
4. `questions` 是数组。
5. `counts.total !== questions.length` → **warning**（不阻断）。

**Phase 2 — 逐记录（error → 丢弃计入 rejected；warning → 保留）:**
- 通用: `id` 为串（缺 → 生成 + warning）；`type ∈ QuestionType`（否则 error 丢弃）；`difficulty ∈ enum`（非法 → `medium` + warning）；`tags` 是 `string[]`（非 → `[]` + warning）；`stem` 非空。
- 按 type 一致性:
  - `single_choice`: `options.length≥2`、`k` 唯一 ∈ A–H；`answer` ∈ option keys。
  - `multiple_choice`: `answer` 非空、无重复、⊆ option keys。
  - `true_false`: `answer` 是 boolean（容忍 `"true"/"对"` 归一 + warning）。
  - `fill_blank`: `mode ∈ {ordered,unordered}`；`blanks` 非空；每 `accept` 非空；**stem 中 `______` 计数 === `blanks.length`**（不符 → error，经典作者 bug）；每个 `regex` `new RegExp` 编译（坏 → 丢该 accept + warning；使 blank 空 → error）。
  - `numeric`: `value` 有限数；`tolerance.abs/rel` 若给 ≥0。
  - `code_output`: `expected` 是串。
  - `ordering`: `items` id 唯一；`order` 是 `items[].id` 的一个排列（长度+集合相等，否则 error）。
  - `matching`: `left/right` id 唯一；`pairs` 每 id ∈ 对应集合；1:1 除非 `manyToOne`（否则 error）。
  - `short_answer/essay/code_writing`: `reference` 非空（否则 **warning** — 无参考仍可用）。
  - `scenario`: `parts` 非空；递归校验每 part（错误冒泡为 `parts[i].…` path）；**part 不得为 scenario**（否则 error，禁嵌套）；part id 全文件唯一。
  - `cloze`: 结构校验通过即接受，但**强制附 warning** `code:"cloze_unsupported"` "完形填空 v1 暂不判分，仅展示参考"。
- media: 非 `data:image/*` → error（`bad_media_uri`）；单条 >512KB → warning + 剥离；见 §3.4 预算。
- 全局: 文件内重复 `id` → 第二次起 warning `code:"dup_id"`（保留，合并时 last-wins §6.2）。

**报告 UI（§7.1）**: 汇总条 `✅ N · ⚠️ K · ❌ M` + 逐行 chip（复用 `diffChip`/`typeChipStyle`）。用户确认后才写库。

---

## 6. 存储与迁移 Storage & Migration

### 6.1 localStorage 形状 (两键分离)

```ts
const QBANK_KEY = "byteoffer.qbank.v1";
const PROGRESS_KEY = "byteoffer.progress.v1";

interface StoredBank { schemaVersion: number; updatedAt: string; questions: QuestionRecord[] }

interface ProgressEntry {
  attempts: number;
  correctCount: number;
  lastScore: number | null;      // 最近一次 GradeResult.score
  lastStatus: GradeStatus;
  lastAt: number;                // epoch ms
  wrongCount: number;            // status==="incorrect" 累计
  fav: boolean;
  lastAnswer?: UserAnswer;       // 断点续答 (§6.6)
}
type ProgressMap = Record<string, ProgressEntry>; // keyed by question id
```

- 旧 `fe_exam_remain` 不动。
- **题库与用户态解耦**: 题目在 `QBANK_KEY`，进度/收藏/错题计数在 `PROGRESS_KEY`，按 id 关联 → 重导入/替换题库**永不清进度**。

### 6.2 合并 / 去重 (by id)

```ts
export type MergeMode = "merge" | "replace"; // default "merge" (upsert)
export function mergeBank(existing: QuestionRecord[], incoming: QuestionRecord[]): QuestionRecord[] {
  const byId = new Map(existing.map(q => [q.id, q]));
  for (const q of incoming) byId.set(q.id, q); // upsert, last-wins (also dedupes incoming)
  return [...byId.values()];
}
```
- `merge`（默认）: 按 id upsert，幂等。`replace`: `accepted[]` 成为整库（confirm 对话框；消失 id 的进度保留为孤儿，不删）。合并结果对同 id 内容变化的题在报告列 warning。

### 6.3 与种子的关系 + 中文键桥接

- `lib/qbank/adaptSeed.ts` 一次性把旧 `practiceBank`（`PracticeQuestion`）转 `QuestionRecord`（`single_choice`/`multiple_choice`），运行时全代码只见新类型。旧 `lib/data.ts` 的题目数组标 `@deprecated`，仅供 `adaptSeed` 消费。
- `lib/data.ts` 的**纯样式 helper**（`diffStyle`/`diffChip`/`typeChipStyle`/`fmtTime`）保留原样，新屏幕全复用。
- **中文↔ASCII 桥接**: `diffStyle`/`diffChip` 以中文键（`简单/中等/困难`）工作。桥接方向: 数据层持 ASCII `difficulty`，展示前经 `DIFF_LABEL[difficulty]` 转中文再喂 `diffChip`。`TYPE_LABEL[type]` 同理供 `typeChipStyle` 旁的标签文本。
- 首启（无 `QBANK_KEY`）→ 用 `adaptSeed()` 结果初始化库。

### 6.4 schemaVersion 迁移

```ts
// lib/qbank/migrate.ts
type Migration = (e: any) => any; // vN -> vN+1, pure
const MIGRATIONS: Record<number, Migration> = { /* 1->2 时填 */ };
export class SchemaTooNewError extends Error {}
export function migrate(raw: any): any {
  let e = raw, v = e?.schemaVersion ?? 1;
  while (v < SCHEMA_VERSION) { e = MIGRATIONS[v](e); v = e.schemaVersion; }
  if (v > SCHEMA_VERSION) throw new SchemaTooNewError(String(v));
  return e;
}
```
- **导入文件与 load-from-localStorage 都过 `migrate`** → 内存永远当前版本；下次写库时惰性回写升级后形状。加字段=不升版本（默认补齐）；改/删/改类型=升版本 + 迁移项。未知字段经 `x` 包保留 → 老应用读新文件不丢数据。

### 6.5 导出往返保真

- `exportBank(questions) => QBankEnvelope`: 填 `format/schemaVersion/exportedAt/counts`，`questions` 原样（**不含**运行时进度）。
- **不变式**: `normalize(export(import(f))) deepEquals normalize(f)`（差异仅 JSON 键序、空白、重生成的 `exportedAt`）。判分声明/normalize/accept/`x` 全序列化无损。下载 `byteoffer-qbank-YYYYMMDD.json`。

### 6.6 UserAnswer 持久化 / 断点续答契约

每题作答即写 `progress[id].lastAnswer`（`UserAnswer` 判别联合，§4）。重访该题时 `computeVals` 用 `lastAnswer` 重水化对应控件（choice→选中项，blanks→各 input 值，order→列表序，pairs→各 select，self→自评态）。scenario 的 `lastAnswer` 是 `{kind:"composite", parts}`，按 part id 分发。序列化即 `UserAnswer` 本身（纯 JSON 安全）。

---

## 7. UI/UX 方案

### 7.1 导入/导出入口 — 新增 `题库` (qbank) 屏

- `ScreenKey` 增 `"qbank"`；`sidebar.tsx` 在 `模拟面试` 与 `错题本` 之间加 `<NavItem icon={icons.qbank} label="题库" kbd="⌘6" active={v.nav.qbank.active} onClick={v.nav.qbank.go} />`；`main-area.tsx` 加 `{v.isQbank && <QbankScreen/>}`；`mobileItems`/`meta`/`nav` 补 `qbank` 项。
- QbankScreen 三块（纯 inline-style，复用 `var(--surface)`/`var(--line)`/`var(--pri)` 卡片视觉）:
  1. **导入**: `<input type="file" accept=".json">` + `<textarea>` 粘贴 JSON。合并策略单选 `merge`/`replace`（默认 merge）。
  2. **校验预览**: 解析 → `validateEnvelope` → 渲染 `ImportReport`（汇总条 + 逐行 chip + issue 文案）；"确认导入 X 题"按钮（`fileOk` 前禁用）才落库。
  3. **导出 / 样例**: "下载题库 JSON"（Blob → `URL.createObjectURL` → `<a download>`）；"下载样例题库"（内置 13 类型各 1 题 exemplar，作者模板）；"下载 JSON Schema"。
- 全部派生值（报告行、计数、按钮态、onClick、chip 样式）在 `computeVals` 预计算，屏幕只读 —— 严守"derive everything"范式。文件读取在 action 内 `await file.text()` 后 `patch` 到 `state.qbankReport`，`computeVals` 从中派生。

### 7.2 各题型作答 + 判分（融入 computeVals）

`practice.tsx` 当前选项区（硬编码 radio/checkbox off `q.multi`）替换为按 `v.pQ.type` 分派的渲染。**判分逻辑全在 context**: `pAnswer` action 调 `grade(q, userAnswer)` → `computeVals` 派生 `pGrade: GradeResult` 与每型展示 props。

| type | 作答控件 (无拖拽依赖) | 判分展示 |
|---|---|---|
| single_choice/true_false | radio 行（复用 `selRow`/`markSty`）；true_false 两固定项 对/错 | 正确项 ring |
| multiple_choice | checkbox 行 | 逐项 ✓/✗ + 部分 % |
| fill_blank | 每空 `<input>` | 逐空 ✓/✗ + "命中 2/3" + 接受答案 |
| numeric | 单 `<input>` + 单位后缀 | ✓/✗ + `value±tol` |
| code_output | `<textarea>` (mono) | 归一后 diff |
| ordering | 每项 ↑/↓ 按钮（action `pMove(id,dir)`） | 逐位对错 / Kendall 分 |
| matching | 左固定 + 每行右 `<select>` | 逐对 ✓/✗ |
| short_answer/essay/code_writing | `<textarea>` + "查看参考答案" → **自评条** 对(1)/半对(0.5)/错(0)；essay 有 rubric 则勾选表 | 自评分 + short_answer 灰色 advisory |
| scenario | 纵向堆叠各 part 控件 | 逐 part + 客观聚合分 + "混合"徽标 |
| cloze (v1) | 只读渲染题干 + "查看参考"（无输入） | 无判分 |

- **兼容旧屏**: 保留 `pAnsRight`/`pAnsWrong` 为计算别名（`pAnsRight = v.pGrade.status==="correct"`, `pAnsWrong = v.pGrade.status==="incorrect"`），使 `practice.tsx` 现有对错块不破坏；新增 `partial`（橙色）态渐进接入。
- **自评流**: "查看参考答案"后三按钮 → `pAnswer({kind:"self",selfScore})` → `computeVals` 折入 `pGrade.score` → 写 `progress[id]`。主观未自评=ungraded，不污染客观正确率。
- **移动/键盘**: 新控件在 `mobileNav` 抽屉与窄屏下 `input`/`select` 用 `width:100%`、`min-height:44px`、`font-size:16px`（防 iOS 缩放）；ordering ↑/↓ 与 matching `<select>` 天然键盘可达（原生 focusable，无 dnd）；作答控件按 tab 顺序线性排列。

### 7.3 过滤器 UI 的 ASCII 化 (关键破坏点)

现 `pfTypes`/`pfDiff`/`resetFilters`/`pfTypeList`/`pfDiffs` 用**中文对象键**。迁移: `state.pfTypes` 改为 ASCII 键 `{ single_choice:true, ... }`；`INITIAL` 与 `resetFilters` 用 ASCII 键；`pfTypeList` 迭代 `QuestionType`，标签经 `TYPE_LABEL[k]` 显示，`toggleType(k: QuestionType)`。`pfDiff` 存 ASCII（`"medium"`），`pfDiffs` 标签经 `DIFF_LABEL`。**13 类型不塞满 5 项 UI**: `pfTypeList` 分两组渲染——"客观题"（8）/"主观题"（4，cloze 归此但灰显禁选）——在可滚动容器内，默认全选。

### 7.4 错题本/收藏/最近/统计 从 progress 派生

现 `wrongItems`/`favItems`/`recentItems`（`ListItem[]`，中文 `type`/`diff` + `wrong`/`last`）是 demo。改为从 `bank + ProgressMap` 投影出同形 `ListItem`，`computeVals` 内计算，屏幕不变:

```ts
function toListItem(q: QuestionRecord, p?: ProgressEntry): ListItem {
  return {
    id: q.id,
    type: TYPE_LABEL[q.type],           // ASCII -> 中文，供旧 typeChipStyle 标签
    diff: DIFF_LABEL[q.difficulty],     // ASCII -> 中文，喂 diffStyle/diffChip
    q: typeof q.stem === "string" ? q.stem : resolveLocale(q.stem),
    tags: q.tags,
    wrong: p?.wrongCount ?? 0,
    last: p ? fmtDate(p.lastAt) : "",
  };
}
```
- **错题本 tab**: `bank.filter(q => (progress[q.id]?.wrongCount ?? 0) > 0)`，`meta = "错误 N 次 · 上次错误 <date>"`（现 `wbList` 逻辑保留）。
- **收藏夹 tab**: `bank.filter(q => progress[q.id]?.fav)`。
- **最近练习 tab**: `bank` 按 `progress[q.id]?.lastAt` 降序取前 N，`last = "正确率 X% · <相对时间>"`（`X = round(lastScore*100)`）。
- **stats 屏**: 从 `ProgressMap` 汇总 `attempts`/`correctCount`/accuracy%（客观题分母排除 `manual_reference`/未自评主观）。
- `fmtDate` 新增于 `lib/qbank/format.ts`（`fmtTime` 保留原位）。

---

## 8. 实现任务清单 Implementation Tasks

关键路径: `types.ts`/`enums.ts` 先行 → (normalize/id/grade/validate/migrate/storage/export/seed/adaptSeed/format/screen/answer-field 并行) → 单一 owner 原子集成 `app-context.tsx` + 路由。

### 8a. 独立新文件 (parallel-safe)

| 路径 | 用途 | 关键导出 |
|---|---|---|
| `lib/qbank/types.ts` | §4 判别联合 + `UserAnswer` + `GradeResult` + 信封 | 全部 §4 类型 + `SCHEMA_VERSION`/`FORMAT_ID` |
| `lib/qbank/enums.ts` | 类↔类型映射 + 中文标签 | `GRADING_CLASS_OF`, `TYPE_LABEL`, `DIFF_LABEL`, `effectiveClass(q)` |
| `lib/qbank/id.ts` | 无依赖确定性 id | `deriveId(type, stem): string` (FNV-1a) |
| `lib/qbank/normalize.ts` | §2.4 归一化管线 + 数值解析 | `normalize(raw, opts)`, `parseNumeric(raw)` |
| `lib/qbank/grade.ts` | §2 判分器（dispatch on `effectiveClass`），含净命中/容差/有序无序空/Kendall/scenario 聚合 | `grade(q, a): GradeResult` |
| `lib/qbank/validate.ts` | §5 两阶段 per-record 校验 | `validateEnvelope(raw): ImportReport` |
| `lib/qbank/migrate.ts` | §6.4 迁移链 | `migrate(raw)`, `SchemaTooNewError` |
| `lib/qbank/storage.ts` | 两键读写 + 合并 + 配额处理 | `loadBank()`, `saveBank()`, `mergeBank()`, `loadProgress()`, `saveProgress()` |
| `lib/qbank/export.ts` | 信封序列化 + 下载 | `exportBank(questions)`, `downloadJson(obj, name)` |
| `lib/qbank/seed.ts` | 内置样例信封（13 类型各 1）| `sampleEnvelope: QBankEnvelope` |
| `lib/qbank/adaptSeed.ts` | 旧 `PracticeQuestion` → `QuestionRecord` | `adaptSeed(): QuestionRecord[]` |
| `lib/qbank/format.ts` | 日期/相对时间格式化 | `fmtDate(ms)`, `resolveLocale(field, locale?)` |
| `lib/qbank/selfcheck.ts` | **无测试框架** → 依赖零的自检脚本，`node --experimental-strip-types` 或 `npx tsx` 手动跑；断言净命中(全选=0/W=0退化)、容差、有序/无序贪心空、Kendall、scenario 主观排除、round-trip 不变式 | `runSelfCheck(): {pass:number; fail:string[]}` |
| `public/qbank.schema.json` | §JSON Schema：`oneOf`-on-`type` 镜像 TS 联合，供编辑器自动补全 | — |
| `components/screens/qbank.tsx` | 题库管理屏（导入/导出/预览/样例），presentational，读 `useApp()` | `QbankScreen` |
| `components/qbank/answer-field.tsx` | 按 `type` 派发的作答控件（fill/numeric/code_output/ordering/matching/self-assess/scenario），受控、值由 props | `AnswerFieldByType` |
| `lib/qbank/adapters/{markdown,gift,csv}.ts` | **POST-MVP roadmap**：`parse(text): QBankEnvelope` 喂 `validateEnvelope`；GIFT 近 1:1 映射反证类型表 | `parse(text)` |

> 自检运行方式（记入 README/CLAUDE）: `npx tsx lib/qbank/selfcheck.ts`（tsx 为一次性 `npx`，不入 deps，满足"无重依赖"）。partial-credit 数学是全特性最高正确性风险，**必须**在集成前跑通自检。

### 8b. 共享文件集成 (single-owner, 顺序执行, `app-context.tsx` 为唯一合流点)

**`lib/app-context.tsx`**（原子改，单人）:
- `ScreenKey` 增 `"qbank"`；`nav`/`meta`/`mobileItems`/`activeKey` 补 `qbank` 项。
- `AppState`: `pSelected` 泛化为 `Record<string, UserAnswer>`；增 `bank: QuestionRecord[]`、`progress: ProgressMap`、`qbankReport: ImportReport | null`、`qbankMergeMode: MergeMode`、`qbankPasteText: string`。
- `INITIAL`: `pfTypes` 改 ASCII 键 `{single_choice:true,multiple_choice:true,true_false:true,fill_blank:true,essay:true}`；`pfDiff:"medium"`；`bank:[]`/`progress:{}` 由启动 effect 填充。
- `Actions` 增: `importFile(file)`, `importPaste(text)`, `confirmImport()`, `setMergeMode(m)`, `exportBank()`, `downloadSample()`, `pAnswer(a: UserAnswer)`, `pMove(id,dir)`, `selfGrade(score)`；`toggleType(k: QuestionType)`；`resetFilters` 用 ASCII 键。
- 启动 `useEffect`: `loadBank()`（无则 `adaptSeed()`）经 `migrate` → `state.bank`；`loadProgress()` → `state.progress`。
- `computeVals` practice 段: `bank = state.bank`（替 `practiceBank`）；`q = filtered[pIndex % filtered.length]`（见下采样层）；按 `q.type` 派生 `pOpts`/`pBlanks`/`pOrder`/`pPairs`/`pParts`/`pAnswerKind`；调 `grade()` 得 `pGrade`；`pAnsRight = pGrade.status==="correct"`, `pAnsWrong = pGrade.status==="incorrect"`（别名保旧屏）。新增 qbank 段（`isQbank`, 报告派生, 按钮）、`wbList`/stats 从 `progress` 投影（§7.4）。
- **采样层**: `filtered = bank.filter(q => pfTypes[q.type] && (pfDiff==="all"||DIFF_LABEL match) && tagMatch && companyMatch)`，喂 `pIndex`。practice 现 `bank[pIndex % length]` 改读 `filtered`；`pNext` 在 `filtered` 上前进。
- **考试模式接线** (`examQ` 迁移): 移除硬编码 `examQ`；`examStart()` 从 `filtered`（或全 bank）抽 N=30 题存 `state.examBank: QuestionRecord[]`；`examAns` 泛化为 `Record<number, UserAnswer>`；`eOpts`/作答按 `examBank[examIndex].type` 派生（复用 `AnswerFieldByType`）；`examSubmit` 对每题调 `grade()` 汇总，写 `progress`。exam 屏改读 `v.examBank[examIndex]` 而非 `examQ`。

**`lib/data.ts`**: 题目数组（`practiceBank`/`examQ`/`wrongItems`/`favItems`/`recentItems`）标 `@deprecated`，仅供 `adaptSeed`/首启消费；**保留** `diffStyle`/`diffChip`/`typeChipStyle`/`fmtTime`/`ListItem`/`DiffStyle`/`Chip`（新屏复用）。

**`components/sidebar.tsx`**: 加 `题库` `NavItem`（`icons.qbank` + `⌘6` + `v.nav.qbank`）。

**`components/main-area.tsx`**: 加 `{v.isQbank && <QbankScreen/>}`。

**`components/screens/practice.tsx`**: 选项区换为 `<AnswerFieldByType q={v.pQ} .../>`；对错块读 `v.pGrade`（含 `partial` 橙态与自评条）。

**`components/screens/exam.tsx`**: `v.examQ` → `v.examBank[examIndex]`；`eOpts` 换 `AnswerFieldByType`；提交后展示 `grade()` 汇总。

**推荐顺序**: 8a 全落（仅依赖 `types.ts`/`enums.ts`，可先 stub 后填）→ 跑 `selfcheck.ts` 确认 partial 数学 → 单一 owner 自上而下改 8b（`app-context.tsx` 与路由原子提交，避免 `computeVals` 冲突）。

---

**相关文件（绝对路径）:**
- `/Users/laidexin/IdeaProjects/ByteOffer/lib/data.ts` — seed to supersede; keep style helpers + `ListItem`.
- `/Users/laidexin/IdeaProjects/ByteOffer/lib/app-context.tsx` — the single `computeVals` merge point.
- `/Users/laidexin/IdeaProjects/ByteOffer/components/main-area.tsx` — boolean-flag routing.
- `/Users/laidexin/IdeaProjects/ByteOffer/components/sidebar.tsx` — `NavItem` nav.
- `/Users/laidexin/IdeaProjects/ByteOffer/components/screens/practice.tsx` — per-type answering integration.
- `/Users/laidexin/IdeaProjects/ByteOffer/components/screens/exam.tsx` — exam-mode wiring to `examBank`.
- `/Users/laidexin/IdeaProjects/ByteOffer/lib/theme.ts` — CSS-var theming to reuse.
- New tree to create: `/Users/laidexin/IdeaProjects/ByteOffer/lib/qbank/*`, `/Users/laidexin/IdeaProjects/ByteOffer/components/qbank/answer-field.tsx`, `/Users/laidexin/IdeaProjects/ByteOffer/components/screens/qbank.tsx`, `/Users/laidexin/IdeaProjects/ByteOffer/public/qbank.schema.json`.