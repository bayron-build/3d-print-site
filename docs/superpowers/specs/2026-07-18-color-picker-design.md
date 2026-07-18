# Color swatch picker for fixed-price (catalog) products

**Date:** 2026-07-18
**Status:** Approved

## Problem

Customers ordering a kant-en-klaar product currently type a color into a
free-text field. The owner prints with Bambu Lab PLA Basic and PLA Matte
filament, so the real choice is a fixed palette — like the swatch row on
Bambu's own store. Free text produces colors that don't exist ("donkerblauw
metallic"), and gives no way to signal which colors are in stock versus
need-to-order.

## Decisions made

- **Placement:** swatch picker on the product detail page (`/modellen/[id]`)
  *and* in the order form (`/aanvraag`). The product-page choice carries into
  the form via a URL parameter; the customer can still change it there.
- **Stock management:** a new admin page with an on/off toggle per color.
  No code change or redeploy to update stock.
- **Palette:** two labeled groups, "PLA Basic" and "PLA Matte", matching
  Bambu Lab's current lineups. Official English Bambu color names are kept
  (they're on the spool and in Bambu's shop).
- **Out-of-stock colors are still selectable.** They show a note: "Deze
  kleur is niet op voorraad — levering duurt enkele dagen langer." No order
  is ever lost over stock.
- **Default color:** PLA Basic Black.
- **Scope:** catalog orders only. File and custom requests keep the
  free-text "Kleur (optioneel)" field unchanged.

## Design

### 1. Data model (one migration)

- New table `filament_colors`:
  - `id text primary key` — slug, e.g. `basic-black`, `matte-charcoal`
  - `line text not null check (line in ('basic','matte'))`
  - `name text not null` — official Bambu name, e.g. `Jade White`
  - `hex text not null` — swatch color
  - `sort_order int not null`
  - `available boolean not null default false`
- Seeded in the same migration with the current PLA Basic and PLA Matte
  lineups (names + hex codes verified against Bambu's store during
  implementation).
- RLS: public (anon) read; authenticated (admin) update of `available`.
  Mirrors the products policies.
- **No `requests` schema change.** On submit the server action resolves the
  chosen color id and writes a snapshot string into the existing
  `requests.color` text field:
  - in stock: `PLA Basic – Black`
  - not in stock: `PLA Matte – Charcoal (niet op voorraad — langere
    levertijd)`
  Later stock/palette changes never rewrite old orders, and every
  downstream surface (admin detail, status page, emails) already renders
  `color` — zero changes needed there.

### 2. Shared picker component

One client component (e.g. `components/color-picker.tsx`) used on both
pages:

- Two rows of round swatches with group labels "PLA Basic" / "PLA Matte".
- Selected swatch gets a ring; below the rows, the selected color's name
  plus availability: "Op voorraad" or the longer-delivery note.
- Near-white swatches get a border so they're visible on white.
- Props: color list (fetched server-side), selected id, onChange.
- Defaults to `basic-black` when nothing is selected.

### 3. Product detail page (`/modellen/[id]`)

- Server component fetches `filament_colors` and renders the picker under
  the price block.
- "Bestellen" carries the selection: `/aanvraag?product=<id>&color=<colorId>`.
- Invalid/unknown `color` param falls back to the default.

### 4. Order form (`/aanvraag`)

- For type = kant-en-klaar, the free-text "Kleur (optioneel)" input is
  replaced by the picker, preselected from the `color` URL param or
  defaulting to PLA Basic Black. A hidden field submits the color id.
- For file/custom the existing free-text field renders exactly as today.
- Server action (`app/aanvraag/actions.ts`): for catalog requests it looks
  up the submitted color id in `filament_colors` — the browser's text is
  never trusted, same pattern as the price lookup. Unknown id → validation
  error. The resolved snapshot string is written to `requests.color`.

### 5. Admin (`/admin/kleuren`)

- New page in the admin nav: both groups listed with swatch, name, and an
  "op voorraad" toggle per color.
- Toggle calls a server action updating `available`; effect is immediate.

### 6. Testing

Pure-function tests only, per house style:

- Color snapshot formatting (in stock / not in stock variants).
- Catalog validation: color id must be a non-empty known-shaped slug;
  unknown-id rejection happens in the server action (I/O, covered by the
  manual smoke test like the price lookup).
- Default-selection logic (missing/invalid URL param → `basic-black`).

Manual end-to-end smoke test: toggle a color off in admin → note appears on
product page and form → order stores the suffixed snapshot string.

## Out of scope

- Per-product color palettes
- Stock counts (it's a boolean, not inventory)
- Color choice for file/custom requests
- Photos per color variant
- Other filament lines (PETG, ABS, …) — add rows later if needed
