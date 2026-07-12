import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/supabase/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { isAdmin } = await getAdminSession();
  if (isAdmin) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Inloggen</h1>
      <LoginForm />
    </main>
  );
}
