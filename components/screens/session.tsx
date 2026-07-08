"use client";

// components/screens/session.tsx
// V2 UNIFIED answering screen — one screen for BOTH 刷题(practice) and 模拟面试(exam). Launched from
// the 题库 hub over a frozen, server-shuffled session (§C). AUTHED-ONLY (demo never routes here).
// Visual shell mirrors components/screens/exam.tsx (question panel + timer + flat answer card) and
// folds in the analysis/reveal block from components/screens/practice.tsx. It branches on
// v.sessionMode: practice → no timer, per-question 提交 + immediate 判分/解析, 结束本轮 summary;
// exam → countdown, ungraded auto-save, 交卷 → server-authoritative results table.

import type { CSSProperties } from "react";
import { useApp } from "@/lib/app-context";
import { AnswerFieldByType } from "@/components/qbank/answer-field";

// Flat answer-card bubble — mirrors lib/app-context bubbleStyle (current > marked > answered > idle).
function cardBubble(b: { current: boolean; answered: boolean; marked: boolean }): CSSProperties {
  const base: CSSProperties = {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    fontWeight: 600,
    cursor: "pointer",
    boxSizing: "border-box",
    transition: "all .12s",
  };
  if (b.current)
    return { ...base, background: "var(--pri)", color: "#fff", border: "1.5px solid var(--pri)", boxShadow: "0 0 0 3px var(--pri-w)" };
  if (b.marked)
    return { ...base, background: "#FDF3E7", color: "#B7791F", border: "1.5px solid #F5B45A" };
  if (b.answered)
    return { ...base, background: "var(--pri-w)", color: "var(--pri-a)", border: "1.5px solid var(--pri-w2)" };
  return { ...base, background: "var(--surface)", color: "#98A2B3", border: "1px solid var(--line)" };
}

function Star({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>
  );
}

const PANEL: CSSProperties = { background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "12px" };

export function SessionScreen() {
  const v = useApp();

  // Guard: the screen only routes here when a session exists, but stay honest if it doesn't.
  if (!v.sessionActive) {
    return (
      <div data-screen-label="答题" className="bo-enter" style={{ maxWidth: "1440px", margin: "0 auto" }}>
        <div style={{ ...PANEL, maxWidth: "460px", margin: "80px auto", padding: "44px 40px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "18px", fontWeight: 700, color: "var(--ink)" }}>本轮已结束</div>
          <div style={{ fontSize: "13.5px", color: "var(--ink3)", marginTop: "8px", lineHeight: 1.7 }}>返回题库，从任意章节重新开始刷题或模拟面试。</div>
          <button style={{ marginTop: "22px", background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff", borderRadius: "9px", padding: "11px 30px", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }} onClick={v.sessionExitDo}>返回题库</button>
        </div>
      </div>
    );
  }

  const isExam = v.sessionIsExam;
  const isPractice = v.sessionIsPractice;
  const showExamResults = isExam && v.sessionSubmitted;
  const showPracticeSummary = isPractice && v.sessionSubmitted;
  const hasAna =
    !!v.sessionAna.explain || v.sessionAnaPoints.length > 0 || v.sessionAna.pitfalls.length > 0 || v.sessionAna.related.length > 0;
  const partialPct = Math.round((v.sessionShownGrade?.score ?? 0) * 100);

  // ============================================================
  //  EXAM RESULTS (交卷后) — server-authoritative; never a fake 0.
  // ============================================================
  if (showExamResults) {
    return (
      <div data-screen-label="模拟面试 成绩" className="bo-enter" style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ ...PANEL, borderRadius: "14px", padding: "36px 40px", textAlign: "center" }}>
          <div style={{ width: "64px", height: "64px", margin: "0 auto 18px", borderRadius: "18px", background: "var(--pri-w)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "22px", fontWeight: 700, color: "var(--ink)" }}>交卷成功</div>
          <div style={{ fontSize: "13px", color: "var(--ink3)", marginTop: "4px" }}>{v.sessionScopeLabel}</div>
          <div style={{ fontSize: "13.5px", color: "var(--ink2)", marginTop: "8px" }}>{v.sessionServerPending ? "正在评分，请稍候…" : v.sessionSubmitError ? "评分失败，请重试" : "本次模拟面试已完成，成绩如下"}</div>

          {v.sessionServerPending ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "30px 0 26px" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "38px", fontWeight: 700, color: "var(--ink3)", lineHeight: 1 }}>评分中…</span>
            </div>
          ) : v.sessionSubmitError ? (
            <div style={{ margin: "28px 0 26px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#D63C31", fontSize: "14px", fontWeight: 600, marginBottom: "18px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                成绩暂时无法获取
              </div>
              <div><button style={{ background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff", borderRadius: "9px", padding: "11px 30px", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }} onClick={v.sessionRetryDo}>重试评分</button></div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "4px", margin: "24px 0" }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "56px", fontWeight: 700, color: "var(--pri)", lineHeight: 1 }}>{v.sessionScore100}</span>
                <span style={{ fontSize: "20px", color: "var(--ink3)", fontWeight: 600 }}>/ 100</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px", marginBottom: "8px" }}>
                <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "14px" }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "24px", fontWeight: 700, color: "#0E9F6E" }}>{v.sessionExamCorrect}</div><div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "3px" }}>答对</div></div>
                <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "14px" }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "24px", fontWeight: 700, color: "#F04438" }}>{v.sessionExamWrong}</div><div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "3px" }}>答错</div></div>
                <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "14px" }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "24px", fontWeight: 700, color: "var(--ink3)" }}>{v.sessionUnanswered}</div><div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "3px" }}>未答</div></div>
                <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "14px" }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "24px", fontWeight: 700, color: "var(--ink)" }}>{v.sessionAnsweredCount}</div><div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "3px" }}>已答</div></div>
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "22px" }}>
            {v.sessionResultReady && (
              <button style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: "9px", padding: "11px 22px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }} onClick={v.nav.wrongbook.go}>查看错题解析</button>
            )}
            <button style={{ background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff", borderRadius: "9px", padding: "11px 26px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }} onClick={v.sessionExitDo}>再来一套</button>
          </div>
        </div>

        {/* Per-question results table (aligned to the frozen order). */}
        {v.sessionResultReady && v.sessionResultRows.length > 0 && (
          <div style={{ ...PANEL, marginTop: "16px", padding: "22px 24px" }}>
            <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "15px", fontWeight: 700, color: "var(--ink)", marginBottom: "14px" }}>逐题解析</div>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", minWidth: "560px" }}>
                {v.sessionResultRows.map((r) => {
                  // A subjective question the user answered grades to "ungraded" (no exam self-grade),
                  // so right/wrong/partial are all false but it is NOT 未作答 — show 待评分.
                  const pendingSubjective = !r.right && !r.partial && !r.wrong && r.answered;
                  const tint = r.right ? "#0E9F6E" : r.partial ? "#F79009" : r.wrong ? "#F04438" : pendingSubjective ? "#5A6172" : "var(--ink3)";
                  const statusText = r.right ? "正确" : r.partial ? "部分正确" : r.wrong ? "错误" : pendingSubjective ? "主观题 · 待评分" : "未作答";
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "13px 14px", border: "1px solid var(--line)", borderRadius: "10px" }}>
                      <span style={{ ...cardBubble({ current: false, answered: r.answered, marked: false }), cursor: "default", flex: "none" }}>{r.n}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                          <span style={r.typeChip}>{r.type}</span>
                          <span style={r.diffChip.style}><span style={r.diffChip.dot}></span>{r.diffChip.label}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 700, color: tint, border: `1px solid ${tint}`, borderRadius: "7px", padding: "2px 9px", whiteSpace: "nowrap" }}>{statusText}</span>
                        </div>
                        <div style={{ fontSize: "14px", color: "var(--ink)", lineHeight: 1.55, marginBottom: "8px" }}>{r.q}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: "12.5px" }}>
                          <span style={{ color: "var(--ink3)" }}>你的作答：<span style={{ fontFamily: "'JetBrains Mono',monospace", color: r.right ? "#0E9F6E" : "var(--ink)", fontWeight: 600 }}>{r.yourAns}</span></span>
                          {r.correct && <span style={{ color: "var(--ink3)" }}>正确答案：<span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#0E9F6E", fontWeight: 600 }}>{r.correct}</span></span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  //  PRACTICE SUMMARY (结束本轮) — honest counts, no fabricated totals.
  // ============================================================
  if (showPracticeSummary) {
    const acc = v.sessionSubmittedCount > 0 ? Math.round((v.sessionCorrectCount / v.sessionSubmittedCount) * 100) : 0;
    return (
      <div data-screen-label="刷题 本轮完成" className="bo-enter" style={{ maxWidth: "720px", margin: "0 auto" }}>
        <div style={{ ...PANEL, borderRadius: "14px", padding: "36px 40px", textAlign: "center" }}>
          <div style={{ width: "64px", height: "64px", margin: "0 auto 18px", borderRadius: "18px", background: "var(--pri-w)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "22px", fontWeight: 700, color: "var(--ink)" }}>本轮完成</div>
          <div style={{ fontSize: "13px", color: "var(--ink3)", marginTop: "4px" }}>{v.sessionScopeLabel}</div>

          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: "4px", margin: "24px 0" }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "56px", fontWeight: 700, color: "var(--pri)", lineHeight: 1 }}>{acc}</span>
            <span style={{ fontSize: "20px", color: "var(--ink3)", fontWeight: 600 }}>% 正确率</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "8px" }}>
            <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "14px" }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "24px", fontWeight: 700, color: "#0E9F6E" }}>{v.sessionCorrectCount}</div><div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "3px" }}>答对</div></div>
            <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "14px" }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "24px", fontWeight: 700, color: "var(--ink)" }}>{v.sessionSubmittedCount}</div><div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "3px" }}>已作答</div></div>
            <div style={{ border: "1px solid var(--line)", borderRadius: "10px", padding: "14px" }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "24px", fontWeight: 700, color: "var(--ink3)" }}>{v.sessionTotal}</div><div style={{ fontSize: "12px", color: "var(--ink3)", marginTop: "3px" }}>本轮题数</div></div>
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "22px" }}>
            <button style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: "9px", padding: "11px 22px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }} onClick={v.nav.wrongbook.go}>查看错题本</button>
            <button style={{ background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff", borderRadius: "9px", padding: "11px 26px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }} onClick={v.sessionExitDo}>返回题库</button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  //  ANSWERING LAYOUT (practice + exam share it)
  // ============================================================
  return (
    <div data-screen-label={isExam ? "模拟面试 答题" : "刷题 答题"} className="bo-enter" style={{ maxWidth: "1440px", margin: "0 auto" }}>

      {/* Header: mode + scope + 退出 */}
      <div style={{ ...PANEL, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", padding: "14px 20px", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", border: isExam ? "1px solid rgba(240,68,56,.28)" : "1px solid var(--pri-w2)", background: isExam ? "rgba(240,68,56,.08)" : "var(--pri-w)", color: isExam ? "#D63C31" : "var(--pri)", borderRadius: "7px", padding: "5px 11px", fontSize: "12.5px", fontWeight: 700, whiteSpace: "nowrap", flex: "none" }}>
            {isExam ? (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>模拟面试</>
            ) : (
              <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>刷题练习</>
            )}
          </span>
          <span style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "15.5px", fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.sessionScopeLabel || "本轮练习"}</span>
        </div>
        <button style={{ display: "flex", alignItems: "center", gap: "7px", background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink2)", borderRadius: "8px", padding: "8px 15px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flex: "none" }} onClick={v.sessionExitDo}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
          退出
        </button>
      </div>

      <div className="bo-flexcol" style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>

        {/* Center: question panel */}
        <div style={{ ...PANEL, padding: "22px 26px 18px", display: "flex", flexDirection: "column", minHeight: "566px", flex: "100 1 360px", minWidth: "326px" }}>
          {/* panel header: status + (exam timer | practice progress) + N/total */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "14px", flexWrap: "wrap", paddingBottom: "18px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: isExam ? "#F04438" : "var(--pri)", boxShadow: isExam ? "0 0 0 4px rgba(240,68,56,.13)" : "0 0 0 4px var(--pri-w)" }}></span>
              <span style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "16px", fontWeight: 700, color: "var(--ink)" }}>{isExam ? "考试进行中" : "刷题练习"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: 0 }}>
              {isExam ? (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "19px", fontWeight: 700, color: v.sessionLow ? "#E5342A" : "var(--ink)", letterSpacing: ".02em" }}>{v.sessionTime}</span>
              ) : (
                <div style={{ width: "160px", maxWidth: "40vw", height: "6px", background: "var(--track)", borderRadius: "6px", overflow: "hidden" }}><div style={v.sessionBarStyle}></div></div>
              )}
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "14px", color: "var(--ink2)", fontWeight: 600, flex: "none" }}>{v.sessionNo} / {v.sessionTotal}</span>
            </div>
          </div>

          {!v.sessionHasQ ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: "10px", padding: "40px 0" }}>
              <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink2)" }}>{v.sessionQ.q}</div>
            </div>
          ) : (
            <>
              {/* chips + fav */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", margin: "22px 0 16px" }}>
                <span style={v.sessionTypeChip}>{v.sessionQ.type}</span>
                <span style={v.sessionDiffChip.style}><span style={v.sessionDiffChip.dot}></span>{v.sessionDiffChip.label}</span>
                <div style={{ flex: 1 }}></div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "var(--ink3)", fontSize: "12.5px", fontWeight: 600 }} onClick={v.sessionToggleFav}>
                  <Star filled={v.sessionFav} />收藏
                </div>
              </div>

              <div style={{ fontSize: "17px", fontWeight: 700, color: "var(--ink)", lineHeight: 1.55, marginBottom: "20px" }}>{v.sessionQ.q}</div>

              {v.sessionFieldProps && <AnswerFieldByType {...v.sessionFieldProps} />}

              {/* PRACTICE: submit error banner */}
              {isPractice && v.sessionSubmitError && (
                v.sessionSubmitError.code === "PAYMENT_REQUIRED" ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "var(--pri-w)", border: "1px solid var(--pri-w2)", borderRadius: "10px", padding: "12px 16px", marginTop: "16px" }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><path d="M13 2L3 14h9l-1 8 10-12h-9z" /></svg>
                    <span style={{ flex: 1, minWidth: "160px", fontSize: "13.5px", color: "var(--ink2)", fontWeight: 500 }}>{v.sessionSubmitError.message}</span>
                    <a href="/pricing" style={{ background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>升级 Plus →</a>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", background: "rgba(240,68,56,.08)", border: "1px solid rgba(240,68,56,.28)", borderRadius: "10px", padding: "12px 16px", marginTop: "16px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D63C31" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                    <span style={{ flex: 1, minWidth: "160px", fontSize: "13.5px", color: "#D63C31", fontWeight: 500 }}>{v.sessionSubmitError.message}</span>
                    <button style={{ background: "var(--surface)", border: "1px solid rgba(240,68,56,.4)", color: "#D63C31", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }} onClick={v.sessionSubmitDo}>重试</button>
                  </div>
                )
              )}

              {/* PRACTICE: per-question 判分 + 解析 (immediate feedback once submitted/locked) */}
              {isPractice && v.sessionLocked && (
                <div style={{ marginTop: "20px", paddingTop: "20px", borderTop: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginBottom: hasAna ? "16px" : 0 }}>
                    {v.sessionAnsRight && (<span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#0E9F6E" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E9F6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 12l2.4 2.4L15.5 9" /></svg>回答正确</span>)}
                    {v.sessionAnsWrong && (<span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#F04438" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F04438" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg>回答错误</span>)}
                    {v.sessionPartial && (<span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#F79009" }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F79009" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>部分正确 {partialPct}%</span>)}
                    {v.sessionCorrect && (<span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13.5px", color: "var(--ink2)" }}>正确答案<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "14px", fontWeight: 700, color: "#0E9F6E" }}>{v.sessionCorrect}</span></span>)}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13.5px", color: "var(--ink2)" }}>你的作答<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "14px", fontWeight: 700, color: v.sessionAnsRight ? "#0E9F6E" : v.sessionPartial ? "#F79009" : "var(--ink)" }}>{v.sessionYourAns}</span></span>
                  </div>

                  {hasAna && (
                    <div style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "12px", padding: "20px 22px" }}>
                      {v.sessionAna.explain && (<>
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "10.5px", letterSpacing: ".13em", color: "var(--pri)", fontWeight: 600, marginBottom: "10px" }}>// 解析</div>
                        <div style={{ fontSize: "14.5px", color: "var(--ink2)", lineHeight: 1.85 }}>{v.sessionAna.explain}</div>
                      </>)}

                      {v.sessionAnaPoints.length > 0 && (<>
                        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "14.5px", fontWeight: 700, color: "var(--ink)", margin: "22px 0 14px", paddingTop: "20px", borderTop: "1px solid var(--line)" }}>关键知识点</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                          {v.sessionAnaPoints.map((p) => (
                            <div key={p.i} style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}><span style={{ width: "20px", height: "20px", flex: "none", borderRadius: "6px", background: "var(--pri-w)", color: "var(--pri)", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", marginTop: "1px" }}>{p.i}</span><span style={{ fontSize: "14px", color: "var(--ink)", lineHeight: 1.6 }}>{p.t}</span></div>
                          ))}
                        </div>
                      </>)}

                      {v.sessionAna.pitfalls.length > 0 && (<>
                        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "14.5px", fontWeight: 700, color: "var(--ink)", margin: "22px 0 14px", paddingTop: "20px", borderTop: "1px solid var(--line)" }}>常见陷阱</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {v.sessionAna.pitfalls.map((p, i) => (
                            <div key={i} style={{ display: "flex", gap: "11px", alignItems: "flex-start" }}><span style={{ width: "6px", height: "6px", flex: "none", borderRadius: "50%", background: "#F04438", marginTop: "8px" }}></span><span style={{ fontSize: "14px", color: "var(--ink2)", lineHeight: 1.6 }}>{p}</span></div>
                          ))}
                        </div>
                      </>)}

                      {v.sessionAna.related.length > 0 && (<>
                        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "14.5px", fontWeight: 700, color: "var(--ink)", margin: "22px 0 14px", paddingTop: "20px", borderTop: "1px solid var(--line)" }}>相关考点</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "9px" }}>
                          {v.sessionAna.related.map((r, i) => (
                            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "7px", border: "1px solid var(--line)", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", color: "var(--ink)", fontWeight: 500 }}><span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--pri)", fontSize: "11px" }}>›</span>{r}</span>
                          ))}
                        </div>
                      </>)}
                    </div>
                  )}
                </div>
              )}

              <div style={{ flex: 1, minHeight: "20px" }}></div>

              {/* footer nav */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", paddingTop: "20px", borderTop: "1px solid var(--line)" }}>
                <button style={{ display: "flex", alignItems: "center", gap: "7px", background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink2)", borderRadius: "8px", padding: "9px 15px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }} onClick={v.sessionMark}>
                  {v.sessionMarkedCur ? (<><svg width="15" height="15" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>已标记</>) : (<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>标记本题</>)}
                </button>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button disabled={v.sessionNo <= 1} style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: "8px", padding: "9px 18px", fontSize: "13.5px", fontWeight: 600, cursor: v.sessionNo <= 1 ? "not-allowed" : "pointer", opacity: v.sessionNo <= 1 ? 0.45 : 1, fontFamily: "inherit" }} onClick={v.sessionPrev}>上一题</button>
                  {isPractice && !v.sessionLocked && (
                    <button disabled={!v.sessionCanSubmit} style={{ background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: "8px", padding: "9px 18px", fontSize: "13.5px", fontWeight: 600, cursor: v.sessionCanSubmit ? "pointer" : "not-allowed", opacity: v.sessionCanSubmit ? 1 : 0.5, fontFamily: "inherit" }} onClick={v.sessionSubmitDo}>{v.sessionSubmitting ? "提交中…" : "提交答案"}</button>
                  )}
                  <button style={{ background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff", borderRadius: "8px", padding: "9px 20px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "8px" }} onClick={v.sessionNext}>下一题<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: flat answer card (1..N, frozen order) */}
        <div style={{ ...PANEL, padding: "18px", flex: "1 1 262px", minWidth: "240px" }}>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: "15px", fontWeight: 700, color: "var(--ink)", marginBottom: "14px" }}>答题卡</div>
          <div style={{ display: "flex", gap: "12px", rowGap: "8px", flexWrap: "wrap", marginBottom: "16px", fontSize: "11.5px", color: "var(--ink2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "11px", height: "11px", borderRadius: "4px", background: "var(--pri)" }}></span>当前</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "11px", height: "11px", borderRadius: "4px", background: "var(--pri-w)", border: "1px solid var(--pri-w2)" }}></span>已答</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "11px", height: "11px", borderRadius: "4px", border: "1px solid #D3D9E3" }}></span>未答</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}><span style={{ width: "11px", height: "11px", borderRadius: "4px", background: "#FDF3E7", border: "1px solid #F5B45A" }}></span>标记</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {v.sessionCard.map((b) => (<div key={b.n} style={cardBubble(b)} onClick={b.go}>{b.n}</div>))}
          </div>
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--line)", fontSize: "12px", color: "var(--ink3)" }}>
            已答 <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--ink)", fontWeight: 700 }}>{v.sessionAnsweredCount}</span> / {v.sessionTotal}
            {isPractice && <> · 已提交 <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--ink)", fontWeight: 700 }}>{v.sessionSubmittedCount}</span></>}
          </div>
        </div>
      </div>

      {/* Bottom bar: exam 交卷 / practice 结束本轮 */}
      <div className="bo-wrap" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "12px", padding: "14px 22px", marginTop: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "13px", color: "var(--ink3)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
          {isExam ? (
            <span>考试中请勿离开页面 · 交卷后不可返回修改 · 已答 <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--ink)", fontWeight: 700 }}>{v.sessionAnsweredCount}</span> / {v.sessionTotal}</span>
          ) : (
            <span>刷题即时判分 · 随时可结束本轮 · 已作答 <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "var(--ink)", fontWeight: 700 }}>{v.sessionSubmittedCount}</span> / {v.sessionTotal}</span>
          )}
        </div>
        {isExam ? (
          <button disabled={v.sessionSubmitting} style={{ background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff", borderRadius: "9px", padding: "11px 34px", fontSize: "14px", fontWeight: 700, cursor: v.sessionSubmitting ? "default" : "pointer", opacity: v.sessionSubmitting ? 0.6 : 1, fontFamily: "inherit", boxShadow: "0 6px 16px rgba(45,91,255,.24)" }} onClick={v.sessionSubmitExamDo}>{v.sessionSubmitting ? "提交中…" : "交卷"}</button>
        ) : (
          <button style={{ background: "var(--pri)", border: "1px solid var(--pri)", color: "#fff", borderRadius: "9px", padding: "11px 30px", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 6px 16px rgba(45,91,255,.24)" }} onClick={v.sessionFinishDo}>结束本轮</button>
        )}
      </div>

    </div>
  );
}
