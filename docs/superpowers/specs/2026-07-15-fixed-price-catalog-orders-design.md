# Fixed-price flow for kant-en-klaar (catalog) orders

**Date:** 2026-07-15
**Status:** Approved

## Problem

All three request types (catalog / file / custom) currently share one pipeline:
received → quoted → approved → printing → done. For catalog products the
price is already known, so the quote → akkoord round-trip is pointless
friction: the customer waits for an "offerte" for a product with a listed
price, and the admin has to type in a price that already exists.

## Decisions made

- **Price is fixed and required.** Every *active* product must have a real
  price. The customer pays exactly price × quantity. Products without a
  price cannot be activated/ordered.
- **Catalog pipeline:** received → printing → done (admin can still reject).
  The quoted and approved statuses disappear for catalog orders only.
- **No online payment.** The site shows the fixed total; payment is settled
  offline (bij ophalen, Tikkie, bank transfer). Payment integration is a
  possible later phase.
- **Price snapshot on the order.** New `requests.unit_price` column, copied
  from the product at order time by the server. Later product price changes
  never affect existing orders. The quote fee columns remain exclusively for
  file/custom quotes.

## Design

### 1. Data model (one migration)

- Add `unit_price numeric(10,2)` to `public.requests`. Set only for catalog
  orders; null for file/custom. Total is always `unit_price × quantity`,
  computed where displayed — never stored.
- `products.indicative_price` becomes the real fixed price. UI label changes
  from "vanaf-prijs" to "Prijs". The column is **not** renamed (churn, no
  benefit).
- The `get_request_by_token` RPC (migration 0004) must return `unit_price`
  so the status page can show it.
- Rule "active product ⇒ has price" is enforced in admin product-form
  validation (`lib/products/validation.ts`), not as a DB constraint.
  Existing priceless products get prices set once via the admin.

### 2. Customer request form (`/aanvraag`)

- When type = kant-en-klaar and a product is selected, show the fixed unit
  price and a live total (price × aantal) next to the quantity field, with
  copy: "Vaste prijs — geen offerte nodig. Betaling regelen we bij
  levering/ophalen."
- Product dropdown lists active products only (already the case); all active
  products now have prices.
- On submit the **server action** looks up the product's current price
  itself and writes it to `unit_price`. A price sent from the browser is
  never trusted.

### 3. Customer status page (`/aanvraag/status/[token]`)

- Catalog orders render a shorter pipeline: Ontvangen → Wordt geprint →
  Afgerond (no "Offerte gestuurd" / "Akkoord" chips).
- The "Offerte" box with the AkkoordButton is replaced, for catalog orders,
  by a "Prijs" box: unit price, aantal, total. No approve button.
- File/custom requests keep the existing flow unchanged.
- Legacy edge case: a catalog request created before this change may still
  sit in `quoted` or `approved`. Those statuses don't exist in the short
  pipeline, so such requests fall back to rendering the full five-step
  pipeline (and the old Offerte box, since they have quote fees, not a
  `unit_price`). Only catalog requests **with** a `unit_price` get the new
  rendering — that's the discriminator, not the type alone.

### 4. Admin

- Catalog request detail page: quote form replaced by a read-only
  fixed-price summary (unit price × quantity = total).
- Status dropdown for catalog requests offers only: Ontvangen, Wordt
  geprint, Afgerond, Afgewezen. The DB CHECK constraint keeps all six
  statuses valid, so pre-existing catalog requests in `quoted`/`approved`
  states remain readable; the dropdown simply no longer offers those
  transitions for catalog.

### 5. Emails

- Confirmation email for catalog orders includes unit price, quantity and
  total, so the customer has the price in writing immediately.
- No quote email can ever fire for catalog orders (the status isn't
  offered). "Afgerond" and "Afgewezen" emails unchanged.

### 6. Testing

Extend the existing pure-function test suites:

- `lib/products/validation.test.ts` — active product requires a price.
- `lib/requests/status.test.ts` (new) — status-option filtering per request
  type (new `statusOptionsFor` helper in `lib/requests/status.ts`).
- `lib/email/templates.test.ts` — confirmation template with price block.
- `lib/format.test.ts` — the shared `toAmount` helper used for every
  `numeric` column conversion and total.

The server-side price lookup in `app/aanvraag/actions.ts` is I/O against
Supabase. This codebase tests pure functions only — there is no
request-mocking harness, and adding one for a single lookup is not worth it.
That path is verified manually via the end-to-end smoke test instead.
"Catalog requires a product" is already covered in
`lib/requests/validation.test.ts` and needs no change.

## Out of scope

- Online payment (Mollie/iDEAL)
- Stock or inventory tracking
- Discounts, shipping costs
- Renaming the `indicative_price` column
