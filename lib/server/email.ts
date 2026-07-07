// lib/server/email.ts
// Transactional email sender (architecture §3.3, §11). NO-OP + logs when RESEND_API_KEY is empty
// or a dummy placeholder, so build & dev work without Resend configured (never crashes). When a
// real key is present it POSTs to the Resend HTTP API via fetch (no extra dependency).
//
// This is server-only (imports env). It is called from auth actions to deliver verification /
// password-reset links; those callers ALWAYS return an account-enumeration-safe response
// regardless of whether the email was actually sent.
//
// isEmailEnabled() is the SINGLE source of truth for the app's email posture and is imported by
// the auth layer to switch whole flows: when it is false (no Resend configured) registration is
// verification-FREE (accounts are born usable) and unverified credential logins are allowed, so a
// deployment without Resend is never bricked; when true, strict email verification is enforced.

import { env } from "@/lib/server/env";
import { logger } from "@/lib/server/logger";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * isEmailEnabled — true when Resend is configured with a real (non-empty, non-placeholder) key.
 * Gates the entire email-verification policy (see authService.register / requestPasswordReset /
 * resendVerification and auth.ts authorize). Kept a pure config read so callers can branch on it
 * without side effects.
 */
export function isEmailEnabled(): boolean {
  const key = env.RESEND_API_KEY;
  if (!key) return false;
  const lowered = key.toLowerCase();
  if (lowered.includes("dummy") || lowered.includes("placeholder") || lowered.includes("changeme")) {
    return false;
  }
  return true;
}

/**
 * sendEmail — deliver a transactional email. When Resend is not configured this no-ops and logs
 * the message (including any link embedded in `text`) at info level so a developer can complete
 * flows locally. Returns { sent } indicating whether a real send was attempted. NEVER throws to
 * the caller (a delivery failure must not break account-enumeration-safe auth responses).
 */
export async function sendEmail(input: SendEmailInput): Promise<{ sent: boolean }> {
  const from = env.EMAIL_FROM || "ByteOffer <onboarding@resend.dev>";

  if (!isEmailEnabled()) {
    logger.info("email_noop", {
      reason: "RESEND_API_KEY not configured",
      to: input.to,
      subject: input.subject,
      // Log the plaintext body so dev can grab verification/reset links without a mail server.
      text: input.text ?? "(html only)",
    });
    return { sent: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });
    if (!res.ok) {
      logger.error("email_send_failed", { status: res.status, to: input.to });
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    logger.error("email_send_error", { message: e instanceof Error ? e.message : String(e) });
    return { sent: false };
  }
}
