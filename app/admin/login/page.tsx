import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/supabase/auth";
import { LoginForm } from "./login-form";
import { CubeLogo } from "@/components/site-header";
import { SITE_NAME } from "@/lib/site";

export default async function LoginPage() {
  const { isAdmin } = await getAdminSession();
  if (isAdmin) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <CubeLogo className="h-9 w-9 text-violet-600" />
          <h1 className="text-2xl font-bold text-slate-900">Inloggen</h1>
          <p className="text-sm text-slate-500">Beheer van {SITE_NAME}</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
