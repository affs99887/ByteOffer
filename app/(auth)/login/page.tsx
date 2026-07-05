// app/(auth)/login/page.tsx (3b-2)
// Public login page. Redirects an already-authenticated user to "/app" (belt-and-suspenders with
// the proxy redirect). Passes OAuth availability (hasOAuth) down so the client form only shows
// GitHub/Google buttons for configured providers.

import { redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { hasOAuth } from "@/lib/server/env";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "登录 · ByteOffer" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/app");

  return <LoginForm github={hasOAuth("github")} google={hasOAuth("google")} />;
}
