# Phase 3 Implementation Plan — Public Request Form, File Upload, License Checkbox

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any visitor can submit a request of all three types (catalog / file / custom) through one Dutch form at `/aanvraag`, with up-to-5-file uploads going browser → Supabase Storage directly, the license rule enforced by the database, and the first automated tests (Vitest) covering the shared validation module.

**Architecture:** Files never travel through the server (server actions cap at 1MB, Vercel at ~4.5MB): the browser uploads straight to the private `request-files` bucket under an anon upload-only policy, then a small server action receives text fields + file metadata, re-validates with the same pure validation module the client used, generates the request UUID itself (anon has no SELECT on `requests`, so nothing can be read back), and inserts `requests` + `request_files` rows. RLS is the security boundary; migration `0003` adds the bucket and all anon policies.

**Tech Stack:** Next.js 16.2.10 (App Router, async `searchParams`), React 19 (`useActionState`, `useTransition`), @supabase/ssr 0.12, @supabase/supabase-js 2.110, Tailwind 4, Vitest (new dev dependency). Spec: `docs/superpowers/specs/2026-07-13-phase-3-request-form-design.md`.

## Global Constraints

- UI language **Dutch**; code, comments, identifiers **English**.
- **Only one new dependency in this phase: `vitest` (devDependency).** Nothing else.
- Env var names (already set locally and on Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Supabase project URL `https://pufuggwyyoybkadhtbef.supabase.co`, publishable key `sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ` (public by design).
- **Never put file bytes in a server action call** — a 50MB model cannot pass the 1MB server-action / ~4.5MB Vercel body caps. Uploads go browser → Storage; only metadata goes to the action. Concretely: the file `<input>` must have **no `name` attribute**, so the browser never serializes file bytes into the submitted FormData.
- Bucket `request-files` (private). Limits: max **5** files, **50MB** each (52428800 bytes, enforced by the bucket), extensions `.stl` `.3mf` `.step` `.stp` case-insensitive.
- Next.js 16: `searchParams` in a page is a **Promise** — always `await` it.
- No Supabase CLI, no Docker. SQL runs only via the web SQL editor. Steps marked **OWNER ACTION** need the owner (Supabase dashboard/SQL editor or browser testing); pause and ask, do not work around.
- Every task: `npm run build` must pass; from Task 1 on, `npm test` must pass too.

---

### Task 1: Vitest + shared validation module (TDD)

**Files:**
- Modify: `package.json` (add `vitest` devDependency + `test` script)
- Test: `lib/requests/validation.test.ts`
- Create: `lib/requests/validation.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces (Tasks 3 and 4 import these from `@/lib/requests/validation`):
  - `REQUEST_TYPES: readonly ["catalog", "file", "custom"]`, `type RequestType`
  - `MAX_FILES = 5`, `MAX_FILE_SIZE_BYTES = 52428800`, `ALLOWED_EXTENSIONS`
  - `type FileMeta = { name: string; sizeBytes: number }`
  - `type RequestInput` (all raw-string form fields + `licenseAccepted: boolean` + `files: FileMeta[]`)
  - `type ValidRequest` (cleaned values, optionals as `string | null`, `quantity: number`)
  - `validateRequest(input: RequestInput): ValidationResult` where `ValidationResult = { ok: true; data: ValidRequest } | { ok: false; errors: Record<string, string> }`
  - `validateFiles(files: FileMeta[]): string | null` (Dutch error or null)
  - `hasAllowedExtension(fileName: string): boolean`
  - `isSpam(honeypot: string): boolean`
  - `sanitizeFileName(name: string): string`

- [x] **Step 1: Install Vitest**

```powershell
npm install --save-dev vitest
```

Expected: `vitest` appears in `package.json` devDependencies, no install errors.

- [x] **Step 2: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

(No `vitest.config.ts` needed: the default include pattern already picks up `lib/**/*.test.ts`, and the module imports its subject relatively — no path alias required.)

- [x] **Step 3: Write the failing tests**

Create `lib/requests/validation.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  hasAllowedExtension,
  isSpam,
  sanitizeFileName,
  validateFiles,
  validateRequest,
  type RequestInput,
} from "./validation";

// Valid custom-type baseline; tests override single fields to isolate rules.
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
    files: [],
    ...overrides,
  };
}

const stlFile = { name: "model.stl", sizeBytes: 1024 };

describe("validateRequest", () => {
  it("accepts a valid custom request", () => {
    expect(validateRequest(input()).ok).toBe(true);
  });

  it("accepts a valid catalog request and returns cleaned data", () => {
    const result = validateRequest(
      input({ type: "catalog", productId: "abc-123", quantity: "2" })
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
      },
    });
  });

  it("accepts a valid file request", () => {
    const result = validateRequest(
      input({ type: "file", files: [stlFile], licenseAccepted: true })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown type", () => {
    const result = validateRequest(input({ type: "banana" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.type).toBeDefined();
  });

  it("requires a name and a valid email", () => {
    const result = validateRequest(
      input({ customerName: "  ", email: "geen-email" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.customerName).toBeDefined();
      expect(result.errors.email).toBeDefined();
    }
  });

  it("requires a description for custom requests only", () => {
    const custom = validateRequest(input({ description: "" }));
    expect(custom.ok).toBe(false);
    if (!custom.ok) expect(custom.errors.description).toBeDefined();

    const file = validateRequest(
      input({
        type: "file",
        description: "",
        files: [stlFile],
        licenseAccepted: true,
      })
    );
    expect(file.ok).toBe(true);
  });

  it("requires a product for catalog requests", () => {
    const result = validateRequest(input({ type: "catalog", productId: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.productId).toBeDefined();
  });

  it("rejects a quantity below 1 or non-numeric", () => {
    for (const quantity of ["0", "-3", "abc", ""]) {
      const result = validateRequest(
        input({ type: "catalog", productId: "abc-123", quantity })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.quantity).toBeDefined();
    }
  });

  it("requires the license checkbox for file requests", () => {
    const result = validateRequest(
      input({ type: "file", files: [stlFile], licenseAccepted: false })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.licenseAccepted).toBeDefined();
  });

  it("rejects a file request with invalid files", () => {
    const result = validateRequest(
      input({ type: "file", files: [], licenseAccepted: true })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.files).toBeDefined();
  });

  it("normalizes empty optional fields to null and ignores productId for non-catalog types", () => {
    const result = validateRequest(
      input({ phone: " ", color: "", material: " ", productId: "abc-123" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phone).toBeNull();
      expect(result.data.color).toBeNull();
      expect(result.data.material).toBeNull();
      expect(result.data.productId).toBeNull();
    }
  });
});

describe("validateFiles", () => {
  it("accepts 1 to 5 valid files", () => {
    expect(validateFiles([stlFile])).toBeNull();
    expect(validateFiles(Array(5).fill(stlFile))).toBeNull();
  });

  it("rejects zero files", () => {
    expect(validateFiles([])).not.toBeNull();
  });

  it("rejects more than 5 files", () => {
    expect(validateFiles(Array(6).fill(stlFile))).not.toBeNull();
  });

  it("rejects unsupported extensions", () => {
    expect(validateFiles([{ name: "model.zip", sizeBytes: 10 }])).not.toBeNull();
    expect(validateFiles([{ name: "geen-extensie", sizeBytes: 10 }])).not.toBeNull();
  });

  it("accepts all allowed extensions case-insensitively", () => {
    expect(validateFiles([{ name: "MODEL.STL", sizeBytes: 10 }])).toBeNull();
    expect(validateFiles([{ name: "part.3MF", sizeBytes: 10 }])).toBeNull();
    expect(validateFiles([{ name: "bracket.StEp", sizeBytes: 10 }])).toBeNull();
    expect(validateFiles([{ name: "cad.stp", sizeBytes: 10 }])).toBeNull();
  });

  it("rejects files over 50MB but accepts exactly 50MB", () => {
    expect(
      validateFiles([{ name: "big.stl", sizeBytes: 50 * 1024 * 1024 + 1 }])
    ).not.toBeNull();
    expect(
      validateFiles([{ name: "edge.stl", sizeBytes: 50 * 1024 * 1024 }])
    ).toBeNull();
  });
});

describe("isSpam", () => {
  it("flags a filled honeypot", () => {
    expect(isSpam("http://spam.example")).toBe(true);
  });

  it("passes an empty or whitespace honeypot", () => {
    expect(isSpam("")).toBe(false);
    expect(isSpam("  ")).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("keeps letters, digits, dot, dash, underscore", () => {
    expect(sanitizeFileName("my-model_v2.stl")).toBe("my-model_v2.stl");
  });

  it("replaces every other character with an underscore", () => {
    expect(sanitizeFileName("mijn vaas (rood).stl")).toBe(
      "mijn_vaas__rood_.stl"
    );
  });
});

describe("hasAllowedExtension", () => {
  it("matches allowed extensions case-insensitively", () => {
    expect(hasAllowedExtension("a.STL")).toBe(true);
    expect(hasAllowedExtension("a.pdf")).toBe(false);
  });
});
```

- [x] **Step 4: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./validation` (the module doesn't exist yet).

- [x] **Step 5: Write the validation module**

Create `lib/requests/validation.ts`:

```typescript
// Shared validation for the public request form. Pure functions only — no
// I/O — so the client can pre-validate for fast feedback and the server
// action re-validates the exact same rules. Client checks are UX; the
// server + row level security are the boundary.

export const REQUEST_TYPES = ["catalog", "file", "custom"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const MAX_FILES = 5;
// Must match the bucket's file_size_limit in migration 0003 — the bucket
// cap is the server-enforced boundary, this constant is the friendly check.
export const MAX_FILE_SIZE_BYTES = 52428800; // 50MB
export const ALLOWED_EXTENSIONS = [".stl", ".3mf", ".step", ".stp"] as const;

// Metadata-only view of a file: fits both browser File objects and the
// upload records the server action receives.
export type FileMeta = {
  name: string;
  sizeBytes: number;
};

// Raw form values; quantity stays a string because FormData has no numbers.
export type RequestInput = {
  type: string;
  customerName: string;
  email: string;
  phone: string;
  productId: string;
  description: string;
  color: string;
  material: string;
  quantity: string;
  licenseAccepted: boolean;
  files: FileMeta[];
};

// Cleaned values ready for the requests-table insert.
export type ValidRequest = {
  type: RequestType;
  customerName: string;
  email: string;
  phone: string | null;
  productId: string | null;
  description: string | null;
  color: string | null;
  material: string | null;
  quantity: number;
  licenseAccepted: boolean;
};

export type ValidationResult =
  | { ok: true; data: ValidRequest }
  | { ok: false; errors: Record<string, string> };

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function validateRequest(input: RequestInput): ValidationResult {
  const errors: Record<string, string> = {};

  const type = REQUEST_TYPES.find((t) => t === input.type);
  if (!type) {
    errors.type = "Kies een type aanvraag.";
  }

  const customerName = input.customerName.trim();
  if (!customerName) {
    errors.customerName = "Vul je naam in.";
  }

  const email = input.email.trim();
  if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Vul een geldig e-mailadres in.";
  }

  const description = input.description.trim();
  if (type === "custom" && !description) {
    errors.description =
      "Beschrijf wat je wilt laten maken (afmetingen, doel).";
  }

  const productId = input.productId.trim();
  if (type === "catalog" && !productId) {
    errors.productId = "Kies een product.";
  }

  // Custom requests are quoted per piece anyway; quantity applies to the
  // other two types and defaults to 1.
  let quantity = 1;
  if (type === "catalog" || type === "file") {
    quantity = Number.parseInt(input.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1) {
      errors.quantity = "Vul een aantal van minimaal 1 in.";
    }
  }

  if (type === "file") {
    const fileError = validateFiles(input.files);
    if (fileError) {
      errors.files = fileError;
    }
    if (!input.licenseAccepted) {
      errors.licenseAccepted =
        "Bevestig dat je het ontwerp mag (laten) printen.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      type: type!,
      customerName,
      email,
      phone: input.phone.trim() || null,
      productId: type === "catalog" ? productId : null,
      description: description || null,
      color: input.color.trim() || null,
      material: input.material.trim() || null,
      quantity,
      licenseAccepted: input.licenseAccepted,
    },
  };
}

export function validateFiles(files: FileMeta[]): string | null {
  if (files.length === 0) {
    return "Voeg minimaal één bestand toe.";
  }
  if (files.length > MAX_FILES) {
    return `Maximaal ${MAX_FILES} bestanden per aanvraag.`;
  }
  for (const file of files) {
    if (!hasAllowedExtension(file.name)) {
      return `"${file.name}" is geen ondersteund bestandstype (${ALLOWED_EXTENSIONS.join(", ")}).`;
    }
    if (file.sizeBytes > MAX_FILE_SIZE_BYTES) {
      return `"${file.name}" is groter dan 50MB.`;
    }
  }
  return null;
}

export function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// A real visitor never sees the honeypot field; any content means a bot.
export function isSpam(honeypot: string): boolean {
  return honeypot.trim() !== "";
}

// Storage object keys allow a limited character set: keep letters, digits,
// dot, dash, underscore; replace the rest. The original name is preserved
// separately in request_files.original_name.
export function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all tests green.

- [x] **Step 7: Verify the build**

Run: `npm run build`
Expected: succeeds, no type errors.

- [x] **Step 8: Commit**

```powershell
git add package.json package-lock.json lib/requests/validation.ts lib/requests/validation.test.ts
git commit -m "feat: shared request validation module with Vitest tests"
```

---

### Task 2: Migration 0003 — bucket, anon policies, test product

**Files:**
- Create: `supabase/migrations/0003_request_form.sql`

**Interfaces:**
- Consumes: tables + `public.is_admin()` from Phase 2 migrations.
- Produces: private bucket `request-files` (50MB cap); anon INSERT policies on `requests`, `request_files`, and the bucket; anon SELECT on active `products`; one test product. Task 3's inserts and Task 4's uploads/product dropdown only work because of this task.

- [x] **Step 1: Write the migration file**

Create `supabase/migrations/0003_request_form.sql`:

```sql
-- Phase 3: public request form. Run once in the Supabase web SQL editor,
-- after 0002_rls_policies.sql.
--
-- Policies target both `anon` (plain visitors) and `authenticated` (the
-- logged-in admin filling the form, and Phase 5's magic-link customers)
-- so submitting never depends on being logged out.

-- Private bucket for customer uploads. file_size_limit is the
-- server-enforced 50MB cap; app-side checks are convenience only.
-- No MIME allowlist: browsers report 3D files inconsistently (usually
-- application/octet-stream), so extension checks live in app code.
insert into storage.buckets (id, name, public, file_size_limit)
values ('request-files', 'request-files', false, 52428800);

-- Upload only: no select/update/delete policies for anon, so uploaded
-- objects can never be read, listed, or removed by visitors.
create policy "Anon upload to request-files" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'request-files');

-- The admin manages uploads (Phase 4 downloads them via signed URLs).
create policy "Admin full access to request-files" on storage.objects
  for all
  using (bucket_id = 'request-files' and public.is_admin())
  with check (bucket_id = 'request-files' and public.is_admin());

-- Visitors may create requests, but only harmless ones: fresh status, no
-- quote fees, no admin notes, and file requests must accept the license.
-- The database enforces the license rule, not just the form UI.
create policy "Anon insert requests" on public.requests
  for insert to anon, authenticated
  with check (
    status = 'received'
    and quote_design_fee is null
    and quote_print_fee is null
    and admin_notes is null
    and (type <> 'file' or license_accepted)
  );

-- Metadata rows for uploads. The foreign key already guarantees the
-- request exists (FK checks bypass RLS), and request ids are unguessable
-- UUIDs, so a bare with-check is acceptable here.
create policy "Anon insert request_files" on public.request_files
  for insert to anon, authenticated
  with check (true);

-- The form's product dropdown (and Phase 6's catalog) may read active
-- products only.
create policy "Anon read active products" on public.products
  for select to anon, authenticated
  using (active);
```

- [x] **Step 2: OWNER ACTION — run the migration**

Ask the owner to open Supabase → SQL Editor, paste the full contents of `supabase/migrations/0003_request_form.sql`, and run it.
Expected: "Success. No rows returned".

- [x] **Step 3: OWNER ACTION — insert a test product**

The catalog form type needs at least one product. Ask the owner to run in the SQL Editor:

```sql
insert into public.products (name, description, indicative_price)
values ('Testproduct — vaas', 'Tijdelijk testproduct voor fase 3', 12.50)
returning id, name;
```

Expected: one row returned with the new product's id. (This is a placeholder; the real catalog content arrives in Phase 6 and this row can then be deleted or deactivated.)

- [x] **Step 4: Verify policies via anonymous REST calls**

Run:

```powershell
curl.exe -s -H "apikey: sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ" "https://pufuggwyyoybkadhtbef.supabase.co/rest/v1/products?select=name&active=eq.true"
```

Expected: `[{"name":"Testproduct — vaas"}]` — anon can read active products.

```powershell
curl.exe -s -H "apikey: sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ" "https://pufuggwyyoybkadhtbef.supabase.co/rest/v1/requests?select=id"
```

Expected: `[]` — anon still cannot read requests (insert-only).

- [x] **Step 5: Commit**

```powershell
git add supabase/migrations/0003_request_form.sql
git commit -m "feat: storage bucket and anon policies for the request form"
```

---

### Task 3: Server action and confirmation page

**Files:**
- Create: `app/aanvraag/actions.ts`
- Create: `app/aanvraag/verzonden/page.tsx`

**Interfaces:**
- Consumes: `validateRequest`, `isSpam`, `FileMeta` from `@/lib/requests/validation` (Task 1); `createClient()` from `@/lib/supabase/server` (Phase 1); policies from Task 2.
- Produces: `submitRequest(prevState: SubmitState, formData: FormData): Promise<SubmitState>`, `type SubmitState = { errors: Record<string, string> | null }`, and `type UploadedFile = { storagePath: string; originalName: string; sizeBytes: number }` from `app/aanvraag/actions.ts` — Task 4's form component imports all three. The `/aanvraag/verzonden` route.

No unit tests here: the action is I/O orchestration; all decision logic lives in the already-tested validation module. Verification is the build now and the full form flow in Task 4.

- [x] **Step 1: Write the server action**

Create `app/aanvraag/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isSpam,
  validateRequest,
  type FileMeta,
} from "@/lib/requests/validation";

export type SubmitState = { errors: Record<string, string> | null };

// Metadata about a file the browser already uploaded to storage. The bytes
// themselves never pass through this action (1MB/4.5MB body caps).
export type UploadedFile = {
  storagePath: string;
  originalName: string;
  sizeBytes: number;
};

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

export async function submitRequest(
  _prevState: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  // Bots fill every field; humans never see this one. Pretend success so
  // the bot learns nothing.
  if (isSpam(String(formData.get("website") ?? ""))) {
    redirect("/aanvraag/verzonden");
  }

  const uploadedFiles = parseUploadedFiles(formData.get("uploadedFiles"));
  if (uploadedFiles === null) {
    return { errors: { form: GENERIC_ERROR } };
  }

  const result = validateRequest({
    type: String(formData.get("type") ?? ""),
    customerName: String(formData.get("customerName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    description: String(formData.get("description") ?? ""),
    color: String(formData.get("color") ?? ""),
    material: String(formData.get("material") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    licenseAccepted: formData.get("licenseAccepted") === "on",
    files: uploadedFiles.map(
      (file): FileMeta => ({
        name: file.originalName,
        sizeBytes: file.sizeBytes,
      })
    ),
  });

  if (!result.ok) {
    return { errors: result.errors };
  }

  const supabase = await createClient();

  // Generate the id here instead of reading it back from the insert:
  // PostgREST only returns inserted rows to callers with SELECT permission,
  // and anonymous visitors must never be able to read requests.
  const requestId = crypto.randomUUID();

  const { error: requestError } = await supabase.from("requests").insert({
    id: requestId,
    type: result.data.type,
    product_id: result.data.productId,
    customer_name: result.data.customerName,
    email: result.data.email,
    phone: result.data.phone,
    description: result.data.description,
    color: result.data.color,
    material: result.data.material,
    quantity: result.data.quantity,
    license_accepted: result.data.licenseAccepted,
  });

  if (requestError) {
    return { errors: { form: GENERIC_ERROR } };
  }

  if (result.data.type === "file") {
    const { error: filesError } = await supabase.from("request_files").insert(
      uploadedFiles.map((file) => ({
        request_id: requestId,
        storage_path: file.storagePath,
        original_name: file.originalName,
        size_bytes: file.sizeBytes,
      }))
    );
    if (filesError) {
      return { errors: { form: GENERIC_ERROR } };
    }
  }

  redirect("/aanvraag/verzonden");
}

// The client sends upload metadata as one JSON string field. Parse
// defensively: hand-crafted POSTs can contain anything. Returns null on
// malformed input (treated as a generic error by the caller).
function parseUploadedFiles(
  value: FormDataEntryValue | null
): UploadedFile[] | null {
  if (value === null || value === "") {
    return [];
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const files: UploadedFile[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.storagePath !== "string" ||
        typeof candidate.originalName !== "string" ||
        typeof candidate.sizeBytes !== "number"
      ) {
        return null;
      }
      files.push({
        storagePath: candidate.storagePath,
        originalName: candidate.originalName,
        sizeBytes: candidate.sizeBytes,
      });
    }
    return files;
  } catch {
    return null;
  }
}
```

- [x] **Step 2: Write the confirmation page**

Create `app/aanvraag/verzonden/page.tsx`:

```tsx
import Link from "next/link";

export default function RequestSentPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">Bedankt voor je aanvraag!</h1>
      <p className="max-w-md text-gray-600">
        We bekijken je aanvraag en nemen zo snel mogelijk per e-mail contact
        met je op met een prijsvoorstel.
      </p>
      <Link href="/" className="underline">
        Terug naar de homepagina
      </Link>
    </main>
  );
}
```

- [x] **Step 3: Verify build and tests**

Run: `npm run build`
Expected: succeeds; `/aanvraag/verzonden` listed in the route output.

Run: `npm test`
Expected: still green.

- [x] **Step 4: Commit**

```powershell
git add app/aanvraag/actions.ts app/aanvraag/verzonden/page.tsx
git commit -m "feat: request submit action and confirmation page"
```

---

### Task 4: Form page, client form component, homepage link

**Files:**
- Create: `app/aanvraag/request-form.tsx`
- Create: `app/aanvraag/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `submitRequest`, `SubmitState`, `UploadedFile` from `./actions` (Task 3); `validateFiles`, `sanitizeFileName`, `MAX_FILES`, `FileMeta` from `@/lib/requests/validation` (Task 1); `createClient` from `@/lib/supabase/client` (browser, Phase 1) and `@/lib/supabase/server` (Phase 1); bucket + policies from Task 2.
- Produces: the public `/aanvraag` route; `type ProductOption = { id: string; name: string; indicative_price: number | null }` exported from `request-form.tsx`.

- [x] **Step 1: Write the client form component**

Create `app/aanvraag/request-form.tsx`:

```tsx
"use client";

import { useActionState, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_FILES,
  sanitizeFileName,
  validateFiles,
  type FileMeta,
} from "@/lib/requests/validation";
import {
  submitRequest,
  type SubmitState,
  type UploadedFile,
} from "./actions";

export type ProductOption = {
  id: string;
  name: string;
  indicative_price: number | null;
};

type FormType = "catalog" | "file" | "custom";

const initialState: SubmitState = { errors: null };

const inputClass = "rounded border border-gray-300 px-3 py-2";
const labelClass = "flex flex-col gap-1";
const errorClass = "text-sm text-red-700";

export function RequestForm({
  products,
  preselectedProductId,
}: {
  products: ProductOption[];
  preselectedProductId: string;
}) {
  const [state, formAction, actionPending] = useActionState(
    submitRequest,
    initialState
  );
  const [type, setType] = useState<FormType>(
    preselectedProductId ? "catalog" : "file"
  );
  const [files, setFiles] = useState<File[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [, startTransition] = useTransition();

  const pending = actionPending || isUploading;
  const errors = state.errors ?? {};

  // Submit is intercepted so uploads can happen BEFORE the server action
  // runs: file bytes go browser → storage, only their metadata rides along
  // in the action's FormData.
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);

    const formData = new FormData(event.currentTarget);

    let uploaded: UploadedFile[] = [];
    if (type === "file") {
      // Pre-upload check to fail fast; the server re-validates everything.
      const fileError = validateFiles(
        files.map((file): FileMeta => ({ name: file.name, sizeBytes: file.size }))
      );
      if (fileError) {
        setClientError(fileError);
        return;
      }

      setIsUploading(true);
      try {
        uploaded = await uploadFiles(files);
      } catch {
        setClientError(
          "Uploaden mislukt, controleer je verbinding en probeer het opnieuw."
        );
        return;
      } finally {
        setIsUploading(false);
      }
    }

    formData.set("uploadedFiles", JSON.stringify(uploaded));
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {/* Honeypot: invisible to humans, bots fill it. Kept out of view,
          tab order and screen readers. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Wat wil je aanvragen?</legend>
        {(
          [
            ["catalog", "Kant-en-klaar ontwerp"],
            ["file", "Print mijn bestand"],
            ["custom", "Eigen ontwerp"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="type"
              value={value}
              checked={type === value}
              onChange={() => setType(value)}
            />
            {label}
          </label>
        ))}
        {errors.type && <p className={errorClass}>{errors.type}</p>}
      </fieldset>

      <label className={labelClass}>
        <span className="text-sm font-medium">Naam</span>
        <input type="text" name="customerName" required className={inputClass} />
        {errors.customerName && (
          <p className={errorClass}>{errors.customerName}</p>
        )}
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">E-mailadres</span>
        <input type="email" name="email" required className={inputClass} />
        {errors.email && <p className={errorClass}>{errors.email}</p>}
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">Telefoonnummer (optioneel)</span>
        <input type="tel" name="phone" className={inputClass} />
      </label>

      {type === "catalog" && (
        <label className={labelClass}>
          <span className="text-sm font-medium">Product</span>
          <select
            name="productId"
            defaultValue={preselectedProductId}
            className={inputClass}
          >
            <option value="">— Kies een product —</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
                {product.indicative_price !== null &&
                  ` (richtprijs €${product.indicative_price})`}
              </option>
            ))}
          </select>
          {errors.productId && <p className={errorClass}>{errors.productId}</p>}
        </label>
      )}

      {type === "file" && (
        <div className={labelClass}>
          <span className="text-sm font-medium">
            Bestanden (max {MAX_FILES}, .stl/.3mf/.step, max 50MB per stuk)
          </span>
          {/* Deliberately no `name`: the bytes must never end up in the
              FormData the server action receives. */}
          <input
            type="file"
            multiple
            accept=".stl,.3mf,.step,.stp"
            onChange={(event) =>
              setFiles(Array.from(event.target.files ?? []))
            }
            className={inputClass}
          />
          {errors.files && <p className={errorClass}>{errors.files}</p>}
        </div>
      )}

      <label className={labelClass}>
        <span className="text-sm font-medium">
          {type === "custom"
            ? "Omschrijving (afmetingen, doel)"
            : "Omschrijving (optioneel)"}
        </span>
        <textarea name="description" rows={4} className={inputClass} />
        {errors.description && (
          <p className={errorClass}>{errors.description}</p>
        )}
      </label>

      <label className={labelClass}>
        <span className="text-sm font-medium">Kleur (optioneel)</span>
        <input type="text" name="color" className={inputClass} />
      </label>

      {(type === "file" || type === "custom") && (
        <label className={labelClass}>
          <span className="text-sm font-medium">Materiaal (optioneel)</span>
          <input type="text" name="material" className={inputClass} />
        </label>
      )}

      {(type === "catalog" || type === "file") && (
        <label className={labelClass}>
          <span className="text-sm font-medium">Aantal</span>
          <input
            type="number"
            name="quantity"
            min={1}
            defaultValue={1}
            className={inputClass}
          />
          {errors.quantity && <p className={errorClass}>{errors.quantity}</p>}
        </label>
      )}

      {type === "file" && (
        <label className="flex items-start gap-2">
          <input type="checkbox" name="licenseAccepted" className="mt-1" />
          <span className="text-sm">
            Dit is mijn eigen ontwerp, of de licentie staat commercieel
            printen toe.
          </span>
        </label>
      )}
      {errors.licenseAccepted && (
        <p className={errorClass}>{errors.licenseAccepted}</p>
      )}

      {clientError && <p className={errorClass}>{clientError}</p>}
      {errors.form && <p className={errorClass}>{errors.form}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isUploading
          ? "Bestanden uploaden…"
          : actionPending
            ? "Versturen…"
            : "Aanvraag versturen"}
      </button>
    </form>
  );
}

// Files go browser → Supabase Storage directly: a 50MB model can never
// travel through a server action (1MB default limit, ~4.5MB Vercel cap).
// The anon storage policy allows insert only — never read/list/delete.
async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const supabase = createClient();
  const groupId = crypto.randomUUID();

  const uploaded: UploadedFile[] = [];
  for (const [index, file] of files.entries()) {
    // Random folder per submission; index prefix avoids collisions when
    // two files sanitize to the same name.
    const storagePath = `${groupId}/${index}-${sanitizeFileName(file.name)}`;
    const { error } = await supabase.storage
      .from("request-files")
      .upload(storagePath, file);
    if (error) {
      throw error;
    }
    uploaded.push({
      storagePath,
      originalName: file.name,
      sizeBytes: file.size,
    });
  }
  return uploaded;
}
```

- [x] **Step 2: Write the form page**

Create `app/aanvraag/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { RequestForm, type ProductOption } from "./request-form";

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 16: searchParams is a Promise and must be awaited.
  const { product } = await searchParams;
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-8">
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
        />
      )}
    </main>
  );
}
```

- [x] **Step 3: Link the form from the homepage**

Replace the full contents of `app/page.tsx` with:

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">3D Print Service</h1>
      <p className="text-lg text-gray-600">
        Binnenkort kun je hier 3D-prints bestellen.
      </p>
      <Link
        href="/aanvraag"
        className="rounded bg-gray-900 px-4 py-2 text-white"
      >
        Aanvraag indienen
      </Link>
    </main>
  );
}
```

- [x] **Step 4: Verify build and tests**

Run: `npm run build`
Expected: succeeds; `/aanvraag` and `/aanvraag/verzonden` in the route output.

Run: `npm test`
Expected: green.

- [x] **Step 5: Verify the routes respond**

With `npm run dev` running:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/aanvraag
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/aanvraag/verzonden
```

Expected: `200` for both.

- [x] **Step 6: OWNER ACTION — full browser checklist (local)**

Ask the owner, with `npm run dev` running, on `http://localhost:3000`:

1. Homepage shows the "Aanvraag indienen" button → opens `/aanvraag`.
2. **Custom**: submit with name/email/description → confirmation page. Empty description → Dutch error.
3. **Catalog**: "Testproduct — vaas" appears in the dropdown; submit with quantity 2 → confirmation page.
4. **File**: try a `.zip` or a file over 50MB → Dutch error, nothing uploaded. Then a small `.stl` (any text file renamed `test.stl` works) *without* the license checkbox → Dutch error. With the checkbox → "Bestanden uploaden…" then confirmation page.
5. `/aanvraag?product=<id-from-Task-2>` pre-selects the test product.
6. Honeypot: in devtools, fill the hidden `website` field, submit → confirmation page shows but **no new row** appears in the table (verify in step 7's counts).
7. Supabase dashboard: Table Editor shows the expected `requests` rows (statuses `received`) and `request_files` row(s); Storage → `request-files` contains the uploaded object under a UUID folder. `/admin` count went up accordingly (honeypot submission added nothing).
8. Anonymous REST read still denied:

```powershell
curl.exe -s -H "apikey: sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ" "https://pufuggwyyoybkadhtbef.supabase.co/rest/v1/requests?select=id"
```

Expected: `[]`.

- [x] **Step 7: Commit**

```powershell
git add app/aanvraag/request-form.tsx app/aanvraag/page.tsx app/page.tsx
git commit -m "feat: public request form for all three request types"
```

---

### Task 5: Deploy, live verification, roadmap update

**Files:**
- Modify: `docs/ROADMAP.md` (phase table row for Phase 3)

**Interfaces:**
- Consumes: everything above; Vercel auto-deploys pushes to `main`.
- Produces: Phase 3 live and recorded as done.

- [x] **Step 1: Push**

```powershell
git push
```

- [x] **Step 2: OWNER ACTION — verify on the live site**

After Vercel finishes deploying (a minute or two), repeat Task 4 Step 6's checklist on `https://3d-print-site-five.vercel.app` (at minimum: one submission per type, one real file upload, the honeypot check, and the `/admin` count). Also confirm `/status` still shows "Database verbonden ✓".

- [x] **Step 3: Update the roadmap**

In `docs/ROADMAP.md`, update the Phase 3 row of the phase table to:

```markdown
| 3 | Request form (all three types) + file upload + license checkbox | done |
```

- [x] **Step 4: Commit and push**

```powershell
git add docs/ROADMAP.md
git commit -m "docs: mark Phase 3 complete"
git push
```
