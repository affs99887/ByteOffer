// proxy.ts (repo root)
// Edge auth gate + baseline security headers + Content-Security-Policy (architecture §3.2 layer 1,
// §10). Renamed from middleware.ts to the Next 16 `proxy.ts` convention (clears the deprecation
// warning); the auth/admin-404 logic and the existing headers are preserved verbatim.
//
// Uses the EDGE-SAFE auth.config (no prisma / argon2). This is a UX shortcut, NOT the security
// boundary — services re-check via requireX(). Non-admins get 404 (not 403) on admin surfaces so
// their existence is not leaked (§3.2).

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Content-Security-Policy tuned to the app's actual runtime surface (§10). It is ENFORCING
 * (Content-Security-Policy) — /demo verifies clean under it (fonts + inline styles + inline SVG).
 *
 * Directive rationale:
 *   - default-src 'self'                          baseline: same-origin only.
 *   - script-src 'self' 'unsafe-inline'           Next's runtime/hydration inlines bootstrap scripts.
 *                (+ 'unsafe-eval' in DEV only)     v1 uses 'unsafe-inline' to avoid breakage; a nonce-
 *                                                 based policy is the hardening follow-up (see README).
 *                                                 'unsafe-eval' is added ONLY in development, where
 *                                                 React/Turbopack HMR uses eval() for debugging (React
 *                                                 never uses eval() in production). Production stays
 *                                                 strict — no 'unsafe-eval'.
 *   - style-src  'self' 'unsafe-inline'           Next injects <style>; app uses inline style={} —
 *                https://fonts.googleapis.com     'unsafe-inline' covers style-src-attr too. Google
 *                                                 Fonts stylesheet <link> needs the googleapis host.
 *   - font-src   'self' https://fonts.gstatic.com the actual font files; data: for any inlined glyphs.
 *                data:
 *   - img-src    'self' data:                     data: for the base64 media stored in payload JSONB.
 *   - connect-src 'self'                           Server Actions / fetch stay same-origin.
 *   - frame-src  js.stripe.com checkout.stripe.com Stripe Checkout / Elements iframes (§6).
 *   - object-src 'none'  base-uri 'self'           lock down plugins + <base> hijacking.
 *   - frame-ancestors 'none'                       clickjacking defense (mirrors X-Frame-Options).
 *   - form-action 'self'                           forms post same-origin only.
 */
// 'unsafe-eval' is a DEV-ONLY concession for React/Turbopack HMR; production omits it entirely.
const SCRIPT_SRC =
  process.env.NODE_ENV === "production"
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const CSP = [
  "default-src 'self'",
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://js.stripe.com https://checkout.stripe.com",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

/** Apply the baseline security headers + CSP to a response (§10). */
function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("Content-Security-Policy", CSP);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Deny powerful features the app never uses.
  res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }
  return res;
}

export default auth((req) => {
  const p = req.nextUrl.pathname;
  const isLoggedIn = !!req.auth?.user;
  const role = req.auth?.user?.role;

  // Admin surfaces: hide from non-admins with a 404 (enumeration defense).
  if ((p.startsWith("/admin") || p.startsWith("/api/admin")) && role !== "admin") {
    return withSecurityHeaders(new NextResponse(null, { status: 404 }));
  }

  // The authed app now lives at /app (the root `/` is the public marketing landing). Bounce
  // anonymous visitors to /login before the RSC even runs. `/` (landing), /pricing and the
  // /(auth) pages stay public — there is NO anonymous product access (the /demo route was removed;
  // login is required to use the app). (requireX() in services remains the real boundary — UX only.)
  if ((p === "/app" || p.startsWith("/app/")) && !isLoggedIn) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/login", req.nextUrl)));
  }

  // Logged-in users have no business on the auth entry pages — bounce them into the app.
  // /reset + /verify + /pricing + `/` (landing) are public and unaffected.
  if (isLoggedIn && (p === "/login" || p === "/register")) {
    return withSecurityHeaders(NextResponse.redirect(new URL("/app", req.nextUrl)));
  }

  return withSecurityHeaders(NextResponse.next());
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)).*)"],
};
