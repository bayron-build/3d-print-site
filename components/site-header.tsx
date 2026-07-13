import Link from "next/link";
import { SITE_BYLINE, SITE_NAME } from "@/lib/site";

// The cube mark from the mockup, drawn inline so no image asset is needed.
export function CubeLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />
      <path d="M12 12l9-5M12 12v10M12 12L3 7" />
    </svg>
  );
}

// Public-site header. `dark` sits on the landing page's dark hero band;
// `light` is for all other public pages. Mobile shows logo + CTA only
// (no hamburger menu in v1).
export function SiteHeader({
  variant = "light",
}: {
  variant?: "dark" | "light";
}) {
  const dark = variant === "dark";
  return (
    <header
      className={
        dark
          ? "bg-gray-950 text-white"
          : "border-b border-gray-200 bg-white text-gray-900"
      }
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <CubeLogo
            className={`h-8 w-8 ${dark ? "text-indigo-400" : "text-indigo-600"}`}
          />
          <span className="flex flex-col leading-tight">
            <span className="font-bold">{SITE_NAME}</span>
            <span
              className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}
            >
              {SITE_BYLINE}
            </span>
          </span>
        </Link>
        <nav
          className={`hidden items-center gap-6 text-sm sm:flex ${
            dark ? "text-gray-300" : "text-gray-600"
          }`}
        >
          <Link href="/modellen" className="hover:underline">
            Modellen
          </Link>
          <Link href="/#hoe-het-werkt" className="hover:underline">
            Hoe het werkt
          </Link>
          <Link href="/#contact" className="hover:underline">
            Contact
          </Link>
        </nav>
        <Link
          href="/aanvraag"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Offerte aanvragen
        </Link>
      </div>
    </header>
  );
}
