"use client";
import { useState, useTransition } from "react";
import { useApp } from "@/lib/app-context";
import { logoutAction } from "@/lib/actions/auth";
import { changePasswordAction, updateProfileAction } from "@/lib/actions/profile";

// Shared inline styles for the 修改密码 form (as-const so the literal unions satisfy CSSProperties).
const pwInput = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '14px',
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'inherit',
} as const;
const pwErrText = { fontSize: '12px', color: '#D63C31', marginTop: '5px' } as const;

export function SettingsScreen() {
  const v = useApp();
  const [pendingLogout, startLogout] = useTransition();
  const [pendingSave, startSave] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(v.user?.name ?? "");
  const [savedName, setSavedName] = useState(v.user?.name ?? "");

  // 修改密码 — inline form under the row (real changePasswordAction; no fake navigation).
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwFieldErr, setPwFieldErr] = useState<{ currentPassword?: string; newPassword?: string }>({});
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState<string | null>(null);
  const [pendingPw, startPw] = useTransition();

  // Real identity from initialData.user (via context); graceful fallbacks keep the demo readable.
  const displayName = savedName || v.user?.name || "前端小白";
  const email = v.user?.email || "frontend@byteoffer.dev";
  const tier = v.entitlement?.tier;
  const avatarChar = (displayName || "白").trim().charAt(0) || "白";

  function saveProfile() {
    const next = name.trim();
    if (!next) {
      setEditing(false);
      return;
    }
    startSave(async () => {
      const res = await updateProfileAction({ name: next });
      if (res.ok) {
        const saved = res.data.name ?? next;
        setSavedName(saved);
        // Sync the header / greeting immediately (they read state.user.name via context).
        v.updateUserName(saved);
      }
      setEditing(false);
    });
  }

  function savePassword() {
    setPwFieldErr({});
    setPwErr(null);
    setPwOk(null);
    startPw(async () => {
      const res = await changePasswordAction({ currentPassword: curPw, newPassword: newPw });
      if (res.ok) {
        setPwOk("已更新，请妥善保管");
        setCurPw("");
        setNewPw("");
        return;
      }
      const { code, message, fields } = res.error;
      if (code === "WRONG_PASSWORD") {
        setPwFieldErr({ currentPassword: fields?.currentPassword ?? "当前密码不正确" });
      } else if (code === "NO_PASSWORD") {
        setPwErr("该账号为第三方登录，无本地密码");
      } else if (code === "RATE_LIMITED") {
        setPwErr("操作过于频繁");
      } else if (code === "VALIDATION") {
        if (fields && Object.keys(fields).length > 0) setPwFieldErr({ currentPassword: fields.currentPassword, newPassword: fields.newPassword });
        else setPwErr(message ?? "输入有误");
      } else {
        setPwErr(message ?? "修改失败，请重试");
      }
    });
  }

  const pwSaveDisabled = pendingPw || !curPw || !newPw;

  return (
    <div data-screen-label="设置" className="bo-enter" style={{ maxWidth: '860px', margin: '0 auto' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '.14em', color: 'var(--pri)', fontWeight: 600, marginBottom: '16px' }}>// SETTINGS · 设置</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '22px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '18px' }}>
        <div style={{ width: '60px', height: '60px', borderRadius: '14px', background: 'var(--avatar)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '24px', flex: 'none' }}>{avatarChar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveProfile(); if (e.key === "Escape") setEditing(false); }}
              placeholder="昵称"
              style={{ width: '100%', maxWidth: '260px', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 11px', fontSize: '16px', fontWeight: 700, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit' }}
            />
          ) : (
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--ink)' }}>{displayName}</div>
          )}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', color: 'var(--ink3)', marginTop: '4px' }}>{tier ? `${tier.toUpperCase()} · ` : ""}{email}</div>
        </div>
        {editing ? (
          <button onClick={saveProfile} disabled={pendingSave} style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: pendingSave ? 0.7 : 1 }}>{pendingSave ? "保存中…" : "保存"}</button>
        ) : (
          <button onClick={() => { setName(displayName === "前端小白" ? "" : displayName); setEditing(true); }} style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--ink)', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>编辑资料</button>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '8px 24px', marginBottom: '16px' }}>
        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--ink)', padding: '16px 0 4px' }}>偏好设置</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--divider)' }}>
          <div><div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>每日刷题目标</div><div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px' }}>达成后计入连续打卡</div></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid var(--line)', borderRadius: '8px', overflow: 'hidden' }}>
            <div onClick={v.goalDec} style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)', userSelect: 'none' }}>−</div>
            <div style={{ width: '52px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: '14px', fontWeight: 700, color: 'var(--ink)', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)', padding: '7px 0' }}>{v.goalValue}</div>
            <div onClick={v.goalInc} style={{ width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink2)', userSelect: 'none' }}>+</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderTop: '1px solid var(--divider)' }}>
          <div><div style={{ fontSize: '14px', color: 'var(--ink)', fontWeight: 600 }}>界面布局与主题</div><div style={{ fontSize: '12.5px', color: 'var(--ink3)', marginTop: '3px' }}>侧边栏 / 顶部导航 · 深浅色 · 主色</div></div>
          <div style={{ fontSize: '12.5px', color: 'var(--ink3)', display: 'flex', alignItems: 'center', gap: '6px' }}>在右上角 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8"></circle><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"></path></svg> 切换</div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '8px 24px', marginBottom: '16px' }}>
        <div style={{ fontFamily: "'Space Grotesk','Noto Sans SC',sans-serif", fontSize: '14px', fontWeight: 700, color: 'var(--ink)', padding: '16px 0 4px' }}>账户与安全</div>
        <div onClick={() => setPwOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderTop: '1px solid var(--divider)', cursor: 'pointer' }}><span style={{ fontSize: '14px', color: 'var(--ink)' }}>修改密码</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: pwOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 6l6 6-6 6"></path></svg></div>
        {pwOpen && (
          <div style={{ padding: '4px 0 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <input type="password" autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="当前密码" style={pwInput} />
              {pwFieldErr.currentPassword && <div style={pwErrText}>{pwFieldErr.currentPassword}</div>}
            </div>
            <div>
              <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="新密码" style={pwInput} />
              {pwFieldErr.newPassword && <div style={pwErrText}>{pwFieldErr.newPassword}</div>}
            </div>
            {pwErr && <div style={pwErrText}>{pwErr}</div>}
            {pwOk && <div style={{ fontSize: '12.5px', color: '#0E9F6E', fontWeight: 600 }}>{pwOk}</div>}
            <div>
              <button onClick={savePassword} disabled={pwSaveDisabled} style={{ background: 'var(--pri)', border: '1px solid var(--pri)', color: '#fff', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: pwSaveDisabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: pwSaveDisabled ? 0.6 : 1 }}>{pendingPw ? "保存中…" : "保存"}</button>
            </div>
          </div>
        )}
        <a href="/billing" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderTop: '1px solid var(--divider)', cursor: 'pointer', textDecoration: 'none' }}><span style={{ fontSize: '14px', color: 'var(--ink)' }}>会员状态</span><span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--pri)', fontWeight: 600 }}>{tier === "plus" ? "Plus · 管理订阅" : "免费版 · 升级解锁全部题库"}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"></path></svg></span></a>
        <a href="/billing" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', borderTop: '1px solid var(--divider)', cursor: 'pointer', textDecoration: 'none' }}><span style={{ fontSize: '14px', color: 'var(--ink)' }}>订阅 / 账单</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"></path></svg></a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--pri)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"></path></svg><div><div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>ByteOffer</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', color: 'var(--ink3)', marginTop: '2px' }}>v2.4.0 · 前端面试刷题系统</div></div></div>
        <button onClick={() => startLogout(async () => { await logoutAction(); })} disabled={pendingLogout} style={{ background: 'var(--surface)', border: '1px solid #F3D0CE', color: '#D63C31', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: pendingLogout ? 0.7 : 1 }}>{pendingLogout ? "退出中…" : "退出登录"}</button>
      </div>
    </div>
  );
}
