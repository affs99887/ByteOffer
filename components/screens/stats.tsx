"use client";
import { useApp } from "@/lib/app-context";
import { CountUp } from "@/components/count-up";

export function StatsScreen() {
  const v = useApp();
  return (
    <div data-screen-label="数据统计" className="bo-enter" style={{ maxWidth: '1440px', margin: '0 auto' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.14em', color: 'var(--pri)', fontWeight: 600, marginBottom: '16px' }}>// ANALYTICS · 数据统计</div>

      <div className="bo-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(202px,1fr))', gap: '14px', marginBottom: '16px' }}>
        <div className="bo-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '17px 18px' }}><div style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 600 }}>累计刷题</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '30px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginTop: '13px' }}><CountUp to={v.authed ? v.statTotalAttempts : 1284} comma /></div><div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink3)' }}><span style={{ fontFamily: "'JetBrains Mono',monospace", color: '#0E9F6E', fontWeight: 700 }}>+{v.authed ? v.statTodayCount : 42}</span> 今日</div></div>
        <div className="bo-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '17px 18px' }}><div style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 600 }}>平均正确率</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '30px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginTop: '13px' }}><CountUp to={v.authed ? v.statAccuracyPct : 76.8} dec={v.authed ? 0 : 1} /><span style={{ fontSize: '18px', color: 'var(--ink3)' }}>%</span></div><div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink3)' }}>客观题 · 近30天</div></div>
        <div className="bo-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '17px 18px' }}><div style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 600 }}>学习时长</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '30px', fontWeight: 700, color: 'var(--ink)', lineHeight: 1, marginTop: '13px' }}><CountUp to={v.authed ? v.statStudyHours : 86.5} dec={1} /><span style={{ fontSize: '15px', color: 'var(--ink3)', fontWeight: 500 }}> h</span></div><div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink3)' }}>连续 <span style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--ink2)', fontWeight: 700 }}>{v.authed ? v.statStreak : 18}</span> 天</div></div>
      </div>

      <div className="bo-col2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,7fr) minmax(0,5fr)', gap: '16px', marginBottom: '16px', alignItems: 'start' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px 22px' }}>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>正确率趋势 · 近 10 次</div>
          <svg viewBox="0 0 640 224" style={{ width: '100%', height: 'auto', display: 'block' }}>
            <line x1="40" y1="18" x2="628" y2="18" stroke="rgba(20,26,45,.05)" strokeWidth="1" /><line x1="40" y1="74.7" x2="628" y2="74.7" stroke="rgba(20,26,45,.05)" strokeWidth="1" /><line x1="40" y1="131.3" x2="628" y2="131.3" stroke="rgba(20,26,45,.05)" strokeWidth="1" /><line x1="40" y1="188" x2="628" y2="188" stroke="rgba(20,26,45,.09)" strokeWidth="1" />
            <text x="30" y="22" textAnchor="end" fill="#AEB6C2" fontSize="10.5" fontFamily="'JetBrains Mono',monospace">100</text><text x="30" y="78.7" textAnchor="end" fill="#AEB6C2" fontSize="10.5" fontFamily="'JetBrains Mono',monospace">75</text><text x="30" y="135.3" textAnchor="end" fill="#AEB6C2" fontSize="10.5" fontFamily="'JetBrains Mono',monospace">50</text><text x="30" y="192" textAnchor="end" fill="#AEB6C2" fontSize="10.5" fontFamily="'JetBrains Mono',monospace">25</text>
            {v.statTrend.ready ? (
              <>
                <path d={v.statTrend.area} fill="var(--pri)" opacity="0.06" />
                <polyline points={v.statTrend.points} fill="none" stroke="var(--pri)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 1600, strokeDashoffset: 1600, animation: 'boDraw 1.6s ease .3s both' }} />
                {v.statTrend.dots.map((d, i) => (
                  <g key={i}>
                    <circle cx={d.x} cy={d.y} r={i === v.statTrend.dots.length - 1 ? 4.2 : 3.2} fill={i === v.statTrend.dots.length - 1 ? 'var(--pri)' : '#fff'} stroke={i === v.statTrend.dots.length - 1 ? '#fff' : 'var(--pri)'} strokeWidth={i === v.statTrend.dots.length - 1 ? 2.2 : 2} />
                    <text x={d.x} y="210" textAnchor="middle" fill="#9AA3B2" fontSize="11" fontFamily="'JetBrains Mono',monospace">{d.label}</text>
                  </g>
                ))}
              </>
            ) : v.authed ? (
              <text x="334" y="108" textAnchor="middle" fill="var(--ink3)" fontSize="13" fontFamily="'Noto Sans SC',sans-serif">完成几次练习后这里会出现趋势</text>
            ) : (
              <>
                <path d="M62,150 L124,120 L186,132 L248,96 L310,108 L372,72 L434,88 L496,60 L558,74 L620,44 L620,188 L62,188 Z" fill="var(--pri)" opacity="0.06" />
                <polyline points="62,150 124,120 186,132 248,96 310,108 372,72 434,88 496,60 558,74 620,44" fill="none" stroke="var(--pri)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 1600, strokeDashoffset: 1600, animation: 'boDraw 1.6s ease .3s both' }} />
                <circle cx="62" cy="150" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="124" cy="120" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="186" cy="132" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="248" cy="96" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="310" cy="108" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="372" cy="72" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="434" cy="88" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="496" cy="60" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="558" cy="74" r="3.2" fill="#fff" stroke="var(--pri)" strokeWidth="2" /><circle cx="620" cy="44" r="4.2" fill="var(--pri)" stroke="#fff" strokeWidth="2.2" />
              </>
            )}
          </svg>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px 22px' }}>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '18px' }}>题型表现</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {v.authed ? (
              v.statTypeBars.length > 0 ? (
                v.statTypeBars.map((t) => (
                  <div key={t.label}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>{t.label}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>{t.pct}%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={t.barStyle} /></div></div>
                ))
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--ink3)', padding: '8px 0' }}>暂无题型数据</div>
              )
            ) : (
            <>
            <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>单选题</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>82%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '82%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
            <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>多选题</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>68%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '68%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
            <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>判断题</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>90%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '90%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
            <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>填空题</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>74%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '74%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
            <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>问答题</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>61%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '61%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
            </>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px 22px' }}>
        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '15px', fontWeight: 700, color: 'var(--ink)', marginBottom: '18px' }}>分类正确率</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '16px 32px' }}>
          {v.authed ? (
            v.statCategoryBars.length > 0 ? (
              v.statCategoryBars.map((c) => (
                <div key={c.name}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>{c.name}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>{c.pct}%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={c.barStyle} /></div></div>
              ))
            ) : (
              <div style={{ gridColumn: '1 / -1', fontSize: '13px', color: 'var(--ink3)', padding: '4px 0' }}>暂无分类数据</div>
            )
          ) : (
            <>
              <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>HTML</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>85%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '85%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
              <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>CSS</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>79%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '79%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
              <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>JavaScript</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>74%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '74%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
              <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>TypeScript</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>66%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '66%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
              <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>React</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>71%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '71%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
              <div><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontSize: '13px', color: 'var(--ink)' }}>Vue</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>69%</span></div><div style={{ height: '6px', background: 'var(--track)', borderRadius: '6px', overflow: 'hidden' }}><div style={{ width: '69%', height: '100%', background: 'var(--pri)', borderRadius: '6px', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }} /></div></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
