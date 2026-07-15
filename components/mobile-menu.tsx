"use client";

import { useState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { IconClose, IconMenu } from "@/components/ui/icons";

const LINKS = [
  ["/modellen", "Modellen"],
  ["/#hoe-het-werkt", "Hoe het werkt"],
  ["/#contact", "Contact"],
] as const;

// Only the menu is a client component; the header stays a server component.
// The panel is absolutely positioned against the header (which is
// `relative`), so it overlays page content instead of pushing it down.
export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Menu sluiten" : "Menu openen"}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:text-white"
      >
        {open ? (
          <IconClose className="h-6 w-6" />
        ) : (
          <IconMenu className="h-6 w-6" />
        )}
      </button>
      {open && (
        <nav className="absolute inset-x-0 top-full z-20 flex flex-col gap-1 border-b border-slate-800 bg-slate-950 px-6 pb-6 pt-2">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2 text-sm text-slate-300 hover:text-violet-300"
            >
              {label}
            </Link>
          ))}
          <ButtonLink
            href="/aanvraag"
            onClick={() => setOpen(false)}
            className="mt-2"
          >
            Offerte aanvragen
          </ButtonLink>
        </nav>
      )}
    </div>
  );
}
