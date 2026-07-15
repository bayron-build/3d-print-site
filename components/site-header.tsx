import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { SITE_BYLINE, SITE_NAME } from "@/lib/site";
import { MobileMenu } from "./mobile-menu";

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

// Public-site header. Dark (mockup): on the homepage it melts into the
// full-bleed hero — no bottom border, the color change is separation enough
// on light pages. Mobile gets a hamburger menu; `relative` anchors its
// dropdown panel.
export function SiteHeader() {
  return (
    <header className="relative bg-slate-950">
      <div className="mx-auto flex w-full max-w-[88rem] items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <CubeLogo className="h-8 w-8 text-violet-400" />
          <span className="flex flex-col leading-tight">
            <span className="font-bold text-white">{SITE_NAME}</span>
            <span className="text-xs text-slate-400">{SITE_BYLINE}</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 sm:flex">
          <Link href="/modellen" className="hover:text-violet-300">
            Modellen
          </Link>
          <Link href="/#hoe-het-werkt" className="hover:text-violet-300">
            Hoe het werkt
          </Link>
          <Link href="/#contact" className="hover:text-violet-300">
            Contact
          </Link>
        </nav>
        {/* max-sm:hidden (media-query variant) reliably beats the BASE
            inline-flex; a plain `hidden` utility would tie on specificity.
            Below sm the CTA lives inside the menu panel instead — logo +
            CTA + hamburger don't fit a 390px bar. */}
        <ButtonLink href="/aanvraag" className="max-sm:hidden">
          Offerte aanvragen
        </ButtonLink>
        <MobileMenu />
      </div>
    </header>
  );
}
