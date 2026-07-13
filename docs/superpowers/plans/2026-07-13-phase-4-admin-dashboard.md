# Phase 4 Implementation Plan — Admin Dashboard: List, Detail, Quoting, Status Updates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin can run the whole request pipeline from the app — a filterable request list at `/admin`, a per-request detail page with file downloads, quoting (design fee + print fee), status changes, notes, and delete-with-cleanup — so the Supabase dashboard is no longer needed for daily operation.

**Architecture:** Server components read through the admin's session (RLS is the boundary; the existing `(protected)` layout gate is convenience). Two server actions (`updateRequest`, `deleteRequest`) mutate. File downloads use short-lived signed URLs generated server-side so 50MB files never pass through a Vercel function. A new pure module `lib/requests/admin-validation.ts` (Vitest-tested) parses fees and validates status, mirroring Phase 3's `lib/requests/validation.ts`.

**Tech Stack:** Next.js 16 (App Router; `params` and `searchParams` are Promises — await them), React 19 (`useActionState`), @supabase/ssr, Tailwind 4, Vitest. Spec: `docs/superpowers/specs/2026-07-13-phase-4-admin-dashboard-design.md`.

## Global Constraints

- UI language **Dutch**; code, comments, identifiers **English**.
- **No new dependencies this phase.** Vitest already exists (Phase 3).
- No database migration and no owner SQL: Phase 2's admin all-access table policies and Phase 3's admin storage policy on `request-files` already permit every read/update/delete/signed-URL this phase performs.
- Env vars (already set): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Next 16: `params` and `searchParams` in pages are **Promises** — always `await` them.
- All new admin pages live in `app/admin/(protected)/` so the existing auth gate (`layout.tsx`) covers them.
- Money is `numeric(10,2)` in Postgres — fees have at most 2 decimals, never negative, never float surprises.
- Every task: `npm run build` must pass; `npm test` must pass.
- This plan assumes **Phase 3 is fully implemented and merged**. If a parallel session is still executing Phase 3, do not start execution until it lands.

## File structure

| File | Responsibility |
|---|---|
| `lib/requests/status.ts` | The six status values, their Dutch labels, and badge CSS classes. Shared by list, detail, validation; Phase 5 reuses it. |
| `lib/requests/admin-validation.ts` | Pure fee/status/notes validation for the quote form. No I/O. |
| `lib/requests/admin-validation.test.ts` | Vitest unit tests for the above. |
| `app/admin/(protected)/page.tsx` | **Modify.** Request list table + `?status=` filter (replaces the count-only page). |
| `app/admin/(protected)/aanvragen/[id]/page.tsx` | Detail server component: read-only info, file download links (signed URLs), renders the quote form + delete button. |
| `app/admin/(protected)/aanvragen/[id]/actions.ts` | `updateRequest` and `deleteRequest` server actions. |
| `app/admin/(protected)/aanvragen/[id]/quote-form.tsx` | Client component: edit form with `useActionState`. |
| `app/admin/(protected)/aanvragen/[id]/delete-button.tsx` | Client component: confirmation step + delete submit. |

---

### Task 1: Status vocabulary module

**Files:**
- Create: `lib/requests/status.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (imported by Tasks 2, 3, 4):
  - `REQUEST_STATUSES: readonly ["received","quoted","approved","printing","done","rejected"]`
  - `type RequestStatus = (typeof REQUEST_STATUSES)[number]`
  - `STATUS_LABELS: Record<RequestStatus, string>` (Dutch labels)
  - `STATUS_BADGE_CLASSES: Record<RequestStatus, string>` (Tailwind classes)
  - `isRequestStatus(value: string): value is RequestStatus`

- [ ] **Step 1: Create the module**

Create `lib/requests/status.ts`:

```typescript
// The request status vocabulary, shared across the admin list, detail page,
// and quote validation. Dutch labels for the UI; English identifiers in code.
// Phase 5 reuses this when status changes trigger customer emails.

export const REQUEST_STATUSES = [
  "received",
  "quoted",
  "approved",
  "printing",
  "done",
  "rejected",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  received: "Ontvangen",
  quoted: "Offerte gestuurd",
  approved: "Akkoord",
  printing: "Wordt geprint",
  done: "Afgerond",
  rejected: "Afgewezen",
};

// Badge colours per status: neutral for new, blue while in progress, green
// for done, red for rejected.
export const STATUS_BADGE_CLASSES: Record<RequestStatus, string> = {
  received: "bg-gray-100 text-gray-800",
  quoted: "bg-blue-100 text-blue-800",
  approved: "bg-indigo-100 text-indigo-800",
  printing: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export function isRequestStatus(value: string): value is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build passes (module is imported nowhere yet, but must type-check).

- [ ] **Step 3: Commit**

```bash
git add lib/requests/status.ts
git commit -m "feat: request status labels and badge styles"
```

---

### Task 2: Quote validation module (TDD)

**Files:**
- Create: `lib/requests/admin-validation.ts`
- Test: `lib/requests/admin-validation.test.ts`

**Interfaces:**
- Consumes: `RequestStatus`, `isRequestStatus` from `./status`.
- Produces (imported by Task 3's action):
  - `type QuoteInput = { designFee: string; printFee: string; status: string; notes: string }`
  - `type ValidQuote = { designFee: number | null; printFee: number | null; status: RequestStatus; notes: string | null }`
  - `type QuoteValidationResult = { ok: true; data: ValidQuote } | { ok: false; errors: Record<string, string> }`
  - `parseFee(raw: string): { ok: true; value: number | null } | { ok: false }`
  - `validateQuote(input: QuoteInput): QuoteValidationResult`

- [ ] **Step 1: Write the failing tests**

Create `lib/requests/admin-validation.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseFee, validateQuote, type QuoteInput } from "./admin-validation";

// Valid baseline; tests override single fields to isolate each rule.
function input(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    designFee: "",
    printFee: "",
    status: "received",
    notes: "",
    ...overrides,
  };
}

describe("parseFee", () => {
  it("treats empty and whitespace as null (fee not set)", () => {
    expect(parseFee("")).toEqual({ ok: true, value: null });
    expect(parseFee("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts a dot decimal", () => {
    expect(parseFee("12.50")).toEqual({ ok: true, value: 12.5 });
  });

  it("accepts a Dutch comma decimal", () => {
    expect(parseFee("12,50")).toEqual({ ok: true, value: 12.5 });
  });

  it("accepts a whole number and zero", () => {
    expect(parseFee("40")).toEqual({ ok: true, value: 40 });
    expect(parseFee("0")).toEqual({ ok: true, value: 0 });
  });

  it("rejects negative amounts", () => {
    expect(parseFee("-5")).toEqual({ ok: false });
  });

  it("rejects more than two decimals", () => {
    expect(parseFee("12,505")).toEqual({ ok: false });
  });

  it("rejects non-numeric junk", () => {
    expect(parseFee("abc")).toEqual({ ok: false });
    expect(parseFee("1.2.3")).toEqual({ ok: false });
    expect(parseFee("€10")).toEqual({ ok: false });
  });
});

describe("validateQuote", () => {
  it("accepts empty fees and returns nulls", () => {
    const result = validateQuote(input());
    expect(result).toEqual({
      ok: true,
      data: { designFee: null, printFee: null, status: "received", notes: null },
    });
  });

  it("accepts both fees with mixed separators and trims notes", () => {
    const result = validateQuote(
      input({
        designFee: "15",
        printFee: "7,25",
        status: "quoted",
        notes: "  Bespreken met klant  ",
      })
    );
    expect(result).toEqual({
      ok: true,
      data: {
        designFee: 15,
        printFee: 7.25,
        status: "quoted",
        notes: "Bespreken met klant",
      },
    });
  });

  it("reports a Dutch error for an invalid design fee", () => {
    const result = validateQuote(input({ designFee: "gratis" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.designFee).toBeTruthy();
  });

  it("reports a Dutch error for an invalid print fee", () => {
    const result = validateQuote(input({ printFee: "-1" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.printFee).toBeTruthy();
  });

  it("rejects an unknown status", () => {
    const result = validateQuote(input({ status: "verzonden" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.status).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `admin-validation.ts` does not exist / exports missing.

- [ ] **Step 3: Write the implementation**

Create `lib/requests/admin-validation.ts`:

```typescript
// Pure validation for the admin quote form. No I/O, so it is unit-testable
// and could be reused client-side later. Mirrors lib/requests/validation.ts.

import { isRequestStatus, type RequestStatus } from "./status";

export type QuoteInput = {
  designFee: string;
  printFee: string;
  status: string;
  notes: string;
};

export type ValidQuote = {
  designFee: number | null;
  printFee: number | null;
  status: RequestStatus;
  notes: string | null;
};

export type QuoteValidationResult =
  | { ok: true; data: ValidQuote }
  | { ok: false; errors: Record<string, string> };

// A fee is optional (empty → null) or a non-negative amount with at most two
// decimals, using a dot or a Dutch comma as separator. Anything else is a
// validation error. No sign is allowed, so negatives are rejected by the
// pattern itself.
const FEE_PATTERN = /^\d+([.]\d{1,2})?$/;

export function parseFee(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }
  const normalized = trimmed.replace(",", ".");
  if (!FEE_PATTERN.test(normalized)) {
    return { ok: false };
  }
  return { ok: true, value: Number.parseFloat(normalized) };
}

const FEE_ERROR = "Vul een geldig bedrag in (bijv. 12,50) of laat leeg.";

export function validateQuote(input: QuoteInput): QuoteValidationResult {
  const errors: Record<string, string> = {};

  const designFee = parseFee(input.designFee);
  if (!designFee.ok) {
    errors.designFee = FEE_ERROR;
  }

  const printFee = parseFee(input.printFee);
  if (!printFee.ok) {
    errors.printFee = FEE_ERROR;
  }

  if (!isRequestStatus(input.status)) {
    errors.status = "Kies een geldige status.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      designFee: designFee.ok ? designFee.value : null,
      printFee: printFee.ok ? printFee.value : null,
      status: input.status as RequestStatus,
      notes: input.notes.trim() || null,
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all `parseFee` and `validateQuote` tests green, plus Phase 3's existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add lib/requests/admin-validation.ts lib/requests/admin-validation.test.ts
git commit -m "feat: quote validation module with fee parsing tests"
```

---

### Task 3: Request list with status filter

**Files:**
- Modify: `app/admin/(protected)/page.tsx` (currently the count-only dashboard)

**Interfaces:**
- Consumes: `REQUEST_STATUSES`, `STATUS_LABELS`, `STATUS_BADGE_CLASSES`, `isRequestStatus` from `@/lib/requests/status`; `createClient` from `@/lib/supabase/server`.
- Produces: the `/admin` list; links to `/admin/aanvragen/[id]` (Task 4).

- [ ] **Step 1: Rewrite the dashboard page**

Replace the entire contents of `app/admin/(protected)/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  isRequestStatus,
  REQUEST_STATUSES,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";

const TYPE_LABELS: Record<string, string> = {
  catalog: "Kant-en-klaar",
  file: "Print mijn bestand",
  custom: "Eigen ontwerp",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Next 16: searchParams is a Promise and must be awaited.
  const { status } = await searchParams;
  const activeFilter =
    typeof status === "string" && isRequestStatus(status) ? status : null;

  const supabase = await createClient();
  let query = supabase
    .from("requests")
    .select("id, created_at, customer_name, type, quantity, status")
    .order("created_at", { ascending: false });
  if (activeFilter) {
    query = query.eq("status", activeFilter);
  }
  const { data: requests, error } = await query;

  return (
    <>
      <h1 className="text-2xl font-bold">Aanvragen</h1>
      <p className="mt-1 text-sm text-gray-600">
        {requests?.length ?? 0}{" "}
        {requests?.length === 1 ? "aanvraag" : "aanvragen"}
        {activeFilter ? ` met status “${STATUS_LABELS[activeFilter]}”` : ""}
      </p>

      <nav className="mt-4 flex flex-wrap gap-2">
        <FilterLink label="Alle" href="/admin" active={activeFilter === null} />
        {REQUEST_STATUSES.map((s) => (
          <FilterLink
            key={s}
            label={STATUS_LABELS[s]}
            href={`/admin?status=${s}`}
            active={activeFilter === s}
          />
        ))}
      </nav>

      {error ? (
        <p className="mt-6 text-red-700">
          Kon aanvragen niet laden: {error.message}
        </p>
      ) : requests && requests.length > 0 ? (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th className="py-2 pr-4 font-medium">Datum</th>
              <th className="py-2 pr-4 font-medium">Naam</th>
              <th className="py-2 pr-4 font-medium">Type</th>
              <th className="py-2 pr-4 font-medium">Aantal</th>
              <th className="py-2 pr-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr
                key={request.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/aanvragen/${request.id}`}
                    className="block text-blue-700 underline"
                  >
                    {formatDate(request.created_at)}
                  </Link>
                </td>
                <td className="py-2 pr-4">{request.customer_name}</td>
                <td className="py-2 pr-4">
                  {TYPE_LABELS[request.type] ?? request.type}
                </td>
                <td className="py-2 pr-4">{request.quantity}</td>
                <td className="py-2 pr-4">
                  <StatusBadge status={request.status as RequestStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-6 text-gray-600">Nog geen aanvragen.</p>
      )}
    </>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm ${
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-300 text-gray-700 hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_BADGE_CLASSES[status] ?? "bg-gray-100 text-gray-800"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build passes (the `/admin/aanvragen/[id]` link target arrives in Task 4; Next does not fail the build on links to not-yet-existing routes).

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(protected)/page.tsx"
git commit -m "feat: admin request list with status filter"
```

---

### Task 4: Request detail page with file downloads

**Files:**
- Create: `app/admin/(protected)/aanvragen/[id]/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `STATUS_LABELS` etc. from `@/lib/requests/status`; the `QuoteForm` component (Task 5) and `DeleteButton` component (Task 6).
- Produces: the detail view. Renders `<QuoteForm request={...} />` and `<DeleteButton requestId={...} />`.

> **Note on task order:** this page imports `QuoteForm` (Task 5) and `DeleteButton` (Task 6). Implement it here with those two imports, then create the components in Tasks 5–6. The build step below is deferred to the end of Task 6; verify only after all three exist. If you prefer a green build at every task, temporarily stub the two imports with `<p>` placeholders and replace them in Tasks 5–6.

- [ ] **Step 1: Create the detail page**

Create `app/admin/(protected)/aanvragen/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { STATUS_BADGE_CLASSES, STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import { QuoteForm } from "./quote-form";
import { DeleteButton } from "./delete-button";

const TYPE_LABELS: Record<string, string> = {
  catalog: "Kant-en-klaar",
  file: "Print mijn bestand",
  custom: "Eigen ontwerp",
};

// Download links stay valid for one hour — long enough for the admin to grab
// files during a session, short enough that a leaked URL soon expires.
const SIGNED_URL_TTL_SECONDS = 3600;

function formatDate(value: string): string {
  return new Date(value).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next 16: params is a Promise and must be awaited.
  const { id } = await params;
  const supabase = await createClient();

  const { data: request, error } = await supabase
    .from("requests")
    .select(
      "id, created_at, type, customer_name, email, phone, description, color, material, quantity, license_accepted, status, quote_design_fee, quote_print_fee, admin_notes, product_id, products(name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <p className="text-red-700">
        Kon de aanvraag niet laden: {error.message}
      </p>
    );
  }
  if (!request) {
    notFound();
  }

  const { data: files } = await supabase
    .from("request_files")
    .select("id, storage_path, original_name, size_bytes")
    .eq("request_id", id)
    .order("created_at");

  // Batch-create signed download URLs. If this fails, the page still renders;
  // the file list shows a fallback note instead of links.
  let signedUrls: Record<string, string> = {};
  if (files && files.length > 0) {
    const { data: signed } = await supabase.storage
      .from("request-files")
      .createSignedUrls(
        files.map((file) => file.storage_path),
        SIGNED_URL_TTL_SECONDS
      );
    if (signed) {
      signedUrls = Object.fromEntries(
        signed
          .filter((entry) => entry.signedUrl && entry.path)
          .map((entry) => [entry.path as string, entry.signedUrl])
      );
    }
  }

  // Supabase types the embedded relation as an array; a request has at most
  // one product.
  const productName = Array.isArray(request.products)
    ? request.products[0]?.name
    : (request.products as { name: string } | null)?.name;

  return (
    <div className="max-w-2xl">
      <Link href="/admin" className="text-sm text-blue-700 underline">
        ← Terug naar overzicht
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{request.customer_name}</h1>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_BADGE_CLASSES[request.status as RequestStatus] ??
            "bg-gray-100 text-gray-800"
          }`}
        >
          {STATUS_LABELS[request.status as RequestStatus] ?? request.status}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-gray-600">Type</dt>
        <dd>{TYPE_LABELS[request.type] ?? request.type}</dd>

        <dt className="text-gray-600">Ontvangen</dt>
        <dd>{formatDate(request.created_at)}</dd>

        <dt className="text-gray-600">E-mail</dt>
        <dd>
          <a href={`mailto:${request.email}`} className="text-blue-700 underline">
            {request.email}
          </a>
        </dd>

        {request.phone && (
          <>
            <dt className="text-gray-600">Telefoon</dt>
            <dd>{request.phone}</dd>
          </>
        )}

        {productName && (
          <>
            <dt className="text-gray-600">Product</dt>
            <dd>{productName}</dd>
          </>
        )}

        <dt className="text-gray-600">Aantal</dt>
        <dd>{request.quantity}</dd>

        {request.color && (
          <>
            <dt className="text-gray-600">Kleur</dt>
            <dd>{request.color}</dd>
          </>
        )}

        {request.material && (
          <>
            <dt className="text-gray-600">Materiaal</dt>
            <dd>{request.material}</dd>
          </>
        )}

        {request.description && (
          <>
            <dt className="text-gray-600">Omschrijving</dt>
            <dd className="whitespace-pre-wrap">{request.description}</dd>
          </>
        )}
      </dl>

      {request.type === "file" && (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-gray-600">Bestanden</h2>
          {files && files.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {files.map((file) => {
                const url = signedUrls[file.storage_path];
                return (
                  <li key={file.id}>
                    {url ? (
                      <a href={url} className="text-blue-700 underline">
                        {file.original_name}
                      </a>
                    ) : (
                      <span>{file.original_name}</span>
                    )}{" "}
                    <span className="text-gray-500">
                      ({formatSize(file.size_bytes)})
                      {url ? "" : " — download tijdelijk niet beschikbaar"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gray-500">Geen bestanden.</p>
          )}
        </section>
      )}

      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-lg font-bold">Offerte &amp; status</h2>
        <QuoteForm
          requestId={request.id}
          designFee={request.quote_design_fee}
          printFee={request.quote_print_fee}
          status={request.status as RequestStatus}
          notes={request.admin_notes}
        />
      </section>

      <section className="mt-8 border-t border-gray-200 pt-6">
        <h2 className="text-lg font-bold text-red-700">Verwijderen</h2>
        <p className="mt-1 text-sm text-gray-600">
          Verwijdert de aanvraag en bijbehorende bestanden definitief.
        </p>
        <DeleteButton requestId={request.id} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Proceed to Task 5** (build verification happens after Task 6, once `quote-form.tsx` and `delete-button.tsx` exist). Do not commit yet — Task 6 commits the detail page together with the components once the build is green. (If you stubbed the imports for a green build, you may commit the page now and re-commit in Task 6.)

---

### Task 5: Quote/status update — action + form

**Files:**
- Create: `app/admin/(protected)/aanvragen/[id]/actions.ts` (the `updateRequest` half; `deleteRequest` is added in Task 6)
- Create: `app/admin/(protected)/aanvragen/[id]/quote-form.tsx`

**Interfaces:**
- Consumes: `validateQuote` from `@/lib/requests/admin-validation`; `createClient` from `@/lib/supabase/server`; `REQUEST_STATUSES`, `STATUS_LABELS`, `RequestStatus` from `@/lib/requests/status`.
- Produces:
  - `updateRequest(prevState: UpdateState, formData: FormData): Promise<UpdateState>` where `type UpdateState = { errors: Record<string, string> | null; ok: boolean }`
  - `<QuoteForm requestId designFee printFee status notes />` (props typed below).

- [ ] **Step 1: Create the update action**

Create `app/admin/(protected)/aanvragen/[id]/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateQuote } from "@/lib/requests/admin-validation";

export type UpdateState = { errors: Record<string, string> | null; ok: boolean };

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

// The single place a request's quote and status change. Phase 5 will hook a
// "status changed → email the customer" step onto this action.
export async function updateRequest(
  _prevState: UpdateState,
  formData: FormData
): Promise<UpdateState> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  const result = validateQuote({
    designFee: String(formData.get("designFee") ?? ""),
    printFee: String(formData.get("printFee") ?? ""),
    status: String(formData.get("status") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });

  if (!result.ok) {
    return { errors: result.errors, ok: false };
  }

  const supabase = await createClient();
  // RLS restricts UPDATE to the admin; a non-admin session cannot reach here.
  const { error } = await supabase
    .from("requests")
    .update({
      quote_design_fee: result.data.designFee,
      quote_print_fee: result.data.printFee,
      status: result.data.status,
      admin_notes: result.data.notes,
    })
    .eq("id", requestId);

  if (error) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/aanvragen/${requestId}`);
  return { errors: null, ok: true };
}
```

- [ ] **Step 2: Create the quote form component**

Create `app/admin/(protected)/aanvragen/[id]/quote-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import {
  REQUEST_STATUSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/lib/requests/status";
import { updateRequest, type UpdateState } from "./actions";

const initialState: UpdateState = { errors: null, ok: false };

// Postgres returns numeric(10,2) as a string or number; show it with a Dutch
// comma so the admin edits the same format they read.
function feeToInput(value: number | string | null): string {
  if (value === null) return "";
  return String(value).replace(".", ",");
}

export function QuoteForm({
  requestId,
  designFee,
  printFee,
  status,
  notes,
}: {
  requestId: string;
  designFee: number | string | null;
  printFee: number | string | null;
  status: RequestStatus;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateRequest,
    initialState
  );
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="requestId" value={requestId} />

      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Ontwerpkosten (€)</span>
          <input
            type="text"
            name="designFee"
            inputMode="decimal"
            defaultValue={feeToInput(designFee)}
            placeholder="bijv. 15,00"
            className="rounded border border-gray-300 px-3 py-2"
          />
          {errors.designFee && (
            <span className="text-sm text-red-700">{errors.designFee}</span>
          )}
        </label>

        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Printkosten (€)</span>
          <input
            type="text"
            name="printFee"
            inputMode="decimal"
            defaultValue={feeToInput(printFee)}
            placeholder="bijv. 7,50"
            className="rounded border border-gray-300 px-3 py-2"
          />
          {errors.printFee && (
            <span className="text-sm text-red-700">{errors.printFee}</span>
          )}
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Status</span>
        <select
          name="status"
          defaultValue={status}
          className="rounded border border-gray-300 px-3 py-2"
        >
          {REQUEST_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {errors.status && (
          <span className="text-sm text-red-700">{errors.status}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Notities (intern)</span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={notes ?? ""}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      {errors.form && <p className="text-sm text-red-700">{errors.form}</p>}
      {state.ok && <p className="text-sm text-green-700">Opgeslagen.</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Bezig met opslaan…" : "Opslaan"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Proceed to Task 6** (build verification and commit happen at the end of Task 6, when the delete pieces complete the detail page).

---

### Task 6: Delete request with storage cleanup — action + button

**Files:**
- Modify: `app/admin/(protected)/aanvragen/[id]/actions.ts` (add `deleteRequest`)
- Create: `app/admin/(protected)/aanvragen/[id]/delete-button.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`.
- Produces:
  - `deleteRequest(formData: FormData): Promise<void>` (form action; redirects on success, returns nothing)
  - `<DeleteButton requestId={string} />`

- [ ] **Step 1: Add the delete action**

Append to `app/admin/(protected)/aanvragen/[id]/actions.ts` (add `redirect` to the imports at the top):

```typescript
import { redirect } from "next/navigation";
```

Then append the action at the end of the file:

```typescript
// Removes storage objects first, then the request row (the DB cascade removes
// request_files rows). If storage removal fails, abort and leave everything
// intact — a retry is always possible, and we never orphan files that no
// longer have a request pointing at them.
export async function deleteRequest(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) {
    redirect("/admin");
  }

  const supabase = await createClient();

  const { data: files, error: filesError } = await supabase
    .from("request_files")
    .select("storage_path")
    .eq("request_id", requestId);
  if (filesError) {
    throw new Error("Kon bestanden niet ophalen.");
  }

  if (files && files.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("request-files")
      .remove(files.map((file) => file.storage_path));
    if (storageError) {
      throw new Error("Kon bestanden niet verwijderen.");
    }
  }

  const { error: deleteError } = await supabase
    .from("requests")
    .delete()
    .eq("id", requestId);
  if (deleteError) {
    throw new Error("Kon de aanvraag niet verwijderen.");
  }

  revalidatePath("/admin");
  redirect("/admin");
}
```

- [ ] **Step 2: Create the delete button component**

Create `app/admin/(protected)/aanvragen/[id]/delete-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { deleteRequest } from "./actions";

// Two-step delete: the first click reveals a confirm/cancel pair so a stray
// click cannot destroy a request and its files.
export function DeleteButton({ requestId }: { requestId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-3 rounded border border-red-300 px-4 py-2 text-sm text-red-700"
      >
        Aanvraag verwijderen
      </button>
    );
  }

  return (
    <form action={deleteRequest} className="mt-3 flex items-center gap-3">
      <input type="hidden" name="requestId" value={requestId} />
      <span className="text-sm">Zeker weten?</span>
      <button
        type="submit"
        className="rounded bg-red-700 px-4 py-2 text-sm text-white"
      >
        Ja, verwijderen
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded border border-gray-300 px-4 py-2 text-sm"
      >
        Annuleren
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Verify the whole feature builds and tests pass**

Run: `npm run build`
Expected: PASS — the detail page (Task 4) now resolves both `QuoteForm` and `DeleteButton`.

Run: `npm test`
Expected: PASS — all Phase 3 + Phase 4 validation tests green.

- [ ] **Step 4: Commit the detail feature**

```bash
git add "app/admin/(protected)/aanvragen"
git commit -m "feat: admin request detail with quoting, status, downloads, delete"
```

---

## Owner verification (manual checklist)

No migration or SQL this phase. After deploy, the owner runs this in the browser (local first, then the live Vercel URL). These need the **OWNER** — pause and ask; do not work around a failing step.

1. `/admin` lists Phase 3's test requests, newest first; each status-filter chip narrows the list; an unknown `?status=` value behaves as *Alle*.
2. Open one request of each type: catalog shows the product name; file shows its uploaded files; custom shows the description.
3. Click a file link → the model downloads and matches what was uploaded in Phase 3.
4. Enter a quote with a comma decimal (e.g. design `15`, print `7,25`), set status to *Offerte gestuurd*, save → "Opgeslagen." appears; the badge on `/admin` updates; the values are correct in the Supabase `requests` row.
5. Enter an invalid fee (`abc` or `-5`) → inline Dutch error, nothing saved.
6. Delete a file-type request → confirm step → row disappears from `/admin`; in Supabase Storage the request's objects are gone and no orphan `request_files` rows remain.
7. Visit `/admin/aanvragen/<random-uuid>` → 404. Log out, visit the same detail URL → redirected to `/admin/login`.

---

## Self-review notes

- **Spec coverage:** list + status filter (Task 3); detail read-only info + signed-URL downloads (Task 4); one-form quoting with manual status + Dutch comma fees (Tasks 2, 5); delete-with-cleanup (Task 6); status vocabulary shared for Phase 5 (Task 1); no migration/SQL (confirmed in constraints); Vitest for the new pure module (Task 2). All spec sections map to a task.
- **No new dependencies, no owner SQL** — matches the spec.
- **Type consistency:** `RequestStatus`, `STATUS_LABELS`, `STATUS_BADGE_CLASSES`, `isRequestStatus` (Task 1) are used verbatim in Tasks 2–5; `UpdateState`, `updateRequest`, `deleteRequest` names match between `actions.ts` and the two client components.
- **Task ordering caveat** made explicit: the detail page (Task 4) imports components built in Tasks 5–6; build verification is deferred to the end of Task 6, with a stub option noted for anyone who wants a green build at each step.
