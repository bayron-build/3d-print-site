# Phase 6 — Landing Page, Catalog & Product Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public Dutch landing page + `/modellen` catalog + `/modellen/[id]` detail pages, plus admin product CRUD with photo upload, per the approved spec `docs/superpowers/specs/2026-07-13-phase-6-landing-catalog-design.md`.

**Architecture:** Server components + server actions like Phases 2–5. Product photos upload browser → new **public** Storage bucket `product-photos` (admin-only write via `public.is_admin()` policies); public pages build plain CDN URLs, no signing. Pure logic (product validation, photo rules, euro formatting) lives in `lib/` with Vitest.

**Tech Stack:** Next.js 16.2.10 (App Router), TypeScript, Tailwind v4, `@supabase/ssr`, Vitest. **No new npm dependencies.**

## Global Constraints

- UI text Dutch; code, comments, identifiers English.
- **This is not the Next.js you know** (AGENTS.md): read the relevant guide in `node_modules/next/dist/docs/` before writing route/action code. Known Phase 2–5 gotchas: `params` and `searchParams` are **Promises — await them**; the middleware file is `proxy.ts`, not `middleware.ts`.
- No new npm dependencies. No secret Supabase keys in app code — the publishable key + RLS is the boundary.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (already set).
- Migrations are run-once SQL files executed by the owner in the Supabase web SQL editor (OWNER ACTION) — never assume they ran.
- Tests: `npm test` (vitest run). Every task must leave `npm test` green and, for UI tasks, `npm run build` succeeding.
- Commit after every task with the conventional style used in this repo (`feat:`, `docs:`, `fix:`).
- Branding: site name **PrintCraft**, byline **by Bayron**, indigo accent (Tailwind `indigo-600` on light, `indigo-400` on dark), dark band color `gray-950`.
- Placeholder images `public/images/hero-printer.jpg` and `public/images/dragon.jpg` were already cropped from the mockups and committed during planning — do not regenerate them.
- The design references are `docs/design/mockup-light.png` (overall look) and `docs/design/mockup-dark.png` (hero band look). When in doubt about layout, open them.

---

### Task 1: Migration `0005_product_photos.sql`

**Files:**
- Create: `supabase/migrations/0005_product_photos.sql`

**Interfaces:**
- Produces: public bucket `product-photos` (10MB/file cap) writable only by the admin. Later tasks upload to paths `<productId>/<uuid>.<ext>` and read via `/storage/v1/object/public/product-photos/<path>`.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 6: product catalog photos. Run once in the Supabase web SQL editor,
-- after 0004_status_page.sql.

-- PUBLIC bucket: catalog photos are served straight from the CDN public URL
-- (/storage/v1/object/public/...), no signing. file_size_limit is the
-- server-enforced 10MB cap; app-side checks are convenience only.
-- No MIME allowlist: extension checks live in app code, consistent with
-- request-files.
insert into storage.buckets (id, name, public, file_size_limit)
values ('product-photos', 'product-photos', true, 10485760);

-- Only the admin writes or lists. Public *reads* need no policy: public
-- buckets serve objects at the public URL regardless of RLS. The select
-- policy is for the admin dashboard's list() call (used by the
-- delete-product sweep), not for visitors.
create policy "Admin insert product-photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_admin());

create policy "Admin read product-photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-photos' and public.is_admin());

create policy "Admin delete product-photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_admin());

-- No update policy: photos are immutable; replace = delete + upload.
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0005_product_photos.sql
git commit -m "feat: product-photos bucket migration with admin-only write"
```

- [ ] **Step 3: OWNER ACTION (async — code tasks may proceed)**

The owner runs `0005_product_photos.sql` in the Supabase web SQL editor. Photo upload cannot be browser-tested until this ran. Note the Phase 2 gotcha: the editor may print "Success. No rows returned" — verify with `select * from storage.buckets where id = 'product-photos';`.

---

### Task 2: Shared euro formatter `lib/format.ts`

**Files:**
- Create: `lib/format.ts`, `lib/format.test.ts`
- Modify: `lib/email/templates.ts` (remove local `formatEuro`, import instead), `lib/email/templates.test.ts` (drop the moved `formatEuro` block + import), `app/aanvraag/request-form.tsx:180-181` (fix raw `€12.5` display)

**Interfaces:**
- Produces: `formatEuro(value: number | string): string` from `@/lib/format` — `formatEuro(1234.5) === "€ 1.234,50"`. All later price displays use it.

- [ ] **Step 1: Write the test (moved + extended)**

Create `lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatEuro } from "./format";

describe("formatEuro", () => {
  it("formats numbers Dutch-style with two decimals", () => {
    expect(formatEuro(12.5)).toBe("€ 12,50");
    expect(formatEuro(0)).toBe("€ 0,00");
    expect(formatEuro(7)).toBe("€ 7,00");
  });

  it("accepts the string form Postgres numeric may arrive in", () => {
    expect(formatEuro("12.50")).toBe("€ 12,50");
  });

  it("groups thousands with a dot", () => {
    expect(formatEuro(1234.5)).toBe("€ 1.234,50");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/format.test.ts`
Expected: FAIL — cannot resolve `./format`.

- [ ] **Step 3: Create `lib/format.ts`** (implementation moved verbatim from `lib/email/templates.ts:9-16`)

```ts
// Dutch money formatting, shared by emails, the catalog and admin pages.

// € 1.234,56 — Dutch grouping and comma decimals. Accepts the string form
// Postgres numeric columns may arrive in.
export function formatEuro(value: number | string): string {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  const [whole, decimals] = amount.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€ ${grouped},${decimals}`;
}
```

- [ ] **Step 4: Point `lib/email/templates.ts` at it**

In `lib/email/templates.ts`: delete the `formatEuro` function (lines 9–16) and its doc comment, and add at the top:

```ts
import { formatEuro } from "@/lib/format";
```

`formatEuro` is no longer exported from templates. In `lib/email/templates.test.ts`: delete the whole `describe("formatEuro", …)` block (lines 25–39) and remove `formatEuro` from the import list.

- [ ] **Step 5: Fix the request form's raw price**

In `app/aanvraag/request-form.tsx` add `import { formatEuro } from "@/lib/format";` and change the product option label (currently lines 180–181):

```tsx
{product.indicative_price !== null &&
  ` (richtprijs ${formatEuro(product.indicative_price)})`}
```

- [ ] **Step 6: Run all tests and build**

Run: `npm test` → all pass (46 existing + 3, minus the moved ones — net 46+0 is fine; the count just must be green).
Run: `npm run build` → succeeds.

- [ ] **Step 7: Commit**

```bash
git add lib/format.ts lib/format.test.ts lib/email/templates.ts lib/email/templates.test.ts app/aanvraag/request-form.tsx
git commit -m "feat: shared Dutch euro formatter, fix raw richtprijs display"
```

---

### Task 3: Product validation + photo helpers (pure, TDD)

**Files:**
- Create: `lib/products/validation.ts`, `lib/products/validation.test.ts`, `lib/products/photos.ts`, `lib/products/photos.test.ts`

**Interfaces:**
- Consumes: `parseFee` from `@/lib/requests/admin-validation` (accepts `""` → null, Dutch comma, max 8 integer digits, 2 decimals).
- Produces:
  - `validateProduct(input: ProductInput): ProductValidationResult` with `ProductInput = { name: string; description: string; indicativePrice: string; active: boolean }` and success data `ValidProduct = { name: string; description: string | null; indicativePrice: number | null; active: boolean }`; error shape `{ ok: false; errors: Record<string, string> }`.
  - `validatePhotos(existingCount: number, files: PhotoMeta[]): string | null` (`null` = OK), `PhotoMeta = { name: string; sizeBytes: number }`.
  - Constants `MAX_PHOTOS = 6`, `MAX_PHOTO_BYTES = 10 * 1024 * 1024`, `PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"]`, helper `extensionOf(name: string): string` (lowercased, `""` when no dot).
  - `priceToInput(value: number | string | null): string` — DB numeric → Dutch comma string for form inputs.
  - `productPhotoUrl(path: string): string` from `@/lib/products/photos`.

- [ ] **Step 1: Write the failing tests**

Create `lib/products/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  extensionOf,
  priceToInput,
  validatePhotos,
  validateProduct,
  type ProductInput,
} from "./validation";

function input(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Vaas",
    description: "",
    indicativePrice: "",
    active: true,
    ...overrides,
  };
}

describe("validateProduct", () => {
  it("accepts a minimal product and nulls empty optionals", () => {
    const result = validateProduct(input());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        name: "Vaas",
        description: null,
        indicativePrice: null,
        active: true,
      });
    }
  });

  it("parses a Dutch comma price and trims fields", () => {
    const result = validateProduct(
      input({ name: "  Vaas  ", description: " mooi ", indicativePrice: "12,50" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Vaas");
      expect(result.data.description).toBe("mooi");
      expect(result.data.indicativePrice).toBe(12.5);
    }
  });

  it("rejects a blank name", () => {
    const result = validateProduct(input({ name: "   " }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBeDefined();
  });

  it("rejects a name over 120 characters", () => {
    const result = validateProduct(input({ name: "x".repeat(121) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBeDefined();
  });

  it("rejects an invalid price but keeps other fields' errors independent", () => {
    const result = validateProduct(input({ indicativePrice: "abc" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.indicativePrice).toBeDefined();
  });
});

describe("validatePhotos", () => {
  const photo = (name: string, sizeBytes = 1024) => ({ name, sizeBytes });

  it("accepts a valid batch", () => {
    expect(validatePhotos(0, [photo("a.jpg"), photo("b.PNG")])).toBeNull();
  });

  it("rejects an empty selection", () => {
    expect(validatePhotos(0, [])).toMatch(/foto/i);
  });

  it("rejects when the total would exceed the maximum", () => {
    const files = [photo("a.jpg"), photo("b.jpg")];
    expect(validatePhotos(MAX_PHOTOS - 1, files)).toMatch(/maximaal/i);
  });

  it("rejects disallowed extensions and extensionless names", () => {
    expect(validatePhotos(0, [photo("model.stl")])).toMatch(/jpg/i);
    expect(validatePhotos(0, [photo("geen-extensie")])).toMatch(/jpg/i);
  });

  it("rejects oversized files", () => {
    expect(validatePhotos(0, [photo("a.jpg", MAX_PHOTO_BYTES + 1)])).toMatch(/10/);
  });
});

describe("extensionOf", () => {
  it("lowercases and handles missing dots", () => {
    expect(extensionOf("Foto.JPG")).toBe(".jpg");
    expect(extensionOf("archive.tar.gz")).toBe(".gz");
    expect(extensionOf("nodot")).toBe("");
  });
});

describe("priceToInput", () => {
  it("renders DB numerics with a Dutch comma and null as empty", () => {
    expect(priceToInput(12.5)).toBe("12,5");
    expect(priceToInput("12.50")).toBe("12,50");
    expect(priceToInput(null)).toBe("");
  });
});
```

Create `lib/products/photos.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { productPhotoUrl } from "./photos";

describe("productPhotoUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("builds the public bucket URL for a storage path", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(productPhotoUrl("abc/1.jpg")).toBe(
      "https://example.supabase.co/storage/v1/object/public/product-photos/abc/1.jpg"
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run lib/products`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/products/validation.ts`**

```ts
// Pure validation for the admin product form and photo uploads. No I/O —
// unit-testable and shared by client (pre-upload checks) and server actions.
// Mirrors lib/requests/admin-validation.ts.

import { parseFee } from "@/lib/requests/admin-validation";

export const MAX_PHOTOS = 6;
// Keep in sync with the bucket's file_size_limit in 0005_product_photos.sql.
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export type ProductInput = {
  name: string;
  description: string;
  indicativePrice: string;
  active: boolean;
};

export type ValidProduct = {
  name: string;
  description: string | null;
  indicativePrice: number | null;
  active: boolean;
};

export type ProductValidationResult =
  | { ok: true; data: ValidProduct }
  | { ok: false; errors: Record<string, string> };

export function validateProduct(input: ProductInput): ProductValidationResult {
  const errors: Record<string, string> = {};

  const name = input.name.trim();
  if (name === "") {
    errors.name = "Vul een naam in.";
  } else if (name.length > 120) {
    errors.name = "Gebruik maximaal 120 tekens.";
  }

  const price = parseFee(input.indicativePrice);
  if (!price.ok) {
    errors.indicativePrice =
      "Vul een geldig bedrag in (bijv. 12,50) of laat leeg.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name,
      description: input.description.trim() || null,
      indicativePrice: price.ok ? price.value : null,
      active: input.active,
    },
  };
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export type PhotoMeta = { name: string; sizeBytes: number };

// Dutch error message, or null when the batch may upload.
export function validatePhotos(
  existingCount: number,
  files: PhotoMeta[]
): string | null {
  if (files.length === 0) {
    return "Kies eerst één of meer foto's.";
  }
  if (existingCount + files.length > MAX_PHOTOS) {
    return `Maximaal ${MAX_PHOTOS} foto's per product.`;
  }
  for (const file of files) {
    if (!PHOTO_EXTENSIONS.includes(extensionOf(file.name))) {
      return "Alleen .jpg, .jpeg, .png of .webp bestanden.";
    }
    if (file.sizeBytes > MAX_PHOTO_BYTES) {
      return "Foto's mogen maximaal 10MB zijn.";
    }
  }
  return null;
}

// Postgres numeric arrives as string or number; the form edits it with a
// Dutch comma. Same idea as the quote form's feeToInput.
export function priceToInput(value: number | string | null): string {
  if (value === null) return "";
  return String(value).replace(".", ",");
}
```

- [ ] **Step 4: Implement `lib/products/photos.ts`**

```ts
// The product-photos bucket is public: objects are served from a
// predictable CDN URL, no signing. Usable from server and client
// components (NEXT_PUBLIC_ env vars are inlined client-side).

export function productPhotoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-photos/${path}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add lib/products
git commit -m "feat: product and photo validation with photo URL helper"
```

---

### Task 4: Branding — `lib/site.ts`, `SiteHeader`, `SiteFooter`, root metadata

**Files:**
- Create: `lib/site.ts`, `components/site-header.tsx`, `components/site-footer.tsx`
- Modify: `app/layout.tsx:15-19` (metadata)

**Interfaces:**
- Produces: `SITE_NAME`, `SITE_BYLINE`, `SITE_EMAIL`, `SITE_TAGLINE` from `@/lib/site`; `<SiteHeader variant?: "dark" | "light" />` and `<CubeLogo className?>` from `@/components/site-header`; `<SiteFooter />` from `@/components/site-footer`. Later tasks wrap pages as `<div className="flex min-h-screen flex-col"><SiteHeader/><main className="flex-1 …">…</main><SiteFooter/></div>`.

- [ ] **Step 1: Create `lib/site.ts`**

```ts
// Central place for public-site branding and copy constants.
// The owner edits wording here without touching components.

export const SITE_NAME = "PrintCraft";
export const SITE_BYLINE = "by Bayron";
export const SITE_EMAIL = "bayuronald@hotmail.com";
export const SITE_TAGLINE =
  "Custom 3D-prints voor onderdelen, prototypes en creatieve ideeën.";
```

- [ ] **Step 2: Create `components/site-header.tsx`**

```tsx
import Link from "next/link";
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

// Public-site header. `dark` sits on the landing page's dark hero band;
// `light` is for all other public pages. Mobile shows logo + CTA only
// (no hamburger menu in v1).
export function SiteHeader({
  variant = "light",
}: {
  variant?: "dark" | "light";
}) {
  const dark = variant === "dark";
  return (
    <header
      className={
        dark
          ? "bg-gray-950 text-white"
          : "border-b border-gray-200 bg-white text-gray-900"
      }
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <CubeLogo
            className={`h-8 w-8 ${dark ? "text-indigo-400" : "text-indigo-600"}`}
          />
          <span className="flex flex-col leading-tight">
            <span className="font-bold">{SITE_NAME}</span>
            <span
              className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}
            >
              {SITE_BYLINE}
            </span>
          </span>
        </Link>
        <nav
          className={`hidden items-center gap-6 text-sm sm:flex ${
            dark ? "text-gray-300" : "text-gray-600"
          }`}
        >
          <Link href="/modellen" className="hover:underline">
            Modellen
          </Link>
          <Link href="/#hoe-het-werkt" className="hover:underline">
            Hoe het werkt
          </Link>
          <Link href="/#contact" className="hover:underline">
            Contact
          </Link>
        </nav>
        <Link
          href="/aanvraag"
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Offerte aanvragen
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `components/site-footer.tsx`**

```tsx
import Link from "next/link";
import { CubeLogo } from "./site-header";
import { SITE_BYLINE, SITE_EMAIL, SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Links only to pages that exist — no dead FAQ/privacy links (spec).
export function SiteFooter() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 sm:flex-row sm:justify-between">
        <div className="flex max-w-xs flex-col gap-2">
          <span className="flex items-center gap-2">
            <CubeLogo className="h-6 w-6 text-indigo-600" />
            <span className="font-bold">
              {SITE_NAME}{" "}
              <span className="text-xs font-normal text-gray-500">
                {SITE_BYLINE}
              </span>
            </span>
          </span>
          <p className="text-sm text-gray-600">{SITE_TAGLINE}</p>
        </div>
        <nav className="flex flex-col gap-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">Ontdek</span>
          <Link href="/modellen" className="hover:underline">
            Modellen
          </Link>
          <Link href="/aanvraag" className="hover:underline">
            Aanvraag indienen
          </Link>
        </nav>
        <div className="flex flex-col gap-2 text-sm text-gray-600">
          <span className="font-medium text-gray-900">Contact</span>
          <a href={`mailto:${SITE_EMAIL}`} className="hover:underline">
            {SITE_EMAIL}
          </a>
        </div>
      </div>
      <p className="border-t border-gray-200 py-4 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} {SITE_NAME} {SITE_BYLINE}
      </p>
    </footer>
  );
}
```

- [ ] **Step 4: Update root metadata** in `app/layout.tsx` (replace the current `metadata` export):

```ts
export const metadata: Metadata = {
  title: {
    default: "PrintCraft by Bayron — 3D-printservice",
    template: "%s — PrintCraft",
  },
  description:
    "Lokale 3D-printservice: bestel uit de catalogus, upload je eigen ontwerp of vraag een ontwerp op maat aan.",
};
```

- [ ] **Step 5: Verify**

Run: `npm run build` → succeeds (components are compiled even if not yet imported anywhere).

- [ ] **Step 6: Commit**

```bash
git add lib/site.ts components/site-header.tsx components/site-footer.tsx app/layout.tsx
git commit -m "feat: PrintCraft branding with shared site header and footer"
```

---

### Task 5: `/aanvraag` — `?type=` pre-selection + header/footer

**Files:**
- Modify: `app/aanvraag/page.tsx`, `app/aanvraag/request-form.tsx:24-44`, `app/aanvraag/verzonden/page.tsx`

**Interfaces:**
- Consumes: `SiteHeader`/`SiteFooter` (Task 4).
- Produces: `/aanvraag?type=file|custom|catalog` pre-selects the radio; `?product=` still implies `catalog` and wins. `RequestForm` gains prop `initialType: "" | "catalog" | "file" | "custom"`.

- [ ] **Step 1: Export `FormType` and accept `initialType` in `app/aanvraag/request-form.tsx`**

Change line 24 from `type FormType = …` to:

```ts
export type FormType = "catalog" | "file" | "custom";
```

Change the component signature and the `useState` initializer (currently lines 32–45):

```tsx
export function RequestForm({
  products,
  preselectedProductId,
  initialType,
}: {
  products: ProductOption[];
  preselectedProductId: string;
  initialType: FormType | "";
}) {
  const [state, formAction, actionPending] = useActionState(
    submitRequest,
    initialState
  );
  // ?product= implies catalog and wins over ?type=; default stays "file".
  const [type, setType] = useState<FormType>(
    preselectedProductId ? "catalog" : initialType || "file"
  );
```

- [ ] **Step 2: Parse `?type=` and add header/footer in `app/aanvraag/page.tsx`** (full new file)

```tsx
import { createClient } from "@/lib/supabase/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { RequestForm, type FormType, type ProductOption } from "./request-form";

export const metadata = { title: "Aanvraag indienen" };

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 16: searchParams is a Promise and must be awaited.
  const { product, type } = await searchParams;
  const supabase = await createClient();

  // RLS already limits anon to active products; the explicit filter keeps
  // the intent visible in code too.
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price")
    .eq("active", true)
    .order("name");

  const productList: ProductOption[] = products ?? [];
  // Unknown or inactive ?product= id: silently ignore, no pre-selection.
  const preselected =
    typeof product === "string" &&
    productList.some((option) => option.id === product)
      ? product
      : "";
  // Unknown ?type= value: silently ignore, same posture as ?product=.
  const initialType: FormType | "" =
    type === "catalog" || type === "file" || type === "custom" ? type : "";

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-8">
        <h1 className="text-3xl font-bold">Aanvraag indienen</h1>
        <p className="text-gray-600">
          Vertel ons wat je wilt laten printen. Je ontvangt per e-mail een
          prijsvoorstel — je betaalt pas na akkoord.
        </p>
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
      </main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 3: Header/footer on `app/aanvraag/verzonden/page.tsx`** (full new file)

```tsx
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Aanvraag verzonden" };

export default function RequestSentPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Bedankt voor je aanvraag!</h1>
        <p className="max-w-md text-gray-600">
          We bekijken je aanvraag en nemen zo snel mogelijk per e-mail contact
          met je op met een prijsvoorstel.
        </p>
        <Link href="/" className="underline">
          Terug naar de homepagina
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm test` → green. `npm run build` → succeeds.
Manual (dev server): `/aanvraag?type=custom` shows "Eigen ontwerp" selected; `/aanvraag` still defaults to "Print mijn bestand"; `/aanvraag?type=nonsense` also defaults to file; header and footer render on both pages.

- [ ] **Step 5: Commit**

```bash
git add app/aanvraag
git commit -m "feat: request form type pre-selection and public chrome on form pages"
```

---

### Task 6: `ProductCard` + landing page

**Files:**
- Create: `components/product-card.tsx`
- Modify: `app/page.tsx` (full rebuild)

**Interfaces:**
- Consumes: `formatEuro`, `productPhotoUrl`, `SiteHeader` (dark), `SiteFooter`, `CubeLogo`, `SITE_EMAIL`; static images `public/images/hero-printer.jpg`, `public/images/dragon.jpg`.
- Produces: `<ProductCard product={ProductSummary} />` with `ProductSummary = { id: string; name: string; indicative_price: number | string | null; photos: string[] }` — reused by Task 7's catalog.

- [ ] **Step 1: Create `components/product-card.tsx`**

```tsx
import Link from "next/link";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";
import { CubeLogo } from "./site-header";

export type ProductSummary = {
  id: string;
  name: string;
  indicative_price: number | string | null;
  photos: string[];
};

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link
      href={`/modellen/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="aspect-square w-full bg-gray-100">
        {product.photos.length > 0 ? (
          // Plain <img>: Supabase already serves these from its CDN;
          // next/image remote config would add setup for little gain here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={productPhotoUrl(product.photos[0])}
            alt={product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <CubeLogo className="h-12 w-12 text-gray-300" />
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-2 p-3">
        <span className="text-sm font-medium">{product.name}</span>
        {product.indicative_price !== null && (
          <span className="shrink-0 text-sm text-gray-500">
            Vanaf {formatEuro(product.indicative_price)}
          </span>
        )}
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Rebuild `app/page.tsx`** (full new file — replaces the placeholder)

```tsx
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_EMAIL } from "@/lib/site";
import dragon from "@/public/images/dragon.jpg";
import heroPrinter from "@/public/images/hero-printer.jpg";

// Matches the real pipeline: manual quote by email, Akkoord on the status
// page, pickup with bank transfer/Tikkie.
const STEPS = [
  ["Contact", "Stuur je idee, bestand of aanvraag via het formulier."],
  ["Offerte", "Je ontvangt per e-mail een prijsvoorstel."],
  ["Printen", "Na jouw akkoord wordt je opdracht met zorg geprint."],
  ["Levering", "Ophalen of bezorgen; betalen per bankoverschrijving of Tikkie."],
] as const;

const TRUST_BADGES = [
  "Hoge kwaliteit",
  "Ruime materiaalkeuze",
  "Snelle reactie",
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
      <SiteHeader variant="dark" />

      {/* Dark hero band — the owner's requested contrast: dark top, white rest. */}
      <section className="bg-gray-950 text-white">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-6">
            <h1 className="text-4xl font-bold sm:text-5xl">
              Iets nodig in <span className="text-indigo-400">3D print</span>?
            </h1>
            <p className="text-lg text-gray-300">
              Upload je eigen bestand, vraag een custom ontwerp aan of kies uit
              kant-en-klare modellen. Hoge kwaliteit, snel geregeld, lokaal
              gemaakt.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/aanvraag?type=file"
                className="rounded bg-indigo-600 px-5 py-3 font-medium hover:bg-indigo-500"
              >
                Upload je bestand
              </Link>
              <Link
                href="/aanvraag?type=custom"
                className="rounded border border-gray-600 px-5 py-3 font-medium hover:border-gray-400"
              >
                Custom ontwerp aanvragen
              </Link>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-300">
              {TRUST_BADGES.map((badge) => (
                <li key={badge} className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-indigo-400">✓</span>
                  {badge}
                </li>
              ))}
            </ul>
          </div>
          <Image
            src={heroPrinter}
            alt="3D-printer die een vaas print"
            priority
            className="hidden rounded-lg lg:block"
          />
        </div>
      </section>

      <main className="flex-1">
        <section id="hoe-het-werkt" className="mx-auto w-full max-w-6xl px-6 py-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
            Hoe het werkt
          </p>
          <h2 className="mt-1 text-3xl font-bold">
            Simpel proces, mooi resultaat.
          </h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([title, text], index) => (
              <li key={title} className="flex flex-col gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700">
                  {index + 1}
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-gray-600">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-16">
          <div className="flex flex-col items-center gap-6 rounded-xl bg-indigo-50 p-8 sm:flex-row sm:justify-between">
            <div className="flex max-w-lg flex-col gap-3">
              <h2 className="text-2xl font-bold">Heb je een eigen idee?</h2>
              <p className="text-gray-700">
                Of het nu een prototype, een vervangingsonderdeel of iets
                unieks is — samen maken we het echt.
              </p>
              <Link
                href="/aanvraag?type=custom"
                className="self-start rounded bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500"
              >
                Custom ontwerp aanvragen →
              </Link>
            </div>
            <Image
              src={dragon}
              alt="3D-geprinte paarse draak"
              className="w-40 rounded-lg sm:w-44"
            />
          </div>
        </section>

        <section className="border-t border-gray-100 bg-gray-50">
          <div className="mx-auto w-full max-w-6xl px-6 py-16">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                  Modellen
                </p>
                <h2 className="mt-1 text-3xl font-bold">Klaar om te printen.</h2>
              </div>
              <Link
                href="/modellen"
                className="shrink-0 text-sm font-medium text-indigo-600 hover:underline"
              >
                Bekijk alle modellen →
              </Link>
            </div>
            {error ? (
              <p className="mt-8 text-red-700">{error.message}</p>
            ) : productList.length === 0 ? (
              <p className="mt-8 max-w-xl text-gray-600">
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

        <section id="contact" className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-3xl font-bold">Contact</h2>
          <p className="mt-4 max-w-xl text-gray-600">
            PrintCraft is de 3D-printservice van Bayron — lokaal, in Nederland.
            Vragen of een speciale wens? Mail naar{" "}
            <a
              href={`mailto:${SITE_EMAIL}`}
              className="text-indigo-600 hover:underline"
            >
              {SITE_EMAIL}
            </a>{" "}
            of dien direct een aanvraag in. Betalen kan per bankoverschrijving
            of Tikkie.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build` → succeeds.
Manual (dev server): `/` shows dark hero with printer photo (hidden below `lg`), both CTAs land on the form with the right type selected, anchor links scroll, models section shows the "binnenkort" note when only the test product would qualify or the grid otherwise, footer renders.
Compare against `docs/design/mockup-light.png` for spacing/feel; hero band against `mockup-dark.png`.

- [ ] **Step 4: Commit**

```bash
git add components/product-card.tsx app/page.tsx
git commit -m "feat: PrintCraft landing page with dark hero and models section"
```

---

### Task 7: `/modellen` — catalog page

**Files:**
- Create: `app/modellen/page.tsx`

**Interfaces:**
- Consumes: `ProductCard`/`ProductSummary`, `SiteHeader`, `SiteFooter`.

- [ ] **Step 1: Create `app/modellen/page.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductSummary } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Modellen",
  description:
    "Kant-en-klare 3D-print modellen met richtprijzen — bestel direct of vraag een variant aan.",
};

export default async function ModelsPage() {
  const supabase = await createClient();
  // RLS limits anon to active products; the filter keeps intent visible.
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price, photos")
    .eq("active", true)
    .order("created_at", { ascending: false });
  const productList: ProductSummary[] = products ?? [];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-bold">Modellen</h1>
        <p className="mt-2 max-w-xl text-gray-600">
          Kant-en-klare ontwerpen, geprint op bestelling. De richtprijs is een
          indicatie — je definitieve prijs volgt in de offerte.
        </p>
        {error ? (
          <p className="mt-8 text-red-700">{error.message}</p>
        ) : productList.length === 0 ? (
          <p className="mt-8 max-w-xl text-gray-600">
            De catalogus wordt gevuld — binnenkort vind je hier kant-en-klare
            modellen. Een eigen bestand of idee kun je nu al insturen.
          </p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {productList.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run build` → succeeds. Manual: `/modellen` renders grid or empty state; card links to `/modellen/<id>` (404 until Task 8 — expected).

- [ ] **Step 3: Commit**

```bash
git add app/modellen/page.tsx
git commit -m "feat: public catalog page"
```

---

### Task 8: `/modellen/[id]` — product detail page

**Files:**
- Create: `app/modellen/[id]/page.tsx`, `app/modellen/[id]/not-found.tsx`

**Interfaces:**
- Consumes: `formatEuro`, `productPhotoUrl`, `SiteHeader`, `SiteFooter`, `CubeLogo`.
- Produces: "Bestellen" → `/aanvraag?product=<id>` (existing pre-selection).

- [ ] **Step 1: Create `app/modellen/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CubeLogo } from "@/components/site-header";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";

type Product = {
  id: string;
  name: string;
  description: string | null;
  indicative_price: number | string | null;
  photos: string[];
};

// A malformed id makes Postgres error on the uuid cast; treat every failure
// mode (error, unknown id, inactive product) as the same Dutch 404 so
// inactive products' existence never leaks.
async function getProduct(id: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, indicative_price, photos")
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

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

  const [cover, ...rest] = product.photos;

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <Link href="/modellen" className="text-sm text-indigo-600 hover:underline">
          ← Alle modellen
        </Link>
        <div className="mt-6 grid gap-10 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productPhotoUrl(cover)}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <CubeLogo className="h-16 w-16 text-gray-300" />
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
                    className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
                  />
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-bold">{product.name}</h1>
            {product.indicative_price !== null && (
              <p className="text-lg">
                Richtprijs vanaf{" "}
                <span className="font-semibold">
                  {formatEuro(product.indicative_price)}
                </span>
                <span className="block text-sm text-gray-500">
                  De definitieve prijs volgt in je offerte (kleur, materiaal en
                  aantal tellen mee).
                </span>
              </p>
            )}
            {product.description && (
              <p className="whitespace-pre-line text-gray-700">
                {product.description}
              </p>
            )}
            <Link
              href={`/aanvraag?product=${product.id}`}
              className="mt-2 self-start rounded bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-500"
            >
              Bestellen
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 2: Create `app/modellen/[id]/not-found.tsx`**

```tsx
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function ProductNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Model niet gevonden</h1>
        <p className="max-w-md text-gray-600">
          Dit model bestaat niet (meer). Bekijk de andere modellen of dien een
          eigen aanvraag in.
        </p>
        <Link href="/modellen" className="text-indigo-600 underline">
          Naar alle modellen
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build` → succeeds. Manual: detail page of the test product renders (no photos → cube placeholder); `Bestellen` pre-selects it on the form; `/modellen/geen-uuid` and a random UUID both show the Dutch 404.

- [ ] **Step 4: Commit**

```bash
git add app/modellen
git commit -m "feat: product detail page with Dutch 404"
```

---

### Task 9: Admin nav + `/admin/producten` list

**Files:**
- Modify: `app/admin/(protected)/layout.tsx:19-22` (nav links)
- Create: `app/admin/(protected)/producten/page.tsx`

**Interfaces:**
- Consumes: `formatEuro`, `productPhotoUrl`.
- Produces: rows link to `/admin/producten/[id]` (Task 11); "Nieuw product" links to `/admin/producten/nieuw` (Task 10).

- [ ] **Step 1: Add nav links to the admin header**

In `app/admin/(protected)/layout.tsx`, add `import Link from "next/link";` and replace `<span className="font-bold">Beheer</span>` with:

```tsx
<div className="flex items-center gap-6">
  <span className="font-bold">Beheer</span>
  <nav className="flex items-center gap-4 text-sm text-gray-600">
    <Link href="/admin" className="hover:underline">
      Aanvragen
    </Link>
    <Link href="/admin/producten" className="hover:underline">
      Producten
    </Link>
  </nav>
</div>
```

- [ ] **Step 2: Create `app/admin/(protected)/producten/page.tsx`**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/format";
import { productPhotoUrl } from "@/lib/products/photos";

type ProductRow = {
  id: string;
  name: string;
  indicative_price: number | string | null;
  active: boolean;
  photos: string[];
  created_at: string;
};

export default async function AdminProductsPage() {
  const supabase = await createClient();
  // Admin RLS: all products, active or not.
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, indicative_price, active, photos, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return <p className="text-red-700">{error.message}</p>;
  }
  const rows: ProductRow[] = products ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Producten</h1>
        <Link
          href="/admin/producten/nieuw"
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
        >
          Nieuw product
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-600">Nog geen producten.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-4 font-medium">Foto</th>
              <th className="py-2 pr-4 font-medium">Naam</th>
              <th className="py-2 pr-4 font-medium">Richtprijs</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Aangemaakt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id} className="border-b border-gray-100">
                <td className="py-2 pr-4">
                  {product.photos.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={productPhotoUrl(product.photos[0])}
                      alt=""
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <span className="inline-block h-10 w-10 rounded bg-gray-100" />
                  )}
                </td>
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/producten/${product.id}`}
                    className="font-medium text-blue-700 underline"
                  >
                    {product.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">
                  {product.indicative_price !== null
                    ? formatEuro(product.indicative_price)
                    : "—"}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      product.active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {product.active ? "actief" : "inactief"}
                  </span>
                </td>
                <td className="py-2 pr-4">
                  {new Date(product.created_at).toLocaleDateString("nl-NL")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run build` → succeeds. Manual: logged in, `/admin/producten` lists the test product with "actief" badge; logged out it redirects to `/admin/login` (route group gate).

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(protected)/layout.tsx" "app/admin/(protected)/producten/page.tsx"
git commit -m "feat: admin product list with nav link"
```

---

### Task 10: `ProductForm` + create action + `/admin/producten/nieuw`

**Files:**
- Create: `app/admin/(protected)/producten/actions.ts`, `app/admin/(protected)/producten/product-form.tsx`, `app/admin/(protected)/producten/nieuw/page.tsx`

**Interfaces:**
- Consumes: `validateProduct`, `priceToInput` (Task 3), `createClient` from `@/lib/supabase/server`.
- Produces (in `actions.ts`; Tasks 11–12 add more actions to this file):
  - `type ProductFormState = { errors: Record<string, string> | null; ok: boolean }`
  - `createProduct(prev: ProductFormState, formData: FormData): Promise<ProductFormState>` — redirects to `/admin/producten/<id>` on success.
  - `<ProductForm action initial productId? submitLabel />` with `ProductFormValues = { name: string; description: string; indicativePrice: string; active: boolean }`.

- [ ] **Step 1: Create `app/admin/(protected)/producten/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateProduct } from "@/lib/products/validation";

export type ProductFormState = {
  errors: Record<string, string> | null;
  ok: boolean;
};

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

function readProductInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    indicativePrice: String(formData.get("indicativePrice") ?? ""),
    active: formData.get("active") === "on",
  };
}

// Public pages cache per-product and list views; every mutation refreshes
// them all so the catalog never shows stale products.
function revalidateProductPaths(productId?: string) {
  revalidatePath("/");
  revalidatePath("/modellen");
  revalidatePath("/admin/producten");
  if (productId) {
    revalidatePath(`/modellen/${productId}`);
    revalidatePath(`/admin/producten/${productId}`);
  }
}

export async function createProduct(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const result = validateProduct(readProductInput(formData));
  if (!result.ok) {
    return { errors: result.errors, ok: false };
  }

  const supabase = await createClient();
  // RLS restricts INSERT on products to the admin.
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: result.data.name,
      description: result.data.description,
      indicative_price: result.data.indicativePrice,
      active: result.data.active,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  revalidateProductPaths(data.id);
  // Photos are uploaded on the edit page, against the row that now exists.
  redirect(`/admin/producten/${data.id}`);
}
```

- [ ] **Step 2: Create `app/admin/(protected)/producten/product-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import type { ProductFormState } from "./actions";

export type ProductFormValues = {
  name: string;
  description: string;
  indicativePrice: string;
  active: boolean;
};

const initialState: ProductFormState = { errors: null, ok: false };
const inputClass = "rounded border border-gray-300 px-3 py-2";
const labelClass = "flex flex-col gap-1";
const errorClass = "text-sm text-red-700";

// Shared by the create and edit pages; `productId` is only set when editing.
export function ProductForm({
  action,
  initial,
  productId,
  submitLabel,
}: {
  action: (
    state: ProductFormState,
    formData: FormData
  ) => Promise<ProductFormState>;
  initial: ProductFormValues;
  productId?: string;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      {productId && (
        <input type="hidden" name="productId" value={productId} />
      )}

      <label className={labelClass}>
        <span className="text-sm font-medium">Naam</span>
        <input
          type="text"
          name="name"
          defaultValue={initial.name}
          required
          className={inputClass}
        />
        {errors.name && <p className={errorClass}>{errors.name}</p>}
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">Omschrijving (optioneel)</span>
        <textarea
          name="description"
          rows={5}
          defaultValue={initial.description}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">Richtprijs (€, optioneel)</span>
        <input
          type="text"
          name="indicativePrice"
          inputMode="decimal"
          defaultValue={initial.indicativePrice}
          placeholder="bijv. 12,50"
          className={inputClass}
        />
        {errors.indicativePrice && (
          <p className={errorClass}>{errors.indicativePrice}</p>
        )}
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="active"
          defaultChecked={initial.active}
        />
        <span className="text-sm">Actief (zichtbaar in de catalogus)</span>
      </label>

      {errors.form && <p className={errorClass}>{errors.form}</p>}
      {state.ok && <p className="text-sm text-green-700">Opgeslagen.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Bezig…" : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `app/admin/(protected)/producten/nieuw/page.tsx`**

```tsx
import { createProduct } from "../actions";
import { ProductForm } from "../product-form";

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Nieuw product</h1>
      <p className="max-w-xl text-sm text-gray-600">
        Na het aanmaken kom je op de bewerkpagina en kun je foto&apos;s
        uploaden.
      </p>
      <ProductForm
        action={createProduct}
        initial={{ name: "", description: "", indicativePrice: "", active: true }}
        submitLabel="Product aanmaken"
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm test` and `npm run build` → green.
Manual: create a product with price `12,50` → redirected to `/admin/producten/<id>` (404 until Task 11 — the redirect target existing is Task 11's concern; confirm the row appears in the list and, if active, on `/modellen`). Blank name and `abc` price show Dutch field errors.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(protected)/producten"
git commit -m "feat: admin product create with shared product form"
```

---

### Task 11: Edit page + update action

**Files:**
- Modify: `app/admin/(protected)/producten/actions.ts` (add `updateProduct`)
- Create: `app/admin/(protected)/producten/[id]/page.tsx`

**Interfaces:**
- Consumes: `ProductForm`, `priceToInput`, `createProduct`'s state type.
- Produces: `updateProduct(prev: ProductFormState, formData: FormData): Promise<ProductFormState>` (expects hidden `productId`). The edit page later hosts `PhotoManager` (Task 12) and `DeleteProductButton` (Task 13).

- [ ] **Step 1: Add `updateProduct` to `actions.ts`**

```ts
export async function updateProduct(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  const result = validateProduct(readProductInput(formData));
  if (!result.ok) {
    return { errors: result.errors, ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: result.data.name,
      description: result.data.description,
      indicative_price: result.data.indicativePrice,
      active: result.data.active,
    })
    .eq("id", productId);

  if (error) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  revalidateProductPaths(productId);
  return { errors: null, ok: true };
}
```

- [ ] **Step 2: Create `app/admin/(protected)/producten/[id]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { priceToInput } from "@/lib/products/validation";
import { updateProduct } from "../actions";
import { ProductForm } from "../product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16: params is a Promise and must be awaited.
  const { id } = await params;
  const supabase = await createClient();
  const { data: product, error } = await supabase
    .from("products")
    .select("id, name, description, indicative_price, active, photos")
    .eq("id", id)
    .maybeSingle();
  if (error || !product) notFound();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Product bewerken</h1>
      <ProductForm
        action={updateProduct}
        productId={product.id}
        initial={{
          name: product.name,
          description: product.description ?? "",
          indicativePrice: priceToInput(product.indicative_price),
          active: product.active,
        }}
        submitLabel="Opslaan"
      />
      {/* PhotoManager (Task 12) and DeleteProductButton (Task 13) mount here. */}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm test`, `npm run build` → green.
Manual: edit the created product (name, price `15,00`, uncheck Actief) → "Opgeslagen.", list badge flips to "inactief", product disappears from `/modellen` and its public detail page 404s; re-activate → back.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(protected)/producten"
git commit -m "feat: admin product edit with deactivate flow"
```

---

### Task 12: Photo manager (upload + delete photos)

**Files:**
- Modify: `app/admin/(protected)/producten/actions.ts` (add `addProductPhoto`, `deleteProductPhoto`)
- Create: `app/admin/(protected)/producten/[id]/photo-manager.tsx`
- Modify: `app/admin/(protected)/producten/[id]/page.tsx` (mount it)

**Interfaces:**
- Consumes: `validatePhotos`, `extensionOf`, `MAX_PHOTOS`, `PHOTO_EXTENSIONS`, `productPhotoUrl`, browser client `createClient` from `@/lib/supabase/client`.
- Produces: `addProductPhoto(productId: string, path: string): Promise<PhotoActionResult>` and `deleteProductPhoto(productId: string, path: string): Promise<PhotoActionResult>` with `PhotoActionResult = { ok: boolean; message?: string }`.

- [ ] **Step 1: Add the photo actions to `actions.ts`**

```ts
export type PhotoActionResult = { ok: boolean; message?: string };

// The bytes went browser → storage already (10MB photos cannot ride through
// a server action); this only records the path on the product row.
export async function addProductPhoto(
  productId: string,
  path: string
): Promise<PhotoActionResult> {
  // The path must live under this product's folder — reject anything else.
  if (!path.startsWith(`${productId}/`)) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { data: product, error: readError } = await supabase
    .from("products")
    .select("photos")
    .eq("id", productId)
    .maybeSingle();
  if (readError || !product) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const { error } = await supabase
    .from("products")
    .update({ photos: [...product.photos, path] })
    .eq("id", productId);
  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidateProductPaths(productId);
  return { ok: true };
}

// Storage object first, then the array entry: a failed storage delete
// leaves the photo visible (retryable) instead of orphaned-but-invisible.
export async function deleteProductPhoto(
  productId: string,
  path: string
): Promise<PhotoActionResult> {
  const supabase = await createClient();

  const { error: storageError } = await supabase.storage
    .from("product-photos")
    .remove([path]);
  if (storageError) {
    return { ok: false, message: "Kon de foto niet verwijderen." };
  }

  const { data: product, error: readError } = await supabase
    .from("products")
    .select("photos")
    .eq("id", productId)
    .maybeSingle();
  if (readError || !product) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const { error } = await supabase
    .from("products")
    .update({ photos: product.photos.filter((p: string) => p !== path) })
    .eq("id", productId);
  if (error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  revalidateProductPaths(productId);
  return { ok: true };
}
```

- [ ] **Step 2: Create `photo-manager.tsx`**

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_PHOTOS,
  PHOTO_EXTENSIONS,
  extensionOf,
  validatePhotos,
} from "@/lib/products/validation";
import { productPhotoUrl } from "@/lib/products/photos";
import { addProductPhoto, deleteProductPhoto } from "../actions";

// Photos upload browser → storage directly (same reason as the request
// form's model files: server actions cap out around 1MB on Vercel). The
// admin session's JWT satisfies the bucket's is_admin() insert policy.
export function PhotoManager({
  productId,
  photos,
}: {
  productId: string;
  photos: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleUpload() {
    const files = Array.from(inputRef.current?.files ?? []);
    setError(null);

    const validationError = validatePhotos(
      photos.length,
      files.map((file) => ({ name: file.name, sizeBytes: file.size }))
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      for (const file of files) {
        const path = `${productId}/${crypto.randomUUID()}${extensionOf(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from("product-photos")
          .upload(path, file);
        if (uploadError) throw uploadError;
        const result = await addProductPhoto(productId, path);
        if (!result.ok) throw new Error(result.message);
      }
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setError("Uploaden mislukt, probeer het opnieuw.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDelete(path: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteProductPhoto(productId, path);
      if (!result.ok) {
        setError(result.message ?? "Er ging iets mis.");
      }
    });
  }

  const busy = isUploading || isPending;

  return (
    <section className="flex max-w-xl flex-col gap-4">
      <h2 className="text-lg font-semibold">Foto&apos;s</h2>
      <p className="text-sm text-gray-600">
        Max {MAX_PHOTOS} foto&apos;s ({PHOTO_EXTENSIONS.join(", ")}, max 10MB
        per stuk). De eerste foto is de omslagfoto in de catalogus.
      </p>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-4">
          {photos.map((path) => (
            <li key={path} className="flex flex-col gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={productPhotoUrl(path)}
                alt=""
                className="aspect-square w-full rounded border border-gray-200 object-cover"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => handleDelete(path)}
                className="text-sm text-red-700 underline disabled:opacity-50"
              >
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={PHOTO_EXTENSIONS.join(",")}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={handleUpload}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {isUploading ? "Uploaden…" : "Foto's uploaden"}
        </button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 3: Mount it on the edit page**

In `app/admin/(protected)/producten/[id]/page.tsx`, add the import and replace the placeholder comment:

```tsx
import { PhotoManager } from "./photo-manager";
// … inside the returned JSX, after <ProductForm …/>:
<PhotoManager productId={product.id} photos={product.photos} />
```

- [ ] **Step 4: Verify**

Requires migration 0005 (Task 1 OWNER ACTION) to have run.
Run: `npm test`, `npm run build` → green.
Manual: upload two photos → thumbnails appear (server revalidation refreshes the page data); cover shows on `/modellen` and the card; delete one → gone from page AND from the bucket (check Supabase dashboard); a 7th photo or a `.stl` file is refused with a Dutch message before any upload.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(protected)/producten"
git commit -m "feat: product photo upload and delete via public bucket"
```

---

### Task 13: Delete product

**Files:**
- Modify: `app/admin/(protected)/producten/actions.ts` (add `deleteProduct`)
- Create: `app/admin/(protected)/producten/[id]/delete-button.tsx`
- Modify: `app/admin/(protected)/producten/[id]/page.tsx` (mount it)

**Interfaces:**
- Produces: `deleteProduct(prev: DeleteProductState, formData: FormData): Promise<DeleteProductState>` with `DeleteProductState = { error: string | null }`; redirects to `/admin/producten` on success.

- [ ] **Step 1: Add `deleteProduct` to `actions.ts`**

```ts
export type DeleteProductState = { error: string | null };

const PRODUCT_IN_USE =
  "Dit product is gebruikt in aanvragen en kan niet worden verwijderd. Zet het op inactief.";

// Spec order: check for referencing requests BEFORE touching storage, so a
// product that must stay keeps its photos. The storage sweep lists the
// product's folder, which also removes any orphaned uploads in it.
export async function deleteProduct(
  _prevState: DeleteProductState,
  formData: FormData
): Promise<DeleteProductState> {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);
  if (countError) {
    return { error: GENERIC_ERROR };
  }
  if ((count ?? 0) > 0) {
    return { error: PRODUCT_IN_USE };
  }

  const { data: objects, error: listError } = await supabase.storage
    .from("product-photos")
    .list(productId);
  if (listError) {
    return { error: "Kon de foto's niet ophalen." };
  }
  if (objects && objects.length > 0) {
    const { error: removeError } = await supabase.storage
      .from("product-photos")
      .remove(objects.map((object) => `${productId}/${object.name}`));
    if (removeError) {
      return { error: "Kon de foto's niet verwijderen." };
    }
  }

  const { error: deleteError } = await supabase
    .from("products")
    .delete()
    .eq("id", productId);
  if (deleteError) {
    // FK from a request created between the check and the delete —
    // effectively theoretical for a single admin.
    return { error: PRODUCT_IN_USE };
  }

  revalidateProductPaths(productId);
  redirect("/admin/producten");
}
```

- [ ] **Step 2: Create `delete-button.tsx`** (two-step confirm, pattern from `app/admin/(protected)/aanvragen/[id]/delete-button.tsx`, plus inline error via `useActionState`)

```tsx
"use client";

import { useActionState, useState } from "react";
import { deleteProduct, type DeleteProductState } from "../actions";

const initialState: DeleteProductState = { error: null };

// Two-step delete: the first click reveals a confirm/cancel pair so a stray
// click cannot destroy a product and its photos.
export function DeleteProductButton({ productId }: { productId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    deleteProduct,
    initialState
  );

  return (
    <div className="flex flex-col gap-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="self-start rounded border border-red-300 px-4 py-2 text-sm text-red-700"
        >
          Product verwijderen
        </button>
      ) : (
        <form action={formAction} className="flex items-center gap-3">
          <input type="hidden" name="productId" value={productId} />
          <span className="text-sm">Zeker weten?</span>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {pending ? "Bezig…" : "Ja, verwijderen"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded border border-gray-300 px-4 py-2 text-sm"
          >
            Annuleren
          </button>
        </form>
      )}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Mount it on the edit page** (import + render after `<PhotoManager …/>`)

```tsx
import { DeleteProductButton } from "./delete-button";
// … after <PhotoManager …/>:
<DeleteProductButton productId={product.id} />
```

- [ ] **Step 4: Verify**

Run: `npm test`, `npm run build` → green.
Manual: deleting a fresh product with photos removes row + storage folder and lands on the list; deleting the Phase 3 test product (`eedf1e4e-…`, has requests) shows the Dutch in-use message and its photos/row survive.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(protected)/producten"
git commit -m "feat: product delete with request guard and storage sweep"
```

---

### Task 14: Final verification, docs, owner checklist

**Files:**
- Modify: `docs/ROADMAP.md:54` (Phase 6 status — only after owner verification)

- [ ] **Step 1: Full suite**

Run: `npm test` → all pass. `npm run lint` → no errors. `npm run build` → succeeds.

- [ ] **Step 2: Owner verification checklist** (owner runs locally with `npm run dev`, then live after push; spec §Testing verbatim)

1. Landing page renders: dark hero + white sections, both hero CTAs pre-select the right form type, anchors scroll, empty-catalog note shows while no products exist.
2. Admin: create a real product with name/description/price → redirected to edit → upload 2+ photos → photos appear; delete one photo → gone from page and bucket.
3. `/modellen` shows the product; detail page shows all photos + description + price; "Bestellen" lands on the form with the product pre-selected; submitting that request works end-to-end.
4. Landing now shows the product card instead of the empty state.
5. Deactivate the product → gone from `/modellen`, landing, and the form's product dropdown; its detail URL → 404; still listed (inactief) in admin.
6. Delete the Phase 3 test product 'Testproduct — vaas' via the new UI (it has requests → expect the friendly in-use message → deactivate it instead; or delete if its test requests were already cleaned up). **OWNER ACTION**
7. Prices show Dutch formatting (`€ 12,50`) on the form, catalog, detail, and admin pages.
8. As anon (logged out): `/admin/producten` redirects to login; a direct storage upload to `product-photos` is rejected; public photo URLs load.

- [ ] **Step 3: Push and verify live** (push to `main` auto-deploys on Vercel), rerun the checklist against the live URL.

- [ ] **Step 4: Mark Phase 6 done**

After the owner confirms the live checklist: in `docs/ROADMAP.md` change the Phase 6 row status from `—` to `done`.

```bash
git add docs/ROADMAP.md
git commit -m "docs: mark Phase 6 complete"
git push
```
