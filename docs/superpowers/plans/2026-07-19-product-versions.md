# Product Versions with Discount Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional per-product versions ("uitvoeringen", e.g. Enkel/Dubbel) with their own manual price and an optional struck-through compare-at price, selectable on the product page and carried through the whole order pipeline as a snapshot.

**Architecture:** A new `product_versions` table (RLS mirroring `products`), one nullable `base_version_label` column on `products`, and one nullable `version_name` snapshot column on `requests`. Pure helpers in `lib/products/versions.ts` are shared by the admin form, the customer picker and the server action. The detail page gains a client-side version picker that swaps price/cover and rides `&version=<id>` on the Bestellen link; the server action resolves the id itself (trust rule: browser never names a price) and snapshots `version_name` + the version's price into `unit_price`. The anon insert policy from migration 0007 is extended so a version order's `unit_price` must equal a real version's price.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RLS), Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-19-product-versions-design.md`

## Global Constraints

- All customer/admin copy is Dutch; code, comments and identifiers are English.
- Migrations are NOT run by the implementer. The owner runs them manually in the Supabase web SQL editor. Never attempt to run SQL against the database.
- **Rollout is MIGRATION-FIRST (hard requirement):** the new code inserts a `version_name` column and needs the extended insert policy; deploying before 0009 runs breaks ALL catalog orders. 0009 is safe to run before deploy (current code never names the new columns, and the recreated policy accepts today's version-less inserts).
- Version names and the base-price label share one cap: **40 characters** (`MAX_VERSION_NAME_LENGTH`).
- `price` is `numeric(10,2)`, required, `> 0`. `compare_at_price` is `numeric(10,2)`, nullable, and when set must be `> price` — enforced in the DB check AND in `validateVersion`.
- Price input uses the Dutch comma (`parseFee` from `lib/requests/admin-validation.ts`), display uses `formatEuro`.
- Trust rule: the browser only ever sends a version **id**; the server resolves name and price itself. Unknown, foreign (other product's), stale or malformed version ids get the field error (exact copy): `Kies een versie.`
- The base-price option adds **no** `&version=` param to the Bestellen link and stores `version_name = NULL`.
- Base label fallback (exact copy): `Standaard`. Catalog card hint (exact copy): `{n} uitvoeringen` with n = versions + 1 for the base. Admin heading: `Uitvoeringen`; picker label: `Uitvoering`; admin form label: `Label basisprijs`.
- Product name and version name are joined with an em-dash separator (exact): `Naam — Versie`.
- A versions fetch error on public pages degrades silently: no picker on the detail page, no hint on the card — never a broken page.
- Tests are pure functions only (Vitest, `npm test`). No I/O mocking harness exists — do not add one.
- No new npm dependencies.
- Public pages are light-mode only; admin pages must include `dark:` classes.
- Next 16: `params`/`searchParams` are Promises and must be awaited. Read `node_modules/next/dist/docs/` if unsure about an API.
- Commit messages: repo style is `feat:`/`fix:`/`docs:` prefixes, with the Claude trailer lines used in recent commits.

---

### Task 1: Migration 0009 — `product_versions` + snapshot columns + policy update

**Files:**
- Create: `supabase/migrations/0009_product_versions.sql`

**Interfaces:**
- Consumes: `public.is_admin()` (migration 0002), `public.products`, `public.requests`, `public.get_request_by_token(uuid)` (last recreated in 0006).
- Produces: table `public.product_versions(id uuid pk, product_id uuid fk, name text, price numeric(10,2), compare_at_price numeric(10,2), photo_path text, sort_order integer)`; `products.base_version_label text`; `requests.version_name text`; RPC result gains `version_name`; anon insert policy accepts version orders. Later tasks select columns `id, product_id, name, price, compare_at_price, photo_path, sort_order`.

- [ ] **Step 1: Write the migration**

```sql
-- Product versions ("uitvoeringen"): optional per-product configurations with
-- their own manual price and an optional struck-through compare-at price.
-- Products without versions behave exactly as before.
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as
-- 0001-0008), BEFORE deploying the code that uses it. Safe to run early: the
-- current app never names these columns, and the recreated insert policy
-- still accepts today's version-less catalog inserts.

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price > 0),
  compare_at_price numeric(10,2) check (compare_at_price is null or compare_at_price > price),
  photo_path text,
  sort_order integer not null default 0
);

-- Every read is "versions of product X"; the FK alone creates no index.
create index product_versions_product_id_idx
  on public.product_versions (product_id);

alter table public.product_versions enable row level security;

create policy "Admin full access" on public.product_versions
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Mirrors "Anon read active products" (0003): visitors only see versions of
-- active products. The subquery runs under the caller's own products RLS,
-- which already limits anon to active rows.
create policy "Anon read versions of active products" on public.product_versions
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
       where p.id = product_id
         and p.active
    )
  );

-- Customer-facing label of the base-price option (e.g. 'Enkel'), shown only
-- when the product has versions; the UI falls back to 'Standaard' when empty.
alter table public.products
  add column base_version_label text;

-- Point-in-time snapshot of the chosen version's name. NULL = base-price
-- order (or any pre-versions request). Price is already snapshotted in
-- unit_price, so editing or deleting a version never rewrites past orders.
alter table public.requests
  add column version_name text;

-- Recreate get_request_by_token with version_name in the result. A function's
-- return table cannot be altered in place: drop + recreate, then re-grant
-- (grants are dropped together with the function). Same procedure as 0006.
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
  version_name text,
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
    r.version_name,
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

-- Extend 0007's forgeability rule to versions. A catalog insert must carry
-- either (no version_name + the product's own indicative_price) or a
-- (version_name, unit_price) pair that exists on that product. The exists()
-- check tolerates duplicate version names; forging still requires naming a
-- real version's name AND price on an active product. Non-catalog requests
-- carry neither a price nor a version name.
drop policy "Anon insert requests" on public.requests;

create policy "Anon insert requests" on public.requests
  for insert to anon, authenticated
  with check (
    status = 'received'
    and quote_design_fee is null
    and quote_print_fee is null
    and admin_notes is null
    and (type <> 'file' or license_accepted)
    and (
      case
        when type <> 'catalog' then unit_price is null and version_name is null
        when version_name is null then unit_price = (
          select p.indicative_price
            from public.products p
           where p.id = requests.product_id
             and p.active
        )
        else exists (
          select 1
            from public.product_versions v
            join public.products p on p.id = v.product_id
           where v.product_id = requests.product_id
             and v.name = requests.version_name
             and v.price = requests.unit_price
             and p.active
        )
      end
    )
  );
```

- [ ] **Step 2: Sanity-check against the live schema assumptions**

Do NOT run the SQL. Verify by reading: 0007 is the latest definition of the "Anon insert requests" policy (nothing after it redefines it); 0006 is the latest `get_request_by_token` (nothing after it redefines it); `products` has columns `id`, `active`, `indicative_price` (0001); `pgcrypto`/`gen_random_uuid()` is used by earlier migrations (0001 uses uuid defaults — confirm the default-generation function used there and match it).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0009_product_versions.sql
git commit -m "feat: product_versions schema, snapshot columns, version-aware insert policy"
```

---

### Task 2: Pure helpers — `lib/products/versions.ts`

**Files:**
- Create: `lib/products/versions.ts`
- Test: `lib/products/versions.test.ts`

**Interfaces:**
- Consumes: `parseFee` (`@/lib/requests/admin-validation`), `toAmount` (`@/lib/format`).
- Produces (used by Tasks 3-7):
  - `MAX_VERSION_NAME_LENGTH = 40`, `DEFAULT_BASE_VERSION_LABEL = "Standaard"`
  - `type ProductVersion = { id: string; product_id: string; name: string; price: number | string; compare_at_price: number | string | null; photo_path: string | null; sort_order: number }`
  - `validateVersion(input: VersionInput): VersionValidationResult` with `VersionInput = { name: string; price: string; compareAtPrice: string }` and `ValidVersion = { name: string; price: number; compareAtPrice: number | null }`
  - `baseVersionLabel(label: string | null): string`
  - `type VersionOption = { id: string; label: string; price: number; compareAtPrice: number | null; photoPath: string | null }` (id `""` = base option)
  - `buildVersionOptions(product, versions): VersionOption[]`
  - `checkVersionRow(row, productId): VersionLookup` (pure half of the server action's version lookup)

- [ ] **Step 1: Write the failing tests**

Create `lib/products/versions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  baseVersionLabel,
  buildVersionOptions,
  checkVersionRow,
  validateVersion,
  type ProductVersion,
} from "./versions";

function version(overrides: Partial<ProductVersion> = {}): ProductVersion {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    product_id: "22222222-2222-2222-2222-222222222222",
    name: "Dubbel",
    price: "40.00",
    compare_at_price: null,
    photo_path: null,
    sort_order: 10,
    ...overrides,
  };
}

describe("validateVersion", () => {
  const valid = { name: "Dubbel", price: "40,00", compareAtPrice: "46,00" };

  it("accepts a valid version and parses Dutch commas", () => {
    const result = validateVersion(valid);
    expect(result).toEqual({
      ok: true,
      data: { name: "Dubbel", price: 40, compareAtPrice: 46 },
    });
  });

  it("accepts an empty compare-at price as null", () => {
    const result = validateVersion({ ...valid, compareAtPrice: "" });
    expect(result).toEqual({
      ok: true,
      data: { name: "Dubbel", price: 40, compareAtPrice: null },
    });
  });

  it("trims the name", () => {
    const result = validateVersion({ ...valid, name: "  Dubbel  " });
    expect(result.ok && result.data.name).toBe("Dubbel");
  });

  it("rejects an empty name", () => {
    const result = validateVersion({ ...valid, name: "   " });
    expect(!result.ok && result.errors.name).toBe("Vul een naam in.");
  });

  it("rejects a name over 40 characters but accepts exactly 40", () => {
    const long = validateVersion({ ...valid, name: "x".repeat(41) });
    expect(!long.ok && long.errors.name).toBe("Gebruik maximaal 40 tekens.");
    expect(validateVersion({ ...valid, name: "x".repeat(40) }).ok).toBe(true);
  });

  it.each(["", "abc", "12,345", "-5"])(
    "rejects invalid price %j",
    (price) => {
      const result = validateVersion({ ...valid, price });
      expect(!result.ok && result.errors.price).toBe(
        "Vul een geldig bedrag in (bijv. 12,50)."
      );
    }
  );

  it("rejects a zero price (DB requires > 0)", () => {
    const result = validateVersion({ ...valid, price: "0" });
    expect(!result.ok && result.errors.price).toBe(
      "Vul een geldig bedrag in (bijv. 12,50)."
    );
  });

  it("rejects a malformed compare-at price", () => {
    const result = validateVersion({ ...valid, compareAtPrice: "abc" });
    expect(!result.ok && result.errors.compareAtPrice).toBe(
      "Vul een geldig bedrag in (bijv. 12,50) of laat leeg."
    );
  });

  it.each(["40,00", "39,99"])(
    "rejects compare-at price %j that does not exceed the price",
    (compareAtPrice) => {
      const result = validateVersion({ ...valid, compareAtPrice });
      expect(!result.ok && result.errors.compareAtPrice).toBe(
        "De oorspronkelijke prijs moet hoger zijn dan de prijs."
      );
    }
  );

  it("collects errors for multiple fields at once", () => {
    const result = validateVersion({ name: "", price: "", compareAtPrice: "x" });
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "compareAtPrice",
      "name",
      "price",
    ]);
  });
});

describe("baseVersionLabel", () => {
  it("falls back to Standaard for null, empty and whitespace", () => {
    expect(baseVersionLabel(null)).toBe("Standaard");
    expect(baseVersionLabel("")).toBe("Standaard");
    expect(baseVersionLabel("   ")).toBe("Standaard");
  });

  it("returns the trimmed label when set", () => {
    expect(baseVersionLabel(" Enkel ")).toBe("Enkel");
  });
});

describe("buildVersionOptions", () => {
  const product = { indicative_price: "23.00", base_version_label: "Enkel" };

  it("returns no options for a versionless product", () => {
    expect(buildVersionOptions(product, [])).toEqual([]);
  });

  it("returns no options when the product has no price", () => {
    expect(
      buildVersionOptions(
        { indicative_price: null, base_version_label: null },
        [version()]
      )
    ).toEqual([]);
  });

  it("puts the base option first with the label and product price", () => {
    const options = buildVersionOptions(product, [version()]);
    expect(options[0]).toEqual({
      id: "",
      label: "Enkel",
      price: 23,
      compareAtPrice: null,
      photoPath: null,
    });
  });

  it("falls back to Standaard when the label is empty", () => {
    const options = buildVersionOptions(
      { indicative_price: 23, base_version_label: null },
      [version()]
    );
    expect(options[0].label).toBe("Standaard");
  });

  it("maps versions with numeric conversion and photo path", () => {
    const options = buildVersionOptions(product, [
      version({ compare_at_price: "46.00", photo_path: "p/1.jpg" }),
    ]);
    expect(options[1]).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      label: "Dubbel",
      price: 40,
      compareAtPrice: 46,
      photoPath: "p/1.jpg",
    });
  });

  it("orders versions by sort_order", () => {
    const options = buildVersionOptions(product, [
      version({ id: "b", name: "B", sort_order: 20 }),
      version({ id: "a", name: "A", sort_order: 10 }),
    ]);
    expect(options.map((o) => o.label)).toEqual(["Enkel", "A", "B"]);
  });
});

describe("checkVersionRow", () => {
  const productId = "22222222-2222-2222-2222-222222222222";

  it("rejects a missing row (unknown or RLS-hidden version)", () => {
    expect(checkVersionRow(null, productId)).toEqual({ ok: false });
  });

  it("rejects a version of another product", () => {
    expect(
      checkVersionRow(
        { product_id: "33333333-3333-3333-3333-333333333333", name: "Dubbel", price: "40.00" },
        productId
      )
    ).toEqual({ ok: false });
  });

  it("returns name and price for a matching version", () => {
    expect(
      checkVersionRow(
        { product_id: productId, name: "Dubbel", price: "40.00" },
        productId
      )
    ).toEqual({ ok: true, name: "Dubbel", price: "40.00" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/products/versions.test.ts`
Expected: FAIL — cannot resolve `./versions`.

- [ ] **Step 3: Implement `lib/products/versions.ts`**

```ts
// Pure helpers for product versions ("uitvoeringen"): admin-form validation,
// picker option building, and the decision half of the server action's
// version lookup. No I/O — shared by client, server actions and tests.
// Mirrors lib/products/validation.ts.

import { parseFee } from "@/lib/requests/admin-validation";
import { toAmount } from "@/lib/format";

// Shared cap for version names and the product's base-price label.
export const MAX_VERSION_NAME_LENGTH = 40;

// Customer-facing label of the base-price option when the label is empty.
export const DEFAULT_BASE_VERSION_LABEL = "Standaard";

// Row shape from product_versions; numeric columns may arrive as strings.
export type ProductVersion = {
  id: string;
  product_id: string;
  name: string;
  price: number | string;
  compare_at_price: number | string | null;
  photo_path: string | null;
  sort_order: number;
};

export type VersionInput = {
  name: string;
  price: string;
  compareAtPrice: string;
};

export type ValidVersion = {
  name: string;
  price: number;
  compareAtPrice: number | null;
};

export type VersionValidationResult =
  | { ok: true; data: ValidVersion }
  | { ok: false; errors: Record<string, string> };

export function validateVersion(input: VersionInput): VersionValidationResult {
  const errors: Record<string, string> = {};

  const name = input.name.trim();
  if (name === "") {
    errors.name = "Vul een naam in.";
  } else if (name.length > MAX_VERSION_NAME_LENGTH) {
    errors.name = `Gebruik maximaal ${MAX_VERSION_NAME_LENGTH} tekens.`;
  }

  // Unlike product prices (nullable for inactive drafts), a version IS its
  // price: empty and zero are both invalid, matching the DB's price > 0.
  const price = parseFee(input.price);
  const priceValid = price.ok && price.value !== null && price.value > 0;
  if (!priceValid) {
    errors.price = "Vul een geldig bedrag in (bijv. 12,50).";
  }

  const compareAt = parseFee(input.compareAtPrice);
  if (!compareAt.ok) {
    errors.compareAtPrice = "Vul een geldig bedrag in (bijv. 12,50) of laat leeg.";
  } else if (compareAt.value !== null && priceValid && compareAt.value <= price.value!) {
    // Mirrors the DB check compare_at_price > price: equal is not a discount.
    errors.compareAtPrice = "De oorspronkelijke prijs moet hoger zijn dan de prijs.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name,
      price: price.ok ? price.value! : 0,
      compareAtPrice: compareAt.ok ? compareAt.value : null,
    },
  };
}

// Empty or whitespace label falls back to the default.
export function baseVersionLabel(label: string | null): string {
  const trimmed = label?.trim() ?? "";
  return trimmed === "" ? DEFAULT_BASE_VERSION_LABEL : trimmed;
}

// One selectable card in the customer-facing picker. id "" is the base-price
// option: it maps to no product_versions row and adds no &version= param.
export type VersionOption = {
  id: string;
  label: string;
  price: number;
  compareAtPrice: number | null;
  photoPath: string | null;
};

// Empty array = render no picker (versionless product, missing price, or a
// degraded versions fetch — the caller passes [] on error).
export function buildVersionOptions(
  product: {
    indicative_price: number | string | null;
    base_version_label: string | null;
  },
  versions: ProductVersion[]
): VersionOption[] {
  if (versions.length === 0 || product.indicative_price === null) {
    return [];
  }
  const sorted = [...versions].sort((a, b) => a.sort_order - b.sort_order);
  return [
    {
      id: "",
      label: baseVersionLabel(product.base_version_label),
      price: toAmount(product.indicative_price),
      compareAtPrice: null,
      photoPath: null,
    },
    ...sorted.map((version) => ({
      id: version.id,
      label: version.name,
      price: toAmount(version.price),
      compareAtPrice:
        version.compare_at_price === null
          ? null
          : toAmount(version.compare_at_price),
      photoPath: version.photo_path,
    })),
  ];
}

export type VersionLookup =
  | { ok: true; name: string; price: number | string }
  | { ok: false };

// Decision half of the server action's version lookup: the action fetches the
// row by id, this decides what it means for the submitted product. A missing
// row covers unknown ids AND versions of inactive products (RLS hides those).
export function checkVersionRow(
  row: { product_id: string; name: string; price: number | string } | null,
  productId: string
): VersionLookup {
  if (!row || row.product_id !== productId) {
    return { ok: false };
  }
  return { ok: true, name: row.name, price: row.price };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/products/versions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Full suite + lint, then commit**

Run: `npm test` and `npm run lint` — both green.

```bash
git add lib/products/versions.ts lib/products/versions.test.ts
git commit -m "feat: pure version validation and picker-option helpers"
```

---

### Task 3: Base-price label through the admin product form

**Files:**
- Modify: `lib/products/validation.ts` (ProductInput/ValidProduct + label rule)
- Modify: `lib/products/validation.test.ts` (new field in fixtures + new cases)
- Modify: `app/admin/(protected)/producten/product-form.tsx` (new field)
- Modify: `app/admin/(protected)/producten/actions.ts` (read + persist)
- Modify: `app/admin/(protected)/producten/[id]/page.tsx` (select + initial)
- Modify: `app/admin/(protected)/producten/nieuw/page.tsx` (initial)

**Interfaces:**
- Consumes: `MAX_VERSION_NAME_LENGTH` from `@/lib/products/versions` (Task 2).
- Produces: `ProductInput` gains `baseVersionLabel: string`; `ValidProduct` gains `baseVersionLabel: string | null`; DB writes include `base_version_label`. Task 5 reads `products.base_version_label`.

- [ ] **Step 1: Write the failing tests**

In `lib/products/validation.test.ts`, add `baseVersionLabel: ""` to every existing `ProductInput` object literal (the compiler will point at each one), then add:

```ts
describe("validateProduct base version label", () => {
  const base = {
    name: "Theedispenser",
    description: "",
    indicativePrice: "23,00",
    baseVersionLabel: "",
    active: true,
  };

  it("passes an empty label through as null", () => {
    const result = validateProduct(base);
    expect(result.ok && result.data.baseVersionLabel).toBeNull();
  });

  it("trims the label and treats whitespace-only as null", () => {
    const trimmed = validateProduct({ ...base, baseVersionLabel: " Enkel " });
    expect(trimmed.ok && trimmed.data.baseVersionLabel).toBe("Enkel");
    const blank = validateProduct({ ...base, baseVersionLabel: "   " });
    expect(blank.ok && blank.data.baseVersionLabel).toBeNull();
  });

  it("rejects a label over 40 characters but accepts exactly 40", () => {
    const long = validateProduct({
      ...base,
      baseVersionLabel: "x".repeat(41),
    });
    expect(!long.ok && long.errors.baseVersionLabel).toBe(
      "Gebruik maximaal 40 tekens."
    );
    expect(
      validateProduct({ ...base, baseVersionLabel: "x".repeat(40) }).ok
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/products/validation.test.ts`
Expected: FAIL — type errors on the fixture edits resolve once the input type gains the field; the new assertions fail until validation handles it.

- [ ] **Step 3: Extend `lib/products/validation.ts`**

Add the import at the top:

```ts
import { MAX_VERSION_NAME_LENGTH } from "@/lib/products/versions";
```

Extend the types:

```ts
export type ProductInput = {
  name: string;
  description: string;
  indicativePrice: string;
  baseVersionLabel: string;
  active: boolean;
};

export type ValidProduct = {
  name: string;
  description: string | null;
  indicativePrice: number | null;
  baseVersionLabel: string | null;
  active: boolean;
};
```

In `validateProduct`, after the price checks, add:

```ts
  // Same cap as version names: the label renders as the first picker card.
  const baseVersionLabel = input.baseVersionLabel.trim();
  if (baseVersionLabel.length > MAX_VERSION_NAME_LENGTH) {
    errors.baseVersionLabel = `Gebruik maximaal ${MAX_VERSION_NAME_LENGTH} tekens.`;
  }
```

And in the returned data object add:

```ts
      baseVersionLabel: baseVersionLabel || null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/products/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the field through form, actions and pages**

`app/admin/(protected)/producten/product-form.tsx` — extend the values type and add the field between the price field and the active checkbox:

```ts
export type ProductFormValues = {
  name: string;
  description: string;
  indicativePrice: string;
  baseVersionLabel: string;
  active: boolean;
};
```

```tsx
      <Field
        label='Label basisprijs (optioneel — getoond als eerste keuze bij uitvoeringen, leeg = "Standaard")'
        error={errors.baseVersionLabel}
      >
        <Input
          type="text"
          name="baseVersionLabel"
          defaultValue={initial.baseVersionLabel}
          placeholder="bijv. Enkel"
        />
      </Field>
```

`app/admin/(protected)/producten/actions.ts` — in `readProductInput` add:

```ts
    baseVersionLabel: String(formData.get("baseVersionLabel") ?? ""),
```

In BOTH the `createProduct` insert object and the `updateProduct` update object add:

```ts
      base_version_label: result.data.baseVersionLabel,
```

`app/admin/(protected)/producten/[id]/page.tsx` — add `base_version_label` to the `.select(...)` string and to the form's `initial`:

```ts
    .select("id, name, description, indicative_price, base_version_label, active, photos")
```

```ts
            baseVersionLabel: product.base_version_label ?? "",
```

`app/admin/(protected)/producten/nieuw/page.tsx` — extend the initial object:

```tsx
          initial={{ name: "", description: "", indicativePrice: "", baseVersionLabel: "", active: true }}
```

- [ ] **Step 6: Verify and commit**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit` — all green.

```bash
git add lib/products/validation.ts lib/products/validation.test.ts "app/admin/(protected)/producten/product-form.tsx" "app/admin/(protected)/producten/actions.ts" "app/admin/(protected)/producten/[id]/page.tsx" "app/admin/(protected)/producten/nieuw/page.tsx"
git commit -m "feat: base-price label field on the admin product form"
```

---

### Task 4: Admin "Uitvoeringen" manager

**Files:**
- Create: `app/admin/(protected)/producten/[id]/version-actions.ts`
- Create: `app/admin/(protected)/producten/[id]/versions-manager.tsx`
- Modify: `app/admin/(protected)/producten/[id]/page.tsx` (fetch versions + render block)

**Interfaces:**
- Consumes: `validateVersion`, `MAX_VERSION_NAME_LENGTH`, `ProductVersion` (Task 2); `priceToInput` (`@/lib/products/validation`); `formatEuro` (`@/lib/format`); `productPhotoUrl` (`@/lib/products/photos`); UI components `Button`, `Field`, `Input`, `Card`.
- Produces: server actions `saveVersion(state, formData)` (create when no `versionId` field, update otherwise), `deleteVersion(productId, versionId)`, `moveVersion(productId, versionId, direction)`; client component `VersionsManager`.

- [ ] **Step 1: Write `version-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateVersion } from "@/lib/products/versions";

export type VersionFormState = {
  errors: Record<string, string> | null;
  ok: boolean;
};

export type VersionActionResult = { ok: boolean; message?: string };

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

// Version changes affect the product detail page (picker), the catalog and
// homepage (uitvoeringen hint) and this admin page. Mirrors
// revalidateProductPaths in ../actions.ts, which "use server" cannot export.
function revalidateVersionPaths(productId: string) {
  revalidatePath("/");
  revalidatePath("/modellen");
  revalidatePath(`/modellen/${productId}`);
  revalidatePath(`/admin/producten/${productId}`);
}

// One action for create and update: the form posts a versionId only when
// editing, so the client needs no action-swapping.
export async function saveVersion(
  _prevState: VersionFormState,
  formData: FormData
): Promise<VersionFormState> {
  const productId = String(formData.get("productId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!productId) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  const result = validateVersion({
    name: String(formData.get("name") ?? ""),
    price: String(formData.get("price") ?? ""),
    compareAtPrice: String(formData.get("compareAtPrice") ?? ""),
  });
  if (!result.ok) {
    return { errors: result.errors, ok: false };
  }

  const photoPath = String(formData.get("photoPath") ?? "");
  const supabase = await createClient();

  // The picker offers only the product's own photos; re-check server-side so
  // a hand-crafted submit cannot point a version at a foreign or stale path.
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("photos")
    .eq("id", productId)
    .maybeSingle();
  if (productError || !product) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }
  if (photoPath !== "" && !product.photos.includes(photoPath)) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  const values = {
    name: result.data.name,
    price: result.data.price,
    compare_at_price: result.data.compareAtPrice,
    photo_path: photoPath || null,
  };

  if (versionId === "") {
    // Append at the end; steps of 10 leave room, like the color seed.
    const { data: last, error: lastError } = await supabase
      .from("product_versions")
      .select("sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) {
      return { errors: { form: GENERIC_ERROR }, ok: false };
    }
    const { error } = await supabase.from("product_versions").insert({
      product_id: productId,
      ...values,
      sort_order: (last?.sort_order ?? 0) + 10,
    });
    if (error) {
      return { errors: { form: GENERIC_ERROR }, ok: false };
    }
  } else {
    // The product_id filter stops a forged (productId, versionId) pair from
    // editing another product's version; RLS alone would allow the admin to.
    const { data, error } = await supabase
      .from("product_versions")
      .update(values)
      .eq("id", versionId)
      .eq("product_id", productId)
      .select("id");
    if (error || !data || data.length === 0) {
      return { errors: { form: GENERIC_ERROR }, ok: false };
    }
  }

  revalidateVersionPaths(productId);
  return { errors: null, ok: true };
}

// Orders keep their snapshots (version_name + unit_price on the request);
// deleting a version only removes it from the site.
export async function deleteVersion(
  productId: string,
  versionId: string
): Promise<VersionActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_versions")
    .delete()
    .eq("id", versionId)
    .eq("product_id", productId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, message: GENERIC_ERROR };
  }
  revalidateVersionPaths(productId);
  return { ok: true };
}

export async function moveVersion(
  productId: string,
  versionId: string,
  direction: "up" | "down"
): Promise<VersionActionResult> {
  const supabase = await createClient();
  const { data: versions, error } = await supabase
    .from("product_versions")
    .select("id, sort_order")
    .eq("product_id", productId)
    .order("sort_order");
  if (error || !versions) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const index = versions.findIndex((version) => version.id === versionId);
  if (index === -1) {
    return { ok: false, message: GENERIC_ERROR };
  }
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= versions.length) {
    return { ok: true }; // already at the edge — nothing to do
  }

  const current = versions[index];
  const neighbor = versions[neighborIndex];
  // Two updates swap the sort keys. Not atomic, but single-admin: a failed
  // second update at worst leaves two rows sharing an order value, which
  // only affects display order and is fixed by the next successful move.
  const first = await supabase
    .from("product_versions")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id)
    .select("id");
  if (first.error || !first.data || first.data.length === 0) {
    return { ok: false, message: GENERIC_ERROR };
  }
  const second = await supabase
    .from("product_versions")
    .update({ sort_order: current.sort_order })
    .eq("id", neighbor.id)
    .select("id");
  if (second.error || !second.data || second.data.length === 0) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidateVersionPaths(productId);
  return { ok: true };
}
```

- [ ] **Step 2: Write `versions-manager.tsx`**

```tsx
"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { formatEuro } from "@/lib/format";
import { priceToInput } from "@/lib/products/validation";
import { productPhotoUrl } from "@/lib/products/photos";
import {
  MAX_VERSION_NAME_LENGTH,
  type ProductVersion,
} from "@/lib/products/versions";
import {
  deleteVersion,
  moveVersion,
  saveVersion,
  type VersionFormState,
} from "./version-actions";

const initialState: VersionFormState = { errors: null, ok: false };

// List + add/edit form for a product's versions. One form serves both modes:
// picking "Bewerken" fills it (keyed remount resets the uncontrolled
// defaults), a successful save switches back to add mode.
export function VersionsManager({
  productId,
  photos,
  versions,
}: {
  productId: string;
  photos: string[];
  versions: ProductVersion[];
}) {
  const [state, formAction, formPending] = useActionState(
    saveVersion,
    initialState
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // A successful save closes the edit form; the refreshed list shows the result.
  useEffect(() => {
    if (state.ok) setEditingId(null);
  }, [state]);

  const editing = versions.find((version) => version.id === editingId);
  const errors = state.errors ?? {};
  const busy = formPending || isPending;

  function handleDelete(versionId: string) {
    setListError(null);
    startTransition(async () => {
      const result = await deleteVersion(productId, versionId);
      if (!result.ok) setListError(result.message ?? "Er ging iets mis.");
    });
  }

  function handleMove(versionId: string, direction: "up" | "down") {
    setListError(null);
    startTransition(async () => {
      const result = await moveVersion(productId, versionId, direction);
      if (!result.ok) setListError(result.message ?? "Er ging iets mis.");
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        Uitvoeringen
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Optioneel: extra uitvoeringen met een eigen prijs (bijv. dubbel). De
        basisprijs hierboven blijft de eerste keuze; het veld &quot;Label
        basisprijs&quot; bepaalt hoe die keuze heet. Verwijderen verandert
        bestaande bestellingen niet.
      </p>

      {versions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {versions.map((version, index) => (
            <li
              key={version.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
            >
              {version.photo_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productPhotoUrl(version.photo_path)}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <span className="h-10 w-10 shrink-0 rounded border border-dashed border-slate-300 dark:border-slate-700" />
              )}
              <span className="flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
                {version.name}
              </span>
              <span className="shrink-0 text-sm text-slate-900 dark:text-white">
                {version.compare_at_price !== null && (
                  <s className="mr-1 text-slate-400 dark:text-slate-500">
                    {formatEuro(version.compare_at_price)}
                  </s>
                )}
                {formatEuro(version.price)}
              </span>
              <button
                type="button"
                disabled={busy || index === 0}
                onClick={() => handleMove(version.id, "up")}
                aria-label={`${version.name} omhoog`}
                className="text-sm text-slate-600 hover:text-violet-700 disabled:opacity-40 dark:text-slate-300 dark:hover:text-violet-400"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || index === versions.length - 1}
                onClick={() => handleMove(version.id, "down")}
                aria-label={`${version.name} omlaag`}
                className="text-sm text-slate-600 hover:text-violet-700 disabled:opacity-40 dark:text-slate-300 dark:hover:text-violet-400"
              >
                ↓
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditingId(version.id)}
                className="text-sm text-violet-700 hover:underline disabled:opacity-50 dark:text-violet-400"
              >
                Bewerken
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(version.id)}
                className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
      {listError && (
        <p className="text-sm text-red-600 dark:text-red-400">{listError}</p>
      )}

      <form
        key={editingId ?? "new"}
        action={formAction}
        className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
      >
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          {editing ? "Uitvoering bewerken" : "Uitvoering toevoegen"}
        </h3>
        <input type="hidden" name="productId" value={productId} />
        {editing && (
          <input type="hidden" name="versionId" value={editing.id} />
        )}

        <Field label="Naam (bijv. Dubbel)" error={errors.name}>
          <Input
            type="text"
            name="name"
            defaultValue={editing?.name ?? ""}
            maxLength={MAX_VERSION_NAME_LENGTH}
            required
          />
        </Field>

        <Field label="Prijs (€)" error={errors.price}>
          <Input
            type="text"
            name="price"
            inputMode="decimal"
            defaultValue={editing ? priceToInput(editing.price) : ""}
            placeholder="bijv. 40,00"
          />
        </Field>

        <Field
          label="Oorspronkelijke prijs (optioneel — doorgestreept getoond)"
          error={errors.compareAtPrice}
        >
          <Input
            type="text"
            name="compareAtPrice"
            inputMode="decimal"
            defaultValue={editing ? priceToInput(editing.compare_at_price) : ""}
            placeholder="bijv. 46,00"
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Foto (optioneel — wordt de omslagfoto als de klant deze uitvoering
            kiest)
          </legend>
          <div className="flex flex-wrap gap-3">
            <label className="flex cursor-pointer flex-col items-center gap-1">
              <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Geen
              </span>
              <input
                type="radio"
                name="photoPath"
                value=""
                defaultChecked={!editing?.photo_path}
                className="accent-violet-600"
              />
            </label>
            {photos.map((path) => (
              <label
                key={path}
                className="flex cursor-pointer flex-col items-center gap-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productPhotoUrl(path)}
                  alt=""
                  className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                />
                <input
                  type="radio"
                  name="photoPath"
                  value={path}
                  defaultChecked={editing?.photo_path === path}
                  className="accent-violet-600"
                />
              </label>
            ))}
          </div>
        </fieldset>

        {errors.form && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {errors.form}
          </p>
        )}
        {state.ok && (
          <p className="text-sm text-green-700 dark:text-green-400">
            Opgeslagen.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy} size="sm">
            {formPending ? "Bezig…" : editing ? "Opslaan" : "Toevoegen"}
          </Button>
          {editing && (
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="text-sm text-slate-600 hover:underline dark:text-slate-300"
            >
              Annuleren
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
```

- [ ] **Step 3: Wire into the edit page**

In `app/admin/(protected)/producten/[id]/page.tsx`, import the manager and the row type:

```ts
import { VersionsManager } from "./versions-manager";
import type { ProductVersion } from "@/lib/products/versions";
```

After the product fetch, add:

```ts
  // Version list for the Uitvoeringen block. On a fetch error the block
  // renders empty; saving will surface errors of its own.
  const { data: versionRows } = await supabase
    .from("product_versions")
    .select("id, product_id, name, price, compare_at_price, photo_path, sort_order")
    .eq("product_id", id)
    .order("sort_order");
  const versions: ProductVersion[] = versionRows ?? [];
```

Below the PhotoManager `Card` (before `DeleteProductButton`), add:

```tsx
      <Card className="max-w-xl">
        <VersionsManager
          productId={product.id}
          photos={product.photos}
          versions={versions}
        />
      </Card>
```

- [ ] **Step 4: Verify and commit**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit` — all green. (No new pure logic: validation was tested in Task 2; these files are I/O + UI.)

```bash
git add "app/admin/(protected)/producten/[id]/version-actions.ts" "app/admin/(protected)/producten/[id]/versions-manager.tsx" "app/admin/(protected)/producten/[id]/page.tsx"
git commit -m "feat: admin Uitvoeringen block with add/edit/delete/reorder"
```

---

### Task 5: Customer detail-page picker + catalog hint

**Files:**
- Create: `app/modellen/[id]/product-view.tsx` (client: gallery + info + pickers + Bestellen)
- Create: `app/modellen/[id]/version-picker.tsx` (client: selectable cards)
- Delete: `app/modellen/[id]/order-panel.tsx` (subsumed by product-view)
- Modify: `app/modellen/[id]/page.tsx` (fetch versions, render ProductView)
- Modify: `app/modellen/page.tsx` (fetch version counts)
- Modify: `components/product-card.tsx` (optional `versionCount` hint)

**Interfaces:**
- Consumes: `buildVersionOptions`, `VersionOption`, `ProductVersion` (Task 2); `DEFAULT_COLOR_ID`, `FilamentColor`, `ColorPicker`, `formatEuro`, `productPhotoUrl`, `ButtonLink`, `CubeLogo`.
- Produces: `ProductView({ product, colors, options })`; `VersionPicker({ options, selectedId, onSelect })`; `ProductCard` gains optional prop `versionCount?: number` (the display value, already including the base).

- [ ] **Step 1: Write `version-picker.tsx`**

```tsx
"use client";

import { formatEuro } from "@/lib/format";
import type { VersionOption } from "@/lib/products/versions";

// Selectable version cards. First option is always the base price; a version
// with a compare-at price shows it struck through in gray beside the real
// price. Renders nothing for versionless products.
export function VersionPicker({
  options,
  selectedId,
  onSelect,
}: {
  options: VersionOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700">Uitvoering</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              aria-pressed={selected}
              className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                selected
                  ? "border-violet-600 bg-violet-50 ring-1 ring-violet-600"
                  : "border-slate-300 hover:border-violet-400"
              }`}
            >
              <span className="text-sm font-semibold text-slate-900">
                {option.label}
              </span>
              <span className="text-sm text-slate-900">
                {option.compareAtPrice !== null && (
                  <s className="mr-1.5 text-slate-400">
                    {formatEuro(option.compareAtPrice)}
                  </s>
                )}
                <span className="font-semibold">
                  {formatEuro(option.price)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `product-view.tsx`**

This takes over the two-column grid that `page.tsx` rendered plus the old `OrderPanel` (which it replaces): selection state must drive the cover image AND the price line, so the whole block becomes one client component.

```tsx
"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ColorPicker } from "@/components/color-picker";
import { CubeLogo } from "@/components/site-header";
import { DEFAULT_COLOR_ID, type FilamentColor } from "@/lib/colors";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";
import type { VersionOption } from "@/lib/products/versions";
import { VersionPicker } from "./version-picker";

export type ProductViewData = {
  id: string;
  name: string;
  description: string | null;
  indicative_price: number | string | null;
  photos: string[];
};

// Gallery + info + version/color pickers + Bestellen. Client component
// because the chosen version swaps the cover image and price line, and the
// chosen color and version must ride along in the order link. With empty
// options/colors (versionless product or degraded fetch) the pickers hide
// and everything renders exactly as before this feature.
export function ProductView({
  product,
  colors,
  options,
}: {
  product: ProductViewData;
  colors: FilamentColor[];
  options: VersionOption[];
}) {
  const [colorId, setColorId] = useState(DEFAULT_COLOR_ID);
  // "" selects the base-price option; only real version ids ride the link.
  const [versionId, setVersionId] = useState("");
  const selected = options.find((option) => option.id === versionId);

  const price = selected ? selected.price : product.indicative_price;
  const cover = selected?.photoPath ?? product.photos[0];
  const rest = product.photos.slice(1);

  let href = `/aanvraag?product=${product.id}`;
  if (colors.length > 0) href += `&color=${colorId}`;
  if (versionId !== "") href += `&version=${versionId}`;

  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="aspect-square w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={productPhotoUrl(cover)}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <CubeLogo className="h-16 w-16 text-slate-300" />
            </div>
          )}
        </div>
        {rest.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {rest.map((path) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={path}
                src={productPhotoUrl(path)}
                alt={product.name}
                className="aspect-square w-full rounded-xl border border-slate-200 object-cover"
              />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-slate-900">{product.name}</h1>
        {price !== null && (
          <p className="text-lg">
            Vaste prijs{" "}
            <span className="font-semibold">{formatEuro(price)}</span>
            <span className="block text-sm text-slate-500">
              Geen offerte nodig — na je bestelling gaan we direct voor je
              aan de slag.
            </span>
          </p>
        )}
        {product.description && (
          <p className="whitespace-pre-line text-slate-700">
            {product.description}
          </p>
        )}
        <VersionPicker
          options={options}
          selectedId={versionId}
          onSelect={setVersionId}
        />
        <ColorPicker colors={colors} selectedId={colorId} onSelect={setColorId} />
        <ButtonLink href={href} size="lg" className="mt-2 self-start">
          Bestellen
        </ButtonLink>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `app/modellen/[id]/page.tsx` and delete `order-panel.tsx`**

Full new page content:

```tsx
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { buildVersionOptions } from "@/lib/products/versions";
import type { FilamentColor } from "@/lib/colors";
import { ProductView } from "./product-view";

type Product = {
  id: string;
  name: string;
  description: string | null;
  indicative_price: number | string | null;
  base_version_label: string | null;
  photos: string[];
};

// A malformed id makes Postgres error on the uuid cast; treat every failure
// mode (error, unknown id, inactive product, active-but-unpriced product) as
// the same Dutch 404 so inactive products' existence never leaks. An unpriced
// product joins that list because it isn't orderable: the order form filters
// it out, so its "Bestellen" button would strand the customer on an empty
// form. Collapsing it into the same 404 keeps that one exit here too.
// Wrapped in cache() so generateMetadata and the page component share one
// fetch per request instead of querying twice.
const getProduct = cache(async (id: string): Promise<Product | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, indicative_price, base_version_label, photos")
    .eq("id", id)
    .eq("active", true)
    .not("indicative_price", "is", null)
    .maybeSingle();
  if (error || !data) return null;
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16: params is a Promise and must be awaited.
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product ? product.name : "Model niet gevonden" };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  // Color palette for the picker. A fetch error degrades to no picker rather
  // than a broken page; the order form falls back to default black.
  const supabase = await createClient();
  const { data: colorRows } = await supabase
    .from("filament_colors")
    .select("id, line, name, hex, available")
    .order("line")
    .order("sort_order");
  const colors: FilamentColor[] = colorRows ?? [];

  // Versions for the picker — same degrade philosophy: a fetch error means
  // no picker, base price only.
  const { data: versionRows } = await supabase
    .from("product_versions")
    .select("id, product_id, name, price, compare_at_price, photo_path, sort_order")
    .eq("product_id", product.id)
    .order("sort_order");
  const options = buildVersionOptions(product, versionRows ?? []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-10">
        <Link href="/modellen" className="text-sm text-violet-700 hover:underline">
          ← Alle modellen
        </Link>
        <ProductView product={product} colors={colors} options={options} />
      </main>
      <SiteFooter />
    </div>
  );
}
```

Then delete the old panel:

```bash
git rm app/modellen/[id]/order-panel.tsx
```

- [ ] **Step 4: Catalog hint — `components/product-card.tsx` and `app/modellen/page.tsx`**

`product-card.tsx` — new optional prop; note goes under the name/price row:

```tsx
export function ProductCard({
  product,
  versionCount,
}: {
  product: ProductSummary;
  // Display value including the base option; undefined = no hint.
  versionCount?: number;
}) {
```

Replace the bottom info `div` with:

```tsx
      <div className="flex flex-col gap-0.5 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-slate-900">{product.name}</span>
          {product.indicative_price !== null && (
            <span className="shrink-0 text-sm text-slate-500">
              {formatEuro(product.indicative_price)}
            </span>
          )}
        </div>
        {versionCount !== undefined && (
          <span className="text-xs text-slate-500">
            {versionCount} uitvoeringen
          </span>
        )}
      </div>
```

`app/modellen/page.tsx` — after the products query, add the count query and pass the prop:

```ts
  // One query for all versions; RLS already limits anon to versions of
  // active products. A fetch error degrades to no hints — cards still render.
  const { data: versionRows } = await supabase
    .from("product_versions")
    .select("product_id");
  const versionCounts = new Map<string, number>();
  for (const row of versionRows ?? []) {
    versionCounts.set(row.product_id, (versionCounts.get(row.product_id) ?? 0) + 1);
  }
```

```tsx
            {productList.map((product) => {
              const versions = versionCounts.get(product.id) ?? 0;
              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  versionCount={versions > 0 ? versions + 1 : undefined}
                />
              );
            })}
```

- [ ] **Step 5: Verify and commit**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` — all green (build catches server/client boundary mistakes).

```bash
git add "app/modellen/[id]/page.tsx" "app/modellen/[id]/product-view.tsx" "app/modellen/[id]/version-picker.tsx" app/modellen/page.tsx components/product-card.tsx
git commit -m "feat: version picker on product page, uitvoeringen hint on catalog cards"
```

---

### Task 6: Order flow — version through form and server action

**Files:**
- Modify: `lib/requests/validation.ts` (versionId field)
- Modify: `lib/requests/validation.test.ts` (fixtures + new cases)
- Modify: `app/aanvraag/page.tsx` (resolve `?version=`)
- Modify: `app/aanvraag/request-form.tsx` (hidden field, version line, price preview)
- Modify: `app/aanvraag/actions.ts` (lookup + snapshot)

**Interfaces:**
- Consumes: `checkVersionRow` (Task 2); everything already in the order flow.
- Produces: `RequestInput` gains `versionId: string`; `ValidRequest` gains `versionId: string | null`; `RequestForm` gains prop `preselectedVersion: PreselectedVersion | null` with `type PreselectedVersion = { id: string; name: string; price: number | string }` (exported from `request-form.tsx`); requests insert carries `version_name`. Task 7 reads `versionName` locals in `actions.ts`.

- [ ] **Step 1: Write the failing tests**

In `lib/requests/validation.test.ts`, add `versionId: ""` to every existing `RequestInput` object literal (the compiler will point at each one), then add — reusing the file's existing helper/fixture pattern for a valid catalog input:

```ts
describe("validateRequest versionId", () => {
  // Adjust `catalogInput` to the file's existing valid-catalog fixture name.
  it("passes a catalog versionId through trimmed", () => {
    const result = validateRequest({
      ...catalogInput,
      versionId: " 11111111-1111-1111-1111-111111111111 ",
    });
    expect(result.ok && result.data.versionId).toBe(
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("treats an empty versionId as the base option (null)", () => {
    const result = validateRequest({ ...catalogInput, versionId: "" });
    expect(result.ok && result.data.versionId).toBeNull();
  });

  it("nulls versionId for non-catalog types", () => {
    // Adjust `fileInput` to the file's existing valid-file fixture name.
    const result = validateRequest({ ...fileInput, versionId: "abc" });
    expect(result.ok && result.data.versionId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/requests/validation.test.ts`
Expected: FAIL (type + assertions).

- [ ] **Step 3: Extend `lib/requests/validation.ts`**

Add to `RequestInput` (after `colorId: string;`):

```ts
  // Catalog only: chosen product_versions id; "" = the base-price option.
  versionId: string;
```

Add to `ValidRequest` (after `colorId: string | null;`):

```ts
  // Catalog only: id in product_versions, null for the base-price option.
  // The server action resolves it to a name+price snapshot itself.
  versionId: string | null;
```

In `validateRequest`, next to the `colorId` handling add:

```ts
  // No validation rule: an empty id IS the base-price option. Existence and
  // ownership are the server action's job — this module stays I/O-free.
  const versionId = input.versionId.trim();
```

And in the returned data object add:

```ts
      versionId: type === "catalog" ? versionId || null : null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/requests/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Resolve `?version=` in `app/aanvraag/page.tsx`**

Destructure the param: `const { product, type, color, version } = await searchParams;`

After `preselected` is computed, add:

```ts
  // ?version= from the detail page: resolve to a real version OF the
  // preselected product, else silently ignore — same posture as ?product=.
  // A malformed uuid just errors the query, which lands in the same ignore.
  let preselectedVersion: PreselectedVersion | null = null;
  if (preselected && typeof version === "string" && version !== "") {
    const { data: versionRow } = await supabase
      .from("product_versions")
      .select("id, product_id, name, price")
      .eq("id", version)
      .maybeSingle();
    if (versionRow && versionRow.product_id === preselected) {
      preselectedVersion = {
        id: versionRow.id,
        name: versionRow.name,
        price: versionRow.price,
      };
    }
  }
```

Import the type from the form module (add to the existing import): `type PreselectedVersion`. Pass the prop:

```tsx
              <RequestForm
                products={productList}
                preselectedProductId={preselected}
                preselectedVersion={preselectedVersion}
                initialType={initialType}
                colors={colors}
                initialColorId={initialColorId}
              />
```

- [ ] **Step 6: Thread the version through `request-form.tsx`**

Export the type and extend the props:

```ts
export type PreselectedVersion = {
  id: string;
  name: string;
  price: number | string;
};
```

```ts
export function RequestForm({
  products,
  preselectedProductId,
  preselectedVersion,
  initialType,
  colors,
  initialColorId,
}: {
  products: ProductOption[];
  preselectedProductId: string;
  preselectedVersion: PreselectedVersion | null;
  initialType: FormType | "";
  colors: FilamentColor[];
  initialColorId: string;
}) {
```

Add state next to the other `useState` calls:

```ts
  // "" = base-price option. The only non-empty value ever set is the
  // preselected one — the form itself has no version picker (the customer
  // picks on the product page).
  const [versionId, setVersionId] = useState(
    preselectedVersion ? preselectedVersion.id : ""
  );
```

Selecting another product drops the version (it belongs to the old product) — extend the product `Select`'s `onChange`:

```tsx
                onChange={(event) => {
                  setProductId(event.target.value);
                  setVersionId("");
                }}
```

Derive the active version and use its price for the preview — replace the `unitPrice` computation with:

```ts
  const selectedVersion =
    type === "catalog" && versionId !== "" ? preselectedVersion : null;
  const unitPrice = selectedVersion
    ? toAmount(selectedVersion.price)
    : selectedProduct && selectedProduct.indicative_price !== null
      ? toAmount(selectedProduct.indicative_price)
      : null;
```

Inside the catalog block, directly under the product `Field` (before the price panel), add the version line, hidden field and error slot:

```tsx
            <input type="hidden" name="versionId" value={versionId} />
            {selectedVersion && (
              <p className="text-sm text-slate-600">
                Versie:{" "}
                <span className="font-medium text-slate-900">
                  {selectedVersion.name}
                </span>
              </p>
            )}
            {errors.versionId && (
              <p className="text-sm text-red-600">{errors.versionId}</p>
            )}
```

In `handleSubmit`, add to the `RequestInput` literal (after `colorId`):

```ts
      versionId: String(formData.get("versionId") ?? ""),
```

- [ ] **Step 7: Resolve and snapshot in `app/aanvraag/actions.ts`**

Import the helper:

```ts
import { checkVersionRow } from "@/lib/products/versions";
```

Add a UUID guard constant near `GENERIC_ERROR`:

```ts
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
```

After the product lookup block (which already proves the product exists, is active and priced) and before the color lookup, add:

```ts
  // Same trust rule as the price and the color: the browser sends only a
  // version id; the server resolves name and price itself and snapshots
  // both. The product lookup above already proved the product is active —
  // and RLS hides versions of inactive products anyway, so a version of an
  // inactive product resolves to "no row" here.
  let versionName: string | null = null;
  if (result.data.type === "catalog" && result.data.versionId !== null) {
    // Reject malformed ids before the query: a non-uuid string would make
    // Postgres error on the cast, which must read as a bad choice, not as a
    // transport failure.
    if (!UUID_PATTERN.test(result.data.versionId)) {
      return { errors: { versionId: "Kies een versie." } };
    }
    const { data: versionRow, error: versionError } = await supabase
      .from("product_versions")
      .select("product_id, name, price")
      .eq("id", result.data.versionId)
      .maybeSingle();
    if (versionError) {
      return { errors: { form: GENERIC_ERROR } };
    }
    const version = checkVersionRow(versionRow, result.data.productId!);
    if (!version.ok) {
      return { errors: { versionId: "Kies een versie." } };
    }
    unitPrice = version.price;
    versionName = version.name;
  }
```

Add the snapshot to the requests insert object (after `unit_price`):

```ts
    version_name: versionName,
```

- [ ] **Step 8: Verify and commit**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit` — all green.

```bash
git add lib/requests/validation.ts lib/requests/validation.test.ts app/aanvraag/page.tsx app/aanvraag/request-form.tsx app/aanvraag/actions.ts
git commit -m "feat: version selection through the order form with server-side snapshot"
```

---

### Task 7: Version name on emails, status page and admin request view

**Files:**
- Modify: `lib/email/templates.ts` (both templates)
- Modify: `lib/email/templates.test.ts` (new cases)
- Modify: `app/aanvraag/actions.ts` (pass versionName into both emails)
- Modify: `app/aanvraag/status/[token]/page.tsx` (show version)
- Modify: `app/admin/(protected)/aanvragen/[id]/page.tsx` (select + show version)

**Interfaces:**
- Consumes: `versionName` local in `actions.ts` (Task 6); `version_name` in the RPC result and `requests` rows (Task 1).
- Produces: `OrderSummary` gains `versionName?: string`; `OwnerNotificationInput["order"]` gains `versionName?: string`.

- [ ] **Step 1: Write the failing tests**

In `lib/email/templates.test.ts`, following the file's existing call patterns, add:

```ts
describe("version name in emails", () => {
  it("confirmation email lists the version", () => {
    const { html } = confirmationEmail({
      customerName: "Jan",
      statusUrl: "https://example.test/s/1",
      order: { unitPrice: "40.00", quantity: 1, versionName: "Dubbel" },
    });
    expect(html).toContain("Versie: Dubbel");
  });

  it("confirmation email omits the version line without one", () => {
    const { html } = confirmationEmail({
      customerName: "Jan",
      statusUrl: "https://example.test/s/1",
      order: { unitPrice: "23.00", quantity: 1 },
    });
    expect(html).not.toContain("Versie:");
  });

  it("owner notification joins product and version with an em-dash", () => {
    const { html } = ownerNotificationEmail({
      customerName: "Jan",
      email: "jan@example.test",
      phone: null,
      adminUrl: "https://example.test/admin/aanvragen/1",
      order: {
        productName: "Theedispenser",
        unitPrice: "40.00",
        quantity: 1,
        versionName: "Dubbel",
      },
    });
    expect(html).toContain("Product: Theedispenser — Dubbel");
  });

  it("owner notification escapes the version name", () => {
    const { html } = ownerNotificationEmail({
      customerName: "Jan",
      email: "jan@example.test",
      phone: null,
      adminUrl: "https://example.test/admin/aanvragen/1",
      order: {
        productName: "Theedispenser",
        unitPrice: "40.00",
        quantity: 1,
        versionName: "<b>Dubbel</b>",
      },
    });
    expect(html).toContain("&lt;b&gt;Dubbel&lt;/b&gt;");
    expect(html).not.toContain("<b>Dubbel</b>");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/email/templates.test.ts`
Expected: FAIL — `versionName` is not a known property / assertions fail.

- [ ] **Step 3: Extend `lib/email/templates.ts`**

`OrderSummary` gains (after `color?: string;`):

```ts
  // Chosen version's name ("Dubbel"), absent for base-price orders.
  versionName?: string;
```

In `confirmationEmail`, build the lines so the version comes first — replace the `lines` initialization with:

```ts
    const lines: string[] = [];
    if (input.order.versionName) {
      lines.push(`Versie: ${escapeHtml(input.order.versionName)}`);
    }
    lines.push(
      `Prijs per stuk: ${formatEuro(input.order.unitPrice)}`,
      `Aantal: ${input.order.quantity}`
    );
```

`OwnerNotificationInput`'s `order` gains (after `color?: string;`):

```ts
    versionName?: string;
```

In `ownerNotificationEmail`, replace the `Product:` line push with:

```ts
    details.push(
      `Product: ${escapeHtml(input.order.productName)}${
        input.order.versionName
          ? ` — ${escapeHtml(input.order.versionName)}`
          : ""
      }`,
      `Aantal: ${input.order.quantity}`
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/email/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass the version from the submit action**

In `app/aanvraag/actions.ts`, extend both email payloads' `order` objects (they are built where `unitPrice !== null`):

In `sendConfirmationEmail`'s `order`:

```ts
            versionName: versionName ?? undefined,
```

In `sendNewRequestNotification`'s `order`:

```ts
            versionName: versionName ?? undefined,
```

- [ ] **Step 6: Show the version on the status page**

In `app/aanvraag/status/[token]/page.tsx`, extend `TokenRequest` (after `unit_price`):

```ts
  // Optional: migration 0009 adds version_name to the RPC's result table.
  // Until that runs the key is absent, so the type must admit undefined.
  version_name?: string | null;
```

Replace the Product `dd` content:

```tsx
            <dd>
              {request.product_name}
              {request.version_name ? ` — ${request.version_name}` : ""}
            </dd>
```

- [ ] **Step 7: Show the version on the admin request view**

In `app/admin/(protected)/aanvragen/[id]/page.tsx`, add `version_name` to the `.select(...)` string (after `unit_price`), then replace the Product `dd` content:

```tsx
              <dd>
                {productName}
                {request.version_name ? ` — ${request.version_name}` : ""}
              </dd>
```

- [ ] **Step 8: Verify and commit**

Run: `npm test`, `npm run lint`, `npx tsc --noEmit` — all green.

```bash
git add lib/email/templates.ts lib/email/templates.test.ts app/aanvraag/actions.ts "app/aanvraag/status/[token]/page.tsx" "app/admin/(protected)/aanvragen/[id]/page.tsx"
git commit -m "feat: version name on confirmation, owner email, status page and admin view"
```

---

### Task 8: Full verification, roadmap, owner handoff

**Files:**
- Modify: `docs/ROADMAP.md` (one row)

**Interfaces:**
- Consumes: everything above.
- Produces: a verified, committed batch ready for the owner's migration + deploy.

- [ ] **Step 1: Full verification**

Run, in order, and confirm each is green:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all tests pass, no lint errors, no type errors, build succeeds with all routes compiled. `git status` shows a clean tree (no uncommitted stragglers).

- [ ] **Step 2: Roadmap row**

In `docs/ROADMAP.md`, append to the build-phases table (after the site-redesign row):

```markdown
| — | Productversies met kortingsprijzen ("uitvoeringen", 2026-07-19) | done |
```

- [ ] **Step 3: Commit docs**

```bash
git add docs/ROADMAP.md
git commit -m "docs: roadmap row for product versions"
```

- [ ] **Step 4: Owner handoff (controller + owner, not the implementer)**

Present this checklist and wait for the owner:

1. **Run migration `0009_product_versions.sql`** in the Supabase SQL editor — BEFORE pushing/deploying (hard requirement; the new insert path names `version_name`).
2. Local smoke test (`npm run dev`): on `/admin/producten/<test product>`, set a "Label basisprijs", add a version with a compare-at price and a linked photo, reorder, edit, delete/re-add.
3. On `/modellen/<id>`: picker shows base first, strikethrough renders, cover swaps on a version with a photo, Bestellen link carries `&version=`.
4. Place a test order for the discounted version: form shows "Versie:", price preview uses the version price; after submit check the confirmation email, the owner notification ("Product: X — Y"), the status page and `/admin/aanvragen/<id>` all show the version; `unit_price` equals the version price.
5. Also place one base-price order on the same product (no `version_name`, behaves exactly as before).
6. Push to `main` → Vercel deploy → repeat a quick live version order.

---

## Self-review notes

- Spec coverage: table + RLS + `base_version_label` + `version_name` + RPC (Task 1); manual pricing + compare-at validation (Task 2); base label admin input (Task 3); admin Uitvoeringen block incl. photo picker + ordering + delete-keeps-snapshots (Task 4); detail picker + strikethrough + cover swap + `&version=` + no-vanaf overview hint + degrade (Task 5); form "Versie" display, server-side lookup/snapshot, `Kies een versie.` for unknown/foreign/stale/malformed ids, inactive-product rejection via product lookup + RLS (Task 6); emails/status/admin display (Task 7); testing + manual E2E (Tasks 2/6/7/8).
- Out of scope respected: no per-version galleries/descriptions, no auto-discounts, no migration of existing products.
- Type consistency: `ProductVersion`/`VersionOption`/`PreselectedVersion` defined once and imported; `versionId ""` ↔ `null` boundary is validation's job; DB snake_case ↔ camelCase mapping happens at the query/insert sites.
