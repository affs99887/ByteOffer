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

            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '16px 0 9px' }}>标签 · 可多选</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {v.pfTagList.map((t, i) => (
                <span key={i} style={t.style} onClick={t.go}>{t.k}</span>
              ))}
              <span style={{ fontSize: '12.5px', fontWeight: 500, padding: '6px 10px', color: 'var(--ink3)', cursor: 'pointer' }}>展开更多…</span>
            </div>

            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '18px 0 9px' }}>公司真题</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 4px', cursor: 'pointer' }} onClick={v.pfCompanyGo}><span style={v.pfCompanyBox}></span><span style={{ fontSize: '13.5px', color: 'var(--ink)', fontWeight: 500 }}>仅看大厂真题</span></div>

            <div style={{ display: 'flex', gap: '9px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--line)' }}>
              <button style={{ flex: 'none', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.resetFiltersDo}>重置</button>
              <button style={{ flex: 1, background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '9px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>应用筛选</button>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px 28px 18px', display: 'flex', flexDirection: 'column', minHeight: '566px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
              <span style={v.pTypeChip}>{v.pQ.type}</span>
              <div style={{ flex: 1, height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden', maxWidth: '240px' }}><div style={v.pBarStyle}></div></div>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', color: 'var(--ink2)', fontWeight: 600 }}>{v.pNo} / {v.pTotal}</span>
              <div style={{ flex: 1 }}></div>
              <span style={v.pDiffChip.style}><span style={v.pDiffChip.dot}></span>{v.pDiffChip.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--ink3)', fontSize: '12.5px', fontWeight: 600 }} onClick={v.pToggleFav}>
                {v.pFav && (<svg width="17" height="17" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>)}
                {v.pFavInv && (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>)}
                收藏
              </div>
            </div>

            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.55, marginBottom: '22px' }}>{v.pQ.q}</div>

            {v.pFieldProps && <AnswerFieldByType {...v.pFieldProps} />}

            <div style={{ flex: 1, minHeight: '20px' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
              <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '9px 16px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.pNext}>跳过</button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '8px', padding: '9px 18px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.pSubmit}>提交答案</button>
                <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '9px 20px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={v.pNext}>下一题<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '20px', marginTop: '16px', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--ink3)' }}>
              <span>← 上一题</span><span>→ 下一题</span><span>M 标记本题</span><span>⏎ 提交答案</span>
            </div>
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
            <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '8px 13px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 4.3 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" /></svg>纠错</button>
            <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '8px 13px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={v.pToggleFav}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z" /></svg>收藏</button>
          </div>

          <div className="bo-col2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 344px', gap: '16px', alignItems: 'start' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px 26px' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.13em', color: 'var(--pri)', fontWeight: 600, marginBottom: '10px' }}>// 解析</div>
              <div style={{ fontSize: '14.5px', color: 'var(--ink2)', lineHeight: 1.85 }}>{v.pAna.explain}</div>

              <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)', margin: '24px 0 14px', paddingTop: '22px', borderTop: '1px solid var(--line)' }}>关键知识点</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {v.pAnaPoints.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}><span style={{ width: '20px', height: '20px', flex: 'none', borderRadius: '6px', background: 'var(--pri-w)', color: 'var(--pri)', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>{p.i}</span><span style={{ fontSize: '14px', color: 'var(--ink)', lineHeight: 1.6 }}>{p.t}</span></div>
                ))}
              </div>

              <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)', margin: '24px 0 14px', paddingTop: '22px', borderTop: '1px solid var(--line)' }}>常见陷阱</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {v.pAna.pitfalls.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}><span style={{ width: '6px', height: '6px', flex: 'none', borderRadius: '50%', background: '#F04438', marginTop: '8px' }}></span><span style={{ fontSize: '14px', color: 'var(--ink2)', lineHeight: 1.6 }}>{p}</span></div>
                ))}
              </div>

              <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14.5px', fontWeight: 700, color: 'var(--ink)', margin: '24px 0 14px', paddingTop: '22px', borderTop: '1px solid var(--line)' }}>相关题目推荐</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '9px' }}>
                {v.pAna.related.map((r, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--ink)', fontWeight: 500, cursor: 'pointer' }}><span style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--pri)', fontSize: '11px' }}>›</span>{r}</span>
                ))}
              </div>
            </div>

            <div style={{ background: '#0F1420', border: '1px solid #1E2636', borderRadius: '12px', padding: '20px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '150px', height: '150px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(45,91,255,.35),transparent 70%)' }}></div>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}><span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: '14px', fontWeight: 700, color: '#fff' }}>AI 讲解</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9.5px', letterSpacing: '.1em', color: '#6B7690', border: '1px solid #2A3348', borderRadius: '5px', padding: '2px 6px' }}>BETA</span></div>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 16px' }}><div style={{ width: '64px', height: '64px', borderRadius: '18px', background: 'linear-gradient(150deg,#2D5BFF,#6E7CF8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(45,91,255,.4)' }}><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="8" width="14" height="10" rx="3.5" /><path d="M12 5v3M12 3.5v.01" /><circle cx="9.5" cy="13" r="1.2" fill="#fff" stroke="none" /><circle cx="14.5" cy="13" r="1.2" fill="#fff" stroke="none" /><path d="M3.5 12v3M20.5 12v3" /></svg></div></div>
                <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>Hi，我是你的 AI 助教</div>
                <div style={{ fontSize: '13px', color: '#98A2B8', lineHeight: 1.7, marginBottom: '16px' }}>我来帮你更深入地理解这道题目，随时提问。</div>
                <button style={{ width: '100%', background: 'rgba(45,91,255,.14)', border: '1px solid rgba(45,91,255,.4)', color: '#fff', borderRadius: '9px', padding: '11px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px', marginBottom: '18px' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" stroke="none"><path d="M8 5v14l11-7z" /></svg>播放语音讲解<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: '#8A93AC', fontWeight: 500 }}>02:36</span></button>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', letterSpacing: '.12em', color: '#6B7690', fontWeight: 600, marginBottom: '9px' }}>AI 总结</div>
                <div style={{ fontSize: '13px', color: '#B4BDD0', lineHeight: 1.75, marginBottom: '18px' }}>{v.pAna.ai}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px', background: '#161C2A', border: '1px solid #262F42', borderRadius: '9px', padding: '10px 12px' }}><input placeholder="输入你的问题…" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', fontFamily: 'inherit' }} /><div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg></div></div>
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px 26px', marginTop: '16px' }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.13em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '6px' }}>// KNOWLEDGE GRAPH</div>
            <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '8px' }}>知识图谱</div>
            <svg viewBox="0 0 860 210" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <line x1="430" y1="105" x2="180" y2="52" stroke="#D3DBEC" strokeWidth="1.5" />
              <line x1="430" y1="105" x2="410" y2="40" stroke="#C3D0F5" strokeWidth="1.5" />
              <line x1="430" y1="105" x2="690" y2="55" stroke="#C3D0F5" strokeWidth="1.5" />
              <line x1="430" y1="105" x2="705" y2="150" stroke="#D3DBEC" strokeWidth="1.5" />
              <line x1="430" y1="105" x2="180" y2="158" stroke="#D3DBEC" strokeWidth="1.5" />
              <g><ellipse cx="180" cy="52" rx="52" ry="22" fill="#F4F6FB" stroke="var(--line)" /><text x="180" y="57" textAnchor="middle" fill="#46506A" fontSize="13" fontFamily="'Noto Sans SC',sans-serif" fontWeight="600">执行栈</text></g>
              <g><ellipse cx="410" cy="40" rx="60" ry="22" fill="#EAEEFF" stroke="var(--pri-w2)" /><text x="410" y="45" textAnchor="middle" fill="var(--pri-a)" fontSize="13" fontFamily="'Noto Sans SC',sans-serif" fontWeight="600">微任务队列</text></g>
              <g><ellipse cx="690" cy="55" rx="60" ry="22" fill="#EAEEFF" stroke="var(--pri-w2)" /><text x="690" y="60" textAnchor="middle" fill="var(--pri-a)" fontSize="13" fontFamily="'Noto Sans SC',sans-serif" fontWeight="600">宏任务队列</text></g>
              <g><ellipse cx="705" cy="150" rx="52" ry="22" fill="#F4F6FB" stroke="var(--line)" /><text x="705" y="155" textAnchor="middle" fill="#46506A" fontSize="13" fontFamily="'Noto Sans SC',sans-serif" fontWeight="600">异步任务</text></g>
              <g><ellipse cx="180" cy="158" rx="52" ry="22" fill="#F4F6FB" stroke="var(--line)" /><text x="180" y="163" textAnchor="middle" fill="#46506A" fontSize="13" fontFamily="'Noto Sans SC',sans-serif" fontWeight="600">渲染时机</text></g>
              <circle cx="430" cy="105" r="46" fill="var(--pri)" />
              <text x="430" y="101" textAnchor="middle" fill="#fff" fontSize="14" fontFamily="'Noto Sans SC',sans-serif" fontWeight="700">事件循环</text>
              <text x="430" y="118" textAnchor="middle" fill="#C9D5FF" fontSize="9.5" fontFamily="'JetBrains Mono',monospace">Event Loop</text>
            </svg>
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
