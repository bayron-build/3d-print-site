# Phase 6 Design — Public Landing Page + Catalog + Product Management

**Date:** 2026-07-13
**Project:** 3D print service web app (portfolio project)
**Scope:** Phase 6 only — the last phase of v1. Depends on Phases 1–5 being
merged (they are). Everything on the roadmap's "not in v1" list stays out.

## Phase 6 goal

After this phase, the site has a real public face: a Dutch marketing landing
page in the style of the owner's mockups (dark hero band, white sections,
indigo accent), a catalog page listing ready-made models with photos and
indicative prices, and a detail page per model that links into the existing
request form. The owner manages the catalog (create/edit/deactivate products,
upload photos) from new admin pages — no SQL needed. This also pays off two
deferred debts: nl-NL price formatting and removal of the Phase 3 test
product.

## Design references

Two owner-provided mockups, committed to `docs/design/`:

- `docs/design/mockup-light.png` — "PrintCraft by Bayron", light theme.
  **This is the look to build**, with one change: the hero section uses a
  dark (near-black) background like the dark mockup, and everything below it
  is white. The owner explicitly wants that dark-top/white-rest contrast.
- `docs/design/mockup-dark.png` — dark variant; used only as the reference
  for the dark hero band. No dark mode / theme toggle in v1.

The mockups' copy is English; the real site is Dutch. Claude drafts the
Dutch copy; the owner edits wording afterwards (plain text edits).

## Decisions made

- **Branding: "PrintCraft by Bayron"** with the cube logo mark from the
  light mockup (simple inline SVG, no logo asset needed). Used in the
  header, footer, and page titles. Indigo/violet accent (Tailwind indigo).
- **One-page landing + catalog, no extra info pages.** How-it-works and
  contact are scrollable sections on the landing page (nav links are anchor
  links). The only new public routes are `/modellen` and `/modellen/[id]`.
  No Services/Materials/Gallery/About routes; the footer links only to
  pages that actually exist — no dead FAQ/Verzending/Privacy links.
- **Product cards link to a detail page per product** (`/modellen/[id]`),
  which shows all photos and the description — the only place they're fully
  displayed — with a "Bestellen" button to `/aanvraag?product=<id>`
  (pre-selection already works since Phase 3).
- **Admin product CRUD with photos, browser → Storage direct.** Photo
  uploads go straight from the admin's browser to a new **public** bucket
  `product-photos` (Phase 3 pattern), because server actions cap uploads at
  ~1 MB on Vercel and phone photos are routinely 3–8 MB. Public bucket =
  fast CDN URLs for the catalog, zero signing logic. Write access is
  admin-only via storage policies; the RLS boundary stays in the database.
- **Deactivate is the normal way to retire a product.** The
  `requests.product_id` FK has no cascade (Phase 2: orders keep their
  product). Hard delete exists but fails gracefully with a Dutch message
  suggesting deactivation when any request references the product.
- **Placeholder imagery cropped from the mockups.** The AI-generated hero
  printer photo and the purple dragon are cropped out of the committed
  mockups into `public/images/` as placeholder assets; the owner swaps in
  real photos later (file replacement, no code change). There are no real
  printed models to photograph yet, so the catalog also needs good empty
  states.
- **Shared euro formatter.** `formatEuro` (currently in
  `lib/email/templates.ts`, produces `€ 1.234,56`) moves to `lib/format.ts`;
  the email templates import it from there. All price displays — catalog,
  detail, admin, and the request form's currently-raw
  "richtprijs €12.5" — use it.
- **`/aanvraag` learns `?type=`** (`file` | `custom` | `catalog`) to
  pre-select the request type, mirroring the existing `?product=` handling
  (unknown value → ignored, default unchanged). The hero CTAs use it.
- **Same architecture as Phases 2–5:** server components + server actions,
  no new npm dependencies, Vitest for pure logic only, migrations as
  run-once SQL files the owner executes in the web SQL editor.

## Visual language (from the light mockup)

- Dark hero band: near-black background, white headline with the key phrase
  in indigo, light-gray subline. Everything below: white background,
  near-black text, generous whitespace, soft-gray section dividers.
- Indigo primary buttons (rounded), outlined secondary buttons, circular
  pale-indigo icon chips for step/trust icons.
- Cards: white, thin gray border, rounded corners, subtle hover shadow.
- Existing pages (form, admin, status) keep their current styling; only the
  shared header/footer is added to the public pages (see Routes).

## Routes and UX (all UI text Dutch)

### Shared components: `SiteHeader` and `SiteFooter`

Plain components imported by the public pages (no route-group moves —
existing URLs and files stay where they are):

- **Header:** logo + "PrintCraft by Bayron"; links *Modellen*
  (`/modellen`), *Hoe het werkt* (`/#hoe-het-werkt`), *Contact*
  (`/#contact`); indigo CTA button "Offerte aanvragen" → `/aanvraag`.
  On the landing page the header sits on the dark band (dark variant); on
  other pages it's light. Mobile: the nav collapses to essentials — logo +
  CTA button (no hamburger menu in v1).
- **Footer:** logo, one-line tagline, links to `/modellen` and `/aanvraag`,
  contact email, copyright. Only real destinations.
- **Used on:** landing, `/modellen`, `/modellen/[id]`, `/aanvraag`,
  `/aanvraag/verzonden`. **Not** on the token status page (functional,
  email-linked, noindex) or admin pages.

### `/` — landing page (replaces the placeholder)

Server component, sections top to bottom:

1. **Dark hero band** — headline ("Iets nodig in 3D print?" style, key words
   indigo), subline naming the three routes (upload / custom / kant-en-klaar),
   CTAs "Upload je bestand" → `/aanvraag?type=file` and "Custom ontwerp
   aanvragen" → `/aanvraag?type=custom`, trust badge row (kwaliteit,
   materiaalkeuze, snelle reactie), cropped printer photo on the right
   (hidden/stacked on mobile).
2. **`#hoe-het-werkt`** — 4 steps with icon chips: Contact → Offerte →
   Printen → Levering, one Dutch sentence each. Matches the real pipeline
   (quote by email, Akkoord on the status page, pickup/bank transfer/Tikkie).
3. **Custom-idea card** — pale-indigo card, dragon image, "Heb je een eigen
   idee?" + CTA → `/aanvraag?type=custom`.
4. **Models section** — "Klaar om te printen." + up to 6 newest active
   products as cards (first photo, name, "Vanaf € 12,50"), link "Bekijk
   alle modellen →" → `/modellen`. **If no active products exist** (current
   reality): a friendly "De catalogus wordt gevuld — binnenkort vind je
   hier kant-en-klare modellen." note instead of the grid; the section link
   still points to `/modellen`.
5. **`#contact`** — short over/contact blurb with the owner's email, region
   note (lokaal, Nederland), and payment note (bankoverschrijving/Tikkie).
6. Footer.

Dutch `title`/`description` metadata.

### `/modellen` — catalog

Server component. Grid of **active** products ordered newest first: first
photo (or neutral placeholder tile if the product has no photos), name,
"Vanaf € X" via `formatEuro` (products without an indicative price show no
price line). Card → `/modellen/[id]`. Empty state: same friendly Dutch
message as the landing section. Load error: raw message (project posture).
Dutch metadata.

### `/modellen/[id]` — product detail

Server component (`params` is a Promise — await it). Fetches one **active**
product via the anon client (Phase 2 RLS already limits anon to active
products; unknown or inactive id → Dutch `not-found.tsx`, HTTP 404). Shows:
all photos (first one large, the rest as a simple grid below — no
carousel/lightbox), name, full description, "Richtprijs vanaf € X" when
set (plus a note that the final price follows in the quote), and a
"Bestellen" button → `/aanvraag?product=<id>`. Product name in the page
title.

### `/aanvraag` — small enhancement

Accepts `?type=file|custom|catalog` to pre-select the request type, same
validation-and-ignore approach as `?product=`. `?product=` continues to
imply `catalog` as it does today.

## Admin product management (under the existing `(protected)` gate)

### `/admin/producten` — list

Table of **all** products (active and inactive): first photo thumbnail,
name, indicative price, active badge (Dutch: "actief"/"inactief"),
created date. Link "Nieuw product" → `/admin/producten/nieuw`. Row →
`/admin/producten/[id]`. Admin nav gets a *Producten* link next to
*Aanvragen*.

### `/admin/producten/nieuw` — create

Form: name (required), description (textarea, optional), indicative price
(optional; Dutch comma decimals accepted, same parsing approach as the
Phase 4 quote form; `numeric(10,2)` limits apply), active checkbox
(default on). On success: **redirect to the edit page** to add photos —
photos are only uploaded against an existing product row, so a failed
create can never orphan storage objects.

### `/admin/producten/[id]` — edit

Same fields pre-filled, plus photo management:

- **Upload:** file input (multiple), client component using the
  authenticated browser Supabase client, uploading directly to
  `product-photos/<productId>/<uuid>.<ext>`. After each successful upload a
  server action appends the path to `products.photos` and revalidates.
  Client-side validation before upload: `.jpg/.jpeg/.png/.webp`, max 10 MB
  per file, max 6 photos per product (shared pure module, unit-tested).
- **Delete a photo:** button per thumbnail; server action removes the
  storage object, then the path from the array.
- **Order:** array order = upload order; first photo is the card/cover
  image. No reordering UI in v1.

Photo URLs are built with Supabase's public-URL helper (public bucket, no
signing).

### Deleting a product

Delete button with confirmation (pattern from Phase 4's request delete).
The server action, in order:

1. Counts `requests` referencing the product (admin can read requests). If
   any exist, stop before touching anything and show: "Dit product is
   gebruikt in aanvragen en kan niet worden verwijderd. Zet het op
   inactief." — photos stay intact.
2. Otherwise removes **all objects under the product's storage prefix**
   (also sweeping any orphaned uploads in that folder), then deletes the
   row. Should the row delete still fail on the FK (request created in the
   same instant — single-admin, effectively theoretical), the same Dutch
   message appears; the photos are then lost but re-uploadable.

## Database changes — `supabase/migrations/0005_product_photos.sql`

Run once by the owner in the Supabase web SQL editor. **No changes to the
`products` table** — Phase 2's schema (`photos text[]`) and RLS (public
reads active products, admin full access) already cover everything else.

- Create storage bucket `product-photos`, **public** (public read via CDN
  URLs; no select policy needed for that).
- Storage policies on `storage.objects` for `bucket_id = 'product-photos'`:
  `insert` and `delete` for authenticated users where `public.is_admin()`
  (reusing the Phase 2 helper). No anon write of any kind. No update policy
  (photos are immutable; replace = delete + upload).

## Shared modules

| File | Role |
|---|---|
| `lib/format.ts` | `formatEuro` moved from `lib/email/templates.ts` (which now imports it). Existing tests move/extend with it. |
| `lib/products/validation.ts` | Pure validation for the product form (name required, price parsing with Dutch commas reusing the Phase 4 approach, active flag) and for photo files (extension, size, count). No I/O — Vitest. |

## Error handling

- Same posture as Phases 2–5: page-load errors show the raw message
  (visible misconfiguration); form actions return Dutch field errors.
- Photo upload failure (network, policy): Dutch error next to the upload
  control; the product row is never half-saved (text fields and photos are
  separate operations). A storage upload that succeeds but whose
  path-append fails leaves an orphan in the product's folder — swept on
  product delete, otherwise same accepted-debt class as Phase 3.
- Unknown/inactive product on `/modellen/[id]` → Dutch 404, no leak of
  inactive products' existence.
- Catalog/landing with zero active products → friendly Dutch empty states,
  never an empty grid or an error.

## Testing

- **Vitest (pure logic only):** `lib/products/validation.ts` (name/price/
  active parsing, photo extension/size/count rules), `lib/format.ts`
  (`formatEuro` cases move with the function; request-form richtprijs
  formatting relies on it).
- **Manual checklist (owner: local, then live after deploy):**
  1. Landing page renders: dark hero + white sections, both hero CTAs
     pre-select the right form type, anchors scroll, empty-catalog note
     shows while no products exist.
  2. Admin: create a real product with name/description/price → redirected
     to edit → upload 2+ photos → photos appear; delete one photo → gone
     from page and bucket.
  3. `/modellen` shows the product; detail page shows all photos +
     description + price; "Bestellen" lands on the form with the product
     pre-selected; submitting that request works end-to-end.
  4. Landing now shows the product card instead of the empty state.
  5. Deactivate the product → gone from `/modellen`, landing, and the
     form's product dropdown; its detail URL → 404; still listed (inactief)
     in admin.
  6. Delete the Phase 3 test product 'Testproduct — vaas' via the new UI
     (it has requests → expect the friendly FK message → deactivate it
     instead; or delete if its test requests were already cleaned up).
  7. Prices show Dutch formatting (`€ 12,50`) on the form, catalog, detail,
     and admin pages.
  8. As anon (logged out): `/admin/producten` redirects to login; a direct
     storage upload to `product-photos` is rejected; public photo URLs
     load.

## Manual steps (owner)

1. Supabase SQL editor: run `0005_product_photos.sql` (OWNER ACTION).
2. After verifying: create the first real product(s) and deactivate or
   delete 'Testproduct — vaas' (id `eedf1e4e-5970-424c-8b99-b28023dd0fb2`).
3. Optional, unrelated to code: the Phase 5 Resend env vars are still
   unset; emails keep silently skipping until then.

## Explicitly not in Phase 6

Dark mode / theme toggle, hamburger mobile menu, separate
Services/Materials/Gallery/About pages, photo reordering, image
resizing/optimization pipeline, catalog search/filtering/categories,
sitemap/OG images, carousel/lightbox, cleanup of Phase 3's
abandoned-upload orphans in `request-files` (still deferred), and the
roadmap's entire not-in-v1 list (payments, accounts, cart, stock,
auto-pricing, English, reviews, multi-printer).
