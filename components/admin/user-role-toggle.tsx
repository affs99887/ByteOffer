"use client";

// components/admin/user-role-toggle.tsx
// Users table with a per-row role toggle (architecture §3.3). The server page fetches the
// AdminUserRow[] and passes them in; this shell renders the table and calls setUserRoleAction to
// flip a user between user⇄admin. The LAST_ADMIN guard lives server-side (adminService.setUserRole)
// — when the action returns a VALIDATION error whose field is "LAST_ADMIN", we surface a clear
// inline message instead of a raw error. Optimistic local state is reconciled from the action
// result (server is authoritative for role).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserRoleAction } from "@/lib/actions/admin";
import type { AdminUserRow } from "@/lib/server/services/adminService";
import type { Role } from "@prisma/client";
import { Banner, Table, Td, Th, ghostBtnStyle, priBtnStyle } from "./ui";

export function UserRoleTable({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<AdminUserRow[]>(users);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function setRole(user: AdminUserRow, role: Role) {
    if (user.role === role) return;
    setError(null);
    setOkMsg(null);
    setBusyId(user.id);
    startTransition(async () => {
      const res = await setUserRoleAction({ userId: user.id, role });
      setBusyId(null);
      if (!res.ok) {
        if (res.error.fields?.role === "LAST_ADMIN") {
          setError("无法降级最后一名管理员 —— 系统必须至少保留一名管理员。");
        } else {
          setError(res.error.message ?? "更新角色失败");
        }
        return;
      }
      // Reconcile from the authoritative server result.
      setRows((prev) => prev.map((r) => (r.id === user.id ? { ...r, role: res.data.role } : r)));
      setOkMsg(`已将 ${user.email} 设为 ${res.data.role === "admin" ? "管理员" : "普通用户"}`);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {error && <Banner kind="error">{error}</Banner>}
      {okMsg && <Banner kind="success">{okMsg}</Banner>}

      <Table
        head={
          <>
            <Th>邮箱</Th>
            <Th>昵称</Th>
            <Th>套餐</Th>
            <Th>角色</Th>
            <Th>注册于</Th>
            <Th style={{ textAlign: "right" }}>操作</Th>
          </>
        }
      >
        {rows.length === 0 ? (
          <tr>
            <Td colSpan={6} style={{ textAlign: "center", color: "var(--ink3)" }}>
              暂无用户
            </Td>
          </tr>
        ) : (
          rows.map((u) => {
            const busy = pending && busyId === u.id;
            const isAdmin = u.role === "admin";
            return (
              <tr key={u.id}>
                <Td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "var(--ink)" }}>{u.email}</Td>
                <Td style={{ color: "var(--ink2)" }}>{u.name ?? "—"}</Td>
                <Td>
                  <TierChip tier={u.tier} />
                </Td>
                <Td>
                  <RoleChip role={u.role} />
                </Td>
                <Td style={{ color: "var(--ink3)", fontSize: "12px", whiteSpace: "nowrap" }}>{fmtDate(u.createdAt)}</Td>
                <Td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {isAdmin ? (
                    <button onClick={() => setRole(u, "user")} disabled={busy} style={smallBtn(ghostBtnStyle)}>
                      降为普通
                    </button>
                  ) : (
                    <button onClick={() => setRole(u, "admin")} disabled={busy} style={smallBtn(priBtnStyle)}>
                      设为管理员
                    </button>
                  )}
                </Td>
              </tr>
            );
          })
        )}
      </Table>
    </div>
  );
}

function RoleChip({ role }: { role: Role }) {
  const admin = role === "admin";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "6px",
        padding: "3px 9px",
        fontSize: "12px",
        fontWeight: 600,
        color: admin ? "var(--pri)" : "#5A6172",
        background: admin ? "var(--pri-w)" : "rgba(138,146,162,.12)",
      }}
    >
      {admin ? "管理员" : "普通用户"}
    </span>
  );
}

function TierChip({ tier }: { tier: AdminUserRow["tier"] }) {
  if (!tier) return <span style={{ color: "var(--ink3)", fontSize: "12px" }}>—</span>;
  const plus = tier === "plus";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "6px",
        padding: "3px 9px",
        fontSize: "12px",
        fontWeight: 600,
        color: plus ? "#B7791F" : "#5A6172",
        background: plus ? "rgba(247,144,9,.12)" : "rgba(138,146,162,.10)",
      }}
    >
      {plus ? "Plus" : "免费"}
    </span>
  );
}

function smallBtn(base: React.CSSProperties): React.CSSProperties {
  return { ...base, padding: "6px 11px", fontSize: "12px" };
}

function fmtDate(d: Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default UserRoleTable;
