# Fixed-Price Catalog Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catalog ("kant-en-klaar") orders get a fixed price at submission and skip the quote → akkoord loop; their pipeline becomes received → printing → done.

**Architecture:** A new `requests.unit_price` column snapshots the product's price at order time (server-side lookup, never trusted from the browser). `unit_price IS NOT NULL` is the discriminator everywhere: status page, admin detail, emails. Legacy catalog requests (null `unit_price`) keep the old quote rendering. Quote fee columns stay exclusively for file/custom requests.

**Tech Stack:** Next.js (App Router, **breaking-changes fork** — see Global Constraints), Supabase (Postgres + RLS + RPC), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-15-fixed-price-catalog-orders-design.md`

## Global Constraints

- **This is NOT the Next.js you know** (AGENTS.md): read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code. Known: `params`/`searchParams` are Promises and must be awaited.
- All customer/admin-facing copy is **Dutch**. English identifiers in code.
- Postgres `numeric(10,2)` arrives in JS as `number | string`. Always convert with `toAmount()` (Task 2) before arithmetic; `formatEuro()` already accepts both.
- Migrations are **run manually by the owner in the Supabase web SQL editor** (same workflow as 0001–0005). The executor writes + commits the file, then STOPS and asks the user to run it before any task that depends on it is verified end-to-end.
- The server never trusts a price from the browser; catalog `unit_price` comes from a server-side product lookup at insert time.
- Tests: Vitest, colocated `*.test.ts` next to the module. Run with `npx vitest run <path>`.
- Commit after every task (small, frequent commits).

---

### Task 1: Migration 0006 — `unit_price` column + RPC returns it

**Files:**
- Create: `supabase/migrations/0006_fixed_price_orders.sql`
- Create: `supabase/migrations/0007_fixed_price_policy.sql`

**Interfaces:**
- Produces: `requests.unit_price numeric(10,2) NULL`; `get_request_by_token` result gains a `unit_price` column. Later tasks read `unit_price` from both.

> **As-built note.** The SQL below is the original draft and is kept for context;
> the migration files are the source of truth. Two changes were made during
> implementation:
> 1. A write guard was added — 0003's `"Anon insert requests"` policy never
>    mentioned `unit_price`, so anon (which is what the server action runs as,
>    via the publishable key) could POST any price it liked and bypass the
>    server-side lookup. `0007` replaces that policy so the database re-derives
>    the price from the product.
> 2. That guard ships as a **separate migration** so the rollout has no outage.
>    See Step 3.

**Note:** `create or replace function` CANNOT change a function's return table — Postgres errors with "cannot change return type of existing function". The function must be dropped and recreated, and grants must be re-issued (they die with the drop).

- [ ] **Step 1: Write the migration**

```sql
-- Fixed-price catalog orders: snapshot the product's price on the request at
-- order time. NULL for file/custom requests and for catalog requests created
-- before this migration (those keep the old quote flow).
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as 0001-0005).

alter table public.requests
  add column unit_price numeric(10,2);

-- Recreate get_request_by_token with unit_price in the result. A function's
-- return table cannot be altered in place: drop + recreate, then re-grant
-- (grants are dropped together with the function).
drop function public.get_request_by_token(uuid);

create function public.get_request_by_token(p_token uuid)
returns table (
  type text,
  status text,
  product_name text,
  quantity integer,
  description text,
  color text,
  material text,
  quote_design_fee numeric(10, 2),
  quote_print_fee numeric(10, 2),
  unit_price numeric(10, 2),
  created_at timestamptz,
  file_names text[]
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.type,
    r.status,
    p.name,
    r.quantity,
    r.description,
    r.color,
    r.material,
    r.quote_design_fee,
    r.quote_print_fee,
    r.unit_price,
    r.created_at,
    coalesce(
      (select array_agg(f.original_name order by f.created_at)
         from public.request_files f
        where f.request_id = r.id),
      '{}'
    )
  from public.requests r
  left join public.products p on p.id = r.product_id
  where r.access_token = p_token;
$$;

revoke execute on function public.get_request_by_token(uuid) from public;
grant execute on function public.get_request_by_token(uuid) to anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0006_fixed_price_orders.sql supabase/migrations/0007_fixed_price_policy.sql
git commit -m "feat: migration for unit_price snapshot on requests"
```

- [ ] **Step 3: Run 0006 whenever you like; 0007 only after the deploy**

The two files are split precisely so there is **no cutover and no outage**. Run
them at different times:

- **`0006` — safe to run now, or any time.** It is a no-op against the
  currently-deployed code: `unit_price` is nullable and today's insert never
  names it, and the RPC's extra result key is read by name (the status page
  casts the row to its own `TokenRequest` type), so existing callers ignore it.
  It must, however, be run **before** the Task 6–10 deploy: Task 6 adds
  `unit_price` to the insert unconditionally, so shipping that against a missing
  column breaks *all three* request types, not just catalog.
- **`0007` — only after the Task 6–10 deploy is live.** It rejects a catalog
  insert that carries no price, which is exactly what the pre-deploy code sends.
  Run it early and every catalog order fails until the deploy lands.

Correct sequence (also in the post-implementation checklist): run 0006 → deploy
Tasks 2–10 → run 0007. Nothing is ever rejected, and the strict invariant still
lands.

Between the deploy and 0007 the price is briefly forgeable — but that is not a
regression: that hole is open in production *today*, and it closes the moment
0007 is pasted. Local dev and production share one Supabase project, so both
files hit production whenever they are run.

Proceed to Task 2 now.

---

### Task 2: `toAmount` in `lib/format.ts` (and deduplicate)

**Files:**
- Modify: `lib/format.ts`
- Modify: `lib/format.test.ts`
- Modify: `lib/email/templates.ts:60-63` (remove local `toAmount`, import instead)
- Modify: `app/aanvraag/status/[token]/page.tsx:60-63` (remove local `toAmount`, import instead)

**Interfaces:**
- Produces: `export function toAmount(value: number | string | null): number` from `@/lib/format`. Null → 0; string → parsed float; number → itself. All later tasks use it for `numeric` arithmetic.

- [ ] **Step 1: Write the failing tests** — append to `lib/format.test.ts`:

```ts
describe("toAmount", () => {
  it("passes numbers through", () => {
    expect(toAmount(12.5)).toBe(12.5);
  });

  it("parses the string form Postgres numeric arrives in", () => {
    expect(toAmount("7.25")).toBe(7.25);
  });

  it("treats null as zero", () => {
    expect(toAmount(null)).toBe(0);
  });
});
```

Add `toAmount` to the existing import from `./format`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/format.test.ts`
Expected: FAIL — `toAmount` is not exported.

- [ ] **Step 3: Implement** — append to `lib/format.ts`:

```ts
// Postgres numeric(10,2) arrives as string or number depending on the
// driver; normalise before any arithmetic. Null (no value) counts as zero.
export function toAmount(value: number | string | null): number {
  if (value === null) return 0;
  return typeof value === "string" ? Number.parseFloat(value) : value;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/format.test.ts`
Expected: PASS

- [ ] **Step 5: Deduplicate the two existing local copies**

In `lib/email/templates.ts`: delete the local `toAmount` function (lines 60–63) and change the import at the top to `import { formatEuro, toAmount } from "@/lib/format";`

In `app/aanvraag/status/[token]/page.tsx`: delete the local `toAmount` function (lines 60–63) and change the import to `import { formatEuro, toAmount } from "@/lib/format";`

- [ ] **Step 6: Verify nothing broke**

Run: `npx vitest run`
Expected: all tests PASS
Run: `npm run lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add lib/format.ts lib/format.test.ts lib/email/templates.ts "app/aanvraag/status/[token]/page.tsx"
git commit -m "feat: shared toAmount helper for numeric columns"
```

---

### Task 3: `statusOptionsFor` in `lib/requests/status.ts`

**Files:**
- Modify: `lib/requests/status.ts`
- Create: `lib/requests/status.test.ts`

**Interfaces:**
- Produces: `export function statusOptionsFor(hasFixedPrice: boolean): readonly RequestStatus[]` — `true` → `["received", "printing", "done", "rejected"]`, `false` → all six. Used by the admin quote form (Task 9) and the update action's server-side guard (Task 9).

- [ ] **Step 1: Write the failing test** — create `lib/requests/status.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { REQUEST_STATUSES, statusOptionsFor } from "./status";

describe("statusOptionsFor", () => {
  it("skips quoted and approved for fixed-price orders", () => {
    expect(statusOptionsFor(true)).toEqual([
      "received",
      "printing",
      "done",
      "rejected",
    ]);
  });

  it("offers every status when there is no fixed price", () => {
    expect(statusOptionsFor(false)).toEqual([...REQUEST_STATUSES]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/requests/status.test.ts`
Expected: FAIL — `statusOptionsFor` is not exported.

- [ ] **Step 3: Implement** — append to `lib/requests/status.ts`:

```ts
// Fixed-price orders (unit_price set) skip the quote loop: no "quoted", no
// "approved". The full list stays valid in the DB CHECK, so legacy catalog
// requests already sitting in those statuses remain readable.
const FIXED_PRICE_STATUSES = [
  "received",
  "printing",
  "done",
  "rejected",
] as const satisfies readonly RequestStatus[];

export function statusOptionsFor(
  hasFixedPrice: boolean
): readonly RequestStatus[] {
  return hasFixedPrice ? FIXED_PRICE_STATUSES : REQUEST_STATUSES;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/requests/status.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/requests/status.ts lib/requests/status.test.ts
git commit -m "feat: status options helper for fixed-price orders"
```

---

### Task 4: Active products require a price

**Files:**
- Modify: `lib/products/validation.ts:30-59` (`validateProduct`)
- Modify: `lib/products/validation.test.ts`
- Modify: `app/admin/(protected)/producten/product-form.tsx:49` (label)
- Modify: `app/admin/(protected)/producten/page.tsx:45` (table header)

**Interfaces:**
- Consumes: existing `validateProduct(input: ProductInput): ProductValidationResult`.
- Produces: same signature; new rule: `active: true` with an empty price is rejected with `errors.indicativePrice = "Een actief product heeft een vaste prijs nodig."`.

- [ ] **Step 1: Write the failing tests** — append to `lib/products/validation.test.ts` (inside or alongside the existing `validateProduct` describe block, matching its style):

```ts
describe("validateProduct — fixed price rule", () => {
  it("rejects an active product without a price", () => {
    const result = validateProduct({
      name: "Vaas",
      description: "",
      indicativePrice: "",
      active: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.indicativePrice).toBe(
        "Een actief product heeft een vaste prijs nodig."
      );
    }
  });

  it("allows an inactive product without a price", () => {
    const result = validateProduct({
      name: "Vaas",
      description: "",
      indicativePrice: "",
      active: false,
    });
    expect(result.ok).toBe(true);
  });

  it("allows an active product with a price", () => {
    const result = validateProduct({
      name: "Vaas",
      description: "",
      indicativePrice: "12,50",
      active: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.indicativePrice).toBe(12.5);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run lib/products/validation.test.ts`
Expected: FAIL — active product without price currently passes.

- [ ] **Step 3: Implement** — in `lib/products/validation.ts`, inside `validateProduct`, after the existing `parseFee` check:

```ts
  const price = parseFee(input.indicativePrice);
  if (!price.ok) {
    errors.indicativePrice =
      "Vul een geldig bedrag in (bijv. 12,50) of laat leeg.";
  } else if (input.active && price.value === null) {
    // Fixed-price ordering: the customer pays this amount, so an active
    // (orderable) product must have one. Inactive drafts may stay empty.
    errors.indicativePrice = "Een actief product heeft een vaste prijs nodig.";
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/products/validation.test.ts`
Expected: PASS

- [ ] **Step 5: Update the admin labels**

In `app/admin/(protected)/producten/product-form.tsx` line 49, change:

```tsx
      <Field label="Prijs (€ — verplicht als het product actief is)" error={errors.indicativePrice}>
```

In `app/admin/(protected)/producten/page.tsx` line 45, change `<th className="px-4 py-2.5">Richtprijs</th>` to:

```tsx
                <th className="px-4 py-2.5">Prijs</th>
```

- [ ] **Step 6: Verify**

Run: `npx vitest run` — all PASS
Run: `npm run lint` — no errors

- [ ] **Step 7: Commit**

```bash
git add lib/products/validation.ts lib/products/validation.test.ts "app/admin/(protected)/producten/product-form.tsx" "app/admin/(protected)/producten/page.tsx"
git commit -m "feat: active products require a fixed price"
```

---

### Task 5: Confirmation email with order price block

**Files:**
- Modify: `lib/email/templates.ts:31-51` (`ConfirmationEmailInput`, `confirmationEmail`)
- Modify: `lib/email/templates.test.ts`
- Modify: `lib/email/notifications.ts:16-26` (`sendConfirmationEmail`)

**Interfaces:**
- Produces:
  - `export type OrderSummary = { unitPrice: number | string; quantity: number };`
  - `ConfirmationEmailInput` gains optional `order?: OrderSummary`.
  - `sendConfirmationEmail` gains optional `order?: OrderSummary`, passed through. Task 6's server action supplies it for catalog orders.
- Consumes: `toAmount`, `formatEuro` from `@/lib/format` (Task 2).

- [ ] **Step 1: Write the failing tests** — append to `lib/email/templates.test.ts`:

```ts
describe("confirmationEmail — fixed-price order", () => {
  const order = { unitPrice: "12.50", quantity: 3 };

  it("shows unit price, quantity and total", () => {
    const email = confirmationEmail({
      customerName: "Jan",
      statusUrl: STATUS_URL,
      order,
    });
    expect(email.subject).toBe("We hebben je bestelling ontvangen");
    expect(email.html).toContain("€ 12,50");
    expect(email.html).toContain("Aantal: 3");
    expect(email.html).toContain("€ 37,50");
    expect(email.html).toContain(STATUS_URL);
  });

  it("does not promise a quote", () => {
    const email = confirmationEmail({
      customerName: "Jan",
      statusUrl: STATUS_URL,
      order,
    });
    expect(email.html).not.toContain("prijsvoorstel");
  });

  it("keeps the quote-flow wording when there is no order", () => {
    const email = confirmationEmail({
      customerName: "Jan",
      statusUrl: STATUS_URL,
    });
    expect(email.subject).toBe("We hebben je aanvraag ontvangen");
    expect(email.html).toContain("prijsvoorstel");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/email/templates.test.ts`
Expected: FAIL — `order` is not an accepted property / subject mismatch.

- [ ] **Step 3: Implement** — in `lib/email/templates.ts`, replace the `ConfirmationEmailInput` type and `confirmationEmail` function with:

```ts
// Fixed-price catalog orders put the price in the confirmation itself: the
// customer never gets a quote email, so this is their written price.
export type OrderSummary = {
  unitPrice: number | string;
  quantity: number;
};

export type ConfirmationEmailInput = {
  customerName: string;
  statusUrl: string;
  order?: OrderSummary;
};

export function confirmationEmail(
  input: ConfirmationEmailInput
): EmailContent {
  if (input.order) {
    const total = toAmount(input.order.unitPrice) * input.order.quantity;
    return {
      subject: "We hebben je bestelling ontvangen",
      html: layout([
        `Beste ${escapeHtml(input.customerName)},`,
        "Bedankt voor je bestelling! We hebben hem in goede orde ontvangen.",
        [
          `Prijs per stuk: ${formatEuro(input.order.unitPrice)}`,
          `Aantal: ${input.order.quantity}`,
          `<strong>Totaal: ${formatEuro(total)}</strong>`,
        ].join("<br>"),
        "Dit is een vaste prijs — je hoeft geen offerte af te wachten. Betalen kan bij het ophalen, per bankoverschrijving of Tikkie.",
        `Via jouw persoonlijke pagina kun je de bestelling volgen: ${statusLink(
          input.statusUrl,
          "volg je bestelling"
        )}.`,
      ]),
    };
  }

  return {
    subject: "We hebben je aanvraag ontvangen",
    html: layout([
      `Beste ${escapeHtml(input.customerName)},`,
      "Bedankt voor je aanvraag! We hebben hem in goede orde ontvangen.",
      `Via jouw persoonlijke pagina kun je de aanvraag volgen: ${statusLink(
        input.statusUrl,
        "volg je aanvraag"
      )}.`,
      "We bekijken je aanvraag en sturen je zo snel mogelijk per e-mail een prijsvoorstel.",
    ]),
  };
}
```

(The `toAmount` import already exists after Task 2.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/email/templates.test.ts`
Expected: PASS

- [ ] **Step 5: Thread `order` through `sendConfirmationEmail`** — in `lib/email/notifications.ts`, replace the function with:

```ts
import type { OrderSummary } from "./templates";

export async function sendConfirmationEmail(input: {
  to: string;
  customerName: string;
  accessToken: string;
  order?: OrderSummary;
}): Promise<void> {
  const { subject, html } = confirmationEmail({
    customerName: input.customerName,
    statusUrl: statusPageUrl(input.accessToken),
    order: input.order,
  });
  await sendEmail({ to: input.to, subject, html });
}
```

(Merge the type import with the existing `import { confirmationEmail, emailForStatusChange } from "./templates";` — one import statement is fine: `import { confirmationEmail, emailForStatusChange, type OrderSummary } from "./templates";`)

- [ ] **Step 6: Verify**

Run: `npx vitest run` — all PASS
Run: `npm run lint` — no errors

- [ ] **Step 7: Commit**

```bash
git add lib/email/templates.ts lib/email/templates.test.ts lib/email/notifications.ts
git commit -m "feat: confirmation email carries fixed order price"
```

---

### Task 6: Server action snapshots the price

**Files:**
- Modify: `app/aanvraag/actions.ts:65-124` (`submitRequest`)
- Modify: `app/aanvraag/page.tsx:27-31` (product query)

**Interfaces:**
- Consumes: `sendConfirmationEmail` with optional `order` (Task 5); `requests.unit_price` column (Task 1).
- Produces: catalog requests are inserted with `unit_price` set from a server-side product lookup; an unpriced/inactive/unknown product returns `errors.productId`.

- [ ] **Step 1: Add the price lookup** — in `app/aanvraag/actions.ts`, after `const supabase = await createClient();` (line 69) and before the `requestId` generation, insert:

```ts
  // Fixed-price orders: the server looks the price up itself — a price sent
  // from the browser is never trusted. Unknown, inactive or unpriced products
  // are rejected; RLS already hides inactive products from anon anyway.
  let unitPrice: number | string | null = null;
  if (result.data.type === "catalog") {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("indicative_price")
      .eq("id", result.data.productId!)
      .eq("active", true)
      .maybeSingle();
    if (productError || !product || product.indicative_price === null) {
      return {
        errors: { productId: "Dit product is momenteel niet te bestellen." },
      };
    }
    unitPrice = product.indicative_price;
  }
```

- [ ] **Step 2: Insert and email the price** — in the same file:

Add `unit_price: unitPrice,` to the `.insert({ ... })` object (after `license_accepted`).

Change the `sendConfirmationEmail` call at the bottom to:

```ts
  await sendConfirmationEmail({
    to: result.data.email,
    customerName: result.data.customerName,
    accessToken,
    order:
      unitPrice !== null
        ? { unitPrice, quantity: result.data.quantity }
        : undefined,
  });
```

- [ ] **Step 3: Hide unpriced legacy products from the form** — in `app/aanvraag/page.tsx`, extend the product query:

```ts
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price")
    .eq("active", true)
    .not("indicative_price", "is", null)
    .order("name");
```

(Active products created before Task 4 may still lack a price; they must not be orderable until the admin sets one.)

- [ ] **Step 4: Verify**

Run: `npx vitest run` — all PASS
Run: `npm run lint` — no errors

The price lookup is I/O against Supabase, and this codebase has no
request-mocking harness (every test is a pure function) — so there is no unit
test for this path by design. It is covered by the end-to-end smoke test in
the post-implementation checklist: needs migration 0006 applied, then submit a
catalog order and confirm the `requests` row has `unit_price` set.

- [ ] **Step 5: Commit**

```bash
git add app/aanvraag/actions.ts app/aanvraag/page.tsx
git commit -m "feat: snapshot product price onto catalog requests"
```

---

### Task 7: Request form shows the fixed price live

**Files:**
- Modify: `app/aanvraag/request-form.tsx`

**Interfaces:**
- Consumes: `toAmount` from `@/lib/format` (Task 2); `ProductOption.indicative_price`.
- Produces: `ProductOption.indicative_price` widens to `number | string | null`. No other new exports.

- [ ] **Step 0: Fix the `ProductOption` type** — `indicative_price` is a Postgres `numeric(10,2)`, which arrives as a string or a number; the current `number | null` is a latent trap (`components/product-card.tsx` already types it honestly). Line 30-34:

```tsx
export type ProductOption = {
  id: string;
  name: string;
  indicative_price: number | string | null;
};
```

- [ ] **Step 1: Make product + quantity controlled** — in `RequestForm`, next to the existing `files`/`photos` state (around line 81), add:

```tsx
  const [productId, setProductId] = useState(preselectedProductId);
  const [quantity, setQuantity] = useState("1");
```

Derive, just above the `return` (after the `errors` line):

```tsx
  // Live fixed-price panel for catalog orders. Quantity mirrors the shared
  // validation's rules (integer >= 1); anything else previews as 1 piece.
  const selectedProduct =
    type === "catalog"
      ? products.find((product) => product.id === productId)
      : undefined;
  const unitPrice =
    selectedProduct && selectedProduct.indicative_price !== null
      ? toAmount(selectedProduct.indicative_price)
      : null;
  const parsedQuantity = Number.parseInt(quantity, 10);
  const previewQuantity =
    Number.isInteger(parsedQuantity) && parsedQuantity >= 1
      ? parsedQuantity
      : 1;
```

Add `toAmount` to the existing `formatEuro, formatFileSize` import from `@/lib/format`.

- [ ] **Step 2: Wire the controls** — in the catalog `Select` (line 256), replace `defaultValue={preselectedProductId}` with:

```tsx
            <Select
              name="productId"
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
            >
```

In the quantity `Input` (line 393), replace `defaultValue={1}` with:

```tsx
              <Input
                type="number"
                name="quantity"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
```

- [ ] **Step 3: Update the option label** — line 261-262, the price suffix loses "richtprijs":

```tsx
                  {product.name}
                  {product.indicative_price !== null &&
                    ` (${formatEuro(product.indicative_price)})`}
```

- [ ] **Step 4: Add the fixed-price panel** — directly after the closing `</Field>` of the product select (inside the `type === "catalog"` block; wrap the existing `<Field>` and this panel in a fragment `<>...</>`):

```tsx
            {unitPrice !== null && (
              <div className="rounded-lg bg-violet-50 px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">
                  Vaste prijs: {formatEuro(unitPrice)} per stuk
                  {previewQuantity > 1 &&
                    ` — totaal ${formatEuro(unitPrice * previewQuantity)}`}
                </p>
                <p className="mt-1 text-slate-600">
                  Geen offerte nodig: na je bestelling gaan we direct voor je
                  aan de slag. Betalen kan bij het ophalen, per
                  bankoverschrijving of Tikkie.
                </p>
              </div>
            )}
```

- [ ] **Step 5: Verify**

Run: `npm run lint` — no errors
Run: `npx vitest run` — all PASS (no behavior change to shared validation)

Manual check (if a dev server is available): `npm run dev`, open `/aanvraag?type=catalog`, pick a priced product, change quantity — the panel updates live.

- [ ] **Step 6: Commit**

```bash
git add app/aanvraag/request-form.tsx
git commit -m "feat: live fixed-price panel on the catalog request form"
```

---

### Task 8: Status page — short pipeline + price box

**Files:**
- Modify: `app/aanvraag/status/[token]/page.tsx`

**Interfaces:**
- Consumes: RPC now returns `unit_price` (Task 1); `toAmount` import (already switched in Task 2).
- Produces: UI only. Discriminator: `(request.unit_price ?? null) !== null` (legacy catalog requests keep the quote rendering).

> **As-built correction — do not revert this to `!== null`.** The original text
> said `request.unit_price !== null`. That is a crash: pre-0006 the RPC omits
> the key entirely, so the value is `undefined`, and `undefined !== null` is
> **true** — every request of every type is misclassified as fixed-price, which
> suppresses `hasQuote` (killing the akkoord button for in-flight quote
> customers) and then throws `TypeError: undefined.toFixed` in `formatEuro`, a
> hard 500 on every customer's status page. Use `?? null`, and keep
> `unit_price?:` typed optional so the guard doesn't read as dead code.
> `??` not `||`: a `unit_price` of `0` is a legitimate free order.

- [ ] **Step 1: Extend the row type** — add to `TokenRequest` (after `quote_print_fee`):

```ts
  unit_price: number | string | null;
```

- [ ] **Step 2: Add the short pipeline** — below the existing `PIPELINE` constant:

```ts
// Fixed-price orders skip the quote loop entirely.
const FIXED_PRICE_PIPELINE = [
  "received",
  "printing",
  "done",
] as const satisfies readonly RequestStatus[];
```

- [ ] **Step 3: Pick pipeline + totals per request** — replace the `hasQuote`/`total` block (lines 90–93) with:

```ts
  // ?? null, never !== null — see the as-built correction above.
  const unitPrice = request.unit_price ?? null;
  const hasFixedPrice = unitPrice !== null;
  const pipeline: readonly RequestStatus[] = hasFixedPrice
    ? FIXED_PRICE_PIPELINE
    : PIPELINE;
  const hasQuote =
    !hasFixedPrice &&
    (request.quote_design_fee !== null || request.quote_print_fee !== null);
  const total = hasFixedPrice
    ? toAmount(request.unit_price) * request.quantity
    : toAmount(request.quote_design_fee) + toAmount(request.quote_print_fee);
```

- [ ] **Step 4: Render the chosen pipeline** — in the `<ol>` (lines 115–131), replace both uses of `PIPELINE` with `pipeline`:

```tsx
          <ol className="flex flex-wrap gap-2">
            {pipeline.map((step, index) => {
              const reached = index <= pipeline.indexOf(status);
```

(Rest of the loop body unchanged. `pipeline.indexOf(status)` is fine now that `pipeline` is typed `readonly RequestStatus[]`; a legacy status not in the short list yields -1, but such requests always take the long pipeline.)

- [ ] **Step 5: Add the price box** — before the existing `{hasQuote && (...)}` section, add:

```tsx
      {hasFixedPrice && (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Prijs</h2>
          <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-slate-600">Per stuk</dt>
            <dd>{formatEuro(toAmount(request.unit_price))}</dd>
            <dt className="text-slate-600">Aantal</dt>
            <dd>{request.quantity}</dd>
            <dt className="font-medium">Totaal</dt>
            <dd className="font-medium">{formatEuro(total)}</dd>
          </dl>
          <p className="mt-4 text-sm text-slate-600">
            Vaste prijs — je hoeft nergens akkoord op te geven. Betalen kan
            bij het ophalen, per bankoverschrijving of Tikkie.
          </p>
        </section>
      )}
```

(The existing quote box stays as-is; `hasQuote` is already false whenever `hasFixedPrice` is true.)

- [ ] **Step 6: Verify**

Run: `npm run lint` — no errors

Manual check (needs migration 0006 applied and a catalog order submitted through the new form): open the status link from the confirmation email — three chips, price box, no akkoord button. Also open a legacy file/custom request's link — unchanged five chips.

- [ ] **Step 7: Commit**

```bash
git add "app/aanvraag/status/[token]/page.tsx"
git commit -m "feat: fixed-price rendering on the customer status page"
```

---

### Task 9: Admin — fixed-price summary, filtered statuses, server guard

**Files:**
- Modify: `app/admin/(protected)/aanvragen/[id]/quote-form.tsx`
- Modify: `app/admin/(protected)/aanvragen/[id]/page.tsx`
- Modify: `app/admin/(protected)/aanvragen/[id]/actions.ts` (`updateRequest`)

**Interfaces:**
- Consumes: `statusOptionsFor` (Task 3), `toAmount`/`formatEuro` (Task 2), `requests.unit_price` (Task 1).
- Produces: `QuoteForm` props gain `unitPrice: number | string | null` and `quantity: number`.

> **`unit_price` MUST stay in both `.select()` lists** (the page query in Step 4
> and the action's read in Step 5). If either ever drops it, the field reads
> `undefined`, and `undefined !== null` is **true** — every request silently
> becomes fixed-price. supabase-js returns loosely-typed rows from a dynamic
> `.select()`, so TypeScript will NOT catch it. Prefer `(x ?? null) !== null`
> over `x !== null` at both derivation sites for the same reason Task 8 does
> (`??` not `||`: a price of `0` is a legitimate free order).

- [ ] **Step 1: Extend `QuoteForm`** — in `quote-form.tsx`:

Change the imports:

```tsx
import {
  STATUS_LABELS,
  statusOptionsFor,
  type RequestStatus,
} from "@/lib/requests/status";
import { formatEuro, toAmount } from "@/lib/format";
```

(`REQUEST_STATUSES` is no longer imported.)

Change the signature:

```tsx
export function QuoteForm({
  requestId,
  designFee,
  printFee,
  status,
  notes,
  unitPrice,
  quantity,
}: {
  requestId: string;
  designFee: number | string | null;
  printFee: number | string | null;
  status: RequestStatus;
  notes: string | null;
  unitPrice: number | string | null;
  quantity: number;
}) {
```

Below the `total` line, add:

```tsx
  const hasFixedPrice = unitPrice !== null;
  const statusOptions = statusOptionsFor(hasFixedPrice);
```

- [ ] **Step 2: Swap fee inputs for a summary in fixed-price mode** — wrap the fee-inputs `<div className="flex flex-col gap-4 sm:flex-row">` **and** the `{hasTotal && (...)}` total line together in `{!hasFixedPrice && (<> ... </>)}`, and directly before that block add:

```tsx
      {hasFixedPrice && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Vaste prijs: {formatEuro(toAmount(unitPrice))} × {quantity} ={" "}
          <span className="font-medium text-slate-900 dark:text-white">
            {formatEuro(toAmount(unitPrice) * quantity)}
          </span>
        </p>
      )}
```

- [ ] **Step 3: Filter the status dropdown** — replace `REQUEST_STATUSES.map` with:

```tsx
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
```

- [ ] **Step 4: Pass the new props from the detail page** — in `page.tsx`:

Add `unit_price` to the select (line 46): `"id, created_at, type, customer_name, email, phone, description, color, material, quantity, status, quote_design_fee, quote_print_fee, unit_price, admin_notes, access_token, products(name)"`

Update the `QuoteForm` usage:

```tsx
        <QuoteForm
          requestId={request.id}
          designFee={request.quote_design_fee}
          printFee={request.quote_print_fee}
          status={request.status as RequestStatus}
          notes={request.admin_notes}
          unitPrice={request.unit_price}
          quantity={request.quantity}
        />
```

Make the card heading fit both modes (line 224):

```tsx
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {request.unit_price !== null ? "Prijs & status" : "Offerte & status"}
        </h2>
```

Neutralise the status-link card copy (lines 215–219):

```tsx
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Op deze pagina ziet de klant de status en de prijs of offerte.
          Handig om zelf te delen (bijv. via WhatsApp) als de e-mail de klant
          niet bereikt.
        </p>
```

- [ ] **Step 5: Server-side status guard** — in `actions.ts` (`updateRequest`):

Add the import: `import { statusOptionsFor } from "@/lib/requests/status";`

Extend the row read (line 42): `.select("status, email, customer_name, access_token, unit_price")`

Between the row read and the `.update(...)` call, add:

```ts
  // The dropdown hides quoted/approved for fixed-price orders, but the form
  // POST is still just data — enforce the same rule here.
  if (
    existing &&
    existing.unit_price !== null &&
    !statusOptionsFor(true).includes(result.data.status)
  ) {
    return {
      errors: { status: "Deze status bestaat niet voor een bestelling met vaste prijs." },
      ok: false,
    };
  }
```

- [ ] **Step 6: Verify**

Run: `npx vitest run` — all PASS
Run: `npm run lint` — no errors

Manual check (needs migration + a fixed-price order): admin detail shows "Prijs & status" with the summary and a 4-option dropdown; a legacy quoted request still shows fee inputs and 6 options.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/(protected)/aanvragen/[id]/quote-form.tsx" "app/admin/(protected)/aanvragen/[id]/page.tsx" "app/admin/(protected)/aanvragen/[id]/actions.ts"
git commit -m "feat: fixed-price mode for the admin request detail"
```

---

### Task 10: Public copy — fixed price everywhere

**Files:**
- Modify: `components/product-card.tsx:37-41`
- Modify: `app/modellen/page.tsx:6-10,27-30`
- Modify: `app/modellen/[id]/page.tsx:98-109`
- Modify: `app/aanvraag/page.tsx:52-55,109-115`
- Modify: `app/aanvraag/verzonden/page.tsx:20-23`

**Interfaces:** copy-only; no new exports.

- [ ] **Step 1: Product card** — drop the "Vanaf" prefix:

```tsx
        {product.indicative_price !== null && (
          <span className="shrink-0 text-sm text-slate-500">
            {formatEuro(product.indicative_price)}
          </span>
        )}
```

- [ ] **Step 2: Catalog page** — metadata description:

```tsx
  description:
    "Kant-en-klare 3D-print modellen met vaste prijzen — bestel direct.",
```

Intro paragraph:

```tsx
        <p className="mt-2 max-w-xl text-slate-600">
          Kant-en-klare ontwerpen, geprint op bestelling, voor een vaste
          prijs. Geen offerte nodig — bestel direct.
        </p>
```

- [ ] **Step 3: Product detail page** — replace the price block (lines 98–109):

```tsx
            {product.indicative_price !== null && (
              <p className="text-lg">
                Vaste prijs{" "}
                <span className="font-semibold">
                  {formatEuro(product.indicative_price)}
                </span>
                <span className="block text-sm text-slate-500">
                  Geen offerte nodig — na je bestelling gaan we direct voor je
                  aan de slag.
                </span>
              </p>
            )}
```

- [ ] **Step 4: Request page** — intro paragraph (lines 52–55):

```tsx
          <p className="mt-2 text-slate-600">
            Vertel ons wat je wilt laten printen. Kant-en-klare producten
            hebben een vaste prijs; voor eigen bestanden en ontwerpen ontvang
            je eerst een prijsvoorstel.
          </p>
```

"Goed om te weten" list (lines 111–115) — replace the first `<li>` and keep the rest:

```tsx
          <li>
            Kant-en-klare producten hebben een vaste prijs — geen offerte
            nodig.
          </li>
          <li>
            Voor eigen bestanden en ontwerpen betaal je pas nadat je akkoord
            bent gegaan met de offerte.
          </li>
          <li>Je krijgt meestal binnen 1–2 dagen antwoord.</li>
          <li>Betalen kan per bankoverschrijving of Tikkie.</li>
```

- [ ] **Step 5: Verzonden page** — the copy must fit both flows (lines 20–23):

```tsx
          <p className="text-slate-600">
            We hebben je aanvraag in goede orde ontvangen. Je vindt de details
            en de status via de link in je bevestigingsmail.
          </p>
```

- [ ] **Step 6: Verify the whole feature**

Run: `npx vitest run` — all PASS
Run: `npm run lint` — no errors
Run: `npm run build` — build succeeds

- [ ] **Step 7: Commit**

```bash
git add components/product-card.tsx app/modellen/page.tsx "app/modellen/[id]/page.tsx" app/aanvraag/page.tsx app/aanvraag/verzonden/page.tsx
git commit -m "feat: fixed-price copy on catalog and request pages"
```

---

## Post-implementation checklist (user actions)

**Order matters, but there is no outage.** The migrations are split so each one
is safe at its own moment: `0006` is a no-op against the old code, `0007` is the
tightening that only the new code can satisfy. Do these in sequence:

1. **Set a price on every active product** in the admin. Pure data entry, safe
   to do now — Task 4's validation isn't live yet, and the only visible effect
   is a price appearing on products that lacked one. Do it first so the
   unbounded manual part never blocks a later step. Active products without a
   price will be unsaveable and hidden from the order form once the code ships.
   (Existing `Testproduct` needs a price or deactivation.)
2. **Run migration `0006_fixed_price_orders.sql`** in the Supabase web SQL
   editor. Paste the whole file and run it once — a partial run between the
   `drop` and the `grant` would briefly leave `get_request_by_token` executable
   by everyone. This changes nothing for the live site; it just puts the column
   and the RPC field in place.
3. Finish Tasks 2–10; confirm `npx vitest run`, `npm run lint` and
   `npm run build` are all green.
4. Push to `main` and let Vercel deploy. Catalog orders now record a real
   `unit_price`.
5. **Run migration `0007_fixed_price_policy.sql`.** This closes the forgery
   hole (until now, anon could POST its own price). Do it promptly after the
   deploy, but nothing is broken in between — that hole is open in production
   today regardless.
6. Verify live: place a catalog order → confirmation email shows the total →
   status page shows three chips + a price box and no akkoord button → admin
   shows "Prijs & status" → move to "Wordt geprint" → "Afgerond" email arrives.
7. Verify a file/custom request still gets the full five-step quote flow
   unchanged.

**If the first order after the deploy fails with `PGRST204 column
"unit_price" ... does not exist`,** that is PostgREST's schema cache being
stale, not a broken migration. Supabase's DDL event triggers normally refresh
it within seconds — wait and retry, or run `notify pgrst, 'reload schema';`.
Do not revert a migration that worked.

**Rollback.** The `unit_price` column is additive and harmless to leave in
place; only 0007 changes existing behavior. To restore the old insert rule,
`git revert` the code and run these two statements together (0003 cannot be
re-run as a whole — it would re-insert its storage bucket and re-create four
other policies, all of which error as duplicates):

```sql
drop policy "Anon insert requests" on public.requests;

create policy "Anon insert requests" on public.requests
  for insert to anon, authenticated
  with check (
    status = 'received'
    and quote_design_fee is null
    and quote_print_fee is null
    and admin_notes is null
    and (type <> 'file' or license_accepted)
  );
```
