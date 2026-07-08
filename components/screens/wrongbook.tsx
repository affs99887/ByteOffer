"use client";
import { useApp } from "@/lib/app-context";

export function WrongbookScreen() {
  const v = useApp();
  // V2 (§E): review-launch copy. wbReviewMode ("wrong"|"favorites") picks the noun; the active chapter
  // (v.wbChapter) narrows the scope in the hint. Both are AUTHED-only surfaces (demo keeps today's UI).
  const reviewNoun = v.wbReviewMode === "favorites" ? "收藏" : "错题";
  const reviewTitle = v.wbReviewMode === "favorites" ? "收藏复习" : "错题复习";
  const reviewHint = v.wbChapter ? `将复习「${v.wbChapter}」的${reviewNoun}` : `将复习全部${reviewNoun}`;
  // V2 (§E): the chapter filter is shown on 错题本/收藏夹 (never 最近练习) once the tree has real chapters.
  const showChapterFilter = v.authed && !v.wbIsRecent && v.wbChapterOptions.length > 1;
  const showReview = v.authed && v.wbCanReview;

  return (
    <div data-screen-label="错题本 收藏夹" className="bo-enter" style={{ maxWidth: '1000px', margin: '0 auto' }}>

      {/* TABS */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '26px', borderBottom: '1px solid var(--line)', marginBottom: '20px' }}>
        <div style={{ position: 'relative', padding: '0 2px 13px', cursor: 'pointer' }} onClick={v.wbGo错题本}>
          {v.wbIsWrong && (<><span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>错题本</span><span style={{ position: 'absolute', left: 0, right: 0, bottom: '-1px', height: '2.5px', borderRadius: '2px', background: 'var(--pri)' }}></span></>)}
          {v.wbIsWrongInv && (<><span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--ink3)' }}>错题本</span></>)}
        </div>
        <div style={{ position: 'relative', padding: '0 2px 13px', cursor: 'pointer' }} onClick={v.wbGo收藏夹}>
          {v.wbIsFav && (<><span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>收藏夹</span><span style={{ position: 'absolute', left: 0, right: 0, bottom: '-1px', height: '2.5px', borderRadius: '2px', background: 'var(--pri)' }}></span></>)}
          {v.wbIsFavInv && (<><span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--ink3)' }}>收藏夹</span></>)}
        </div>
        <div style={{ position: 'relative', padding: '0 2px 13px', cursor: 'pointer' }} onClick={v.wbGo最近}>
          {v.wbIsRecent && (<><span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>最近练习</span><span style={{ position: 'absolute', left: 0, right: 0, bottom: '-1px', height: '2.5px', borderRadius: '2px', background: 'var(--pri)' }}></span></>)}
          {v.wbIsRecentInv && (<><span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--ink3)' }}>最近练习</span></>)}
        </div>
      </div>

      {/* V2 CHAPTER FILTER (§E) — authed only, above the list on 错题本/收藏夹. Clicking go() refetches the
          list narrowed to that chapter AND rescopes the review launch. Mirrors the practice tag-chip style. */}
      {showChapterFilter && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '18px' }}>
          {v.wbChapterOptions.map((c, i) => (
            <span
              key={i}
              onClick={c.go}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                fontWeight: c.active ? 600 : 500,
                padding: '6px 12px',
                borderRadius: '7px',
                cursor: 'pointer',
                border: c.active ? '1px solid var(--pri)' : '1px solid var(--line)',
                background: c.active ? 'var(--pri-w)' : 'var(--surface)',
                color: c.active ? 'var(--pri)' : '#5A6172',
                transition: 'all .1s',
              }}
            >
              {c.label}
              {"count" in c && typeof c.count === "number" && (
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', opacity: 0.7 }}>{c.count}</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* V2 REVIEW LAUNCH (§E) — authed only, on 错题本/收藏夹 when the current scope has rows. Launches ONE
          frozen session over the tab scope (wrong/favorites) honoring the active chapter filter. */}
      {showReview && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '16px 20px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--pri-w)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)' }}>{reviewTitle}</div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '2px' }}>{reviewHint}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={v.wbReviewPractice}
                disabled={v.hubLaunching}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: v.hubLaunching ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: v.hubLaunching ? 0.6 : 1 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                刷题
              </button>
              <button
                onClick={v.wbReviewExam}
                disabled={v.hubLaunching}
                style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: v.hubLaunching ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: v.hubLaunching ? 0.6 : 1 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9 2h6"/></svg>
                模拟面试
              </button>
            </div>
          </div>
          {v.hubLaunching && (
            <div style={{ marginTop: '12px', fontSize: '12.5px', color: 'var(--ink3)' }}>正在生成复习题目…</div>
          )}
          {v.hubLaunchError && !v.hubLaunching && (
            <div style={{ marginTop: '12px', fontSize: '12.5px', color: '#D63C31' }}>{v.hubLaunchError.message || '启动复习失败，请稍后重试'}</div>
          )}
        </div>
      )}

      {/* CARDS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {v.wbList.map((it) => (
          <div key={it.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }}>
              <span style={it.typeChip}>{it.type}</span>
              <span style={it.diffChip.style}><span style={it.diffChip.dot}></span>{it.diffChip.label}</span>
              {/* V2 (§E): 章 · 节 breadcrumb (authed only; demo rows have no chapter/section). */}
              {v.authed && (
                <span title={it.chapterSection} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '55%', fontSize: '12px', fontWeight: 500, color: 'var(--ink3)', overflow: 'hidden' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.chapterSection}</span>
                </span>
              )}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.5, marginBottom: '13px' }}>{it.q}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '16px' }}>
              {it.tags.map((tg, j) => (<span key={j} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--ink3)', background: 'var(--chip)', borderRadius: '6px', padding: '4px 9px' }}>{tg}</span>))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', borderTop: '1px solid var(--divider)' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink3)' }}>{it.meta}</div>
              <div style={{ display: 'flex', gap: '9px' }}>
                <button style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={it.onFav}>
                  {it.fav && (<><svg width="14" height="14" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z"/></svg>已收藏</>)}
                  {it.favInv && (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z"/></svg>加入收藏</>)}
                </button>
                {it.canMaster && (
                  <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={it.onMaster}>标记已掌握</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* EMPTY STATE — authed honest empty per tab (demo lists fall back to sample rows, never empty) */}
      {v.wbEmpty && !v.wbLoading && !v.wbError && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '48px 22px', textAlign: 'center', color: 'var(--ink3)', fontSize: '14px' }}>
          {v.wbIsWrong ? '暂无错题，保持下去！' : v.wbIsFav ? '还没有收藏题目' : '暂无练习记录'}
        </div>
      )}

      {/* ERROR HINT */}
      {v.wbError && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px 22px', textAlign: 'center', color: '#D63C31', fontSize: '13.5px' }}>加载失败，请稍后重试</div>
      )}

      {/* PAGINATION — demo page buttons (empty in authed) + authed cursor 「加载更多」 */}
      {(v.pages.length > 0 || v.wbHasMore || v.wbLoading) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
          {v.pages.map((p, i) => (<div key={i} style={p.style} onClick={p.go}>{p.n}</div>))}
          {v.wbHasMore && (
            <button onClick={v.wbLoadMore} disabled={v.wbLoading} style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: v.wbLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: v.wbLoading ? 0.6 : 1 }}>{v.wbLoading ? '加载中…' : '加载更多'}</button>
          )}
          {v.wbLoading && !v.wbHasMore && (<span style={{ fontSize: '13px', color: 'var(--ink3)' }}>加载中…</span>)}
        </div>
      )}
    </div>
  );
}
