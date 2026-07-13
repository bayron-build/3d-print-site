import Link from "next/link";
import { CubeLogo } from "./site-header";
import { SITE_BYLINE, SITE_EMAIL, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Links only to pages that exist — no dead FAQ/privacy links (spec).
export function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:flex-row sm:justify-between">
        <div className="flex max-w-xs flex-col gap-2">
          <span className="flex items-center gap-2">
            <CubeLogo className="h-6 w-6 text-indigo-600" />
            <span className="font-bold">
              {SITE_NAME}{" "}
              <span className="text-xs font-normal text-gray-500">
                {SITE_BYLINE}
              </span>
            </span>
          </span>
          <p className="text-sm text-gray-600">{SITE_TAGLINE}</p>
        </div>
        <nav className="flex flex-col gap-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">Ontdek</span>
          <Link href="/modellen" className="hover:underline">
            Modellen
          </Link>
          <Link href="/aanvraag" className="hover:underline">
            Aanvraag indienen
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">Contact</span>
          <a href={`mailto:${SITE_EMAIL}`} className="hover:underline">
            {SITE_EMAIL}
          </a>
        </div>
      </div>
      <p className="border-t border-gray-200 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} {SITE_NAME} {SITE_BYLINE}
      </p>
    </footer>
  );
}
