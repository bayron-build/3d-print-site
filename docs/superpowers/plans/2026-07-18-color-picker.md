# Color Swatch Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bambu-style color swatch picker for fixed-price catalog products — on the product page and the order form — backed by a `filament_colors` table with an admin stock-toggle page.

**Architecture:** The color list lives in a new `filament_colors` table (seeded with the official Bambu PLA Basic + PLA Matte lineups). Pure helpers in `lib/colors.ts` are shared by client, server, and tests. One `ColorPicker` client component renders on the product detail page (choice rides the Bestellen link as `?color=`) and in the order form (hidden `colorId` field). The server action resolves the id against the table and writes a snapshot string into the existing `requests.color` column — no `requests` schema change. Admin gets a `/admin/kleuren` toggle page.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RLS), Tailwind 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-color-picker-design.md`

## Global Constraints

- All customer/admin copy is Dutch. Color names stay official Bambu English ("Jade White").
- Out-of-stock note (exact copy): `Deze kleur is niet op voorraad — levering duurt enkele dagen langer.`
- Snapshot suffix (exact copy): ` (niet op voorraad — langere levertijd)`; separator between line and name is an en-dash: `PLA Basic – Black`.
- Default color id: `basic-black`.
- Next 16: `params`/`searchParams` are Promises and must be awaited. Read `node_modules/next/dist/docs/` if unsure about an API.
- Tests are pure functions only (Vitest, `npm test`). No I/O mocking harness exists — do not add one.
- Migrations are NOT run by the implementer. The owner runs them manually in the Supabase web SQL editor. Never attempt to run SQL against the database.
- No new npm dependencies.
- Hex codes are stored WITH the leading `#` (e.g. `#00AE42`).
- Public pages are light-mode only; admin pages must include `dark:` classes.
- Commit messages: repo style is `feat:`/`fix:`/`docs:` prefixes, with the Claude trailer lines used in recent commits.

---

### Task 1: Migration 0008 — `filament_colors` table + seed

**Files:**
- Create: `supabase/migrations/0008_filament_colors.sql`

**Interfaces:**
- Consumes: `public.is_admin()` (defined in migration 0002).
- Produces: table `public.filament_colors(id text pk, line text, name text, hex text, sort_order int, available bool default false)`, readable by anon, writable by admin. Later tasks query columns `id, line, name, hex, available`.

The color data below is the official Bambu lineup (verified against the community-maintained SpoolmanDB, which mirrors Bambu's published hex codes): 30 PLA Basic + 25 PLA Matte colors.

- [ ] **Step 1: Write the migration**

```sql
-- Bambu filament color palette for fixed-price catalog orders. One row per
-- color; `available` = owner has the spool in house. Unavailable colors stay
-- orderable (longer lead time), so anon reads ALL rows — availability is a
-- label, not a filter.
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as
-- 0001-0007). Purely additive: safe to run before the code that uses it
-- deploys; the current app never touches this table.

create table public.filament_colors (
  id text primary key,
  line text not null check (line in ('basic', 'matte')),
  name text not null,
  hex text not null,
  sort_order integer not null,
  available boolean not null default false
);

alter table public.filament_colors enable row level security;

create policy "Admin full access" on public.filament_colors
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Anon read colors" on public.filament_colors
  for select to anon, authenticated
  using (true);

-- Seed: official Bambu PLA Basic lineup. All colors start unavailable; the
-- owner flips the in-house ones on /admin/kleuren.
insert into public.filament_colors (id, line, name, hex, sort_order) values
  ('basic-jade-white',       'basic', 'Jade White',       '#FFFFFF', 10),
  ('basic-beige',            'basic', 'Beige',            '#F7E6DE', 20),
  ('basic-gold',             'basic', 'Gold',             '#E4BD68', 30),
  ('basic-silver',           'basic', 'Silver',           '#A6A9AA', 40),
  ('basic-gray',             'basic', 'Gray',             '#8E9089', 50),
  ('basic-bronze',           'basic', 'Bronze',           '#847D48', 60),
  ('basic-brown',            'basic', 'Brown',            '#9D432C', 70),
  ('basic-cocoa-brown',      'basic', 'Cocoa Brown',      '#6F5034', 80),
  ('basic-maroon-red',       'basic', 'Maroon Red',       '#9D2235', 90),
  ('basic-red',              'basic', 'Red',              '#C12E1F', 100),
  ('basic-magenta',          'basic', 'Magenta',          '#EC008C', 110),
  ('basic-pink',             'basic', 'Pink',             '#F55A74', 120),
  ('basic-hot-pink',         'basic', 'Hot Pink',         '#F5547C', 130),
  ('basic-orange',           'basic', 'Orange',           '#FF6A13', 140),
  ('basic-pumpkin-orange',   'basic', 'Pumpkin Orange',   '#FF9016', 150),
  ('basic-sunflower-yellow', 'basic', 'Sunflower Yellow', '#FEC600', 160),
  ('basic-yellow',           'basic', 'Yellow',           '#F4EE2A', 170),
  ('basic-bright-green',     'basic', 'Bright Green',     '#BECF00', 180),
  ('basic-bambu-green',      'basic', 'Bambu Green',      '#00AE42', 190),
  ('basic-mistletoe-green',  'basic', 'Mistletoe Green',  '#3F8E43', 200),
  ('basic-turquoise',        'basic', 'Turquoise',        '#00B1B7', 210),
  ('basic-cyan',             'basic', 'Cyan',             '#0086D6', 220),
  ('basic-blue',             'basic', 'Blue',              '#0A2989', 230),
  ('basic-cobalt-blue',      'basic', 'Cobalt Blue',      '#0056B8', 240),
  ('basic-purple',           'basic', 'Purple',           '#5E43B7', 250),
  ('basic-indigo-purple',    'basic', 'Indigo Purple',    '#482960', 260),
  ('basic-blue-gray',        'basic', 'Blue Gray',        '#5B6579', 270),
  ('basic-light-gray',       'basic', 'Light Gray',       '#D1D3D5', 280),
  ('basic-dark-gray',        'basic', 'Dark Gray',        '#545454', 290),
  ('basic-black',            'basic', 'Black',            '#000000', 300);

-- Seed: official Bambu PLA Matte lineup.
insert into public.filament_colors (id, line, name, hex, sort_order) values
  ('matte-ivory-white',     'matte', 'Ivory White',     '#FFFFFF', 10),
  ('matte-bone-white',      'matte', 'Bone White',      '#CBC6B8', 20),
  ('matte-desert-tan',      'matte', 'Desert Tan',      '#E8DBB7', 30),
  ('matte-latte-brown',     'matte', 'Latte Brown',     '#D3B7A7', 40),
  ('matte-caramel',         'matte', 'Caramel',         '#AE835B', 50),
  ('matte-terracotta',      'matte', 'Terracotta',      '#B15533', 60),
  ('matte-dark-brown',      'matte', 'Dark Brown',      '#7D6556', 70),
  ('matte-dark-chocolate',  'matte', 'Dark Chocolate',  '#4D3324', 80),
  ('matte-lemon-yellow',    'matte', 'Lemon Yellow',    '#F7D959', 90),
  ('matte-mandarin-orange', 'matte', 'Mandarin Orange', '#F99963', 100),
  ('matte-sakura-pink',     'matte', 'Sakura Pink',     '#E8AFCF', 110),
  ('matte-lilac-purple',    'matte', 'Lilac Purple',    '#AE96D4', 120),
  ('matte-plum',            'matte', 'Plum',            '#950051', 130),
  ('matte-scarlet-red',     'matte', 'Scarlet Red',     '#DE4343', 140),
  ('matte-dark-red',        'matte', 'Dark Red',        '#BB3D43', 150),
  ('matte-apple-green',     'matte', 'Apple Green',     '#C2E189', 160),
  ('matte-grass-green',     'matte', 'Grass Green',     '#61C680', 170),
  ('matte-dark-green',      'matte', 'Dark Green',      '#68724D', 180),
  ('matte-ice-blue',        'matte', 'Ice Blue',        '#A3D8E1', 190),
  ('matte-sky-blue',        'matte', 'Sky Blue',        '#56B7E6', 200),
  ('matte-marine-blue',     'matte', 'Marine Blue',     '#0078BF', 210),
  ('matte-dark-blue',       'matte', 'Dark Blue',       '#042F56', 220),
  ('matte-ash-gray',        'matte', 'Ash Gray',        '#9B9EA0', 230),
  ('matte-nardo-gray',      'matte', 'Nardo Gray',      '#757575', 240),
  ('matte-charcoal',        'matte', 'Charcoal',        '#000000', 250);
```

- [ ] **Step 2: Sanity-check the seed counts**

Verify by eye: 30 `basic-` rows, 25 `matte-` rows, every hex 7 chars (`#` + 6), unique ids. Do NOT run the SQL — the owner runs it in the Supabase SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0008_filament_colors.sql
git commit -m "feat: filament_colors table with Bambu PLA Basic/Matte seed"
```

---

### Task 2: `lib/colors.ts` — shared pure helpers

**Files:**
- Create: `lib/colors.ts`
- Test: `lib/colors.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (used by Tasks 4–8):
  - `type FilamentColor = { id: string; line: string; name: string; hex: string; available: boolean }`
  - `DEFAULT_COLOR_ID = "basic-black"`
  - `OUT_OF_STOCK_NOTE: string`
  - `lineLabel(line: string): string` → `"PLA Basic"` / `"PLA Matte"`
  - `formatColorSnapshot(color: { line: string; name: string; available: boolean }): string`
  - `resolveColorId(param: string | string[] | undefined, colors: { id: string }[]): string`
  - `isNearWhite(hex: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `lib/colors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLOR_ID,
  formatColorSnapshot,
  isNearWhite,
  lineLabel,
  resolveColorId,
} from "./colors";

describe("lineLabel", () => {
  it("maps the two lines to their display labels", () => {
    expect(lineLabel("basic")).toBe("PLA Basic");
    expect(lineLabel("matte")).toBe("PLA Matte");
  });
});

describe("formatColorSnapshot", () => {
  it("formats an in-stock color as line – name", () => {
    expect(
      formatColorSnapshot({ line: "basic", name: "Black", available: true })
    ).toBe("PLA Basic – Black");
  });

  it("appends the delivery note for an out-of-stock color", () => {
    expect(
      formatColorSnapshot({ line: "matte", name: "Charcoal", available: false })
    ).toBe("PLA Matte – Charcoal (niet op voorraad — langere levertijd)");
  });
});

describe("resolveColorId", () => {
  const colors = [{ id: "basic-black" }, { id: "matte-plum" }];

  it("accepts a known id", () => {
    expect(resolveColorId("matte-plum", colors)).toBe("matte-plum");
  });

  it("falls back to the default for an unknown id", () => {
    expect(resolveColorId("basic-vantablack", colors)).toBe(DEFAULT_COLOR_ID);
  });

  it("falls back to the default when the param is missing or repeated", () => {
    expect(resolveColorId(undefined, colors)).toBe(DEFAULT_COLOR_ID);
    expect(resolveColorId(["a", "b"], colors)).toBe(DEFAULT_COLOR_ID);
  });

  it("falls back to the default for an empty color list", () => {
    expect(resolveColorId("basic-black", [])).toBe(DEFAULT_COLOR_ID);
  });
});

describe("isNearWhite", () => {
  it("flags white and near-white swatches", () => {
    expect(isNearWhite("#FFFFFF")).toBe(true);
    expect(isNearWhite("#F7E6DE")).toBe(true); // Beige
  });

  it("does not flag dark or saturated swatches", () => {
    expect(isNearWhite("#000000")).toBe(false);
    expect(isNearWhite("#F4EE2A")).toBe(false); // Yellow — bright but visible
  });

  it("treats malformed hex as not near-white", () => {
    expect(isNearWhite("banaan")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/colors.test.ts`
Expected: FAIL — cannot resolve `./colors`.

- [ ] **Step 3: Write the implementation**

Create `lib/colors.ts`:

```ts
// Bambu filament colors for fixed-price (catalog) orders. The color list
// itself lives in the filament_colors table (migration 0008); this module
// holds the pure helpers shared by the picker, the pages and the server
// action.

export type FilamentColor = {
  id: string;
  line: string; // "basic" | "matte" — plain string: rows arrive untyped from Supabase
  name: string;
  hex: string; // includes the leading "#"
  available: boolean;
};

export const DEFAULT_COLOR_ID = "basic-black";

// Shown under the picker when the selected color is not in stock.
export const OUT_OF_STOCK_NOTE =
  "Deze kleur is niet op voorraad — levering duurt enkele dagen langer.";

export function lineLabel(line: string): string {
  return line === "matte" ? "PLA Matte" : "PLA Basic";
}

// Snapshot string written into requests.color at order time. Point-in-time
// by design: later stock or palette changes must never rewrite old orders.
export function formatColorSnapshot(color: {
  line: string;
  name: string;
  available: boolean;
}): string {
  const base = `${lineLabel(color.line)} – ${color.name}`;
  return color.available
    ? base
    : `${base} (niet op voorraad — langere levertijd)`;
}

// ?color= URL param → a known color id, else the default. Same silent-ignore
// posture as ?product= and ?type= on the request page.
export function resolveColorId(
  param: string | string[] | undefined,
  colors: { id: string }[]
): string {
  return typeof param === "string" &&
    colors.some((color) => color.id === param)
    ? param
    : DEFAULT_COLOR_ID;
}

// Near-white swatches disappear against a white page without a border.
// Perceived-brightness formula; 220/255 keeps Light Gray borderless while
// catching the whites and Beige.
export function isNearWhite(hex: string): boolean {
  const value = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return false;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 220;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/colors.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add lib/colors.ts lib/colors.test.ts
git commit -m "feat: filament color helpers (snapshot, URL param, swatch border)"
```

---

### Task 3: Validation — `colorId` required for catalog requests

**Files:**
- Modify: `lib/requests/validation.ts`
- Test: `lib/requests/validation.test.ts`

**Interfaces:**
- Consumes: existing `RequestInput` / `ValidRequest` / `validateRequest`.
- Produces: `RequestInput` gains `colorId: string`; `ValidRequest` gains `colorId: string | null` (set only for catalog). Error key `colorId` with message `"Kies een kleur."`. Tasks 6 and 7 rely on these exact names.

- [ ] **Step 1: Extend the tests (they must fail first)**

In `lib/requests/validation.test.ts`:

1. Add `colorId: ""` to the `input()` baseline helper (the baseline is a custom request, where colorId is not required):

```ts
function input(overrides: Partial<RequestInput> = {}): RequestInput {
  return {
    type: "custom",
    customerName: "Jan Jansen",
    email: "jan@example.com",
    phone: "",
    productId: "",
    description: "Een vaas van 20cm hoog",
    color: "",
    material: "",
    quantity: "1",
    licenseAccepted: false,
    colorId: "",
    files: [],
    photos: [],
    ...overrides,
  };
}
```

2. Update the existing test `"accepts a valid catalog request and returns cleaned data"` — it asserts the full cleaned-data object with `toEqual`, so it MUST now include `colorId` in both the input override and the expected data:

```ts
  it("accepts a valid catalog request and returns cleaned data", () => {
    const result = validateRequest(
      input({
        type: "catalog",
        productId: "abc-123",
        quantity: "2",
        colorId: "basic-black",
      })
    );
    expect(result).toEqual({
      ok: true,
      data: {
        type: "catalog",
        customerName: "Jan Jansen",
        email: "jan@example.com",
        phone: null,
        productId: "abc-123",
        description: "Een vaas van 20cm hoog",
        color: null,
        material: null,
        quantity: 2,
        licenseAccepted: false,
        colorId: "basic-black",
      },
    });
  });
```

3. Add two new tests inside `describe("validateRequest", ...)`:

```ts
  it("requires a color for catalog requests", () => {
    const result = validateRequest(
      input({ type: "catalog", productId: "abc-123", colorId: "  " })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.colorId).toBeDefined();
  });

  it("nulls colorId for non-catalog requests", () => {
    const result = validateRequest(input({ colorId: "basic-black" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.colorId).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run lib/requests/validation.test.ts`
Expected: FAIL — TypeScript/property errors for `colorId` and the two new tests failing.

- [ ] **Step 3: Implement in `lib/requests/validation.ts`**

Add to `RequestInput` (after `licenseAccepted: boolean;`):

```ts
  colorId: string;
```

Add to `ValidRequest` (after `licenseAccepted: boolean;`):

```ts
  // Catalog only: id in filament_colors. The server action resolves it to a
  // snapshot string; the id itself is never stored.
  colorId: string | null;
```

In `validateRequest`, after the `productId` check block:

```ts
  // The picker always submits a color (defaults to black); a missing id only
  // happens on hand-crafted POSTs. Existence in filament_colors is checked
  // by the server action — this module stays I/O-free.
  const colorId = input.colorId.trim();
  if (type === "catalog" && !colorId) {
    errors.colorId = "Kies een kleur.";
  }
```

In the returned `data` object (after `licenseAccepted`):

```ts
      colorId: type === "catalog" ? colorId : null,
```

- [ ] **Step 4: Run the full suite to verify everything passes**

Run: `npm test`
Expected: PASS. If `app/aanvraag/request-form.tsx` or `app/aanvraag/actions.ts` fail to typecheck in your editor because `RequestInput` grew a field, that is expected — they are updated in Tasks 6 and 7; `npm test` (vitest) does not typecheck those files.

- [ ] **Step 5: Commit**

```bash
git add lib/requests/validation.ts lib/requests/validation.test.ts
git commit -m "feat: catalog requests require a colorId"
```

**NOTE for the executor:** Between this task and Task 7, `tsc`/`next build` will fail because `request-form.tsx` and `actions.ts` construct `RequestInput` without `colorId`. That is expected mid-plan; the build is verified green in Task 9.

---

### Task 4: Email templates — color line in order emails

**Files:**
- Modify: `lib/email/templates.ts`
- Test: `lib/email/templates.test.ts`

**Interfaces:**
- Consumes: existing `OrderSummary`, `OwnerNotificationInput`, `confirmationEmail`, `ownerNotificationEmail`.
- Produces: `OrderSummary` gains `color?: string`; `OwnerNotificationInput`'s `order` variant gains `color?: string`. When set, both emails render a `Kleur: <snapshot>` line. Task 7 passes the snapshot string here. `lib/email/notifications.ts` needs NO change (it re-exports these types structurally).

- [ ] **Step 1: Add failing tests**

In `lib/email/templates.test.ts`, inside `describe("confirmationEmail — fixed-price order", ...)` add:

```ts
  it("shows the chosen color when present and omits the line when absent", () => {
    const withColor = confirmationEmail({
      customerName: "Jan",
      statusUrl: "https://example.com/s/t",
      order: { unitPrice: 10, quantity: 1, color: "PLA Basic – Black" },
    });
    expect(withColor.html).toContain("Kleur: PLA Basic – Black");

    const withoutColor = confirmationEmail({
      customerName: "Jan",
      statusUrl: "https://example.com/s/t",
      order: { unitPrice: 10, quantity: 1 },
    });
    expect(withoutColor.html).not.toContain("Kleur:");
  });
```

Inside `describe("ownerNotificationEmail", ...)` add (reuse the file's existing baseline-input pattern — read how the neighbouring tests build their input and follow it):

```ts
  it("catalog: shows the chosen color when present", () => {
    const { html } = ownerNotificationEmail({
      customerName: "Jan",
      email: "jan@example.com",
      phone: null,
      adminUrl: "https://example.com/admin/aanvragen/1",
      order: {
        productName: "Vaas",
        unitPrice: 10,
        quantity: 2,
        color: "PLA Matte – Charcoal (niet op voorraad — langere levertijd)",
      },
    });
    expect(html).toContain(
      "Kleur: PLA Matte – Charcoal (niet op voorraad — langere levertijd)"
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/email/templates.test.ts`
Expected: FAIL — `color` not in the types / `Kleur:` not in the HTML.

- [ ] **Step 3: Implement in `lib/email/templates.ts`**

Extend `OrderSummary`:

```ts
export type OrderSummary = {
  unitPrice: number | string;
  quantity: number;
  // Color snapshot ("PLA Basic – Black"), present for new catalog orders.
  color?: string;
};
```

In `confirmationEmail`, replace the fixed `[Prijs per stuk, Aantal, Totaal].join("<br>")` array with:

```ts
    const lines = [
      `Prijs per stuk: ${formatEuro(input.order.unitPrice)}`,
      `Aantal: ${input.order.quantity}`,
    ];
    if (input.order.color) {
      lines.push(`Kleur: ${escapeHtml(input.order.color)}`);
    }
    lines.push(`<strong>Totaal: ${formatEuro(total)}</strong>`);
```

and use `lines.join("<br>")` where the old array was joined.

Extend `OwnerNotificationInput`'s order variant:

```ts
  order?: {
    productName: string;
    unitPrice: number | string;
    quantity: number;
    color?: string;
  };
```

In `ownerNotificationEmail`, replace the single `details.push(...)` call in the `if (input.order)` branch with (color line sits between `Aantal` and `Prijs per stuk`):

```ts
    details.push(
      `Product: ${escapeHtml(input.order.productName)}`,
      `Aantal: ${input.order.quantity}`
    );
    if (input.order.color) {
      details.push(`Kleur: ${escapeHtml(input.order.color)}`);
    }
    details.push(
      `Prijs per stuk: ${formatEuro(input.order.unitPrice)}`,
      `<strong>Totaal: ${formatEuro(total)}</strong>`
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/email/templates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates.ts lib/email/templates.test.ts
git commit -m "feat: order emails include the chosen filament color"
```

---

### Task 5: ColorPicker component + product detail page

**Files:**
- Create: `components/color-picker.tsx`
- Create: `app/modellen/[id]/order-panel.tsx`
- Modify: `app/modellen/[id]/page.tsx`

**Interfaces:**
- Consumes: `FilamentColor`, `DEFAULT_COLOR_ID`, `OUT_OF_STOCK_NOTE`, `lineLabel`, `isNearWhite` from `lib/colors` (Task 2); `ButtonLink` from `components/ui/button`.
- Produces: `ColorPicker({ colors, selectedId, onSelect })` client component (Task 6 reuses it); `OrderPanel({ productId, colors })` client component. No unit tests (components; house rule tests pure functions only).

- [ ] **Step 1: Create `components/color-picker.tsx`**

```tsx
"use client";

import {
  isNearWhite,
  lineLabel,
  OUT_OF_STOCK_NOTE,
  type FilamentColor,
} from "@/lib/colors";

// Bambu-style rows of round swatches, grouped per filament line. Controlled
// component: the parent owns the selected id (product page → Bestellen link,
// order form → hidden field). Public pages are light-mode only.
export function ColorPicker({
  colors,
  selectedId,
  onSelect,
}: {
  colors: FilamentColor[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (colors.length === 0) return null;
  const selected = colors.find((color) => color.id === selectedId);
  return (
    <div className="flex flex-col gap-3">
      {(["basic", "matte"] as const).map((line) => {
        const group = colors.filter((color) => color.line === line);
        if (group.length === 0) return null;
        return (
          <div key={line}>
            <p className="text-sm font-medium text-slate-700">
              {lineLabel(line)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {group.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => onSelect(color.id)}
                  title={color.name}
                  aria-label={`${lineLabel(line)} ${color.name}`}
                  aria-pressed={color.id === selectedId}
                  className={`h-7 w-7 rounded-full transition-shadow ${
                    isNearWhite(color.hex) ? "border border-slate-300" : ""
                  } ${
                    color.id === selectedId
                      ? "ring-2 ring-violet-600 ring-offset-2"
                      : "hover:ring-2 hover:ring-violet-300 hover:ring-offset-2"
                  }`}
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
          </div>
        );
      })}
      {selected && (
        <p className="text-sm">
          <span className="font-medium text-slate-900">
            {lineLabel(selected.line)} – {selected.name}
          </span>{" "}
          {selected.available ? (
            <span className="text-green-700">Op voorraad</span>
          ) : (
            <span className="block text-amber-700">{OUT_OF_STOCK_NOTE}</span>
          )}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/modellen/[id]/order-panel.tsx`**

```tsx
"use client";

import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ColorPicker } from "@/components/color-picker";
import { DEFAULT_COLOR_ID, type FilamentColor } from "@/lib/colors";

// Color choice + Bestellen button. Client component because the chosen
// color must ride along in the order link. With an empty color list (fetch
// failure) the picker hides and the link degrades to the pre-color URL.
export function OrderPanel({
  productId,
  colors,
}: {
  productId: string;
  colors: FilamentColor[];
}) {
  const [colorId, setColorId] = useState(DEFAULT_COLOR_ID);
  const href =
    colors.length > 0
      ? `/aanvraag?product=${productId}&color=${colorId}`
      : `/aanvraag?product=${productId}`;
  return (
    <>
      <ColorPicker colors={colors} selectedId={colorId} onSelect={setColorId} />
      <ButtonLink href={href} size="lg" className="mt-2 self-start">
        Bestellen
      </ButtonLink>
    </>
  );
}
```

- [ ] **Step 3: Wire into `app/modellen/[id]/page.tsx`**

1. Add imports:

```tsx
import { OrderPanel } from "./order-panel";
import type { FilamentColor } from "@/lib/colors";
```

2. Remove the now-unused `ButtonLink` import (it moves into OrderPanel).

3. In `ProductDetailPage`, after `if (!product) notFound();`, fetch the colors:

```tsx
  // Color palette for the picker. A fetch error degrades to no picker rather
  // than a broken page; the order form falls back to default black.
  const supabase = await createClient();
  const { data: colorRows } = await supabase
    .from("filament_colors")
    .select("id, line, name, hex, available")
    .order("line")
    .order("sort_order");
  const colors: FilamentColor[] = colorRows ?? [];
```

4. Replace the `<ButtonLink href={`/aanvraag?product=${product.id}`} ...>Bestellen</ButtonLink>` block with:

```tsx
            <OrderPanel productId={product.id} colors={colors} />
```

- [ ] **Step 4: Verify lint passes**

Run: `npm run lint`
Expected: no errors in the three touched files (build-wide `tsc` failures from Task 3's `RequestInput` change surface via `next build`, not eslint — ignore until Task 7).

- [ ] **Step 5: Commit**

```bash
git add components/color-picker.tsx "app/modellen/[id]/order-panel.tsx" "app/modellen/[id]/page.tsx"
git commit -m "feat: color swatch picker on the product detail page"
```

---

### Task 6: Order form — picker replaces free-text Kleur for catalog

**Files:**
- Modify: `app/aanvraag/page.tsx`
- Modify: `app/aanvraag/request-form.tsx`

**Interfaces:**
- Consumes: `ColorPicker` (Task 5), `resolveColorId` + `FilamentColor` (Task 2), `RequestInput.colorId` (Task 3).
- Produces: `RequestForm` props gain `colors: FilamentColor[]` and `initialColorId: string`. FormData field `colorId` (hidden input) that Task 7's server action reads.

- [ ] **Step 1: Fetch colors and resolve the URL param in `app/aanvraag/page.tsx`**

1. Add imports:

```tsx
import { resolveColorId, type FilamentColor } from "@/lib/colors";
```

2. Destructure `color` too:

```tsx
  const { product, type, color } = await searchParams;
```

3. After the products query, fetch colors (error → empty list; the form still submits the default id and the server resolves it):

```tsx
  const { data: colorRows } = await supabase
    .from("filament_colors")
    .select("id, line, name, hex, available")
    .order("line")
    .order("sort_order");
  const colors: FilamentColor[] = colorRows ?? [];
  // Unknown ?color= id: silently fall back to default black, same posture
  // as ?product= and ?type=.
  const initialColorId = resolveColorId(color, colors);
```

4. Pass both to the form:

```tsx
              <RequestForm
                products={productList}
                preselectedProductId={preselected}
                initialType={initialType}
                colors={colors}
                initialColorId={initialColorId}
              />
```

- [ ] **Step 2: Integrate the picker in `app/aanvraag/request-form.tsx`**

1. Add imports:

```tsx
import { ColorPicker } from "@/components/color-picker";
import type { FilamentColor } from "@/lib/colors";
```

2. Extend the component props:

```tsx
export function RequestForm({
  products,
  preselectedProductId,
  initialType,
  colors,
  initialColorId,
}: {
  products: ProductOption[];
  preselectedProductId: string;
  initialType: FormType | "";
  colors: FilamentColor[];
  initialColorId: string;
}) {
```

3. Add state next to the other `useState` calls:

```tsx
  const [colorId, setColorId] = useState(initialColorId);
```

4. Inside the `{type === "catalog" && (<>...</>)}` block, directly after the fixed-price panel's closing `)}`, add the picker. The hidden input renders even when the color list failed to load, so a catalog submit always carries the (default) id:

```tsx
            <div className="flex flex-col gap-1.5">
              <input type="hidden" name="colorId" value={colorId} />
              {colors.length > 0 && (
                <>
                  <span className="text-sm font-medium text-slate-700">
                    Kleur
                  </span>
                  <ColorPicker
                    colors={colors}
                    selectedId={colorId}
                    onSelect={setColorId}
                  />
                </>
              )}
              {errors.colorId && (
                <p className="text-sm text-red-600">{errors.colorId}</p>
              )}
            </div>
```

5. The free-text Kleur field becomes file/custom-only. In the `grid gap-4 sm:grid-cols-2` div, replace:

```tsx
          <Field label="Kleur (optioneel)">
            <Input type="text" name="color" />
          </Field>
```

with:

```tsx
          {(type === "file" || type === "custom") && (
            <Field label="Kleur (optioneel)">
              <Input type="text" name="color" />
            </Field>
          )}
```

6. In `handleSubmit`, add `colorId` to the `RequestInput` object (after `licenseAccepted`):

```tsx
      colorId: String(formData.get("colorId") ?? ""),
```

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/aanvraag/page.tsx app/aanvraag/request-form.tsx
git commit -m "feat: color picker in the order form for catalog requests"
```

---

### Task 7: Server action — resolve the color id, store the snapshot

**Files:**
- Modify: `app/aanvraag/actions.ts`

**Interfaces:**
- Consumes: `formatColorSnapshot` (Task 2), `result.data.colorId` (Task 3), `color?` fields on the email inputs (Task 4), FormData field `colorId` (Task 6).
- Produces: `requests.color` holds the snapshot string for catalog orders; both emails receive it.

- [ ] **Step 1: Implement the lookup**

1. Add import:

```ts
import { formatColorSnapshot } from "@/lib/colors";
```

2. In the `validateRequest({...})` call, add after `licenseAccepted`:

```ts
    colorId: String(formData.get("colorId") ?? ""),
```

3. After the product-lookup block (the `if (result.data.type === "catalog") { ... }` that sets `unitPrice`/`productName`), add:

```ts
  // Same trust rule as the price: the browser sends only a color id, the
  // server resolves name and availability itself. The snapshot string is
  // point-in-time — later stock changes never rewrite this order.
  let colorSnapshot: string | null = null;
  if (result.data.type === "catalog") {
    const { data: color, error: colorError } = await supabase
      .from("filament_colors")
      .select("line, name, available")
      .eq("id", result.data.colorId!)
      .maybeSingle();
    if (colorError) {
      return { errors: { form: GENERIC_ERROR } };
    }
    if (!color) {
      return { errors: { colorId: "Kies een kleur." } };
    }
    colorSnapshot = formatColorSnapshot(color);
  }
```

4. In the `requests` insert, change the `color` line to:

```ts
    color: colorSnapshot ?? result.data.color,
```

5. In the `sendConfirmationEmail` call, extend the order object:

```ts
    order:
      unitPrice !== null
        ? {
            unitPrice,
            quantity: result.data.quantity,
            color: colorSnapshot ?? undefined,
          }
        : undefined,
```

6. In the `sendNewRequestNotification` call, extend its order object the same way:

```ts
    order:
      unitPrice !== null
        ? {
            productName,
            unitPrice,
            quantity: result.data.quantity,
            color: colorSnapshot ?? undefined,
          }
        : undefined,
```

- [ ] **Step 2: Run the full suite and lint**

Run: `npm test` then `npm run lint`
Expected: both PASS — the `RequestInput` type is now satisfied everywhere.

- [ ] **Step 3: Commit**

```bash
git add app/aanvraag/actions.ts
git commit -m "feat: resolve catalog color server-side and snapshot it on the order"
```

---

### Task 8: Admin — /admin/kleuren toggle page + nav link

**Files:**
- Create: `app/admin/(protected)/kleuren/page.tsx`
- Create: `app/admin/(protected)/kleuren/actions.ts`
- Create: `app/admin/(protected)/kleuren/color-toggle.tsx`
- Modify: `app/admin/(protected)/admin-nav.tsx`

**Interfaces:**
- Consumes: `FilamentColor`, `lineLabel`, `isNearWhite` (Task 2); `Card` from `components/ui/card`; admin auth via the `(protected)` layout (nothing to do).
- Produces: `toggleColorAvailability(colorId: string, available: boolean): Promise<{ ok: boolean }>` server action.

- [ ] **Step 1: Create `app/admin/(protected)/kleuren/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ToggleResult = { ok: boolean };

// Flip a color's op-voorraad flag. RLS restricts UPDATE to the admin, so a
// non-admin call updates zero rows and reports failure.
export async function toggleColorAvailability(
  colorId: string,
  available: boolean
): Promise<ToggleResult> {
  if (!colorId) {
    return { ok: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("filament_colors")
    .update({ available })
    .eq("id", colorId)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false };
  }
  // The picker renders on every product page and in the order form.
  revalidatePath("/aanvraag");
  revalidatePath("/modellen");
  revalidatePath("/modellen/[id]", "page");
  revalidatePath("/admin/kleuren");
  return { ok: true };
}
```

- [ ] **Step 2: Create `app/admin/(protected)/kleuren/color-toggle.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { toggleColorAvailability } from "./actions";

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

// One button per color row. The server action revalidates the page, so the
// fresh `available` prop arrives via the RSC refresh — no local mirror state.
export function ColorToggle({
  colorId,
  available,
}: {
  colorId: string;
  available: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-3">
      {error && (
        <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await toggleColorAvailability(colorId, !available);
            if (!result.ok) {
              setError(GENERIC_ERROR);
            }
          })
        }
        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          available
            ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25"
            : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        }`}
      >
        {available ? "Op voorraad" : "Niet op voorraad"}
      </button>
    </span>
  );
}
```

- [ ] **Step 3: Create `app/admin/(protected)/kleuren/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { isNearWhite, lineLabel, type FilamentColor } from "@/lib/colors";
import { ColorToggle } from "./color-toggle";

export const metadata = { title: "Kleuren" };

export default async function AdminColorsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("filament_colors")
    .select("id, line, name, hex, available")
    .order("line")
    .order("sort_order");

  if (error) {
    return <p className="text-red-700 dark:text-red-400">{error.message}</p>;
  }
  const colors: FilamentColor[] = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Kleuren
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Zet een kleur op &ldquo;op voorraad&rdquo; als je de filament in huis
          hebt. Kleuren die niet op voorraad zijn blijven bestelbaar, met een
          langere levertijd.
        </p>
      </div>
      {(["basic", "matte"] as const).map((line) => {
        const group = colors.filter((color) => color.line === line);
        if (group.length === 0) return null;
        return (
          <Card key={line} className="overflow-hidden p-0">
            <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              {lineLabel(line)}
            </h2>
            <ul>
              {group.map((color) => (
                <li
                  key={color.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0 dark:border-slate-800"
                >
                  <span
                    className={`h-6 w-6 shrink-0 rounded-full ${
                      isNearWhite(color.hex)
                        ? "border border-slate-300 dark:border-slate-600"
                        : ""
                    }`}
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="flex-1 text-sm text-slate-900 dark:text-slate-100">
                    {color.name}
                  </span>
                  <ColorToggle colorId={color.id} available={color.available} />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Add the nav link in `app/admin/(protected)/admin-nav.tsx`**

```ts
const LINKS = [
  { href: "/admin", label: "Aanvragen" },
  { href: "/admin/producten", label: "Producten" },
  { href: "/admin/kleuren", label: "Kleuren" },
] as const;
```

- [ ] **Step 5: Lint and commit**

Run: `npm run lint`
Expected: PASS.

```bash
git add "app/admin/(protected)/kleuren" "app/admin/(protected)/admin-nav.tsx"
git commit -m "feat: admin kleuren page with op-voorraad toggles"
```

---

### Task 9: Full verification

**Files:** none new.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites PASS (colors, requests validation, products validation, email templates, format, status).

- [ ] **Step 2: Lint and production build**

Run: `npm run lint` then `npm run build`
Expected: both succeed with zero errors. The build is the first full typecheck since Task 3 — any `colorId` type slips surface here.

- [ ] **Step 3: Commit any stragglers**

Only if fixes were needed in Step 1–2.

- [ ] **Step 4: Report the manual rollout steps (do not perform them)**

Tell the owner, verbatim:

1. Run `supabase/migrations/0008_filament_colors.sql` once in the Supabase web SQL editor (purely additive — safe to run before the deploy).
2. Deploy the site (push to main → Vercel).
3. On `/admin/kleuren`, toggle the colors you have in house to "Op voorraad" (at minimum PLA Basic Black).
4. Smoke test: open a product page → swatches show, black preselected → pick an out-of-stock color → note appears → Bestellen → form shows the same color → submit → admin detail + both emails show e.g. `PLA Matte – Charcoal (niet op voorraad — langere levertijd)`.
