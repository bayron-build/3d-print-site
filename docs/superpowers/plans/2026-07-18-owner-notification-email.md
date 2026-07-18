# Owner Notification Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email the site owner on every new submission (catalog order, custom design, own file) showing who submitted and what, with a direct link to the admin detail page.

**Architecture:** A new pure template function in `lib/email/templates.ts` renders the notification; a new `sendNewRequestNotification` in `lib/email/notifications.ts` reads `ADMIN_EMAIL` and hands the result to the existing never-throws `sendEmail` transport; `submitRequest` in `app/aanvraag/actions.ts` calls it right after the customer confirmation email.

**Tech Stack:** Next.js 16 server actions, Resend REST API via fetch (existing transport), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-owner-notification-email-design.md`

## Global Constraints

- **No new dependencies** (project rule — the Resend transport is a plain `fetch`).
- **Read `node_modules/next/dist/docs/` before writing Next.js-specific code** — this Next.js version has breaking changes vs. training data (AGENTS.md).
- Email failures must never fail a submission: notification functions never throw; missing config logs a `console.warn` and returns.
- Templates in `lib/email/templates.ts` stay pure — no I/O, no `process.env` access.
- All customer-supplied strings that land in HTML bodies go through the existing `escapeHtml`. Email **subjects** are plain text, not HTML — no escaping there.
- Site copy is Dutch; owner-facing email copy is Dutch too.
- Test command: `npm test` (vitest run); single file: `npx vitest run lib/email/templates.test.ts`.

---

### Task 1: `ownerNotificationEmail` template

**Files:**
- Modify: `lib/email/templates.ts` (add type + function at the end of the file)
- Test: `lib/email/templates.test.ts` (add a `describe` block at the end)

**Interfaces:**
- Consumes: existing helpers in `lib/email/templates.ts` — `layout(paragraphs: string[]): string`, `escapeHtml(value: string): string`, `statusLink(url: string, label: string): string`, and `formatEuro`/`toAmount` from `@/lib/format`.
- Produces (Task 2 relies on these exact names):

```ts
export type OwnerNotificationInput = {
  customerName: string;
  email: string;
  phone: string | null;
  adminUrl: string;
  // Exactly one of the two below is set: `order` for catalog, `request` for custom/file.
  order?: { productName: string; unitPrice: number | string; quantity: number };
  request?: {
    description: string | null;
    color: string | null;
    material: string | null;
    quantity: number;
    fileCount: number;
  };
};

export function ownerNotificationEmail(input: OwnerNotificationInput): EmailContent;
```

- [ ] **Step 1: Write the failing tests**

Append to `lib/email/templates.test.ts` (extend the import list at the top with `ownerNotificationEmail`):

```ts
describe("ownerNotificationEmail", () => {
  const ADMIN_URL =
    "https://example.com/admin/aanvragen/00000000-0000-0000-0000-000000000000";

  const catalogInput = {
    customerName: "Jan",
    email: "jan@example.com",
    phone: "0612345678",
    adminUrl: ADMIN_URL,
    order: { productName: "Vaas", unitPrice: "12.50", quantity: 3 },
  };

  const customInput = {
    customerName: "Jan",
    email: "jan@example.com",
    phone: null,
    adminUrl: ADMIN_URL,
    request: {
      description: "Een kapotte klink namaken",
      color: "Zwart",
      material: "PETG",
      quantity: 2,
      fileCount: 2,
    },
  };

  it("catalog: subject names the sender, body shows contact, product and totals", () => {
    const email = ownerNotificationEmail(catalogInput);
    expect(email.subject).toBe("Nieuwe bestelling van Jan");
    expect(email.html).toContain("jan@example.com");
    expect(email.html).toContain("0612345678");
    expect(email.html).toContain("Product: Vaas");
    expect(email.html).toContain("Aantal: 3");
    expect(email.html).toContain("Prijs per stuk: € 12,50");
    expect(email.html).toContain("Totaal: € 37,50");
    expect(email.html).toContain(ADMIN_URL);
  });

  it("custom/file: subject says aanvraag, body shows details and attachment count", () => {
    const email = ownerNotificationEmail(customInput);
    expect(email.subject).toBe("Nieuwe aanvraag van Jan");
    expect(email.html).toContain("Een kapotte klink namaken");
    expect(email.html).toContain("Kleur: Zwart");
    expect(email.html).toContain("Materiaal: PETG");
    expect(email.html).toContain("Aantal: 2");
    expect(email.html).toContain("Bijlagen: 2");
    expect(email.html).toContain(ADMIN_URL);
  });

  it("omits the phone line when phone is null", () => {
    const email = ownerNotificationEmail(customInput);
    expect(email.html).not.toContain("Telefoon");
  });

  it("omits empty detail lines (no description/color/material)", () => {
    const email = ownerNotificationEmail({
      ...customInput,
      request: {
        description: null,
        color: null,
        material: null,
        quantity: 1,
        fileCount: 1,
      },
    });
    expect(email.html).not.toContain("Omschrijving");
    expect(email.html).not.toContain("Kleur");
    expect(email.html).not.toContain("Materiaal");
  });

  it("escapes HTML in customer-supplied fields", () => {
    const email = ownerNotificationEmail({
      ...customInput,
      customerName: "<script>alert(1)</script>",
      request: { ...customInput.request, description: "<img src=x>" },
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<img");
    expect(email.html).toContain("&lt;img");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/email/templates.test.ts`
Expected: FAIL — `ownerNotificationEmail` is not exported.

- [ ] **Step 3: Implement the template**

Append to `lib/email/templates.ts`:

```ts
// Owner notification: sent to ADMIN_EMAIL on every new submission so the
// inbox answers "who and what" without opening the admin site. Subjects are
// plain text (no HTML escaping); everything in the body is escaped.
export type OwnerNotificationInput = {
  customerName: string;
  email: string;
  phone: string | null;
  adminUrl: string;
  // Exactly one of the two below is set: `order` for catalog, `request` for custom/file.
  order?: { productName: string; unitPrice: number | string; quantity: number };
  request?: {
    description: string | null;
    color: string | null;
    material: string | null;
    quantity: number;
    fileCount: number;
  };
};

export function ownerNotificationEmail(
  input: OwnerNotificationInput
): EmailContent {
  const contact = [
    `Naam: ${escapeHtml(input.customerName)}`,
    `E-mail: ${escapeHtml(input.email)}`,
  ];
  if (input.phone !== null) {
    contact.push(`Telefoon: ${escapeHtml(input.phone)}`);
  }

  const details: string[] = [];
  if (input.order) {
    const total = toAmount(input.order.unitPrice) * input.order.quantity;
    details.push(
      `Product: ${escapeHtml(input.order.productName)}`,
      `Aantal: ${input.order.quantity}`,
      `Prijs per stuk: ${formatEuro(input.order.unitPrice)}`,
      `<strong>Totaal: ${formatEuro(total)}</strong>`
    );
  } else if (input.request) {
    if (input.request.description !== null) {
      details.push(`Omschrijving: ${escapeHtml(input.request.description)}`);
    }
    if (input.request.color !== null) {
      details.push(`Kleur: ${escapeHtml(input.request.color)}`);
    }
    if (input.request.material !== null) {
      details.push(`Materiaal: ${escapeHtml(input.request.material)}`);
    }
    details.push(`Aantal: ${input.request.quantity}`);
    details.push(`Bijlagen: ${input.request.fileCount}`);
  }

  return {
    subject: input.order
      ? `Nieuwe bestelling van ${input.customerName}`
      : `Nieuwe aanvraag van ${input.customerName}`,
    html: layout([
      input.order
        ? "Er is een nieuwe bestelling binnengekomen."
        : "Er is een nieuwe aanvraag binnengekomen.",
      contact.join("<br>"),
      details.join("<br>"),
      `Bekijk de details in het ${statusLink(input.adminUrl, "beheer")}.`,
    ]),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/email/templates.test.ts`
Expected: PASS (all, including the pre-existing template tests).

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test` — expected: all pass.

```bash
git add lib/email/templates.ts lib/email/templates.test.ts
git commit -m "feat: owner notification email template"
```

---

### Task 2: Send the notification on submit

**Files:**
- Modify: `lib/email/notifications.ts` (new function + admin URL helper)
- Modify: `app/aanvraag/actions.ts` (product name in the price lookup; one call after the confirmation email)
- Modify: `.env.example` (document the email env vars)
- Modify: `.env.local` (add `ADMIN_EMAIL` — gitignored, local only)

**Interfaces:**
- Consumes (from Task 1): `ownerNotificationEmail(input: OwnerNotificationInput): EmailContent` from `./templates`, where `OwnerNotificationInput` is `{ customerName: string; email: string; phone: string | null; adminUrl: string; order?: { productName: string; unitPrice: number | string; quantity: number }; request?: { description: string | null; color: string | null; material: string | null; quantity: number; fileCount: number } }`.
- Produces:

```ts
export async function sendNewRequestNotification(
  input: {
    requestId: string;
  } & Omit<OwnerNotificationInput, "adminUrl">
): Promise<void>;
```

- [ ] **Step 1: Add `sendNewRequestNotification` to `lib/email/notifications.ts`**

Extend the import at the top of the file:

```ts
import {
  confirmationEmail,
  emailForStatusChange,
  ownerNotificationEmail,
  type OrderSummary,
  type OwnerNotificationInput,
} from "./templates";
```

Append at the end of the file:

```ts
// Owner alert on every new submission. ADMIN_EMAIL unset (e.g. local dev)
// follows the transport's pattern: warn and skip, never fail the submit.
export function adminRequestUrl(requestId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/+$/, "")}/admin/aanvragen/${requestId}`;
}

export async function sendNewRequestNotification(
  input: { requestId: string } & Omit<OwnerNotificationInput, "adminUrl">
): Promise<void> {
  const to = process.env.ADMIN_EMAIL;
  if (!to) {
    console.warn("[email] ADMIN_EMAIL not set; skipping owner notification");
    return;
  }
  const { subject, html } = ownerNotificationEmail({
    ...input,
    adminUrl: adminRequestUrl(input.requestId),
  });
  await sendEmail({ to, subject, html });
}
```

- [ ] **Step 2: Wire it into `app/aanvraag/actions.ts`**

Three edits:

(a) Extend the notifications import (line 10):

```ts
import {
  sendConfirmationEmail,
  sendNewRequestNotification,
} from "@/lib/email/notifications";
```

(b) In the catalog price lookup, also fetch the product name. Replace:

```ts
  let unitPrice: number | string | null = null;
  if (result.data.type === "catalog") {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("indicative_price")
```

with:

```ts
  let unitPrice: number | string | null = null;
  let productName = "";
  if (result.data.type === "catalog") {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("name, indicative_price")
```

and after `unitPrice = product.indicative_price;` add:

```ts
    productName = product.name;
```

(c) After the `await sendConfirmationEmail({ ... });` call (before the final `redirect`), add:

```ts
  // Owner alert — same never-throws guarantee as the confirmation above.
  await sendNewRequestNotification({
    requestId,
    customerName: result.data.customerName,
    email: result.data.email,
    phone: result.data.phone,
    order:
      unitPrice !== null
        ? { productName, unitPrice, quantity: result.data.quantity }
        : undefined,
    request:
      unitPrice === null
        ? {
            description: result.data.description,
            color: result.data.color,
            material: result.data.material,
            quantity: result.data.quantity,
            fileCount: uploadedFiles.length,
          }
        : undefined,
  });
```

- [ ] **Step 3: Document and set the env var**

Replace the contents of `.env.example` with:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
NEXT_PUBLIC_SITE_URL=https://your-site.example.com
RESEND_API_KEY=re_xxx
EMAIL_FROM=onboarding@resend.dev
ADMIN_EMAIL=owner@example.com
```

Append to `.env.local` (do not overwrite existing lines):

```
ADMIN_EMAIL=bayuronald@hotmail.com
```

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit` — expected: no errors.
Run: `npm run lint` — expected: no errors.
Run: `npm test` — expected: all pass.

- [ ] **Step 5: Manual verification (local)**

1. `npm run dev`
2. Submit a test request at `http://localhost:3000/aanvraag` (custom flow, no uploads needed).
3. Expected in the dev server console: either a Resend send for the owner notification (if `RESEND_API_KEY`/`EMAIL_FROM` are set in `.env.local`) or the two skip warnings — but **never** an error, and the submit must still land on `/aanvraag/verzonden`.
4. If Resend is configured locally: check the inbox for "Nieuwe aanvraag van {naam}" and click the admin link — it must open `/admin/aanvragen/{id}` for that request (after admin login).

- [ ] **Step 6: Commit**

```bash
git add lib/email/notifications.ts app/aanvraag/actions.ts .env.example
git commit -m "feat: notify owner by email on every new submission"
```

---

### Deploy note (user action, not a code task)

In Vercel → Project → Settings → Environment Variables, add `ADMIN_EMAIL` = the address the Resend account is registered with (test mode only delivers there), then redeploy. Switch it to any preferred address once the Resend domain is verified.
