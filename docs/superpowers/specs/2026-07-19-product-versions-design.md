# Product versions with discount pricing — design

**Date:** 2026-07-19
**Status:** Approved by owner (conversation), pending spec review

## Problem

Some catalog products come in multiple configurations of the same model — e.g. a
tea dispenser sold as a single stack (€23) or a double stack that would
nominally cost €46 but is offered at a discount. Today a product has exactly one
`indicative_price`, so the only workaround is duplicate products. We want
versions to be modular (any product can have them) instead of hardcoded.

## Decisions made during brainstorming

- **Pricing is fully manual.** Each version has its own typed-in price plus an
  optional `compare_at_price` shown struck through. Nothing is auto-computed
  from the base price.
- **Versions are an optional extra.** Products keep their single base price;
  a product without versions looks and behaves exactly as today.
- **No "vanaf" pricing on the overview.** The owner finds "vanaf €X" reads as a
  lure. Cards show the plain base price plus a subtle "N uitvoeringen" hint.
- **One shared photo gallery per product.** A version may *point at* one of the
  product's existing photos; selecting the version swaps the cover image to it.
  No per-version galleries.
- **Approach: a `product_versions` table** (over JSON-on-product or
  version-as-separate-product) — matches the existing architecture.

## Database (one migration, Supabase SQL editor, safe to run before deploy)

New table `product_versions`:

| column             | type            | rules                                        |
| ------------------ | --------------- | -------------------------------------------- |
| `id`               | uuid pk         |                                              |
| `product_id`       | uuid fk         | references products, `on delete cascade`     |
| `name`             | text            | required, customer-facing (e.g. "Dubbel")    |
| `price`            | numeric(10,2)   | required, > 0                                |
| `compare_at_price` | numeric(10,2)   | nullable; when set, must be > `price`        |
| `photo_path`       | text            | nullable; one of the product's photo paths   |
| `sort_order`       | integer         | display order                                |

RLS mirrors products: anon may read versions of active products only; only the
authenticated owner may insert/update/delete.

`products` gains one nullable column: `base_version_label` (e.g. "Enkel") —
the customer-facing label of the base-price option, shown only when the product
has versions; defaults to "Standaard" in the UI when empty.

`requests` gains one nullable column: `version_name` — a text snapshot of the
chosen version at order time. Price is already snapshotted into the existing
`unit_price` column, so editing or deleting a version never rewrites past
orders. Base-price (no-version) orders leave `version_name` null and behave
exactly as today. `get_request_by_token` is recreated to also return
`version_name` (drop + recreate + re-grant, same as migration 0006).

## Customer-facing behavior

**Detail page `/modellen/[id]`** — unchanged for versionless products. With
versions, a picker of selectable cards appears above the color picker:

```
┌─────────────┐  ┌──────────────────┐
│ Enkel       │  │ Dubbel           │
│ €23,00      │  │ ~€46,00~  €40,00 │
└─────────────┘  └──────────────────┘
```

- First card = base price, labeled `base_version_label` (fallback "Standaard").
- A version with `compare_at_price` shows it struck through in gray, real price
  bold beside it.
- Selecting a card updates the "Vaste prijs €…" line; if the version has a
  `photo_path`, the cover image swaps to that photo.
- The Bestellen link carries `&version=<id>` alongside the existing color
  param; the base option adds no param.
- A fetch error for versions degrades to no picker (base price only), same
  philosophy as the color picker.

**Overview `/modellen`** — card shows base price as today plus a small gray
"N uitvoeringen" note when versions exist (N = versions + 1 for the base).

**Order flow** — the request form shows "Product — Versie". On submit the
server ignores any browser-sent price (existing trust rule): it looks the
version up itself, verifies it belongs to the submitted product and the product
is active, then snapshots `version_name` and uses the version's price as
`unit_price`. Unknown/foreign/stale version ids get a Dutch "Kies een versie."
field error. Confirmation email, owner notification, status page, and the admin
request view all show the version name next to the product name.

## Admin

On `/admin/producten/[id]`, below photos, a new **Uitvoeringen** block:

- List of versions: name, price, optional "van"-price, linked photo thumbnail.
- Add/edit form: naam, prijs (Dutch comma), oorspronkelijke prijs (optional),
  photo picker over the product's existing photos (optional), up/down ordering.
- Deleting a version only removes it from the site; orders keep snapshots.
- Next to the existing price field: optional **"Label basisprijs"** input
  (same 40-char cap as version names; empty = "Standaard" fallback).

Validation lives in `lib/products/` as pure unit-tested functions shared by
form and server action (pattern of `lib/products/validation.ts`): name required
(max 40 chars), valid price required, compare-at optional but must exceed the
price, Dutch error messages.

## Error handling

Server-side rejection of everything the UI can't produce but a hand-crafted
POST can: version from another product, unknown version id, version of an
inactive product. Detail-page version fetch errors degrade to no picker.

## Testing

- Vitest unit tests: version validation (incl. compare-at > price), price
  input/format round-trip, order-action version lookup logic.
- Manual end-to-end after build: order a discounted version, verify
  strikethrough rendering, request snapshot, both emails, status page, admin
  view.

## Out of scope

- Per-version photo galleries or descriptions.
- Automatic discount computation or site-wide sales.
- Migrating existing products to versions (base price stays canonical).
