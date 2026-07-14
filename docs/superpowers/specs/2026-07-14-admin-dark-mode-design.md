# Admin Dark Mode — Design

**Date:** 2026-07-14
**Status:** Approved by owner (full dark, login included, Tailwind `dark:` variant approach)

## Goal

The admin area (everything under `/admin`, including `/admin/login`) always renders
dark — the owner found the light admin too bright. The public site stays exactly as
it is after the 2026-07-14 redesign. No toggle, no system-preference detection:
admin is simply always dark.

## Non-goals (explicitly out of scope)

- No dark mode for the public site (but this mechanism makes it possible later).
- No theme toggle or `prefers-color-scheme` handling.
- No behavior changes of any kind — this is classes only, same rule as the redesign.
- No new components. The shared `components/ui/` set stays the single source of truth.

## Mechanism (approach chosen: Tailwind class-based `dark:` variants)

Tailwind CSS v4, class strategy:

1. `app/globals.css` gains one line after the imports:

   ```css
   @custom-variant dark (&:where(.dark, .dark *));
   ```

   This makes every `dark:*` utility activate only inside an element with the
   `.dark` class — NOT via the OS/browser color scheme.

2. The `.dark` class (plus `[color-scheme:dark]` so native controls — select
   dropdowns, checkboxes, file inputs — render dark) goes on exactly two roots:
   - the admin layout wrapper div in `app/admin/(protected)/layout.tsx`
   - the `<main>` of `app/admin/login/page.tsx`

3. Shared components and admin pages get `dark:` counterpart classes. Public pages
   never sit under a `.dark` ancestor, so the added `dark:` classes are inert there —
   zero visual change to the public site.

Rejected alternative: separate admin components (`AdminCard` etc.) — duplicates the
shared UI the redesign just consolidated; every future tweak would be done twice.

## Palette mapping (light → dark, within `.dark` scope)

| Role | Light (current) | Dark |
|---|---|---|
| Page background | `bg-slate-50` | `dark:bg-slate-950` |
| Surfaces (header, cards, table) | `bg-white` | `dark:bg-slate-900` |
| Borders (cards, dividers) | `border-slate-200` / `divide-slate-100` | `dark:border-slate-800` / `dark:divide-slate-800` |
| Input borders | `border-slate-300` | `dark:border-slate-700` |
| Input background | `bg-white` | `dark:bg-slate-950` |
| Headings | `text-slate-900` | `dark:text-white` |
| Body text | `text-slate-600` / `text-slate-700` | `dark:text-slate-300` |
| Muted text | `text-slate-500` | `dark:text-slate-400` |
| Placeholder | `placeholder:text-slate-400` | `dark:placeholder:text-slate-500` |
| Row/zebra hover | `hover:bg-violet-50/60` | `dark:hover:bg-violet-500/10` |
| Active nav / filter card | `bg-violet-100 text-violet-800` | `dark:bg-violet-500/20 dark:text-violet-300` |
| Icon circles | `bg-violet-100 text-violet-700` | `dark:bg-violet-500/20 dark:text-violet-300` |
| Table header band | `bg-slate-50 text-slate-500` | `dark:bg-slate-950/50 dark:text-slate-400` |
| Error text (inline) | `text-red-600` | `dark:text-red-400` |
| Error text (page-load) | `text-red-700` | `dark:text-red-400` |
| Success text | `text-green-700` | `dark:text-green-400` |
| Danger card border | `border-red-200` | `dark:border-red-500/40` |
| Focus ring | `focus:ring-violet-200` | `dark:focus:ring-violet-500/30` |

Violet primary buttons (`bg-violet-600 hover:bg-violet-500`) stay unchanged — they
work on both backgrounds. `STATUS_DOT_CLASSES` (solid dots) also stay unchanged.

## Component-level decisions

All in `components/ui/` unless noted. Every change is additive `dark:` classes.

- **Card** — `dark:border-slate-800 dark:bg-slate-900`. Callers that tint a Card
  (e.g. `bg-violet-50` sidebar on the public aanvraag page) are public-only and
  unaffected.
- **Button** — `primary` and `danger` unchanged. `secondary`:
  `dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300
  dark:hover:border-violet-500 dark:hover:text-violet-300`. `danger-outline`:
  `dark:border-red-500/40 dark:bg-transparent dark:text-red-400
  dark:hover:bg-red-500/10`.
- **Field / Input / Textarea / Select** (`inputClasses` + Field label/hint/error) —
  inputs `dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100
  dark:placeholder:text-slate-500 dark:focus:border-violet-500
  dark:focus:ring-violet-500/30`; label `dark:text-slate-300`; hint
  `dark:text-slate-400`; error `dark:text-red-400`.
- **StatusBadge** — colors stay in `lib/requests/status.ts` (unchanged constraint:
  status colors live there only). Each `STATUS_BADGE_CLASSES` entry gains a dark
  variant, pattern `dark:bg-<color>-500/15 dark:text-<color>-300`:
  - received: `dark:bg-slate-500/20 dark:text-slate-300`
  - quoted: `dark:bg-blue-500/15 dark:text-blue-300`
  - approved: `dark:bg-violet-500/15 dark:text-violet-300`
  - printing: `dark:bg-amber-500/15 dark:text-amber-300`
  - done: `dark:bg-green-500/15 dark:text-green-300`
  - rejected: `dark:bg-red-500/15 dark:text-red-300`
- **SectionHeading / icons** — not used in admin today; no changes.
- **AdminNav** (`app/admin/(protected)/admin-nav.tsx`) — active
  `dark:bg-violet-500/20 dark:text-violet-300`; inactive
  `dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100`.

## Page-level inventory (admin files that need `dark:` classes)

- `app/admin/(protected)/layout.tsx` — root gets `dark [color-scheme:dark]`,
  `dark:bg-slate-950`; header `dark:border-slate-800 dark:bg-slate-900`; logo text
  `dark:text-white`; email `dark:text-slate-400`.
- `app/admin/(protected)/page.tsx` — headings, muted text, FilterCard (surface,
  border, active ring, hover), table header band, row text/hover, empty states.
- `app/admin/(protected)/aanvragen/[id]/page.tsx` + `quote-form.tsx` +
  `copy-status-link.tsx` + `delete-button.tsx` — headings/dl text, back link stays
  violet (`dark:text-violet-400` for contrast), file links likewise, code block
  `dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300`, success/error text
  per mapping, danger card border.
- `app/admin/(protected)/producten/**` (list page, product-form, nieuw, [id],
  photo-manager, delete-button) — same mapping; active/inactive badges get
  `dark:bg-green-500/15 dark:text-green-300` / `dark:bg-slate-700 dark:text-slate-300`;
  photo-manager file input `dark:text-slate-400 dark:file:bg-violet-500/20
  dark:file:text-violet-300 dark:hover:file:bg-violet-500/30`.
- `app/admin/login/page.tsx` + `login-form.tsx` — `<main>` gets
  `dark [color-scheme:dark] dark:bg-slate-950`; card and fields via the shared
  components' dark variants; headings/subtitle per mapping.

Customer-facing pages (`/aanvraag/status/[token]` etc.) are NOT admin and get no
changes, even though the owner shares those links from the admin.

## Error handling / data flow

None affected. No queries, actions, props, or state change anywhere.

## Testing & verification

- `npm run test` (66 tests), `npm run lint`, `npm run build` stay green — no logic
  is touched, so no new unit tests. Exception: `lib/requests/status.ts` badge
  strings change; if any test asserts those exact strings, update it to match.
- Playwright visual check without credentials: `/admin/login` renders dark
  (slate-950 screen, slate-900 card, readable fields at both 1440×900 and 390×844).
- Grep check: no `dark:` classes may appear in public-page files (`app/page.tsx`,
  `app/modellen/**`, `app/aanvraag/**` except nothing there should change) —
  `dark:` variants belong only in `components/ui/`, `lib/requests/status.ts`, and
  `app/admin/**`.
- Owner checklist (logged in, local): dashboard filter cards readable, badge colors
  distinguishable, request detail cards + quote form inputs legible, native select
  dropdown renders dark, products list + photo manager legible, login flow.

## Open questions

None — shades and scope approved by owner on 2026-07-14.
