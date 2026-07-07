// app/app/page.tsx
// The authenticated app entry — relocated here from `/` (the root is now the public marketing
// landing). SERVER COMPONENT (architecture §8.1 RSC-fetch pattern), logic identical to the old
// app/page.tsx: auth() → redirect("/login") if anonymous → fetch initial data via the application
// services → render the client <AppShell> with { initialData, actions }. Because it awaits auth()
// it is intrinsically DYNAMIC (ƒ): `next build` will NOT prerender it, so NO database is required
// at build time. Every service read is wrapped in try/catch so a cold/absent DB renders an
// empty-but-non-crashing shell instead of a build/runtime crash (hard constraint).
//
// SECURITY NOTE (practice bank, Phase 3c): the authed practice bank is now key-STRIPPED. We inject
// PublicQuestion[] via questionService.listPublicForPractice — the answer key AND explanation are
// removed at every level (incl. scenario parts) before the bank ever reaches the client (§5.4 /
// architecture invariant #3: 非 admin 用户对未作答的题永远收不到答案密钥也收不到 explanation).
// Grading + reveal for the authed flow come from the SERVER submit response (submitAttemptAction
// reads the DB payload and grades authoritatively), NOT from a local grade() on this stripped bank.
// Exam keys are likewise withheld via the separate stripped exam flow. The /demo route keeps the
// full sample bank + local grading (no props → AppProvider fallback).

import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import type { InitialData, ProgressLite } from "@/lib/app-context";
import { auth } from "@/lib/server/auth";
import type { PublicQuestion } from "@/lib/server/qbank/mapping";
import * as questionService from "@/lib/server/services/questionService";
import * as statsService from "@/lib/server/services/statsService";
import * as entitlementService from "@/lib/server/services/entitlementService";
import * as libraryService from "@/lib/server/services/libraryService";
import { listTags } from "@/lib/server/qbank/tags";
import {
  submitAttemptAction,
  selfGradeAttemptAction,
} from "@/lib/actions/attempts";
import {
  toggleFavoriteAction,
  listWrongbookAction,
  listFavoritesAction,
  listRecentAction,
  masterWrongAction,
} from "@/lib/actions/library";
import { getQuestionForPracticeAction, startPracticeSessionAction } from "@/lib/actions/practice";
import {
  startExamSessionAction,
  saveExamAnswerAction,
  submitExamAction,
  getExamStateAction,
} from "@/lib/actions/exam";

// Force dynamic rendering — this page depends on the request session (auth()); never prerender.
export const dynamic = "force-dynamic";

const PRACTICE_BATCH = 30;

/**
 * loadInitialData — best-effort RSC read of the authed user's starting data. Any failure (no DB,
 * cold connection, migration failure) degrades to an empty shell; it never throws.
 */
async function loadInitialData(userId: string): Promise<Omit<InitialData, "user" | "entitlement">> {
  const out: Omit<InitialData, "user" | "entitlement"> = {};

  // Real stats (Phase 6, §7.2): fetch the enriched report and inject it as initialData.stats — a
  // superset of the old dashboard() read. computeVals derives the home KPIs, the stats-screen trend
  // + category bars, and the sidebar streak from this when present, and falls back to the demo
  // numbers when absent. Best-effort: any failure (no DB) leaves stats undefined → demo fallback.
  try {
    const stats = await statsService.report(userId);
    out.stats = stats;
  } catch {
    /* no DB → leave stats undefined → computeVals uses the demo fallback numbers */
  }

  // Practice bank (SECURE, Phase 3c): first published batch as key-STRIPPED PublicQuestion[]
  // (§5.4). listPublicForPractice runs each row through recordFromRow → stripAnswerKey, so the
  // injected bank carries stem+options+items+blank shells to render the prompt but NO answer key
  // and NO explanation. This is only a FIRST-PAINT batch — the practice loop refetches per the live
  // filters on entry. The exam bank is NOT injected: the authed exam uses the server exam flow, and
  // an injected pool would render a "ghost" exam before startExam lands.
  try {
    const { items } = await questionService.listPublicForPractice({ take: PRACTICE_BATCH });
    if (items.length > 0) {
      const bank: PublicQuestion[] = items;
      out.bank = bank;
    }
  } catch {
    /* no DB → leave bank undefined → the practice loop fetches on entry (never the sample envelope) */
  }

  // Authoritative published-question total (real 题库总数 for home/qbank; replaces the hardcoded 8642
  // / state.bank.length). Best-effort → left undefined (screens show 0 / empty) on any failure.
  try {
    out.bankTotal = await questionService.countPublished();
  } catch {
    /* no DB → leave bankTotal undefined */
  }

  // Category overview (home 分类练习进度 cards) and the tag facet (practice filter chips, §7.3).
  try {
    out.categories = await questionService.categoryOverview();
  } catch {
    /* no DB → leave categories undefined */
  }
  try {
    out.tags = await listTags();
  } catch {
    /* no DB → leave tags undefined */
  }

  // Progress seed (fav回填 + demo-parity projection) AND the home 最近练习 first page. We reuse the
  // single listRecent read: its items seed both initialData.recentItems and the progress map.
  try {
    const progress: Record<string, ProgressLite> = {};
    const recent = await libraryService.listRecent({ userId });
    out.recentItems = recent.items; // real first page for the home 最近练习 card (§E)
    for (const it of recent.items) {
      progress[it.id] = {
        ...(progress[it.id] ?? {}),
        wrongCount: it.wrong,
        lastAt: Date.now(),
        lastStatus: "correct",
        fav: it.fav,
      };
    }
    const favs = await libraryService.listFavorites({ userId });
    for (const it of favs.items) {
      progress[it.id] = { ...(progress[it.id] ?? {}), fav: true, wrongCount: it.wrong };
    }
    const wrong = await libraryService.listWrongbook({ userId });
    for (const it of wrong.items) {
      progress[it.id] = {
        ...(progress[it.id] ?? {}),
        wrongCount: it.wrong || 1,
        lastStatus: "incorrect",
      };
    }
    if (Object.keys(progress).length > 0) out.progress = progress;
  } catch {
    /* leave progress/recentItems undefined → authed screens render honest empty states */
  }

  return out;
}

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id;

  // Entitlement (tier) — best-effort; defaults to free-ish display on failure.
  let tier = "free";
  try {
    const ent = await entitlementService.get(userId);
    tier = ent.tier;
  } catch {
    /* keep default */
  }

  // Real stats (Phase 6) are fetched inside loadInitialData → initialData.stats and threaded into
  // the home/stats/sidebar derivations (§7.2). No separate dashboard() warm-up is needed.
  const rest = await loadInitialData(userId);

  const initialData: InitialData = {
    user: { name: session.user.name ?? undefined, email: session.user.email ?? undefined },
    entitlement: { tier },
    ...rest,
  };

  return (
    <AppShell
      initialData={initialData}
      actions={{
        submitAttempt: submitAttemptAction,
        selfGradeAttempt: selfGradeAttemptAction,
        toggleFavorite: toggleFavoriteAction,
        listWrongbook: listWrongbookAction,
        listFavorites: listFavoritesAction,
        listRecent: listRecentAction,
        masterWrong: masterWrongAction,
        getQuestionForPractice: getQuestionForPracticeAction,
        startPractice: startPracticeSessionAction,
        startExam: startExamSessionAction,
        saveExamAnswer: saveExamAnswerAction,
        submitExam: submitExamAction,
        getExamState: getExamStateAction,
      }}
    />
  );
}
