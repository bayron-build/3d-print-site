import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/supabase/auth";
import { CubeLogo } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { AdminNav } from "./admin-nav";
import { logout } from "./actions";

// Server-side gate for every admin page. The (protected) route group keeps
// /admin/login outside this layout — a gate in a plain app/admin/layout.tsx
// would wrap the login page too and redirect-loop. This check is
// convenience; row level security in the database is the security boundary.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isAdmin, email } = await getAdminSession();
  if (!isAdmin) {
    redirect("/admin/login");
  }

  return (
    <div className="dark flex min-h-screen flex-col bg-slate-50 [color-scheme:dark] dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <CubeLogo className="h-7 w-7 text-violet-600" />
              <span className="font-bold text-slate-900 dark:text-white">Beheer</span>
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline dark:text-slate-400">
              {email}
            </span>
            <form action={logout}>
              <Button type="submit" variant="secondary" size="sm">
                Uitloggen
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 sm:p-8">{children}</main>
    </div>
  );
}
