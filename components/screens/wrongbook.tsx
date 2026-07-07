"use client";
import { useApp } from "@/lib/app-context";

export function WrongbookScreen() {
  const v = useApp();
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

      {/* CARDS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {v.wbList.map((it) => (
          <div key={it.id} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '12px' }}><span style={it.typeChip}>{it.type}</span><span style={it.diffChip.style}><span style={it.diffChip.dot}></span>{it.diffChip.label}</span></div>
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
