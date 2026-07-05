// app/(auth)/register/page.tsx (3b-2)
// Public registration page. Redirects an authenticated user to "/app". Renders the client form.

import { redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata = { title: "注册 · ByteOffer" };

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/app");

  return <RegisterForm />;
}
