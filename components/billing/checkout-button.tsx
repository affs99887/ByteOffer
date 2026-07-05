"use client";

// components/billing/checkout-button.tsx
// Client checkout button (architecture §6.2). Calls createCheckoutSessionAction({priceId}) and
// redirects the browser to the returned Stripe Checkout url. On failure (billing disabled, network,
// validation) it surfaces a small inline message instead of navigating. The button never grants
// anything — entitlement flips only after the webhook lands (§6.3), so the success page reads DB
// state.

import { useState, useTransition } from "react";
import { createCheckoutSessionAction } from "@/lib/actions/billing";

export function CheckoutButton({
  priceId,
  children,
  style,
}: {
  priceId: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    startTransition(async () => {
      const res = await createCheckoutSessionAction({ priceId });
      if (res.ok) {
        // Hard navigation to Stripe's hosted Checkout.
        window.location.href = res.data.url;
        return;
      }
      setError(res.error.message ?? "无法开始结账，请稍后再试");
    });
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={pending || !priceId}
        style={{
          background: "var(--pri)",
          border: "1px solid var(--pri)",
          color: "#fff",
          borderRadius: "10px",
          padding: "11px 18px",
          fontSize: "14px",
          fontWeight: 700,
          cursor: pending ? "default" : "pointer",
          fontFamily: "inherit",
          width: "100%",
          opacity: pending ? 0.7 : 1,
          ...style,
        }}
      >
        {pending ? "跳转中…" : children}
      </button>
      {error && (
        <div style={{ color: "#D63C31", fontSize: "12.5px", marginTop: "8px", lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default CheckoutButton;
