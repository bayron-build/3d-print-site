"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Aanvragen" },
  { href: "/admin/producten", label: "Producten" },
  { href: "/admin/kleuren", label: "Kleuren" },
] as const;

// Client component only for the active-link highlight; the layout stays a
// server component (it does the auth check).
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1">
      {LINKS.map(({ href, label }) => {
        const active =
          href === "/admin"
            ? pathname === "/admin" || pathname.startsWith("/admin/aanvragen")
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
