"use client";
import { useApp } from "@/lib/app-context";
import { AnswerFieldByType } from "@/components/qbank/answer-field";

export function ExamScreen() {
  const v = useApp();
  return (
    <div data-screen-label="模拟面试 考试" className="bo-enter" style={{ maxWidth: '1440px', margin: '0 auto' }}>

      {v.examSubmittedInv && (<>
      {v.examStartError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(240,68,56,.08)', border: '1px solid rgba(240,68,56,.28)', color: '#D63C31', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13.5px', fontWeight: 600 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
          无法开始考试，请稍后重试（服务暂时不可用）。
        </div>
      )}
      <div className="bo-flexcol" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '18px', flex: '1 1 236px', minWidth: '214px', maxWidth: '290px' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.13em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '5px' }}>// SETUP</div>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '16px' }}>考试设置</div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', marginBottom: '8px' }}>试卷类型</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}>前端综合能力测试<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg></div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '15px 0 8px' }}>题目数量</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer' }}><span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>30</span> 题</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg></div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '15px 0 9px' }}>题型分布</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: '7px', padding: '7px 10px', fontSize: '12.5px', color: 'var(--ink2)' }}>单选题<span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--ink)' }}>15</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: '7px', padding: '7px 10px', fontSize: '12.5px', color: 'var(--ink2)' }}>多选题<span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--ink)' }}>5</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: '7px', padding: '7px 10px', fontSize: '12.5px', color: 'var(--ink2)' }}>判断题<span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--ink)' }}>5</span></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: '7px', padding: '7px 10px', fontSize: '12.5px', color: 'var(--ink2)' }}>问答题<span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: 'var(--ink)' }}>5</span></div>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '15px 0 9px' }}>难度分布</div>
          <div style={{ display: 'flex', height: '8px', borderRadius: '5px', overflow: 'hidden', marginBottom: '9px' }}><div style={{ width: '30%', background: '#12B76A' }}></div><div style={{ width: '50%', background: '#F79009' }}></div><div style={{ width: '20%', background: '#F04438' }}></div></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px' }}><span style={{ color: '#0E9F6E' }}>简单 30%</span><span style={{ color: '#B7791F' }}>中等 50%</span><span style={{ color: '#D63C31' }}>困难 20%</span></div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink2)', margin: '16px 0 8px' }}>公司真题</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', border: '1px solid var(--pri-w2)', background: 'var(--pri-w)', color: 'var(--pri)', borderRadius: '7px', padding: '6px 11px', fontSize: '12.5px', fontWeight: 600 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4 4 10-10"/></svg>包含大厂真题</div>
          <button style={{ width: '100%', marginTop: '18px', background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '9px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 16px rgba(45,91,255,.24)' }} onClick={v.examResetDo}>重新开始考试</button>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '22px 26px 18px', display: 'flex', flexDirection: 'column', minHeight: '566px', flex: '100 1 360px', minWidth: '326px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '18px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}><span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F04438', boxShadow: '0 0 0 4px rgba(240,68,56,.13)' }}></span><span style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>考试进行中</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '19px', fontWeight: 700, color: '#E5342A', letterSpacing: '.02em' }}>{v.examTime}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '14px', color: 'var(--ink2)', fontWeight: 600 }}>{v.examNo} / {v.examTotal}</span></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '22px 0 16px' }}><span style={v.examTypeChip}>{v.examQ.type}</span><span style={v.examDiffChip.style}><span style={v.examDiffChip.dot}></span>{v.examDiffChip.label}</span></div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1.55, marginBottom: '20px' }}>{v.examQ.q}</div>
          {v.examFieldProps && <AnswerFieldByType {...v.examFieldProps} />}
          <div style={{ flex: 1, minHeight: '20px' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
            <button style={{ display: 'flex', alignItems: 'center', gap: '7px', background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink2)', borderRadius: '8px', padding: '9px 15px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.examMark}>
              {v.examMarkedCur && (<><svg width="15" height="15" viewBox="0 0 24 24" fill="#F5A623" stroke="#F5A623" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z"/></svg>已标记</>)}
              {v.examMarkedCurInv && (<><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.9l-4.7 2.35.9-5.23-3.8-3.7 5.25-.76z"/></svg>标记本题</>)}
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '8px', padding: '9px 18px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.examPrev}>上一题</button>
              <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '9px 20px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={v.examNext}>下一题<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg></button>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '18px', flex: '1 1 262px', minWidth: '240px' }}>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '14px' }}>答题卡</div>
          <div style={{ display: 'flex', gap: '14px', marginBottom: '16px', fontSize: '11.5px', color: 'var(--ink2)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '11px', height: '11px', borderRadius: '4px', background: 'var(--pri)' }}></span>已答</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '11px', height: '11px', borderRadius: '4px', border: '1px solid #D3D9E3' }}></span>未答</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '11px', height: '11px', borderRadius: '4px', background: '#FDF3E7', border: '1px solid #F5B45A' }}></span>标记</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.06em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '9px' }}>单选题 · 15</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>{v.bubbles1.map((b, i) => (<div key={i} style={b.st} onClick={b.go}>{b.n}</div>))}</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.06em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '9px' }}>多选题 · 5</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>{v.bubbles2.map((b, i) => (<div key={i} style={b.st} onClick={b.go}>{b.n}</div>))}</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.06em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '9px' }}>判断题 · 5</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>{v.bubbles3.map((b, i) => (<div key={i} style={b.st} onClick={b.go}>{b.n}</div>))}</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '.06em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '9px' }}>问答题 · 5</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{v.bubbles4.map((b, i) => (<div key={i} style={b.st} onClick={b.go}>{b.n}</div>))}</div>
        </div>
      </div>

      <div className="bo-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '14px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', fontSize: '13px', color: 'var(--ink3)' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>考试中请勿离开页面 · 交卷后不可返回修改 · 已答 <span style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--ink)', fontWeight: 700 }}>{v.examAnsweredCount}</span> / 30</div>
        <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '9px', padding: '11px 34px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 16px rgba(45,91,255,.24)' }} onClick={v.examSubmitDo}>交卷</button>
      </div>
      </>)}

      {v.examSubmitted && (<>
      <div style={{ maxWidth: '720px', margin: '20px auto 0', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '14px', padding: '36px 40px', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', margin: '0 auto 18px', borderRadius: '18px', background: 'var(--pri-w)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>
        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '22px', fontWeight: 700, color: 'var(--ink)' }}>交卷成功</div>
        <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '6px' }}>{v.examServerPending ? '正在评分，请稍候…' : '本次「前端综合能力测试」已完成，成绩如下'}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px', margin: '24px 0' }}>{v.examServerPending ? (<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '40px', fontWeight: 700, color: 'var(--ink3)', lineHeight: 1 }}>评分中…</span>) : (<><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '56px', fontWeight: 700, color: 'var(--pri)', lineHeight: 1 }}>{v.examScore100}</span><span style={{ fontSize: '20px', color: 'var(--ink3)', fontWeight: 600 }}>/ 100</span></>)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '26px' }}>
          <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '24px', fontWeight: 700, color: '#0E9F6E' }}>{v.examCorrect}</div><div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px' }}>答对</div></div>
          <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '24px', fontWeight: 700, color: '#F04438' }}>{v.examWrong}</div><div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px' }}>答错</div></div>
          <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '24px', fontWeight: 700, color: 'var(--ink3)' }}>{v.examUnanswered}</div><div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px' }}>未答</div></div>
          <div style={{ border: '1px solid var(--line)', borderRadius: '10px', padding: '14px' }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '24px', fontWeight: 700, color: 'var(--ink)' }}>{v.examAnsweredCount}</div><div style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: '3px' }}>已答</div></div>
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '9px', padding: '11px 22px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.nav.wrongbook.go}>查看错题解析</button>
          <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '9px', padding: '11px 26px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={v.examResetDo}>再考一次</button>
        </div>
      </div>
      </>)}

    </div>
  );
}
