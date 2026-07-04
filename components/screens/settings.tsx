"use client";
import { useApp } from "@/lib/app-context";

export function SettingsScreen() {
  const v = useApp();
  return (
    <div data-screen-label="设置" className="bo-enter" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.14em', color: 'var(--pri)', fontWeight: 600, marginBottom: '16px' }}>// SETTINGS · 设置</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '22px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '18px' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '14px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '24px', flex: 'none' }}>白</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>前端小白</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>LV.24 · 黄金题手 · frontend@byteoffer.dev</div>
        </div>
        <button style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>编辑资料</button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '8px 24px', marginBottom: '16px' }}>
        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--ink)', padding: '16px 0 4px' }}>偏好设置</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--divider)' }}>
          <div><div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>每日刷题目标</div><div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px' }}>达成后计入连续打卡</div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)' }}>−</div>
            <div style={{ width: '52px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: '14px', fontWeight: 700, color: 'var(--ink)', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)', padding: '7px 0' }}>60</div>
            <div style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)' }}>+</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--divider)' }}>
          <div><div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>学习提醒</div><div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px' }}>每天 20:00 提醒你完成目标</div></div>
          <div style={{ width: '44px', height: '26px', borderRadius: '13px', background: 'var(--pri)', position: 'relative', cursor: 'pointer', transition: 'background .15s' }}><span style={{ position: 'absolute', top: '3px', right: '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}></span></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--divider)' }}>
          <div><div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>答题音效</div><div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px' }}>答对 / 答错时播放提示音</div></div>
          <div style={{ width: '44px', height: '26px', borderRadius: '13px', background: 'var(--track)', position: 'relative', cursor: 'pointer', transition: 'background .15s' }}><span style={{ position: 'absolute', top: '3px', left: '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}></span></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--divider)' }}>
          <div><div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>界面布局与主题</div><div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px' }}>侧边栏 / 顶部导航 · 深浅色 · 主色</div></div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>在右上角 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"></path></svg> 切换</div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '8px 24px', marginBottom: '16px' }}>
        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--ink)', padding: '16px 0 4px' }}>账户与安全</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderTop: '1px solid var(--divider)', cursor: 'pointer' }}><span style={{ fontSize: '14px', color: 'var(--ink)' }}>绑定邮箱</span><span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: "'JetBrains Mono',monospace", fontSize: '12.5px', color: 'var(--ink3)' }}>frontend@byteoffer.dev<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"></path></svg></span></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderTop: '1px solid var(--divider)', cursor: 'pointer' }}><span style={{ fontSize: '14px', color: 'var(--ink)' }}>修改密码</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"></path></svg></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderTop: '1px solid var(--divider)', cursor: 'pointer' }}><span style={{ fontSize: '14px', color: 'var(--ink)' }}>会员状态</span><span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--pri)', fontWeight: 600 }}>Plus · 有效期至 2026-12-31<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"></path></svg></span></div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"></path></svg><div><div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>ByteOffer</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>v2.4.0 · 前端面试刷题系统</div></div></div>
        <button style={{ background: 'var(--surface)', border: '1px solid #F3D0CE', color: '#D63C31', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>退出登录</button>
      </div>
    </div>
  );
}
