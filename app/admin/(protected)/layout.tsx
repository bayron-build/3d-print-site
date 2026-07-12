import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/supabase/auth";
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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-8 py-4">
        <span className="font-bold">Beheer</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Ingelogd als {email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded border border-gray-300 px-3 py-1 text-sm"
            >
              Uitloggen
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
