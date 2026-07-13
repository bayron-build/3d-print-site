# Phase 5 Implementation Plan — Emails + Customer Status Page (Magic Link)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer who submits a request gets a Dutch confirmation email with a private `/aanvraag/status/<token>` link; status changes to `quoted`/`done`/`rejected` email the customer; the status page shows the request, the quote, and an **Akkoord** button that flips `quoted → approved`.

**Architecture:** A random `access_token` uuid on each request is the whole auth story — no accounts, no login. Two `security definer` Postgres functions are the only anonymous exposure of request data (RLS stays the boundary; no service-role key). Emails go through Resend's REST API via plain `fetch`; sending is never fatal to the operation that triggered it. Pure Dutch template functions are Vitest-tested; delivery and UI stay on the manual checklist.

**Tech Stack:** Next.js 16 (App Router; `params`/`searchParams` are Promises — always `await`), React 19 (`useActionState`), @supabase/ssr (anon key only), Tailwind 4, Vitest, Resend REST API (no SDK). Spec: `docs/superpowers/specs/2026-07-13-phase-5-emails-status-page-design.md`.

## Global Constraints

- **ORDERING DEPENDENCY — do not start until Phase 3 AND Phase 4 are fully merged.** Phase 3 is merged (commit `c94d83e` and earlier). Phase 4 is being executed in a parallel session; this plan modifies Phase 4's `app/admin/(protected)/aanvragen/[id]/actions.ts` (Task 7) and Phase 3's `app/aanvraag/actions.ts` (Task 4). Before starting, verify `app/admin/(protected)/aanvragen/[id]/actions.ts` exists and exports `updateRequest`. If it doesn't, stop and wait for Phase 4 to land.
- UI and email text **Dutch**; code, comments, identifiers English.
- **No new npm dependencies.** Resend is called with plain `fetch`.
- **No secret Supabase keys in the app.** The two `security definer` functions granted to `anon` are the only token-based access; they never return `admin_notes`, `email`, `phone`, or the token itself. `RESEND_API_KEY` is the only new server secret and can only send email.
- **Email sending is never fatal**: `sendEmail` never throws; failures are logged server-side and the triggering operation (submit, status save) still succeeds.
- Emails fire on submit + status changes to `quoted`, `done`, `rejected` only. `received`, `approved`, `printing` send nothing.
- New env vars (exact names): `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`. Missing email env vars → `sendEmail` no-ops with a console warning (local dev keeps working).
- Money renders Dutch-style: `€ 12,50` (comma decimals, `€` + space).
- The status page and its 404 render a `noindex` robots meta tag.
- Next 16: `params` and `searchParams` in pages are **Promises** — always `await` them.
- Every task: `npm run build` must pass; `npm test` must pass.
- Migration `0004_status_page.sql` is committed by this plan but **run by the owner** in the Supabase web SQL editor (OWNER ACTION, same workflow as Phases 2–3). Manual verification of the status page requires it to have run.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0004_status_page.sql` | **Create.** `access_token` column + unique constraint; `get_request_by_token` and `approve_quote_by_token` functions; grants. |
| `lib/email/templates.ts` | **Create.** Pure Dutch template functions (one per email type) returning `{ subject, html }`; `formatEuro`; `emailForStatusChange` selector. No I/O. |
| `lib/email/templates.test.ts` | **Create.** Vitest: subjects, Dutch money formatting, status-link presence, no-email statuses, HTML escaping. |
| `lib/email/send.ts` | **Create.** `sendEmail({ to, subject, html })` — Resend REST via `fetch`; never throws; no-op with warning when env vars missing. |
| `lib/email/notifications.ts` | **Create.** `statusPageUrl`, `sendConfirmationEmail`, `sendStatusEmail` — glue between request rows, templates, and transport. |
| `app/aanvraag/actions.ts` | **Modify (Phase 3 file).** Generate `access_token`, insert it, send the confirmation email after a successful submit. |
| `app/aanvraag/status/[token]/actions.ts` | **Create.** `approveQuote` server action calling `approve_quote_by_token`. |
| `app/aanvraag/status/[token]/akkoord-button.tsx` | **Create.** Client component posting the Akkoord form. |
| `app/aanvraag/status/[token]/page.tsx` | **Create.** Server component: token lookup via RPC, request summary, progress indicator, quote block, Akkoord button, noindex. |
| `app/aanvraag/status/[token]/not-found.tsx` | **Create.** Friendly Dutch "deze link is niet (meer) geldig" page (HTTP 404). |
| `app/admin/(protected)/aanvragen/[id]/actions.ts` | **Modify (Phase 4 file).** After a successful `updateRequest`, call `sendStatusEmail` when the status actually changed. |

---

### Task 1: Migration — token column + token functions

**Files:**
- Create: `supabase/migrations/0004_status_page.sql`

**Interfaces:**
- Consumes: Phase 1 schema (`requests`, `request_files`, `products`), Phase 2 RLS (anon cannot read `requests`).
- Produces (used by Tasks 5–6 via `supabase.rpc(...)`):
  - `public.get_request_by_token(p_token uuid)` → rows of `(type text, status text, product_name text, quantity integer, description text, color text, material text, quote_design_fee numeric, quote_print_fee numeric, created_at timestamptz, file_names text[])`
  - `public.approve_quote_by_token(p_token uuid)` → `boolean` (true when a `quoted` request was flipped to `approved`)
  - `requests.access_token uuid not null unique default gen_random_uuid()` (used by Tasks 4 and 7)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_status_page.sql`:

```sql
-- Phase 5: customer status page via secret token.
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as
-- Phases 2-3).

-- Every request gets an unguessable token (122 bits of randomness); the
-- status-page link is /aanvraag/status/<token>. The default backfills all
-- existing rows and covers any insert that omits the column.
alter table public.requests
  add column access_token uuid not null default gen_random_uuid();

alter table public.requests
  add constraint requests_access_token_key unique (access_token);

-- Read exactly one request's customer-safe fields by token. SECURITY DEFINER
-- runs with the function owner's rights (bypassing RLS), but the column list
-- is the exposure: never admin_notes, email, phone, or the token itself.
-- Unknown token -> zero rows. Fixed search_path per Supabase lint guidance.
create or replace function public.get_request_by_token(p_token uuid)
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

-- Accept a quote by token: quoted -> approved, nothing else. The status guard
-- in the WHERE clause makes a second click (or a stale page) match nothing
-- and return false instead of erroring.
create or replace function public.approve_quote_by_token(p_token uuid)
returns boolean
language sql
security definer
set search_path = public
volatile
as $$
  with updated as (
    update public.requests
       set status = 'approved'
     where access_token = p_token
       and status = 'quoted'
    returning id
  )
  select exists (select 1 from updated);
$$;

-- These functions are the only anon exposure of request data: revoke the
-- Postgres default (execute for everyone) and grant exactly the roles that
-- need them. authenticated is included so the owner can open a status link
-- while logged in as admin without an RPC permission error.
revoke execute on function public.get_request_by_token(uuid) from public;
revoke execute on function public.approve_quote_by_token(uuid) from public;
grant execute on function public.get_request_by_token(uuid) to anon, authenticated;
grant execute on function public.approve_quote_by_token(uuid) to anon, authenticated;
```

- [ ] **Step 2: Verify nothing broke**

Run: `npm run build`
Expected: PASS (the SQL file is not part of the build; this confirms a clean baseline).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_status_page.sql
git commit -m "feat: access token column and token-scoped SQL functions"
```

> **OWNER ACTION (later, before manual verification):** run this file's contents in the Supabase web SQL editor. Listed again in "Manual steps (owner, once)" at the bottom.

---

### Task 2: Email templates (TDD)

**Files:**
- Create: `lib/email/templates.ts`
- Test: `lib/email/templates.test.ts`

**Interfaces:**
- Consumes: `type RequestStatus` from `@/lib/requests/status` (Phase 4 Task 1, already merged: the union `"received" | "quoted" | "approved" | "printing" | "done" | "rejected"`).
- Produces (imported by Task 3's notifications module and Task 6's status page):
  - `type EmailContent = { subject: string; html: string }`
  - `formatEuro(value: number | string): string` — `12.5` → `"€ 12,50"`
  - `type ConfirmationEmailInput = { customerName: string; statusUrl: string }`
  - `confirmationEmail(input: ConfirmationEmailInput): EmailContent`
  - `type QuoteEmailInput = { customerName: string; designFee: number | string | null; printFee: number | string | null; statusUrl: string }`
  - `quoteEmail(input: QuoteEmailInput): EmailContent`
  - `doneEmail(input: ConfirmationEmailInput): EmailContent`
  - `rejectedEmail(input: ConfirmationEmailInput): EmailContent`
  - `emailForStatusChange(status: RequestStatus, input: QuoteEmailInput): EmailContent | null` — `null` for `received`/`approved`/`printing`

- [ ] **Step 1: Write the failing tests**

Create `lib/email/templates.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  confirmationEmail,
  doneEmail,
  emailForStatusChange,
  formatEuro,
  quoteEmail,
  rejectedEmail,
  type QuoteEmailInput,
} from "./templates";

const STATUS_URL =
  "https://example.com/aanvraag/status/00000000-0000-0000-0000-000000000000";

function quoteInput(overrides: Partial<QuoteEmailInput> = {}): QuoteEmailInput {
  return {
    customerName: "Jan",
    designFee: 15,
    printFee: "7.25",
    statusUrl: STATUS_URL,
    ...overrides,
  };
}

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

describe("confirmationEmail", () => {
  it("has the Dutch subject and links to the status page", () => {
    const email = confirmationEmail({ customerName: "Jan", statusUrl: STATUS_URL });
    expect(email.subject).toBe("We hebben je aanvraag ontvangen");
    expect(email.html).toContain(STATUS_URL);
    expect(email.html).toContain("Jan");
  });

  it("escapes HTML in the customer name", () => {
    const email = confirmationEmail({
      customerName: "<script>alert(1)</script>",
      statusUrl: STATUS_URL,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

describe("quoteEmail", () => {
  it("shows both fees, the total, and the status link", () => {
    const email = quoteEmail(quoteInput());
    expect(email.subject).toBe("Je offerte staat klaar");
    expect(email.html).toContain("€ 15,00");
    expect(email.html).toContain("€ 7,25");
    expect(email.html).toContain("€ 22,25");
    expect(email.html).toContain(STATUS_URL);
  });

  it("omits a fee line when that fee is not set", () => {
    const email = quoteEmail(quoteInput({ designFee: null }));
    expect(email.html).not.toContain("Ontwerpkosten");
    expect(email.html).toContain("€ 7,25");
  });
});

describe("doneEmail", () => {
  it("has the Dutch subject, the link, and a pickup/payment note", () => {
    const email = doneEmail({ customerName: "Jan", statusUrl: STATUS_URL });
    expect(email.subject).toBe("Je print is klaar");
    expect(email.html).toContain(STATUS_URL);
    expect(email.html).toContain("Tikkie");
  });
});

describe("rejectedEmail", () => {
  it("has the Dutch subject and the link", () => {
    const email = rejectedEmail({ customerName: "Jan", statusUrl: STATUS_URL });
    expect(email.subject).toBe("Over je aanvraag");
    expect(email.html).toContain(STATUS_URL);
  });
});

describe("emailForStatusChange", () => {
  it("returns the right template per emailing status", () => {
    expect(emailForStatusChange("quoted", quoteInput())?.subject).toBe(
      "Je offerte staat klaar"
    );
    expect(emailForStatusChange("done", quoteInput())?.subject).toBe(
      "Je print is klaar"
    );
    expect(emailForStatusChange("rejected", quoteInput())?.subject).toBe(
      "Over je aanvraag"
    );
  });

  it("returns null for statuses that send no email", () => {
    expect(emailForStatusChange("received", quoteInput())).toBeNull();
    expect(emailForStatusChange("approved", quoteInput())).toBeNull();
    expect(emailForStatusChange("printing", quoteInput())).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `lib/email/templates.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `lib/email/templates.ts`:

```typescript
// Dutch customer email templates. Pure functions — no I/O, no env access —
// so each is unit-testable. Callers supply the absolute status-page URL;
// lib/email/notifications.ts builds it and hands the result to the transport.

import type { RequestStatus } from "@/lib/requests/status";

export type EmailContent = { subject: string; html: string };

// € 1.234,56 — Dutch grouping and comma decimals. Accepts the string form
// Postgres numeric columns may arrive in.
export function formatEuro(value: number | string): string {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  const [whole, decimals] = amount.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€ ${grouped},${decimals}`;
}

// Customer names end up inside HTML; neutralise markup no matter what was
// typed into the form.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(paragraphs: string[]): string {
  const body = paragraphs
    .map((p) => `<p style="margin:0 0 16px;">${p}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;max-width:560px;">${body}</div>`;
}

function statusLink(statusUrl: string, label: string): string {
  return `<a href="${statusUrl}" style="color:#1d4ed8;">${label}</a>`;
}

export type ConfirmationEmailInput = {
  customerName: string;
  statusUrl: string;
};

export function confirmationEmail(
  input: ConfirmationEmailInput
): EmailContent {
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

export type QuoteEmailInput = {
  customerName: string;
  designFee: number | string | null;
  printFee: number | string | null;
  statusUrl: string;
};

function toAmount(value: number | string | null): number {
  if (value === null) return 0;
  return typeof value === "string" ? Number.parseFloat(value) : value;
}

export function quoteEmail(input: QuoteEmailInput): EmailContent {
  const lines: string[] = [];
  if (input.designFee !== null) {
    lines.push(`Ontwerpkosten: ${formatEuro(input.designFee)}`);
  }
  if (input.printFee !== null) {
    lines.push(`Printkosten: ${formatEuro(input.printFee)}`);
  }
  const total = toAmount(input.designFee) + toAmount(input.printFee);
  lines.push(`<strong>Totaal: ${formatEuro(total)}</strong>`);

  return {
    subject: "Je offerte staat klaar",
    html: layout([
      `Beste ${escapeHtml(input.customerName)},`,
      "Goed nieuws: je offerte staat klaar.",
      lines.join("<br>"),
      `Bekijk de offerte en geef akkoord via ${statusLink(
        input.statusUrl,
        "je statuspagina"
      )}.`,
    ]),
  };
}

export function doneEmail(input: ConfirmationEmailInput): EmailContent {
  return {
    subject: "Je print is klaar",
    html: layout([
      `Beste ${escapeHtml(input.customerName)},`,
      "Goed nieuws: je print is klaar!",
      "We nemen contact met je op over het ophalen. Betalen kan per bankoverschrijving of Tikkie.",
      `Bekijk de details op ${statusLink(input.statusUrl, "je statuspagina")}.`,
    ]),
  };
}

export function rejectedEmail(input: ConfirmationEmailInput): EmailContent {
  return {
    subject: "Over je aanvraag",
    html: layout([
      `Beste ${escapeHtml(input.customerName)},`,
      "We hebben goed naar je aanvraag gekeken, maar kunnen deze helaas niet uitvoeren. Onze excuses voor het ongemak.",
      `De details vind je op ${statusLink(input.statusUrl, "je statuspagina")}.`,
      "Heb je vragen? Beantwoord dan gerust deze e-mail.",
    ]),
  };
}

// One entry point for "the status changed, which email (if any) goes out?".
// received/approved/printing deliberately send nothing: the status page
// already shows progress, and emailing every step is noise.
export function emailForStatusChange(
  status: RequestStatus,
  input: QuoteEmailInput
): EmailContent | null {
  switch (status) {
    case "quoted":
      return quoteEmail(input);
    case "done":
      return doneEmail({
        customerName: input.customerName,
        statusUrl: input.statusUrl,
      });
    case "rejected":
      return rejectedEmail({
        customerName: input.customerName,
        statusUrl: input.statusUrl,
      });
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all template tests green, Phase 3/4 validation tests still green.

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates.ts lib/email/templates.test.ts
git commit -m "feat: Dutch email templates with tested euro formatting"
```

---

### Task 3: Email transport + notification helpers

**Files:**
- Create: `lib/email/send.ts`
- Create: `lib/email/notifications.ts`

**Interfaces:**
- Consumes: `confirmationEmail`, `emailForStatusChange`, `QuoteEmailInput` from `./templates` (Task 2); `RequestStatus` from `@/lib/requests/status`; env vars `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`.
- Produces (imported by Tasks 4 and 7):
  - `sendEmail(input: { to: string; subject: string; html: string }): Promise<{ ok: boolean }>` — never throws
  - `statusPageUrl(accessToken: string): string`
  - `sendConfirmationEmail(input: { to: string; customerName: string; accessToken: string }): Promise<void>` — never throws
  - `type StatusEmailRequest = { email: string; customer_name: string; access_token: string; quote_design_fee: number | string | null; quote_print_fee: number | string | null }`
  - `sendStatusEmail(request: StatusEmailRequest, newStatus: RequestStatus): Promise<void>` — never throws; no-op for non-emailing statuses

No unit tests here: both files are thin I/O glue around the tested templates. Delivery is verified on the manual checklist.

- [ ] **Step 1: Create the transport**

Create `lib/email/send.ts`:

```typescript
// Minimal Resend transport: one POST to their REST API via fetch, no SDK
// (project rule: no new dependencies). Sending email is never fatal — this
// module never throws to the caller; failures are logged and reported as
// { ok: false } so submits and admin actions always succeed regardless.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = { to: string; subject: string; html: string };
export type SendEmailResult = { ok: boolean };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  // Local dev without a Resend key keeps working: warn and skip.
  if (!apiKey || !from) {
    console.warn(
      `[email] RESEND_API_KEY/EMAIL_FROM not set; skipping "${input.subject}"`
    );
    return { ok: false };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      // Expected in test mode for any recipient other than the owner's own
      // inbox (onboarding@resend.dev only delivers there).
      console.error(
        `[email] Resend responded ${response.status} for "${input.subject}": ${await response.text()}`
      );
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    console.error(`[email] send failed for "${input.subject}":`, error);
    return { ok: false };
  }
}
```

- [ ] **Step 2: Create the notification helpers**

Create `lib/email/notifications.ts`:

```typescript
// Glue between request data and the email templates/transport. These are the
// only two functions the rest of the app calls: one on submit, one on an
// admin status change. Both inherit sendEmail's never-throws guarantee.

import type { RequestStatus } from "@/lib/requests/status";
import { sendEmail } from "./send";
import { confirmationEmail, emailForStatusChange } from "./templates";

// Absolute link for emails: Vercel's deploy URL in production,
// http://localhost:3000 locally.
export function statusPageUrl(accessToken: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/aanvraag/status/${accessToken}`;
}

export async function sendConfirmationEmail(input: {
  to: string;
  customerName: string;
  accessToken: string;
}): Promise<void> {
  const { subject, html } = confirmationEmail({
    customerName: input.customerName,
    statusUrl: statusPageUrl(input.accessToken),
  });
  await sendEmail({ to: input.to, subject, html });
}

// Snake_case fields so callers can pass a requests row (plus the freshly
// saved fees) without renaming.
export type StatusEmailRequest = {
  email: string;
  customer_name: string;
  access_token: string;
  quote_design_fee: number | string | null;
  quote_print_fee: number | string | null;
};

export async function sendStatusEmail(
  request: StatusEmailRequest,
  newStatus: RequestStatus
): Promise<void> {
  const content = emailForStatusChange(newStatus, {
    customerName: request.customer_name,
    designFee: request.quote_design_fee,
    printFee: request.quote_print_fee,
    statusUrl: statusPageUrl(request.access_token),
  });
  if (content === null) {
    return; // received / approved / printing: no email by design.
  }
  await sendEmail({ to: request.email, subject: content.subject, html: content.html });
}
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run build`
Expected: PASS.

Run: `npm test`
Expected: PASS (unchanged test set).

- [ ] **Step 4: Commit**

```bash
git add lib/email/send.ts lib/email/notifications.ts
git commit -m "feat: Resend transport and notification helpers"
```

---

### Task 4: Confirmation email on submit (Phase 3 touchpoint)

**Files:**
- Modify: `app/aanvraag/actions.ts`

**Interfaces:**
- Consumes: `sendConfirmationEmail` from `@/lib/email/notifications` (Task 3); the `access_token` column from Task 1's migration. **Note:** inserting into a column that doesn't exist yet errors, so the owner must have run `0004_status_page.sql` before this code path is exercised at runtime (the build itself never touches the database).
- Produces: every new request row carries a known `access_token`; the customer receives the confirmation email.

- [ ] **Step 1: Wire token generation and the email into `submitRequest`**

Three edits to `app/aanvraag/actions.ts`.

**Edit 1** — add the import below the existing imports at the top:

```typescript
import { sendConfirmationEmail } from "@/lib/email/notifications";
```

**Edit 2** — generate the token next to the id and include it in the insert. Replace this block:

```typescript
  // Generate the id here instead of reading it back from the insert:
  // PostgREST only returns inserted rows to callers with SELECT permission,
  // and anonymous visitors must never be able to read requests.
  const requestId = crypto.randomUUID();

  const { error: requestError } = await supabase.from("requests").insert({
    id: requestId,
```

with:

```typescript
  // Generate the id here instead of reading it back from the insert:
  // PostgREST only returns inserted rows to callers with SELECT permission,
  // and anonymous visitors must never be able to read requests. The access
  // token follows the same rule — it must go into the confirmation email,
  // and the inserted row can never be read back.
  const requestId = crypto.randomUUID();
  const accessToken = crypto.randomUUID();

  const { error: requestError } = await supabase.from("requests").insert({
    id: requestId,
    access_token: accessToken,
```

**Edit 3** — send the confirmation right before the final redirect. Replace:

```typescript
  redirect("/aanvraag/verzonden");
}
```

(the one at the end of `submitRequest`, after the `request_files` insert block — not the spam-trap redirect at the top) with:

```typescript
  // Fire-and-forget by contract: sendConfirmationEmail never throws, so a
  // Resend outage cannot fail a submission that is already in the database.
  await sendConfirmationEmail({
    to: result.data.email,
    customerName: result.data.customerName,
    accessToken,
  });

  redirect("/aanvraag/verzonden");
}
```

- [ ] **Step 2: Verify build and tests**

Run: `npm run build`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/aanvraag/actions.ts
git commit -m "feat: access token on submit and confirmation email"
```

---

### Task 5: Akkoord action + button

**Files:**
- Create: `app/aanvraag/status/[token]/actions.ts`
- Create: `app/aanvraag/status/[token]/akkoord-button.tsx`

(These come before the page so every task leaves a green build: the page in Task 6 imports the button, never the other way around.)

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `approve_quote_by_token` RPC (Task 1).
- Produces (imported by Task 6's page):
  - `approveQuote(prevState: ApproveState, formData: FormData): Promise<ApproveState>` where `type ApproveState = { error: string | null }`
  - `<AkkoordButton token={string} />`

- [ ] **Step 1: Create the server action**

Create `app/aanvraag/status/[token]/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ApproveState = { error: string | null };

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accept the quote for the request behind this token. The database function
// only flips quoted -> approved; any other current status (double click,
// stale tab) matches nothing, and the revalidated page simply shows the
// current state. No email goes out for 'approved' by design.
export async function approveQuote(
  _prevState: ApproveState,
  formData: FormData
): Promise<ApproveState> {
  const token = String(formData.get("token") ?? "");
  // Postgres rejects a non-uuid argument with a cast error; catch it here so
  // a hand-crafted POST gets the same generic message as any other failure.
  if (!UUID_PATTERN.test(token)) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_quote_by_token", {
    p_token: token,
  });

  if (error) {
    return { error: GENERIC_ERROR };
  }

  // Applied or not, re-render the page with whatever the status now is.
  revalidatePath(`/aanvraag/status/${token}`);
  return { error: null };
}
```

- [ ] **Step 2: Create the button component**

Create `app/aanvraag/status/[token]/akkoord-button.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { approveQuote, type ApproveState } from "./actions";

const initialState: ApproveState = { error: null };

export function AkkoordButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(
    approveQuote,
    initialState
  );

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-green-700 px-6 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Bezig…" : "Akkoord"}
      </button>
      {state.error && (
        <p className="mt-2 text-sm text-red-700">{state.error}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run build`
Expected: PASS (the components are not imported anywhere yet, but must type-check).

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/aanvraag/status/[token]/actions.ts" "app/aanvraag/status/[token]/akkoord-button.tsx"
git commit -m "feat: quote acceptance action and Akkoord button"
```

---

### Task 6: Customer status page + friendly 404

**Files:**
- Create: `app/aanvraag/status/[token]/page.tsx`
- Create: `app/aanvraag/status/[token]/not-found.tsx`

**Interfaces:**
- Consumes: `get_request_by_token` RPC (Task 1); `AkkoordButton` (Task 5); `formatEuro` from `@/lib/email/templates` (Task 2 — pure function, safe to reuse on the page); `STATUS_LABELS`, `RequestStatus` from `@/lib/requests/status`; `createClient` from `@/lib/supabase/server`; `notFound` from `next/navigation`.
- Produces: the `/aanvraag/status/<token>` page — the link target used in every email (Task 3's `statusPageUrl`).

- [ ] **Step 1: Create the not-found page**

Create `app/aanvraag/status/[token]/not-found.tsx`:

```tsx
import Link from "next/link";

// Rendered (with HTTP 404) whenever the page calls notFound(): malformed
// token, unknown token — deliberately indistinguishable, so probing URLs
// leaks nothing.
export default function StatusNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">Deze link is niet (meer) geldig</h1>
      <p className="max-w-md text-gray-600">
        Controleer of je de volledige link uit de e-mail hebt gebruikt. Kom je
        er niet uit? Beantwoord dan de e-mail die je van ons kreeg.
      </p>
      <Link href="/" className="underline">
        Terug naar de homepagina
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Create the status page**

Create `app/aanvraag/status/[token]/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatEuro } from "@/lib/email/templates";
import { STATUS_LABELS, type RequestStatus } from "@/lib/requests/status";
import { AkkoordButton } from "./akkoord-button";

// Private-by-token page: never let a shared or leaked link end up in a
// search index.
export const metadata: Metadata = {
  title: "Status van je aanvraag",
  robots: { index: false, follow: false },
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The linear pipeline shown in the progress indicator; rejected renders as a
// distinct banner instead of a step.
const PIPELINE = [
  "received",
  "quoted",
  "approved",
  "printing",
  "done",
] as const satisfies readonly RequestStatus[];

const TYPE_LABELS: Record<string, string> = {
  catalog: "Kant-en-klaar",
  file: "Print mijn bestand",
  custom: "Eigen ontwerp",
};

// Shape returned by the get_request_by_token function (migration 0004).
type TokenRequest = {
  type: string;
  status: string;
  product_name: string | null;
  quantity: number;
  description: string | null;
  color: string | null;
  material: string | null;
  quote_design_fee: number | string | null;
  quote_print_fee: number | string | null;
  created_at: string;
  file_names: string[];
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function toAmount(value: number | string | null): number {
  if (value === null) return 0;
  return typeof value === "string" ? Number.parseFloat(value) : value;
}

export default async function StatusPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  // Next 16: params is a Promise and must be awaited.
  const { token } = await params;

  // A non-uuid string would make Postgres error on the cast; treat it the
  // same as an unknown token.
  if (!UUID_PATTERN.test(token)) {
    notFound();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_request_by_token", {
    p_token: token,
  });

  const request = (data as TokenRequest[] | null)?.[0];
  if (error || !request) {
    notFound();
  }

  const status = request.status as RequestStatus;
  const hasQuote =
    request.quote_design_fee !== null || request.quote_print_fee !== null;
  const total =
    toAmount(request.quote_design_fee) + toAmount(request.quote_print_fee);

  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Je aanvraag</h1>
      <p className="mt-1 text-sm text-gray-600">
        Ingediend op {formatDate(request.created_at)}
      </p>

      <section className="mt-6">
        {status === "rejected" ? (
          <p className="rounded bg-red-50 px-4 py-3 text-red-800">
            Deze aanvraag is helaas afgewezen. Vragen? Beantwoord de e-mail
            die je van ons kreeg.
          </p>
        ) : (
          <ol className="flex flex-wrap gap-2">
            {PIPELINE.map((step, index) => {
              const reached = index <= PIPELINE.indexOf(status as (typeof PIPELINE)[number]);
              return (
                <li
                  key={step}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    reached
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-300 text-gray-500"
                  }`}
                >
                  {STATUS_LABELS[step]}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <dl className="mt-8 grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
        <dt className="text-gray-600">Type</dt>
        <dd>{TYPE_LABELS[request.type] ?? request.type}</dd>

        {request.product_name && (
          <>
            <dt className="text-gray-600">Product</dt>
            <dd>{request.product_name}</dd>
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

        {request.file_names.length > 0 && (
          <>
            <dt className="text-gray-600">Bestanden</dt>
            <dd>
              <ul>
                {request.file_names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </dd>
          </>
        )}
      </dl>

      {hasQuote && (
        <section className="mt-8 rounded border border-gray-200 p-4">
          <h2 className="text-lg font-bold">Offerte</h2>
          <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            {request.quote_design_fee !== null && (
              <>
                <dt className="text-gray-600">Ontwerpkosten</dt>
                <dd>{formatEuro(request.quote_design_fee)}</dd>
              </>
            )}
            {request.quote_print_fee !== null && (
              <>
                <dt className="text-gray-600">Printkosten</dt>
                <dd>{formatEuro(request.quote_print_fee)}</dd>
              </>
            )}
            <dt className="font-medium">Totaal</dt>
            <dd className="font-medium">{formatEuro(total)}</dd>
          </dl>

          {status === "quoted" && (
            <>
              <p className="mt-4 text-sm text-gray-600">
                Ga je akkoord met deze offerte? Dan gaan we voor je aan de
                slag.
              </p>
              <AkkoordButton token={token} />
            </>
          )}
          {status === "approved" && (
            <p className="mt-4 text-sm text-green-700">
              Je bent akkoord gegaan met de offerte.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify build and tests**

Run: `npm run build`
Expected: PASS — the `/aanvraag/status/[token]` route appears in the route list as dynamic.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/aanvraag/status/[token]/page.tsx" "app/aanvraag/status/[token]/not-found.tsx"
git commit -m "feat: customer status page with quote acceptance"
```

---

### Task 7: Status-change emails from the admin dashboard (Phase 4 touchpoint)

**Files:**
- Modify: `app/admin/(protected)/aanvragen/[id]/actions.ts` (Phase 4's `updateRequest`)

**Interfaces:**
- Consumes: `sendStatusEmail`, `StatusEmailRequest` from `@/lib/email/notifications` (Task 3); Phase 4's `updateRequest` action as merged (shape: validate → `supabase.from("requests").update(...)` → `revalidatePath` → return `{ errors: null, ok: true }`).
- Produces: a customer email whenever the admin *changes* a request's status to `quoted`, `done`, or `rejected`. Saving without a status change (e.g. editing notes) sends nothing; changing to `received`/`approved`/`printing` sends nothing.

> Phase 4's file may differ slightly from its plan after review — anchor these edits on the described logic, not on exact line numbers.

- [ ] **Step 1: Read the current row before the update**

In `app/admin/(protected)/aanvragen/[id]/actions.ts`, add the import below the existing imports:

```typescript
import { sendStatusEmail } from "@/lib/email/notifications";
```

Then, inside `updateRequest`, directly after `const supabase = await createClient();` and before the `.update(...)` call, insert:

```typescript
  // Read the row first: the notification needs the customer's email and
  // access token, and the old status ensures we email only on an actual
  // change — re-saving notes while status stays 'quoted' must not re-send
  // the quote email.
  const { data: existing } = await supabase
    .from("requests")
    .select("status, email, customer_name, access_token")
    .eq("id", requestId)
    .maybeSingle();
```

- [ ] **Step 2: Send the email after a successful update**

Still inside `updateRequest`, after the update's error check (`if (error) { return ...; }`) and before the `revalidatePath` calls, insert:

```typescript
  // Phase 5: notify the customer on a real status change. sendStatusEmail is
  // a no-op for statuses that don't email and never throws — a Resend outage
  // cannot fail the admin's save.
  if (existing && existing.status !== result.data.status) {
    await sendStatusEmail(
      {
        email: existing.email,
        customer_name: existing.customer_name,
        access_token: existing.access_token,
        quote_design_fee: result.data.designFee,
        quote_print_fee: result.data.printFee,
      },
      result.data.status
    );
  }
```

(The fees come from `result.data` — the values just saved — so the quote email always shows what the customer will see on the status page, not stale row values.)

- [ ] **Step 3: Verify build and tests**

Run: `npm run build`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(protected)/aanvragen/[id]/actions.ts"
git commit -m "feat: email customer on status change to quoted, done or rejected"
```

---

## Manual steps (owner, once) — OWNER ACTION

These need the **OWNER** — pause and ask; do not work around a missing step.

1. Create a free **Resend** account; create an API key (send-only).
2. Add environment variables to Vercel (Production + Preview) and `.env.local`:
   - `RESEND_API_KEY` — the Resend key.
   - `EMAIL_FROM` — `onboarding@resend.dev` for now (swap to a verified
     domain sender later; DNS + this var, no code change).
   - `NEXT_PUBLIC_SITE_URL` — the deployed site URL (and
     `http://localhost:3000` locally) for absolute email links.
3. Supabase SQL editor: run `supabase/migrations/0004_status_page.sql` (the
   exact SQL is in Task 1).

Reminder from the spec: in test mode `onboarding@resend.dev` only delivers to the owner's own registered inbox — test by submitting requests with the owner's own email address. Failures for other recipients are expected and non-fatal.

## Owner verification (manual checklist)

Local first, then the live Vercel URL. Requires the manual steps above.

1. Submit a request using the owner's own email → confirmation email
   ("We hebben je aanvraag ontvangen") arrives → its link opens the correct
   status page showing the submitted details.
2. In the dashboard set that request to *Offerte gestuurd* with fees (e.g.
   design `15`, print `7,25`) → quote email arrives showing design fee, print
   fee, and total `€ 22,25`.
3. Click **Akkoord** on the status page → the page shows *Akkoord* reached in
   the progress bar and the button is gone; the dashboard shows `approved`.
   Click-race check: re-posting the form (back button + resubmit) causes no
   error and no change.
4. Set status to *Afgerond* → "Je print is klaar" email; set another request
   to *Afgewezen* → "Over je aanvraag" email with the decline text.
5. Open `/aanvraag/status/<made-up-uuid>` and `/aanvraag/status/abc` → both
   show the friendly Dutch 404, no data, HTTP status 404.
6. Anonymous REST call (use the project URL + anon key, e.g. with curl):
   `POST {SUPABASE_URL}/rest/v1/rpc/get_request_by_token` with a random uuid
   → `[]`. With a valid token → confirm the response contains **no**
   `admin_notes`, `email`, `phone`, or `access_token` fields.
7. Change a status to *Akkoord* or *Wordt geprint* in the dashboard, and
   re-save a request without changing its status → confirm **no** email is
   sent for any of these.

## Self-review notes

- **Spec coverage:** token column + two `security definer` functions + grants (Task 1); pure Dutch templates with `€ 12,50` formatting and Vitest coverage (Task 2); Resend-via-fetch transport that never throws and no-ops without env vars (Task 3); submit wiring with explicit token + confirmation email (Task 4); Akkoord flow `quoted → approved` with idempotent double-click behaviour (Tasks 1, 5); status page with noindex, progress indicator, quote block, friendly Dutch 404 (Task 6); admin wiring emailing only on a real change to `quoted`/`done`/`rejected` (Task 7); owner manual steps verbatim with exact env var names and SQL (bottom sections). Ordering dependency stated at the top of Global Constraints as the spec requires.
- **Beyond-spec decisions, deliberate:** (a) Task 7 reads the row before updating — required anyway for the email/token, and it prevents duplicate emails on a notes-only save; (b) functions are also granted to `authenticated` so the logged-in owner can open a customer link; (c) customer names are HTML-escaped in templates; (d) a uuid-format guard precedes both RPC calls because Postgres would otherwise error on the cast.
- **Type consistency check:** `EmailContent`, `QuoteEmailInput`, `ConfirmationEmailInput`, `formatEuro`, `emailForStatusChange` (Task 2) match their uses in Tasks 3 and 6; `sendConfirmationEmail`/`sendStatusEmail`/`StatusEmailRequest` (Task 3) match Tasks 4 and 7; `ApproveState`/`approveQuote`/`AkkoordButton` (Task 5) match Task 6; the RPC row type in Task 6 (`TokenRequest`) mirrors the `returns table` column list in Task 1, including `file_names text[]` ↔ `file_names: string[]`.
- **Build stays green at every task:** the button (Task 5) lands before the page that imports it (Task 6) — no stubs needed, unlike Phase 4's Task 4–6 dance.
