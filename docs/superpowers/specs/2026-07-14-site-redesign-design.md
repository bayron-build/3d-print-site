# Site redesign: soft light theme, denser homepage, trustworthy form, friendlier admin

**Date:** 2026-07-14
**Status:** Approved by owner (light mockup direction, approach A)

## Goal

The current site feels harsh (near-black hero band), too narrow (1152px), and too
spread out vertically. The aanvraag form looks bare and untrustworthy. The admin
dashboard is plain and hard to scan. This redesign restyles all three areas after
the light mockup (`docs/design/mockup-light.png`) without changing any behavior:
no changes to validation, server actions, uploads, auth, or database access.

## Approach

Approach A (chosen over restyling in place or adopting a component library):
first add a small shared design foundation — palette tokens and ~5 reusable UI
components — then rebuild the homepage, aanvraag page, and admin on top of it.
All areas end up looking like one product and future pages stay consistent.

## Section 1 — Design foundation

### Palette

Taken from the light mockup:

- **Background:** white; sections separated by very light violet/slate tinted
  bands. No near-black areas on public pages.
- **Text:** dark slate (not pure black) for headings; mid slate-gray for
  secondary text. Use Tailwind's `slate` scale instead of `gray` for a softer
  feel.
- **Accent:** Tailwind's built-in `violet` scale — `violet-600` for solid
  buttons/links (hover `violet-500`), `violet-50`/`violet-100` for tints and
  icon circles. No custom hex values; replaces the current `indigo` usage.
- Status colors (admin + status page) keep their meaning: blue-ish for new/in
  progress, amber for printing, green for done, red for rejected; violet is
  reserved for actions.

### Font fix

`app/globals.css` currently forces `font-family: Arial, Helvetica, sans-serif`
on `body`, overriding the Geist font loaded in `app/layout.tsx`. Remove that so
Geist (via `--font-sans`) actually renders. Remove the unused
`prefers-color-scheme: dark` block too — the site is light-only.

### Shared components (`components/ui/`)

Small, presentational only:

- **`Button`** — variants: `primary` (violet solid), `secondary` (outline),
  plus disabled/pending styling. Used on public pages and admin.
- **`Field` + `Input`/`Textarea`/`Select`** — label, consistent rounded input
  with focus ring, inline red error text; one place defines form styling.
- **`Card`** — white rounded panel, soft border + subtle shadow.
- **`SectionHeading`** — violet uppercase eyebrow + large title (mockup
  pattern).
- **`StatusBadge`** — moves out of the admin page into shared UI; used by admin
  list/detail and the customer status page. Colors stay in
  `lib/requests/status.ts`.

### Layout width

Public content width goes from `max-w-6xl` (1152px) to `max-w-7xl` (1280px).
Admin keeps full-width with comfortable padding.

## Section 2 — Homepage

First-screen goal (owner): roughly 75% hero + how-it-works, with the models
band starting at the bottom edge of the first screen, matching the mockup's
proportions but compacted.

1. **Header** — white, cube logo, nav (Modellen, Hoe het werkt, Contact),
   violet "Offerte aanvragen" button. Single light variant; the `dark` header
   variant disappears with the dark hero.
2. **Hero (slimmer than current)** — light background with subtle violet tint
   (gradient white → violet-tinted). Left: "Iets nodig in 3D print?" headline
   with violet accent word, short subtext, two buttons (Upload je bestand =
   primary, Custom ontwerp aanvragen = secondary), three trust badges with
   icons and one-line subtext like the mockup. Right: existing
   `hero-printer.jpg`, rounded-2xl with soft shadow.
3. **How it works + custom idea in one band** — 4 steps (Contact, Offerte,
   Printen, Levering) with violet icon circles on the left; the "Heb je een
   eigen idee?" card with the dragon image on the right (violet-50 card).
   Merges two current sections into one — the main vertical space win.
4. **Models** — tinted band: `SectionHeading` ("Modellen" / "Klaar om te
   printen."), "Bekijk alle modellen →" link, grid of up to 6 `ProductCard`s.
   Existing empty/error states kept.
5. **Footer** — richer, mockup-style: logo + tagline, link columns (real pages
   only — Modellen, Aanvraag indienen, Hoe het werkt), contact e-mail block
   with the "betalen per bankoverschrijving of Tikkie" line. The separate
   Contact section on the homepage merges into the footer; the header/footer
   `#contact` links point at the footer block.

Vertical rhythm across sections tightens from `py-16` to roughly `py-10`.

## Section 3 — Aanvraag indienen page

Presentation only; validation, client-side upload flow, and the server action
stay exactly as they are.

- **Two-column desktop layout** — form in a `Card` (~2/3) left; trust sidebar
  (~1/3) right: mini 4-step process, "je betaalt pas na akkoord" reassurance,
  what happens after submitting (reply within 1–2 days by e-mail), contact
  e-mail. Sidebar stacks below the form on mobile.
- **Type selector as cards** — the three request types (Kant-en-klaar / Print
  mijn bestand / Eigen ontwerp) become clickable cards with icon + one-line
  description; selected card highlighted violet. Semantically still radio
  inputs (visually-hidden input inside a styled label) so form submission and
  validation are untouched.
- **Styled fields** via shared `Field`/`Input` components.
- **File upload** — dashed drop-zone-styled box with upload icon and the file
  rules as helper text; below it a list of chosen files with name + size.
  Still the plain `<input type="file">` under the hood (label-styled); no
  drag-and-drop logic in scope.
- **Grouped sections** — "Wat wil je aanvragen?", "Jouw gegevens", "Wat wil je
  printen?" as small headings inside the card.
- **Submit** — full-width primary `Button`, existing uploading/sending states.
- The honeypot field stays as is.

## Section 4 — Admin

Layout and styling only; queries, actions and auth untouched.

- **Header** — same clean public style (cube mark + "Beheer"), nav with violet
  active state for Aanvragen / Producten, logged-in e-mail, logout as subtle
  outline button.
- **Status summary cards** — one card per status showing its count, tinted in
  the status color, plus an "Alle" card. Clicking a card filters the list
  (same `?status=` links); these replace the current filter pills. Counts come
  from one extra lightweight query selecting only the `status` column of all
  requests, counted in JS — always accurate regardless of the active filter.
- **Requests table in a `Card`** — hover highlight, whole row clickable to the
  detail page, customer e-mail shown next to the name, colored `StatusBadge`,
  friendly dates ("vandaag"/"gisteren" for recent, otherwise short date).
- **Detail + product pages** — same components: content grouped in `Card`s,
  shared `Button`s and `Field` styles, consistent badges. Mostly class swaps.
- **Colors** — light slate workspace background, white cards, status colors do
  the signaling, violet only for primary actions.

## Out of scope

- Dark mode / theme toggle.
- New pages or nav items that don't exist yet (Services, Gallery, FAQ, privacy).
- Drag-and-drop file upload logic.
- Any behavioral change: validation rules, e-mails, storage, auth, RLS.

## Testing

- Existing vitest suite must keep passing (no logic changes expected to break
  it).
- Manual verification with the running app (and Playwright browser tools):
  - Homepage first screen at 1440×900 and 1920×1080 shows hero + how-it-works
    with the models band visible at the bottom edge.
  - Aanvraag form: all three types render their fields, client validation
    errors show inline, successful submit still redirects to /aanvraag/verzonden.
  - Admin: filter cards filter, table rows navigate, quote form and product
    forms still work.
  - Mobile (~390px wide): hero stacks, form sidebar drops below, admin table
    remains usable.
