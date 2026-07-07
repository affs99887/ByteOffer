"use client";
import { useApp } from "@/lib/app-context";
import { AnswerFieldByType } from "@/components/qbank/answer-field";

export function PracticeScreen() {
  const v = useApp();
  return (
    <div data-screen-label="刷题练习" className="bo-enter" style={{ maxWidth: '1440px', margin: '0 auto' }}>

      {v.pShowAnaInv && (
        <div className="bo-col2" style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: '16px', alignItems: 'start' }}>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '18px 18px' }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.13em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '5px' }}>// FILTERS</div>
            <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>筛选条件</div>

            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '16px 0 8px' }}>题型</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', maxHeight: '288px', overflowY: 'auto' }}>
              {v.pfTypeList.map((t, i) => (
                <div key={t.k}>
                  {(i === 0 || v.pfTypeList[i - 1].group !== t.group) && (
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9.5px', letterSpacing: '.12em', color: 'var(--ink3)', fontWeight: 600, margin: i === 0 ? '2px 0 4px' : '10px 0 4px' }}>{t.group}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 4px', cursor: t.disabled ? 'not-allowed' : 'pointer', borderRadius: '7px', opacity: t.disabled ? 0.45 : 1 }} onClick={t.go}>
                    <span style={t.box}>{t.on && (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4 10-10" /></svg>)}</span>
                    <span style={{ fontSize: '13.5px', color: 'var(--ink)', fontWeight: 500 }}>{t.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '16px 0 8px' }}>难度</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {v.pfDiffs.map((d, i) => (
                <div key={i} style={d.style} onClick={d.go}><span style={d.dotStyle}></span><span style={{ fontSize: '13.5px', color: 'var(--ink)', fontWeight: 500 }}>{d.k}</span></div>
              ))}
            </div>

            {v.pfTagList.length > 0 && (<>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '16px 0 9px' }}>标签 · 可多选</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {v.pfTagList.map((t, i) => (
                  <span key={i} style={t.style} onClick={t.go}>{t.k}</span>
                ))}
              </div>
            </>)}

            <div style={{ display: 'flex', gap: '9px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <button style={{ flex: 'none', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.resetFiltersDo}>重置</button>
              <button style={{ flex: 1, background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.pRestart}>应用筛选</button>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px 28px 18px', display: 'flex', flexDirection: 'column', minHeight: '566px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
              {v.pHasQ && <span style={v.pTypeChip}>{v.pQ.type}</span>}
              {v.pHasQ && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', color: 'var(--ink2)', fontWeight: 600 }}>第 {v.pNo} 题</span>}
              <div style={{ flex: 1, height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden', maxWidth: '240px' }}><div style={v.pBarStyle}></div></div>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', color: 'var(--ink2)', fontWeight: 600 }}>今日 {v.statTodayLive} / {v.pGoal}</span>
              <div style={{ flex: 1 }}></div>
              {v.pHasQ && (<>
                <span style={v.pDiffChip.style}><span style={v.pDiffChip.dot}></span>{v.pDiffChip.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--ink3)', fontSize: '12.5px', fontWeight: 600 }} onClick={v.pToggleFav}>
                  {v.pFav && (<svg width="17" height="17" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>)}
                  {v.pFavInv && (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>)}
                  收藏
                </div>
              </>)}
            </div>

            {v.pExhausted ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '14px', padding: '40px 0' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--pri-w)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
                <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>本轮题目已刷完</div>
                <div style={{ fontSize: '13.5px', color: 'var(--ink3)', lineHeight: 1.7 }}>调整筛选可获得不同题目</div>
                <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '9px', padding: '10px 24px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.pRestart}>重新开始</button>
              </div>
            ) : !v.pHasQ ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '10px', padding: '40px 0' }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink2)' }}>{v.pLoading ? '正在加载题目…' : v.pQ.q}</div>
              </div>
            ) : (<>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.55, marginBottom: '22px' }}>{v.pQ.q}</div>

              {v.pFieldProps && <AnswerFieldByType {...v.pFieldProps} />}

              {v.pSubmitError && (
                v.pSubmitError.code === 'PAYMENT_REQUIRED' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'var(--pri-w)', border: '1px solid var(--pri-w2)', borderRadius: '10px', padding: '12px 16px', marginTop: '16px' }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><path d="M13 2L3 14h9l-1 8 10-12h-9z" /></svg>
                    <span style={{ flex: 1, minWidth: '160px', fontSize: '13.5px', color: 'var(--ink2)', fontWeight: 500 }}>{v.pSubmitError.message}</span>
                    <a href="/pricing" style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>升级 Plus →</a>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'rgba(240,68,56,.08)', border: '1px solid rgba(240,68,56,.28)', borderRadius: '10px', padding: '12px 16px', marginTop: '16px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D63C31" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
                    <span style={{ flex: 1, minWidth: '160px', fontSize: '13.5px', color: '#D63C31', fontWeight: 500 }}>{v.pSubmitError.message}</span>
                    <button style={{ background: 'var(--surface)', border: '1px solid rgba(240,68,56,.4)', color: '#D63C31', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }} onClick={v.pSubmit}>重试</button>
                  </div>
                )
              )}

              <div style={{ flex: 1, minHeight: '20px' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
                <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '9px 16px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.pNext}>跳过</button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button disabled={v.pNo <= 1} style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '8px', padding: '9px 18px', fontSize: '13.5px', fontWeight: 600, cursor: v.pNo <= 1 ? 'not-allowed' : 'pointer', opacity: v.pNo <= 1 ? 0.45 : 1, fontFamily: 'inherit' }} onClick={v.pPrev}>上一题</button>
                  {!v.pGrade && (
                    <button disabled={v.pSubmitting} style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '8px', padding: '9px 18px', fontSize: '13.5px', fontWeight: 600, cursor: v.pSubmitting ? 'default' : 'pointer', opacity: v.pSubmitting ? 0.6 : 1, fontFamily: 'inherit' }} onClick={v.pSubmit}>{v.pSubmitting ? '提交中…' : '提交答案'}</button>
                  )}
                  <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '9px 20px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={v.pNext}>下一题<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--ink3)' }}>
                <span>← 上一题</span><span>→ 下一题</span><span>⏎ 提交答案</span>
              </div>
            </>)}
          </div>
        </div>
      )}

      {v.pShowAna && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={v.pToggleAna}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H6M11 6l-6 6 6 6" /></svg>返回题目</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E9F6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 12l2.4 2.4L15.5 9" /></svg><span style={{ fontSize: '14px', color: 'var(--ink2)' }}>正确答案</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '15px', fontWeight: 700, color: '#0E9F6E' }}>{v.pCorrect}</span></div>
            <div style={{ width: '1px', height: '18px', background: 'var(--line)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {v.pAnsWrong && (<><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F04438" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></svg><span style={{ fontSize: '14px', color: 'var(--ink2)' }}>你的答案</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '15px', fontWeight: 700, color: '#F04438' }}>{v.pYourAns}</span></>)}
              {v.pPartial && (<><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F79009" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg><span style={{ fontSize: '14px', color: 'var(--ink2)' }}>你的答案</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '15px', fontWeight: 700, color: '#F79009' }}>{v.pYourAns} · 部分正确 {Math.round((v.pGrade?.score ?? 0) * 100)}%</span></>)}
              {v.pAnsRight && (<><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E9F6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8.5 12l2.4 2.4L15.5 9" /></svg><span style={{ fontSize: '14px', color: 'var(--ink2)' }}>你的答案</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '15px', fontWeight: 700, color: '#0E9F6E' }}>{v.pYourAns}</span></>)}
            </div>
            <div style={{ flex: 1 }}></div>
            <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '8px 13px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={v.pToggleFav}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>收藏</button>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px 26px' }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.13em', color: 'var(--pri)', fontWeight: 600, marginBottom: '10px' }}>// 解析</div>
            <div style={{ fontSize: '14.5px', color: 'var(--ink2)', lineHeight: 1.85 }}>{v.pAna.explain}</div>

            {v.pAnaPoints.length > 0 && (<>
              <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)', margin: '24px 0 14px', paddingTop: '22px', borderTop: '1px solid var(--line)' }}>关键知识点</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {v.pAnaPoints.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}><span style={{ width: '20px', height: '20px', flex: 'none', borderRadius: '6px', background: 'var(--pri-w)', color: 'var(--pri)', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>{p.i}</span><span style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.6 }}>{p.t}</span></div>
                ))}
              </div>
            </>)}

            {v.pAna.pitfalls.length > 0 && (<>
              <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)', margin: '24px 0 14px', paddingTop: '22px', borderTop: '1px solid var(--line)' }}>常见陷阱</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {v.pAna.pitfalls.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}><span style={{ width: '6px', height: '6px', flex: 'none', borderRadius: '50%', background: '#F04438', marginTop: '8px' }}></span><span style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.6 }}>{p}</span></div>
                ))}
              </div>
            </>)}

            {v.pAna.related.length > 0 && (<>
              <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)', margin: '24px 0 14px', paddingTop: '22px', borderTop: '1px solid var(--line)' }}>相关考点</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px' }}>
                {v.pAna.related.map((r, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--ink)', fontWeight: 500 }}><span style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--pri)', fontSize: '11px' }}>›</span>{r}</span>
                ))}
              </div>
            </>)}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '18px' }}>
            <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.pToggleAna}>‹ 返回题目</button>
            <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '10px 20px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={v.pNext}>下一题<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>
          </div>
        </div>
      )}

    </div>
  );
}
