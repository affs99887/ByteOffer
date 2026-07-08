"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useApp } from "@/lib/app-context";
import { CountUp } from "@/components/count-up";

// Honest 较昨日 delta helpers (authed): color by sign, format gains with an explicit +.
const deltaColor = (d: number) => (d > 0 ? "#0E9F6E" : d < 0 ? "#D63C31" : "var(--ink3)");
const fmtDelta = (d: number) => {
  const r = Math.round(d * 10) / 10;
  return r > 0 ? `+${r}` : `${r}`;
};

export function HomeScreen() {
  const v = useApp();
  // Local time-of-day greeting (authed). Computed after mount to avoid an SSR/client hydration
  // mismatch (server clock ≠ viewer clock); a neutral 你好 shows on the very first paint only.
  const [greet, setGreet] = useState("你好");
  useEffect(() => {
    const h = new Date().getHours();
    setGreet(h < 12 ? "早上好" : h < 18 ? "下午好" : "晚上好");
  }, []);
  const deltaLine: CSSProperties = { marginTop: "10px", fontSize: "12px", color: "var(--ink3)", display: "flex", alignItems: "center", gap: "6px" };
  return (
    <div data-screen-label="首页 仪表盘" className="bo-enter" style={{ maxWidth: '1440px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.14em', color: 'var(--pri)', fontWeight: 600, marginBottom: '10px' }}>// 仪表盘 · OVERVIEW</div>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '26px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.01em' }}>{`${greet}，${v.user?.name || '同学'}`}</div>
          <div style={{ fontSize: '13.5px', color: 'var(--ink2)', marginTop: '8px' }}>今日已完成 <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{v.statTodayLive}</span> 题，保持节奏。</div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '10px 18px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgba(45,91,255,.24)' }} onClick={v.nav.qbank.go}>继续刷题<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg></button>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="bo-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(202px,1fr))', gap: '14px', marginBottom: '26px' }}>
        <div className="bo-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '17px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 600 }}>题库总数</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .6 }}><path d="M6 4h11a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z" /><path d="M6 4a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h13" /></svg></div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '30px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.02em', lineHeight: 1, marginTop: '13px' }}><CountUp to={v.bankTotal ?? 0} comma /></div>
        </div>
        <div className="bo-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '17px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 600 }}>今日完成</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .6 }}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12l2.4 2.4L15.5 9.5" /></svg></div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '30px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.02em', lineHeight: 1, marginTop: '13px' }}><CountUp to={v.statTodayLive} /></div>
          {v.statTodayDeltaAttempts != null ? (
            <div style={deltaLine}><span style={{ fontFamily: "'JetBrains Mono',monospace", color: deltaColor(v.statTodayDeltaAttempts), fontWeight: 700 }}>{fmtDelta(v.statTodayDeltaAttempts)}</span>较昨日</div>
          ) : null}
        </div>
        <div className="bo-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '17px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 600 }}>正确率</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="1.7" style={{ opacity: .6 }}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /></svg></div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '30px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.02em', lineHeight: 1, marginTop: '13px' }}><CountUp to={v.statAccuracyPct} dec={0} /><span style={{ fontSize: '18px', color: 'var(--ink3)' }}>%</span></div>
          {v.statAccuracyDelta != null ? (
            <div style={deltaLine}><span style={{ fontFamily: "'JetBrains Mono',monospace", color: deltaColor(v.statAccuracyDelta), fontWeight: 700 }}>{fmtDelta(v.statAccuracyDelta)}%</span>较昨日</div>
          ) : null}
        </div>
        <div className="bo-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '17px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><span style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 600 }}>连续打卡</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .6 }}><path d="M13 3L6 13h5l-1 8 7-11h-5z" /></svg></div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '30px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.02em', lineHeight: 1, marginTop: '13px' }}><CountUp to={v.statStreak} /><span style={{ fontSize: '15px', color: 'var(--ink3)', fontWeight: 500 }}> 天</span></div>
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>累计练习 <span style={{ fontFamily: "'JetBrains Mono',monospace", color: 'var(--ink2)', fontWeight: 700 }}>{v.statTotalLive}</span> 题</div>
        </div>
      </div>

      {/* CATEGORIES */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.13em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '6px' }}>// CATEGORIES</div>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>分类练习进度</div>
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink3)', fontWeight: 600, fontFamily: "'Noto Sans SC'" }}>共 {v.categoryCards.length} 类</div>
      </div>
      <div className="bo-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(214px,1fr))', gap: '14px', marginBottom: '26px' }}>
        {v.categoryCards.length > 0 ? (
          v.categoryCards.map((c) => (
              <div key={c.name} className="bo-card" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '11px', padding: '13px 14px 0', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', flex: 'none', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: '12px', color: 'var(--ink)' }}>{c.name.slice(0, 2)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div></div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink2)', fontWeight: 600 }}>{c.accuracyPct != null ? `${c.accuracyPct}%` : '—'}</div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--ink3)', margin: '9px 0 12px' }}>{c.count} 题</div>
                <div style={{ height: '3px', margin: '0 -14px', background: 'var(--track)' }}><div style={{ width: `${c.accuracyPct ?? 0}%`, height: '100%', background: 'var(--pri)', transformOrigin: 'left center', animation: 'boGrowX .9s cubic-bezier(.22,.61,.36,1) both' }}></div></div>
              </div>
            ))
          ) : (
            <div className="bo-card" style={{ gridColumn: '1 / -1', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '11px', padding: '22px 14px', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>题库分类整理中</div>
          )}
      </div>

      {/* RECENT + TREND */}
      <div className="bo-col2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,5fr) minmax(0,7fr)', gap: '16px', alignItems: 'start' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '18px 20px' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.13em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '5px' }}>// RECENT</div>
          <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '16px', fontWeight: 700, color: 'var(--ink)', marginBottom: '6px' }}>最近练习</div>
          {v.recentEmpty ? (
              <div style={{ padding: '18px 0 6px', textAlign: 'center' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink3)', marginBottom: '12px' }}>暂无练习记录，去刷题吧</div>
                <button onClick={v.nav.qbank.go} style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>去练习</button>
              </div>
            ) : (
              v.recentList.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 0', borderBottom: i === v.recentList.length - 1 ? 'none' : '1px solid var(--divider)' }}>
                  <div style={{ width: '32px', height: '32px', flex: 'none', border: '1px solid var(--line)', borderRadius: '8px', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: '11px', color: 'var(--ink)' }}>{r.type.slice(0, 2)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.q}</div>{r.last ? <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--ink3)', marginTop: '3px' }}>{r.last}</div> : null}</div>
                  <span style={r.diffChip.style}><span style={r.diffChip.dot}></span>{r.diffChip.label}</span>
                </div>
              ))
            )}
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.13em', color: 'var(--ink3)', fontWeight: 600, marginBottom: '5px' }}>// WEEKLY</div><div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '16px', fontWeight: 700, color: 'var(--ink)' }}>本周学习趋势</div></div>
            {v.statTrend.ready ? (
                <div style={{ display: 'flex', gap: '14px', paddingTop: '4px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--ink2)' }}><span style={{ width: '11px', height: '3px', borderRadius: '2px', background: 'var(--pri)' }}></span>正确率</span>
                </div>
              ) : null}
          </div>
          {v.statTrend.ready ? (
              <svg viewBox="0 0 640 224" style={{ width: '100%', height: 'auto', display: 'block' }}>
                <line x1="54" y1="18" x2="628" y2="18" stroke="rgba(20,26,45,.05)" strokeWidth="1" />
                <line x1="54" y1="74.7" x2="628" y2="74.7" stroke="rgba(20,26,45,.05)" strokeWidth="1" />
                <line x1="54" y1="131.3" x2="628" y2="131.3" stroke="rgba(20,26,45,.05)" strokeWidth="1" />
                <line x1="54" y1="188" x2="628" y2="188" stroke="rgba(20,26,45,.09)" strokeWidth="1" />
                <text x="44" y="22" textAnchor="end" fill="#AEB6C2" fontSize="10.5" fontFamily="'JetBrains Mono',monospace">100</text>
                <text x="44" y="78.7" textAnchor="end" fill="#AEB6C2" fontSize="10.5" fontFamily="'JetBrains Mono',monospace">75</text>
                <text x="44" y="135.3" textAnchor="end" fill="#AEB6C2" fontSize="10.5" fontFamily="'JetBrains Mono',monospace">50</text>
                <text x="44" y="192" textAnchor="end" fill="#AEB6C2" fontSize="10.5" fontFamily="'JetBrains Mono',monospace">25</text>
                <path d={v.statTrend.area} fill="var(--pri)" opacity="0.06" />
                <polyline points={v.statTrend.points} fill="none" stroke="var(--pri)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 1600, strokeDashoffset: 1600, animation: 'boDraw 1.6s ease .3s both' }} />
                {v.statTrend.dots.map((d, i) => (
                  <g key={i}>
                    <circle cx={d.x} cy={d.y} r={i === v.statTrend.dots.length - 1 ? 4.4 : 3.2} fill={i === v.statTrend.dots.length - 1 ? 'var(--pri)' : '#fff'} stroke={i === v.statTrend.dots.length - 1 ? '#fff' : 'var(--pri)'} strokeWidth={i === v.statTrend.dots.length - 1 ? 2.2 : 2} />
                    <text x={d.x} y="210" textAnchor="middle" fill="#9AA3B2" fontSize="11" fontFamily="'JetBrains Mono',monospace">{d.label}</text>
                  </g>
                ))}
              </svg>
            ) : (
              <div style={{ padding: '40px 0', textAlign: 'center', fontSize: '13px', color: 'var(--ink3)' }}>完成几次练习后这里会出现趋势</div>
            )}
        </div>
      </div>
    </div>
  );
}
