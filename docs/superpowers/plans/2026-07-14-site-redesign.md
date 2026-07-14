# Site Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole site (homepage, aanvraag form, public pages, admin) to the approved light/violet design from `docs/superpowers/specs/2026-07-14-site-redesign-design.md` — styling only, zero behavior changes.

**Architecture:** First build a small shared UI foundation (`components/ui/`: Button, Card, Field/Input, SectionHeading, StatusBadge, icons) plus palette fixes in `globals.css`, then rebuild each area on top of it: public header/footer → homepage → aanvraag → secondary public pages → admin layout/dashboard → admin detail → admin products/login.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (no config file; `@theme` in globals.css), Supabase, vitest.

## Global Constraints

- **No behavior changes.** Server actions, queries, validation, uploads, auth are untouched, except two additions named explicitly in tasks: a status-count query on the admin dashboard and two pure helper functions (`formatRequestDate`, `countByStatus`, `formatFileSize`) with unit tests.
- **Palette:** primary actions `bg-violet-600` hover `bg-violet-500`; tints `violet-50`/`violet-100`; all grays use Tailwind's `slate` scale (replace `gray-*` in touched files); status colors come from `lib/requests/status.ts` only.
- **Radii:** `rounded-lg` for controls/inputs, `rounded-xl` for cards, `rounded-2xl` for the hero image.
- **Width:** public pages `mx-auto w-full max-w-7xl px-6`; admin content full-width with `p-6 sm:p-8`.
- **Copy:** Dutch, sentence case, honest — never add links to pages that don't exist (no FAQ/privacy/Services).
- **Next 16:** `params`/`searchParams` are Promises and stay awaited exactly as in the current code. If you need any other Next API, read `node_modules/next/dist/docs/` first (AGENTS.md).
- **Verification commands:** `npm run test`, `npm run lint`, `npm run build` (all from repo root). Every task ends with all three passing and a commit.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Design foundation — globals.css + shared UI components

**Files:**
- Modify: `app/globals.css`
- Modify: `lib/requests/status.ts` (violet swap + dot colors)
- Modify: `lib/format.ts` + Test: `lib/format.test.ts` (`formatFileSize`)
- Create: `components/ui/button.tsx`
- Create: `components/ui/card.tsx`
- Create: `components/ui/field.tsx`
- Create: `components/ui/section-heading.tsx`
- Create: `components/ui/status-badge.tsx`
- Create: `components/ui/icons.tsx`

**Interfaces (produced — later tasks import exactly these):**
- `Button({ variant?: "primary"|"secondary"|"danger"|"danger-outline", size?: "sm"|"md"|"lg", ...buttonProps })`, `ButtonLink(sameProps for next/link)`, `buttonClasses(variant?, size?): string` from `@/components/ui/button`
- `Card({ className?, children })` from `@/components/ui/card`
- `Field({ label, error?, hint?, children })`, `Input`, `Textarea`, `Select`, `inputClasses: string` from `@/components/ui/field`
- `SectionHeading({ eyebrow, title, className? })` from `@/components/ui/section-heading`
- `StatusBadge({ status: RequestStatus })` from `@/components/ui/status-badge`
- `IconChat, IconClipboard, IconPrinter, IconTruck, IconUpload, IconPencil, IconShieldCheck, IconLayers, IconCheck` — each `({ className?: string })` from `@/components/ui/icons`
- `formatFileSize(bytes: number): string` from `@/lib/format`
- `STATUS_DOT_CLASSES: Record<RequestStatus, string>` from `@/lib/requests/status`

- [ ] **Step 1: Write the failing test for `formatFileSize`**

Append to `lib/format.test.ts` (keep existing tests):

```ts
import { formatFileSize } from "./format";

describe("formatFileSize", () => {
  it("formats megabytes with one decimal", () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
  it("formats sub-MB sizes as KB, minimum 1", () => {
    expect(formatFileSize(512 * 1024)).toBe("512 KB");
    expect(formatFileSize(10)).toBe("1 KB");
  });
});
```

(If the file uses `test` instead of `it`, or has no `describe`, match its existing style — read it first.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test`
Expected: FAIL — `formatFileSize` is not exported.

- [ ] **Step 3: Implement `formatFileSize` in `lib/format.ts`**

Append (this is the same logic as the private `formatSize` currently inside `app/admin/(protected)/aanvragen/[id]/page.tsx`, which Task 7 will switch to this helper):

```ts
// File sizes shown to users: MB with one decimal above 1MB, otherwise KB.
export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test` — Expected: PASS.

- [ ] **Step 5: Replace `app/globals.css`**

Full new content (removes the Arial override so the Geist font from `layout.tsx` finally renders, and drops the unused dark-scheme block — the site is light-only):

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: #ffffff;
  color: #0f172a; /* slate-900 */
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
```

- [ ] **Step 6: Update `lib/requests/status.ts`**

Replace the `approved` badge color (indigo → violet, the new accent) and add dot classes for the dashboard cards. Replace the `STATUS_BADGE_CLASSES` block with:

```ts
// Badge colours per status: neutral for new, blue while in progress, green
// for done, red for rejected. Violet marks the customer's "akkoord" moment.
export const STATUS_BADGE_CLASSES: Record<RequestStatus, string> = {
  received: "bg-slate-100 text-slate-800",
  quoted: "bg-blue-100 text-blue-800",
  approved: "bg-violet-100 text-violet-800",
  printing: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

// Solid dot variant of the same scheme, for the admin dashboard filter cards.
export const STATUS_DOT_CLASSES: Record<RequestStatus, string> = {
  received: "bg-slate-400",
  quoted: "bg-blue-500",
  approved: "bg-violet-500",
  printing: "bg-amber-500",
  done: "bg-green-500",
  rejected: "bg-red-500",
};
```

- [ ] **Step 7: Create `components/ui/button.tsx`**

```tsx
import Link from "next/link";
import type { ComponentProps } from "react";

// One source of truth for every button on the site (public + admin).
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:pointer-events-none disabled:opacity-50";

const VARIANTS = {
  primary: "bg-violet-600 text-white hover:bg-violet-500",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:text-violet-700",
  danger: "bg-red-600 text-white hover:bg-red-500",
  "danger-outline": "border border-red-300 bg-white text-red-700 hover:bg-red-50",
} as const;

const SIZES = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = ""
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button {...props} className={buttonClasses(variant, size, className)} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link {...props} className={buttonClasses(variant, size, className)} />;
}
```

- [ ] **Step 8: Create `components/ui/card.tsx`**

```tsx
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 9: Create `components/ui/field.tsx`**

```tsx
import type { ComponentProps } from "react";

// Every form control on the site shares this look; error text renders red
// under the control, hint text slate (hidden while an error shows).
export const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </label>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${inputClasses} ${className}`} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${inputClasses} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${inputClasses} ${className}`} />;
}
```

- [ ] **Step 10: Create `components/ui/section-heading.tsx`**

```tsx
// The mockup's eyebrow + title pattern ("HOE HET WERKT" / big bold title).
export function SectionHeading({
  eyebrow,
  title,
  className = "",
}: {
  eyebrow: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-semibold uppercase tracking-wide text-violet-600">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}
```

- [ ] **Step 11: Create `components/ui/status-badge.tsx`**

```tsx
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_BADGE_CLASSES[status] ?? "bg-slate-100 text-slate-800"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
```

- [ ] **Step 12: Create `components/ui/icons.tsx`**

Simple 24×24 outline icons (stroke follows `currentColor`), no icon library needed:

```tsx
import type { ComponentProps } from "react";

function Icon(props: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function IconChat({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.5-2.9A8 8 0 1 1 21 12z" />
      <path d="M8.5 11h7M8.5 14h4" />
    </Icon>
  );
}

export function IconClipboard({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M9 4h6v3H9zM15 5h3v16H6V5h3" />
      <path d="M9 12h6M9 16h4" />
    </Icon>
  );
}

export function IconPrinter({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M7 8V3h10v5M4 8h16v9h-3M7 13h10v8H7v-8zM4 17h3" />
    </Icon>
  );
}

export function IconTruck({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M2 6h12v10H2zM14 10h4l3 3v3h-7v-6z" />
      <circle cx="6.5" cy="18" r="1.6" />
      <circle cx="16.5" cy="18" r="1.6" />
    </Icon>
  );
}

export function IconUpload({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 16V4M6.5 9.5 12 4l5.5 5.5M4 20h16" />
    </Icon>
  );
}

export function IconPencil({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
      <path d="m14.5 6.5 3 3" />
    </Icon>
  );
}

export function IconShieldCheck({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3l8 3v6c0 4.2-3.4 7.6-8 9-4.6-1.4-8-4.8-8-9V6l8-3z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function IconLayers({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="m3 13 9 5 9-5" />
    </Icon>
  );
}

export function IconCheck({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m5 13 4 4L19 7" />
    </Icon>
  );
}
```

- [ ] **Step 13: Verify**

Run: `npm run test` → all pass. `npm run lint` → clean. `npm run build` → succeeds. (The Arial removal changes the whole site's font — that's expected and desired.)

- [ ] **Step 14: Commit**

```bash
git add app/globals.css lib/requests/status.ts lib/format.ts lib/format.test.ts components/ui
git commit -m "feat: design foundation — violet palette, Geist font fix, shared UI components"
```

---

### Task 2: Public header + footer

**Files:**
- Modify: `components/site-header.tsx` (rewrite; drop the `variant` prop)
- Modify: `components/site-footer.tsx` (rewrite; richer, gets `id="contact"`)
- Modify: `app/page.tsx:38` (only change `<SiteHeader variant="dark" />` → `<SiteHeader />`; the rest of the homepage is Task 3)

**Interfaces:**
- Consumes: `ButtonLink`, `CubeLogo`.
- Produces: `SiteHeader()` (no props), `SiteFooter()`, `CubeLogo({ className })` stays exported from `site-header.tsx`. The footer owns the `#contact` anchor from now on.

- [ ] **Step 1: Rewrite `components/site-header.tsx`**

```tsx
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
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

// Public-site header. Light-only since the redesign; mobile shows logo + CTA
// (no hamburger menu in v1).
export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <CubeLogo className="h-8 w-8 text-violet-600" />
          <span className="flex flex-col leading-tight">
            <span className="font-bold text-slate-900">{SITE_NAME}</span>
            <span className="text-xs text-slate-500">{SITE_BYLINE}</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-600 sm:flex">
          <Link href="/modellen" className="hover:text-violet-700">
            Modellen
          </Link>
          <Link href="/#hoe-het-werkt" className="hover:text-violet-700">
            Hoe het werkt
          </Link>
          <Link href="/#contact" className="hover:text-violet-700">
            Contact
          </Link>
        </nav>
        <ButtonLink href="/aanvraag">Offerte aanvragen</ButtonLink>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Rewrite `components/site-footer.tsx`**

```tsx
import Link from "next/link";
import { CubeLogo } from "./site-header";
import { SITE_BYLINE, SITE_EMAIL, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Links only to pages that exist — no dead FAQ/privacy links (spec).
// Carries the site's contact block; header/homepage "#contact" links land here.
export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-12 sm:grid-cols-3">
        <div className="flex max-w-xs flex-col gap-3">
          <span className="flex items-center gap-2">
            <CubeLogo className="h-7 w-7 text-violet-600" />
            <span className="font-bold text-slate-900">
              {SITE_NAME}{" "}
              <span className="text-xs font-normal text-slate-500">
                {SITE_BYLINE}
              </span>
            </span>
          </span>
          <p className="text-sm text-slate-600">{SITE_TAGLINE}</p>
          <p className="text-sm text-slate-600">
            Lokaal gemaakt, in Nederland.
          </p>
        </div>
        <nav className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">Ontdek</span>
          <Link href="/modellen" className="hover:text-violet-700">
            Modellen
          </Link>
          <Link href="/aanvraag" className="hover:text-violet-700">
            Aanvraag indienen
          </Link>
          <Link href="/#hoe-het-werkt" className="hover:text-violet-700">
            Hoe het werkt
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">Contact</span>
          <a
            href={`mailto:${SITE_EMAIL}`}
            className="text-violet-700 hover:underline"
          >
            {SITE_EMAIL}
          </a>
          <p>
            Vragen of een speciale wens? Mail gerust — je krijgt snel antwoord.
          </p>
          <p>Betalen kan per bankoverschrijving of Tikkie.</p>
        </div>
      </div>
      <p className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} {SITE_NAME} {SITE_BYLINE}
      </p>
    </footer>
  );
}
```

- [ ] **Step 3: Fix the one usage of the removed prop**

In `app/page.tsx`, change `<SiteHeader variant="dark" />` to `<SiteHeader />`. (The homepage still has its dark hero until Task 3 — a slightly odd intermediate look is fine; the build must stay green.)

- [ ] **Step 4: Verify**

Run: `npm run test && npm run lint && npm run build` → all pass. Grep check: `grep -rn "variant=\"dark\"" app components` → no matches.

- [ ] **Step 5: Commit**

```bash
git add components/site-header.tsx components/site-footer.tsx app/page.tsx
git commit -m "feat: light header and richer footer with contact block"
```

---

### Task 3: Homepage rebuild

**Files:**
- Modify: `app/page.tsx` (full rewrite of the JSX; the Supabase query stays identical)

**Interfaces:**
- Consumes: `ButtonLink`, `SectionHeading`, `Card`, icons from Task 1; `SiteHeader`/`SiteFooter` from Task 2; existing `ProductCard`, `createClient`.
- Produces: nothing new. Section anchor `id="hoe-het-werkt"` must remain.

Layout goal (owner-approved): on a laptop screen the hero + how-it-works fill roughly the top 75%, and the models band is just visible at the bottom edge. The separate Contact section is deleted (footer owns `#contact` now); the standalone "Heb je een eigen idee?" section merges into the how-it-works band as a side card, per the light mockup.

- [ ] **Step 1: Rewrite `app/page.tsx`**

```tsx
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  IconChat,
  IconClipboard,
  IconLayers,
  IconPrinter,
  IconShieldCheck,
  IconTruck,
} from "@/components/ui/icons";
import dragon from "@/public/images/dragon.jpg";
import heroPrinter from "@/public/images/hero-printer.jpg";

// Matches the real pipeline: manual quote by email, Akkoord on the status
// page, pickup with bank transfer/Tikkie.
const STEPS = [
  ["Contact", "Stuur je idee, bestand of aanvraag via het formulier.", IconChat],
  ["Offerte", "Je ontvangt per e-mail een prijsvoorstel.", IconClipboard],
  ["Printen", "Na jouw akkoord wordt je opdracht met zorg geprint.", IconPrinter],
  ["Levering", "Ophalen of bezorgen; betalen per bankoverschrijving of Tikkie.", IconTruck],
] as const;

const TRUST_BADGES = [
  ["Hoge kwaliteit", "Strak en precies geprint", IconShieldCheck],
  ["Ruime materiaalkeuze", "Van PLA tot PETG", IconLayers],
  ["Snelle reactie", "Meestal binnen een dag", IconChat],
] as const;

export default async function Home() {
  const supabase = await createClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price, photos")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(6);
  const productList: ProductSummary[] = products ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Compact hero: with how-it-works below it, both fit the first
            screen and the models band peeks in at the bottom (spec). */}
        <section className="bg-gradient-to-b from-violet-50 to-white">
          <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:py-12">
            <div className="flex flex-col gap-5">
              <h1 className="text-4xl font-bold text-slate-900 sm:text-5xl">
                Iets nodig in{" "}
                <span className="text-violet-600">3D print</span>?
              </h1>
              <p className="max-w-xl text-lg text-slate-600">
                Upload je eigen bestand, vraag een custom ontwerp aan of kies
                uit kant-en-klare modellen. Hoge kwaliteit, snel geregeld,
                lokaal gemaakt.
              </p>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href="/aanvraag?type=file" size="lg">
                  Upload je bestand
                </ButtonLink>
                <ButtonLink
                  href="/aanvraag?type=custom"
                  variant="secondary"
                  size="lg"
                >
                  Custom ontwerp aanvragen
                </ButtonLink>
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-8 gap-y-3">
                {TRUST_BADGES.map(([title, sub, Icon]) => (
                  <li key={title} className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="text-sm font-semibold text-slate-900">
                        {title}
                      </span>
                      <span className="text-xs text-slate-500">{sub}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Image
              src={heroPrinter}
              alt="3D-printer die een vaas print"
              priority
              className="hidden rounded-2xl shadow-lg lg:block"
            />
          </div>
        </section>

        {/* How it works + custom-idea card in one band (mockup layout). */}
        <section id="hoe-het-werkt" className="mx-auto w-full max-w-7xl px-6 py-10">
          <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <SectionHeading
                eyebrow="Hoe het werkt"
                title="Simpel proces, mooi resultaat."
              />
              <ol className="mt-6 grid gap-6 sm:grid-cols-2">
                {STEPS.map(([title, text, Icon], index) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <h3 className="font-semibold text-slate-900">
                        {index + 1}. {title}
                      </h3>
                      <p className="mt-0.5 text-sm text-slate-600">{text}</p>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex items-center gap-5 rounded-xl bg-violet-50 p-6">
              <div className="flex flex-col gap-3">
                <h2 className="text-xl font-bold text-slate-900">
                  Heb je een eigen idee?
                </h2>
                <p className="text-sm text-slate-600">
                  Of het nu een prototype, een vervangingsonderdeel of iets
                  unieks is — samen maken we het echt.
                </p>
                <ButtonLink href="/aanvraag?type=custom" className="self-start">
                  Custom ontwerp aanvragen →
                </ButtonLink>
              </div>
              <Image
                src={dragon}
                alt="3D-geprinte paarse draak"
                className="hidden w-28 rounded-lg sm:block"
              />
            </div>
          </div>
        </section>

        {/* Models band starts at the bottom edge of the first screen. */}
        <section className="border-t border-slate-100 bg-slate-50">
          <div className="mx-auto w-full max-w-7xl px-6 py-10">
            <div className="flex items-end justify-between gap-4">
              <SectionHeading eyebrow="Modellen" title="Klaar om te printen." />
              <Link
                href="/modellen"
                className="shrink-0 text-sm font-medium text-violet-700 hover:underline"
              >
                Bekijk alle modellen →
              </Link>
            </div>
            {error ? (
              <p className="mt-8 text-red-700">{error.message}</p>
            ) : productList.length === 0 ? (
              <p className="mt-8 max-w-xl text-slate-600">
                De catalogus wordt gevuld — binnenkort vind je hier
                kant-en-klare modellen. Een eigen bestand of idee kun je nu al
                insturen.
              </p>
            ) : (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {productList.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run test && npm run lint && npm run build` → all pass.

- [ ] **Step 3: Visual check of the first-screen goal**

Start `npm run dev` (background). Load `http://localhost:3000` with the Playwright browser tools at 1440×900 and take a screenshot. Check: hero + all four how-it-works steps visible, and the models band heading ("Modellen / Klaar om te printen.") visible or peeking at the bottom edge. If the models band is fully invisible, reduce hero `py-10 lg:py-12` to `py-8 lg:py-10` and/or the how-it-works `py-10` to `py-8`, re-screenshot, repeat once. Also screenshot at 390×844: hero stacks, no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: compact light homepage — hero, merged how-it-works band, models peek"
```

---

### Task 4: Aanvraag page + form

**Files:**
- Modify: `app/aanvraag/page.tsx` (rewrite JSX; data code unchanged)
- Modify: `app/aanvraag/request-form.tsx` (rewrite render; ALL logic — state, handlers, `uploadFiles`, honeypot, validation flow — stays byte-identical)

**Interfaces:**
- Consumes: `Card`, `Field`, `Input`, `Textarea`, `Select`, `Button`, icons (`IconUpload`, `IconPencil`, `IconChat`, `IconClipboard`, `IconPrinter`, `IconTruck`), `CubeLogo`, `formatFileSize`.
- Produces: `RequestForm` keeps its exact current props (`products`, `preselectedProductId`, `initialType`).

- [ ] **Step 1: Rewrite `app/aanvraag/page.tsx`**

Keep imports/metadata/data-fetching/searchParams logic exactly as now; replace only the returned JSX from `<div className="flex min-h-screen flex-col">` down:

```tsx
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-slate-900">
            Aanvraag indienen
          </h1>
          <p className="mt-2 text-slate-600">
            Vertel ons wat je wilt laten printen. Je ontvangt per e-mail een
            prijsvoorstel — je betaalt pas na akkoord.
          </p>
        </div>
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card>
            {error ? (
              <p className="text-red-700">
                Kon het formulier niet laden, probeer het later opnieuw.
              </p>
            ) : (
              <RequestForm
                products={productList}
                preselectedProductId={preselected}
                initialType={initialType}
              />
            )}
          </Card>
          <RequestSidebar />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
```

And add this component at the bottom of the same file:

```tsx
// Trust sidebar: shows the process and takes the "is this legit?" edge off
// the form (spec: the form alone felt scam-like).
function RequestSidebar() {
  return (
    <aside className="flex flex-col gap-4">
      <Card>
        <h2 className="font-semibold text-slate-900">Zo werkt het</h2>
        <ol className="mt-3 flex flex-col gap-3 text-sm text-slate-600">
          {(
            [
              ["Contact", IconChat],
              ["Offerte per e-mail", IconClipboard],
              ["Printen na jouw akkoord", IconPrinter],
              ["Ophalen of bezorgen", IconTruck],
            ] as const
          ).map(([label, Icon], index) => (
            <li key={label} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="font-medium text-slate-900">
                  {index + 1}.
                </span>{" "}
                {label}
              </span>
            </li>
          ))}
        </ol>
      </Card>
      <Card className="bg-violet-50">
        <h2 className="font-semibold text-slate-900">Goed om te weten</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-600">
          <li>Je betaalt pas nadat je akkoord bent gegaan met de offerte.</li>
          <li>Je krijgt meestal binnen 1–2 dagen antwoord per e-mail.</li>
          <li>Betalen kan per bankoverschrijving of Tikkie.</li>
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          Vragen? Mail{" "}
          <a
            href={`mailto:${SITE_EMAIL}`}
            className="font-medium text-violet-700 hover:underline"
          >
            {SITE_EMAIL}
          </a>
        </p>
      </Card>
    </aside>
  );
}
```

New imports needed at the top of the file: `Card` from `@/components/ui/card`, `SITE_EMAIL` from `@/lib/site`, and `IconChat, IconClipboard, IconPrinter, IconTruck` from `@/components/ui/icons`.

- [ ] **Step 2: Rewrite the render of `app/aanvraag/request-form.tsx`**

Keep the entire top of the file (imports, types, state, `handleSubmit`, `uploadFiles`) unchanged except: delete the `inputClass`/`labelClass`/`errorClass` constants, and add imports:

```tsx
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { IconPencil, IconUpload } from "@/components/ui/icons";
import { CubeLogo } from "@/components/site-header";
import { formatEuro, formatFileSize } from "@/lib/format";
```

Add above the component:

```tsx
// The three request types as selectable cards (spec: bare radios read as
// scam-like). Semantically still radio inputs, so nothing changes for the
// server action.
const TYPE_OPTIONS = [
  {
    value: "catalog",
    label: "Kant-en-klaar ontwerp",
    sub: "Kies een model uit de catalogus",
    Icon: CubeLogo,
  },
  {
    value: "file",
    label: "Print mijn bestand",
    sub: "Upload je eigen .stl/.3mf/.step",
    Icon: IconUpload,
  },
  {
    value: "custom",
    label: "Eigen ontwerp",
    sub: "Wij ontwerpen het samen met jou",
    Icon: IconPencil,
  },
] as const;
```

Replace the returned JSX with (all `name` attributes, the honeypot block, conditional visibility per `type`, and button pending states identical to today):

```tsx
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {/* Honeypot: invisible to humans, bots fill it. Kept out of view,
          tab order and screen readers. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold uppercase tracking-wide text-violet-600">
          Wat wil je aanvragen?
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {TYPE_OPTIONS.map(({ value, label, sub, Icon }) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 transition-colors ${
                type === value
                  ? "border-violet-600 bg-violet-50 ring-1 ring-violet-600"
                  : "border-slate-300 hover:border-violet-400"
              }`}
            >
              <span className="flex items-center justify-between">
                <Icon
                  className={`h-6 w-6 ${
                    type === value ? "text-violet-700" : "text-slate-400"
                  }`}
                />
                <input
                  type="radio"
                  name="type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  className="accent-violet-600"
                />
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {label}
              </span>
              <span className="text-xs text-slate-500">{sub}</span>
            </label>
          ))}
        </div>
        {errors.type && <p className="mt-2 text-sm text-red-600">{errors.type}</p>}
      </fieldset>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-600">
          Jouw gegevens
        </h2>
        <Field label="Naam" error={errors.customerName}>
          <Input type="text" name="customerName" required />
        </Field>
        <Field label="E-mailadres" error={errors.email}>
          <Input type="email" name="email" required />
        </Field>
        <Field label="Telefoonnummer (optioneel)">
          <Input type="tel" name="phone" />
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-600">
          Wat wil je printen?
        </h2>

        {type === "catalog" && (
          <Field label="Product" error={errors.productId}>
            <Select name="productId" defaultValue={preselectedProductId}>
              <option value="">— Kies een product —</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                  {product.indicative_price !== null &&
                    ` (richtprijs ${formatEuro(product.indicative_price)})`}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {type === "file" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">
              Bestanden
            </span>
            {/* Deliberately no `name`: the bytes must never end up in the
                FormData the server action receives. */}
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-violet-400 hover:bg-violet-50">
              <IconUpload className="h-8 w-8 text-violet-600" />
              <span className="text-sm font-medium text-slate-700">
                Kies bestanden
              </span>
              <span className="text-xs text-slate-500">
                Max {MAX_FILES} bestanden · .stl, .3mf, .step, .stp · max 50MB
                per stuk
              </span>
              <input
                type="file"
                multiple
                accept=".stl,.3mf,.step,.stp"
                onChange={(event) =>
                  setFiles(Array.from(event.target.files ?? []))
                }
                className="sr-only"
              />
            </label>
            {files.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {files.map((file) => (
                  <li
                    key={file.name}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="truncate text-slate-900">{file.name}</span>
                    <span className="ml-3 shrink-0 text-xs text-slate-500">
                      {formatFileSize(file.size)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {errors.files && (
              <p className="text-sm text-red-600">{errors.files}</p>
            )}
          </div>
        )}

        <Field
          label={
            type === "custom"
              ? "Omschrijving (afmetingen, doel)"
              : "Omschrijving (optioneel)"
          }
          error={errors.description}
        >
          <Textarea name="description" rows={4} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kleur (optioneel)">
            <Input type="text" name="color" />
          </Field>
          {(type === "file" || type === "custom") && (
            <Field label="Materiaal (optioneel)">
              <Input type="text" name="material" />
            </Field>
          )}
          {(type === "catalog" || type === "file") && (
            <Field label="Aantal" error={errors.quantity}>
              <Input type="number" name="quantity" min={1} defaultValue={1} />
            </Field>
          )}
        </div>

        {type === "file" && (
          <>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="licenseAccepted"
                className="mt-1 accent-violet-600"
              />
              <span className="text-sm text-slate-700">
                Dit is mijn eigen ontwerp, of de licentie staat commercieel
                printen toe.
              </span>
            </label>
            {errors.licenseAccepted && (
              <p className="text-sm text-red-600">{errors.licenseAccepted}</p>
            )}
          </>
        )}
      </div>

      {clientError && <p className="text-sm text-red-600">{clientError}</p>}
      {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {isUploading
          ? "Bestanden uploaden…"
          : actionPending
            ? "Versturen…"
            : "Aanvraag versturen"}
      </Button>
    </form>
  );
```

Note: `quantity` moved inside the two-column grid but keeps its exact `name`, `min`, `defaultValue`, and type-visibility conditions.

- [ ] **Step 3: Verify behavior unchanged**

Run: `npm run test && npm run lint && npm run build` → pass.
With `npm run dev` running, use Playwright browser tools on `http://localhost:3000/aanvraag`:
1. Switch between the three type cards — fields swap exactly as before (product select / file zone / description emphasis).
2. Submit empty → inline red errors appear under Naam/E-mail (client validation intact).
3. `http://localhost:3000/aanvraag?type=custom` preselects the Eigen ontwerp card.
4. Screenshot desktop (1440) and mobile (390): sidebar right on desktop, below form on mobile.

- [ ] **Step 4: Commit**

```bash
git add app/aanvraag/page.tsx app/aanvraag/request-form.tsx
git commit -m "feat: aanvraag page with form card, type cards, upload zone and trust sidebar"
```

---

### Task 5: Secondary public pages (modellen, product detail, verzonden, klant-status)

**Files:**
- Modify: `components/product-card.tsx`
- Modify: `app/modellen/page.tsx`
- Modify: `app/modellen/[id]/page.tsx`
- Modify: `app/aanvraag/verzonden/page.tsx`
- Modify: `app/aanvraag/status/[token]/page.tsx`
- Modify: `app/aanvraag/status/[token]/akkoord-button.tsx`

**Interfaces:** consumes Task 1 components; changes nothing other tasks rely on.

- [ ] **Step 1: `components/product-card.tsx`** — exact class swaps:
  - `rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md` → `rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md`
  - `bg-gray-100` → `bg-slate-100`, `text-gray-300` → `text-slate-300`, `text-gray-500` → `text-slate-500`
  - name span: `text-sm font-medium` → `text-sm font-medium text-slate-900`

- [ ] **Step 2: `app/modellen/page.tsx`** — swaps:
  - `max-w-6xl` → `max-w-7xl`; `py-12` → `py-10`
  - `text-3xl font-bold` → `text-3xl font-bold text-slate-900`
  - every `text-gray-600` → `text-slate-600`

- [ ] **Step 3: `app/modellen/[id]/page.tsx`** — swaps:
  - `max-w-6xl` → `max-w-7xl`; `py-12` → `py-10`
  - back link: `text-indigo-600 hover:underline` → `text-violet-700 hover:underline`
  - image containers: `rounded-lg border border-gray-200 bg-gray-100` → `rounded-xl border border-slate-200 bg-slate-100`; thumbnail `rounded-lg border border-gray-200` → `rounded-xl border border-slate-200`; `text-gray-300` → `text-slate-300`
  - `text-gray-500` → `text-slate-500`, `text-gray-700` → `text-slate-700`, h1 gets `text-slate-900`
  - Bestellen link: replace the `<Link ... className="mt-2 self-start rounded bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500">Bestellen</Link>` with `<ButtonLink href={`/aanvraag?product=${product.id}`} size="lg" className="mt-2 self-start">Bestellen</ButtonLink>` (import `ButtonLink` from `@/components/ui/button`, drop the now-unused `Link` import only if nothing else uses it — the back link still does, so keep it).

- [ ] **Step 4: `app/aanvraag/verzonden/page.tsx`** — replace the `<main>` content with a success card:

```tsx
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
            <IconCheck className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-bold text-slate-900">
            Bedankt voor je aanvraag!
          </h1>
          <p className="text-slate-600">
            We bekijken je aanvraag en nemen zo snel mogelijk per e-mail
            contact met je op met een prijsvoorstel.
          </p>
          <ButtonLink href="/" variant="secondary">
            Terug naar de homepagina
          </ButtonLink>
        </div>
      </main>
```

Imports: add `IconCheck` from `@/components/ui/icons`, `ButtonLink` from `@/components/ui/button`; remove the now-unused `Link` import.

- [ ] **Step 5: `app/aanvraag/status/[token]/page.tsx`** — the customer-facing status page gets header/footer and the new look. Wrap the current `<main>` in `<div className="flex min-h-screen flex-col"><SiteHeader />…<SiteFooter /></div>` (imports from `@/components/site-header`, `@/components/site-footer`), give main `flex-1` and `py-10`, then swaps:
  - all `text-gray-600` → `text-slate-600`, `text-gray-500` → `text-slate-500`, h1/h2 get `text-slate-900`
  - rejected banner: `rounded bg-red-50 px-4 py-3 text-red-800` → `rounded-lg bg-red-50 px-4 py-3 text-red-800`
  - pipeline steps li: reached `border-gray-900 bg-gray-900 text-white` → `border-violet-600 bg-violet-600 text-white`; unreached `border-gray-300 text-gray-500` → `border-slate-300 text-slate-500`
  - quote box: `rounded border border-gray-200 p-4` → `rounded-xl border border-slate-200 bg-white p-6 shadow-sm`

- [ ] **Step 6: `app/aanvraag/status/[token]/akkoord-button.tsx`** — button class swap only: `rounded bg-green-700 px-6 py-2 font-medium text-white disabled:opacity-50` → `rounded-lg bg-green-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-green-500 disabled:pointer-events-none disabled:opacity-50` (green stays: "akkoord" is a go-signal, distinct from violet actions).

- [ ] **Step 7: Verify**

`npm run test && npm run lint && npm run build` → pass. Playwright: check `/modellen` renders cards; a product detail page shows the violet Bestellen button; `/aanvraag/verzonden` shows the success card with header/footer.

- [ ] **Step 8: Commit**

```bash
git add components/product-card.tsx app/modellen app/aanvraag/verzonden app/aanvraag/status
git commit -m "feat: restyle modellen, product detail, verzonden and klant-statuspagina"
```

---

### Task 6: Admin layout + dashboard

**Files:**
- Create: `lib/requests/dates.ts` + Test: `lib/requests/dates.test.ts`
- Create: `lib/requests/counts.ts` + Test: `lib/requests/counts.test.ts`
- Create: `app/admin/(protected)/admin-nav.tsx` (client component for active nav state)
- Modify: `app/admin/(protected)/layout.tsx`
- Modify: `app/admin/(protected)/page.tsx`

**Interfaces:**
- Produces: `formatRequestDate(value: string, now?: Date): string` from `@/lib/requests/dates`; `countByStatus(rows: { status: string }[]): Record<string, number>` from `@/lib/requests/counts`; `AdminNav()` (no props).
- Consumes: `StatusBadge`, `Card`, `Button`, `CubeLogo`, `STATUS_DOT_CLASSES`.

- [ ] **Step 1: Write failing tests**

`lib/requests/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatRequestDate } from "./dates";

const NOW = new Date(2026, 6, 14, 15, 0); // 14 jul 2026

describe("formatRequestDate", () => {
  it("returns vandaag for the same day", () => {
    expect(formatRequestDate(new Date(2026, 6, 14, 9, 0).toISOString(), NOW)).toBe("vandaag");
  });
  it("returns gisteren for the previous day", () => {
    expect(formatRequestDate(new Date(2026, 6, 13, 23, 0).toISOString(), NOW)).toBe("gisteren");
  });
  it("returns a short date for older days", () => {
    expect(formatRequestDate(new Date(2026, 5, 2).toISOString(), NOW)).toBe("2 jun 2026");
  });
});
```

`lib/requests/counts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { countByStatus } from "./counts";

describe("countByStatus", () => {
  it("returns empty object for no rows", () => {
    expect(countByStatus([])).toEqual({});
  });
  it("counts per status", () => {
    expect(
      countByStatus([
        { status: "received" },
        { status: "received" },
        { status: "done" },
      ])
    ).toEqual({ received: 2, done: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test` — Expected: FAIL, modules don't exist.

- [ ] **Step 3: Implement the helpers**

`lib/requests/dates.ts`:

```ts
// "vandaag"/"gisteren" for fresh requests, short Dutch date otherwise —
// the admin scans the list on recency.
export function formatRequestDate(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(now) - startOfDay(date)) / 86_400_000
  );
  if (dayDiff === 0) return "vandaag";
  if (dayDiff === 1) return "gisteren";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
```

`lib/requests/counts.ts`:

```ts
// Pure count-per-status used by the dashboard filter cards.
export function countByStatus(
  rows: { status: string }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test` — Expected: PASS.

- [ ] **Step 5: Create `app/admin/(protected)/admin-nav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Aanvragen" },
  { href: "/admin/producten", label: "Producten" },
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
                ? "bg-violet-100 text-violet-800"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 6: Rewrite `app/admin/(protected)/layout.tsx`**

Keep the auth gate and its comment exactly; replace the returned JSX:

```tsx
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="flex items-center gap-2">
              <CubeLogo className="h-7 w-7 text-violet-600" />
              <span className="font-bold text-slate-900">Beheer</span>
            </Link>
            <AdminNav />
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">
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
```

Imports to add: `CubeLogo` from `@/components/site-header`, `AdminNav` from `./admin-nav`, `Button` from `@/components/ui/button`.

- [ ] **Step 7: Rewrite `app/admin/(protected)/page.tsx`**

Full new file (data query identical; adds only the status-count query; table becomes a fully clickable link list per spec):

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { countByStatus } from "@/lib/requests/counts";
import { formatRequestDate } from "@/lib/requests/dates";
import {
  isRequestStatus,
  REQUEST_STATUSES,
  STATUS_DOT_CLASSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";

const TYPE_LABELS: Record<string, string> = {
  catalog: "Kant-en-klaar",
  file: "Print mijn bestand",
  custom: "Eigen ontwerp",
};

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 16: searchParams is a Promise and must be awaited.
  const { status } = await searchParams;
  const activeFilter =
    typeof status === "string" && isRequestStatus(status) ? status : null;

  const supabase = await createClient();
  let query = supabase
    .from("requests")
    .select("id, created_at, customer_name, email, type, quantity, status")
    .order("created_at", { ascending: false });
  if (activeFilter) {
    query = query.eq("status", activeFilter);
  }
  // Counts stay accurate under any filter: one cheap status-only query.
  const [{ data: requests, error }, { data: statusRows }] = await Promise.all([
    query,
    supabase.from("requests").select("status"),
  ]);
  const counts = countByStatus(statusRows ?? []);
  const total = (statusRows ?? []).length;

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Aanvragen</h1>
      <p className="mt-1 text-sm text-slate-500">
        {requests?.length ?? 0}{" "}
        {requests?.length === 1 ? "aanvraag" : "aanvragen"}
        {activeFilter ? ` met status “${STATUS_LABELS[activeFilter]}”` : ""}
      </p>

      {/* Filter cards double as the status overview (spec). */}
      <nav className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <FilterCard
          label="Alle"
          count={total}
          href="/admin"
          active={activeFilter === null}
        />
        {REQUEST_STATUSES.map((s) => (
          <FilterCard
            key={s}
            label={STATUS_LABELS[s]}
            count={counts[s] ?? 0}
            href={`/admin?status=${s}`}
            active={activeFilter === s}
            dotClass={STATUS_DOT_CLASSES[s]}
          />
        ))}
      </nav>

      {error ? (
        <p className="mt-6 text-red-700">
          Kon aanvragen niet laden: {error.message}
        </p>
      ) : requests && requests.length > 0 ? (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="hidden gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[7rem_1.4fr_1fr_4rem_9rem]">
            <span>Datum</span>
            <span>Klant</span>
            <span>Type</span>
            <span>Aantal</span>
            <span>Status</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {requests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/admin/aanvragen/${request.id}`}
                  className="grid gap-1 px-4 py-3 text-sm transition-colors hover:bg-violet-50/60 sm:grid-cols-[7rem_1.4fr_1fr_4rem_9rem] sm:items-center sm:gap-4"
                >
                  <span className="text-slate-500">
                    {formatRequestDate(request.created_at)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">
                      {request.customer_name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {request.email}
                    </span>
                  </span>
                  <span className="text-slate-600">
                    {TYPE_LABELS[request.type] ?? request.type}
                  </span>
                  <span className="text-slate-600">{request.quantity}</span>
                  <span>
                    <StatusBadge status={request.status as RequestStatus} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="mt-6">
          <p className="text-slate-600">
            {activeFilter
              ? `Geen aanvragen met status “${STATUS_LABELS[activeFilter]}”.`
              : "Nog geen aanvragen."}
          </p>
        </Card>
      )}
    </>
  );
}

function FilterCard({
  label,
  count,
  href,
  active,
  dotClass,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
  dotClass?: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border bg-white p-3 transition-colors ${
        active
          ? "border-violet-600 ring-1 ring-violet-600"
          : "border-slate-200 hover:border-violet-300"
      }`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {dotClass && (
          <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
        )}
        {label}
      </span>
      <span className="mt-1 block text-2xl font-bold text-slate-900">
        {count}
      </span>
    </Link>
  );
}
```

Note: the select now also fetches `email` (display-only addition, same table/RLS).

- [ ] **Step 8: Verify**

`npm run test && npm run lint && npm run build` → pass. With dev server + Playwright, log in at `/admin/login` if a session isn't active (ask the owner for credentials if needed — or verify visually that the login redirect still works and check the dashboard after the owner logs in; do not guess credentials). Check: filter cards show counts and filter on click; rows navigate to detail; mobile 390px renders stacked rows.

- [ ] **Step 9: Commit**

```bash
git add lib/requests/dates.ts lib/requests/dates.test.ts lib/requests/counts.ts lib/requests/counts.test.ts "app/admin/(protected)"
git commit -m "feat: admin shell and dashboard with status filter cards and clickable rows"
```

---

### Task 7: Admin request detail

**Files:**
- Modify: `app/admin/(protected)/aanvragen/[id]/page.tsx`
- Modify: `app/admin/(protected)/aanvragen/[id]/quote-form.tsx`
- Modify: `app/admin/(protected)/aanvragen/[id]/copy-status-link.tsx`
- Modify: `app/admin/(protected)/aanvragen/[id]/delete-button.tsx`

**Interfaces:** consumes `Card`, `StatusBadge`, `Button`, `Field`, `Input`, `Textarea`, `Select`, `formatFileSize`. No props change on any component.

- [ ] **Step 1: `page.tsx`** — restructure into cards:
  - Delete the local `formatSize` function; import `formatFileSize` from `@/lib/format` and use it where `formatSize` was used.
  - Replace the inline status `<span className={...STATUS_BADGE_CLASSES...}>` with `<StatusBadge status={request.status as RequestStatus} />` (import from `@/components/ui/status-badge`; drop the now-unused `STATUS_BADGE_CLASSES` import, keep `STATUS_LABELS` only if still used — it isn't, so drop it too).
  - Back link: `text-blue-700 underline` → `text-violet-700 hover:underline` and text `← Terug naar overzicht` unchanged.
  - Wrap content in cards: the `<dl>` block plus the Bestanden section go inside `<Card className="mt-6">…</Card>`; the "Statuspagina van de klant" section becomes `<Card className="mt-6">…</Card>` (remove `border-t border-gray-200 pt-6`, keep headings but style `text-lg font-bold` → `text-lg font-bold text-slate-900`); the "Offerte & status" section likewise `<Card className="mt-6">`; the Verwijderen section becomes `<Card className="mt-6 border-red-200">` with heading `text-lg font-bold text-red-700`.
  - Container: `max-w-2xl` → `max-w-3xl`; h1 gets `text-slate-900`.
  - Class swaps throughout: `text-gray-600` → `text-slate-600`, `text-gray-500` → `text-slate-500`, file links `text-blue-700 underline` → `text-violet-700 hover:underline`, e-mail link the same swap.
  - Import `Card` from `@/components/ui/card`.

- [ ] **Step 2: `quote-form.tsx`** — swap raw controls for shared ones. Replace the two fee `<label>` blocks, the status `<select>` block and the notes `<textarea>` block with `Field`+`Input`/`Select`/`Textarea` equivalents keeping every `name`, `value`, `onChange`, `defaultValue`, `inputMode`, `placeholder`, `rows` exactly as now. Example for the design fee (repeat the pattern for the others):

```tsx
        <div className="flex-1">
          <Field label="Ontwerpkosten (€)" error={errors.designFee}>
            <Input
              type="text"
              name="designFee"
              inputMode="decimal"
              value={designFeeInput}
              onChange={(e) => setDesignFeeInput(e.target.value)}
              placeholder="bijv. 15,00"
            />
          </Field>
        </div>
```

  Submit button becomes `<Button type="submit" disabled={pending} className="self-start">{pending ? "Bezig met opslaan…" : "Opslaan"}</Button>`. Success line `text-green-700` stays. Imports: `Button` from `@/components/ui/button`, `Field, Input, Select, Textarea` from `@/components/ui/field`. `text-gray-600` → `text-slate-600`.

- [ ] **Step 3: `copy-status-link.tsx`** — swaps: `<code>` classes `rounded border border-gray-200 bg-gray-50` → `rounded-lg border border-slate-200 bg-slate-50`; copy button becomes `<Button type="button" onClick={handleCopy} size="sm" className="shrink-0">{copied ? "Gekopieerd!" : "Kopieer link"}</Button>` (import Button). Error text `text-red-700` → `text-red-600`.

- [ ] **Step 4: `delete-button.tsx`** — use shared buttons, logic identical:
  - initial button: `<Button type="button" variant="danger-outline" size="sm" onClick={() => setConfirming(true)} className="mt-3">Aanvraag verwijderen</Button>`
  - confirm: `<Button type="submit" variant="danger" size="sm">Ja, verwijderen</Button>` and `<Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>Annuleren</Button>`

- [ ] **Step 5: Verify**

`npm run test && npm run lint && npm run build` → pass. Playwright (with owner logged in): open a request detail — cards render, copy-link button works, quote form saves ("Opgeslagen." appears), delete shows two-step confirm (cancel it).

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/aanvragen"
git commit -m "feat: card-based admin request detail with shared form components"
```

---

### Task 8: Admin products + login

**Files:**
- Modify: `app/admin/(protected)/producten/page.tsx`
- Modify: `app/admin/(protected)/producten/product-form.tsx`
- Modify: `app/admin/(protected)/producten/nieuw/page.tsx`
- Modify: `app/admin/(protected)/producten/[id]/page.tsx`
- Modify: `app/admin/(protected)/producten/[id]/photo-manager.tsx`
- Modify: `app/admin/login/page.tsx`
- Modify: `app/admin/login/login-form.tsx`

**Interfaces:** consumes Task 1 components; `ProductForm` and `PhotoManager` keep their exact props. (`producten/[id]/delete-button.tsx` exists too — apply the same Button swaps as Task 7 Step 4 if it contains raw buttons.)

- [ ] **Step 1: `producten/page.tsx`** — "Nieuw product" link becomes `<ButtonLink href="/admin/producten/nieuw">Nieuw product</ButtonLink>`; h1 gets `text-slate-900`; wrap the table in `<Card className="overflow-hidden p-0">` and restyle it like the dashboard list: thead row → `border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500` with `px-4 py-2.5` cells; tbody rows `border-b border-slate-100 hover:bg-violet-50/60` with `px-4 py-3` cells (change `py-2 pr-4` → matching padding); name link `text-blue-700 underline` → `font-medium text-violet-700 hover:underline`; active badge `bg-green-100 text-green-800`, inactive `bg-slate-200 text-slate-700` (rounded-full); photo placeholder `bg-gray-100` → `bg-slate-100`, thumbs `rounded` → `rounded-lg`. Empty state text `text-gray-600` → `text-slate-600`.

- [ ] **Step 2: `product-form.tsx`** — same treatment as quote-form: drop the three local class constants; use `Field` + `Input`/`Textarea` with identical `name`/`defaultValue`/`placeholder`/`rows`/`required`; checkbox gets `accent-violet-600`; submit becomes `<Button type="submit" disabled={pending} className="self-start">{pending ? "Bezig…" : submitLabel}</Button>`. Wrap nothing else — the pages provide the Card.

- [ ] **Step 3: `nieuw/page.tsx` and `[id]/page.tsx`** — h1s get `text-slate-900`; wrap `ProductForm` in `<Card className="max-w-xl">` (remove `max-w-xl` from the form element inside `product-form.tsx` so width is controlled here); on the edit page also wrap `PhotoManager` in `<Card className="max-w-xl">`; intro text `text-gray-600` → `text-slate-600`.

- [ ] **Step 4: `photo-manager.tsx`** — heading gets `text-slate-900`; `text-gray-600` → `text-slate-600`; photo tiles `rounded border border-gray-200` → `rounded-lg border border-slate-200`; delete-per-photo link stays a text button but `text-red-700 underline` → `text-red-600 hover:underline`; file input `rounded border border-gray-300 px-3 py-2 text-sm` → `${inputClasses} text-sm` is NOT applicable to a raw file input — instead use `text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-violet-700 hover:file:bg-violet-200`; upload button becomes `<Button type="button" disabled={busy} onClick={handleUpload} size="sm">{isUploading ? "Uploaden…" : "Foto's uploaden"}</Button>`. Remove `max-w-xl` from the section (Card provides width now).

- [ ] **Step 5: Login page** — `app/admin/login/page.tsx` main becomes:

```tsx
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
```

(imports: `CubeLogo` from `@/components/site-header`, `SITE_NAME` from `@/lib/site`). In `login-form.tsx`: fields → `Field`+`Input` (names/autoComplete identical), submit → `<Button type="submit" disabled={pending} className="w-full">{pending ? "Bezig met inloggen…" : "Inloggen"}</Button>`, error text `text-red-700` → `text-red-600`, remove `max-w-sm` from the form (the card handles width).

- [ ] **Step 6: Verify**

`npm run test && npm run lint && npm run build` → pass. Playwright: login page renders the card; products list, nieuw and edit pages render; photo upload button/input styled.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/(protected)/producten" app/admin/login
git commit -m "feat: restyle admin products and login with shared components"
```

---

### Task 9: Full verification pass

**Files:** none new — fixes only if checks fail.

- [ ] **Step 1: Run the whole suite**

`npm run test && npm run lint && npm run build` → all green.

- [ ] **Step 2: Grep for leftovers**

`grep -rn "indigo-" app components` and `grep -rn "gray-" app components` — every hit in files this plan touched must be intentional (STATUS colors in `lib` are allowed; untouched files like e-mail templates are out of scope). Fix strays.

- [ ] **Step 3: End-to-end visual pass (verify skill)**

With `npm run dev` + Playwright at 1440×900 and 390×844, walk: home → modellen → product detail → aanvraag (`?type=file`, pick a small dummy .stl, fill the form, submit) → verzonden. Confirm the request lands in admin (owner logs in), open it, set a quote, check the customer status link renders. Screenshot each stop; confirm the homepage first-screen rule (hero + steps + models peek) one final time.

- [ ] **Step 4: Update docs and commit**

If `docs/ROADMAP.md` tracks debts/phases affected by this work, add one line noting the redesign. Final commit:

```bash
git add -A
git commit -m "chore: redesign verification pass fixes"
```

(Skip the commit if nothing changed.)

---

## Self-review notes (already applied)

- Spec coverage: palette/font/components → Task 1; width → all tasks (`max-w-7xl`); header/footer/contact merge → Task 2; compact homepage with merged band → Task 3; form card, type cards, upload zone, sidebar → Task 4; status page/verzonden/modellen → Task 5; admin shell, filter-count cards, clickable rows, friendly dates → Task 6; detail cards → Task 7; products/login → Task 8; testing section of spec → per-task verify + Task 9.
- Out-of-scope guard: no dark mode, no new pages, no drag-and-drop logic, no validation changes anywhere.
- Type consistency: `formatFileSize`, `formatRequestDate`, `countByStatus`, `buttonClasses`, component prop shapes are defined once in Task 1/6 and consumed with identical signatures later.
