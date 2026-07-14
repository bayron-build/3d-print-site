import Link from "next/link";
import { CubeLogo } from "./site-header";
import { SITE_BYLINE, SITE_EMAIL, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Links only to pages that exist — no dead FAQ/privacy links (spec).
// Carries the site's contact block; header/homepage "#contact" links land here.
// Soft charcoal (slate-900, muted text) so the page ends grounded without
// the harsh contrast of a near-black block.
export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-slate-800 bg-slate-900">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-12 sm:grid-cols-3">
        <div className="flex max-w-xs flex-col gap-3">
          <span className="flex items-center gap-2">
            <CubeLogo className="h-7 w-7 text-violet-400" />
            <span className="font-bold text-slate-100">
              {SITE_NAME}{" "}
              <span className="text-xs font-normal text-slate-400">
                {SITE_BYLINE}
              </span>
            </span>
          </span>
          <p className="text-sm text-slate-400">{SITE_TAGLINE}</p>
          <p className="text-sm text-slate-400">
            Lokaal gemaakt, in Nederland.
          </p>
        </div>
        <nav className="flex flex-col gap-2 text-sm text-slate-400">
          <span className="font-semibold text-slate-100">Ontdek</span>
          <Link href="/modellen" className="hover:text-violet-300">
            Modellen
          </Link>
          <Link href="/aanvraag" className="hover:text-violet-300">
            Aanvraag indienen
          </Link>
          <Link href="/#hoe-het-werkt" className="hover:text-violet-300">
            Hoe het werkt
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-sm text-slate-400">
          <span className="font-semibold text-slate-100">Contact</span>
          <a
            href={`mailto:${SITE_EMAIL}`}
            className="text-violet-400 hover:underline"
          >
            {SITE_EMAIL}
          </a>
          <p>
            Vragen of een speciale wens? Mail gerust — je krijgt snel antwoord.
          </p>
          <p>Betalen kan per bankoverschrijving of Tikkie.</p>
        </div>
      </div>
      <p className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {SITE_NAME} {SITE_BYLINE}
      </p>
    </footer>
  );
}
