// app/(auth)/verify/page.tsx (3b-2)
// Public email-verification page. Reads ?token= (Promise in Next 16) and hands it to the client
// form, which consumes it via verifyEmailAction. Public so a logged-out user can verify.

import { VerifyForm } from "@/components/auth/verify-form";

export const metadata = { title: "验证邮箱 · ByteOffer" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp.token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return <VerifyForm token={token} />;
}
