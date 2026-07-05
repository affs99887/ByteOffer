"use client";

// components/billing/portal-button.tsx
// Client button that opens the Stripe Billing Portal (architecture §6.2) for self-serve
// cancel / change-card / invoices. Calls createBillingPortalAction() and redirects to the returned
// portal url. Inline error on failure.

import { useState, useTransition } from "react";
import { createBillingPortalAction } from "@/lib/actions/billing";

export function PortalButton({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    startTransition(async () => {
      const res = await createBillingPortalAction();
      if (res.ok) {
        window.location.href = res.data.url;
        return;
      }
      setError(res.error.message ?? "无法打开管理页面，请稍后再试");
    });
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={pending}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--line)",
          color: "var(--ink)",
          borderRadius: "10px",
          padding: "11px 18px",
          fontSize: "14px",
          fontWeight: 600,
          cursor: pending ? "default" : "pointer",
          fontFamily: "inherit",
          opacity: pending ? 0.7 : 1,
          ...style,
        }}
      >
        {pending ? "打开中…" : children}
      </button>
      {error && (
        <div style={{ color: "#D63C31", fontSize: "12.5px", marginTop: "8px", lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default PortalButton;
