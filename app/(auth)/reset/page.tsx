// app/(auth)/reset/page.tsx (3b-2)
// Public password-reset page. With ?token= it renders the new-password form (resetPasswordAction);
// otherwise the request form (requestPasswordResetAction). searchParams is a Promise in Next 16.

import { ResetForm } from "@/components/auth/reset-form";

export const metadata = { title: "重置密码 · ByteOffer" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = sp.token;
  const token = Array.isArray(raw) ? raw[0] : raw;

  return <ResetForm token={token} />;
}
