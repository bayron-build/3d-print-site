# Phase 5 Design — Emails + Customer Status Page (Magic Link)

**Date:** 2026-07-13
**Project:** 3D print service web app (portfolio project)
**Scope:** Phase 5 only. Phase 4 (admin dashboard: list, detail, quoting,
status updates) and Phase 6 (public landing page + catalog) are out of scope.
Phase 5 depends on both Phase 3 and Phase 4 being merged first (see
"Coordination" below).

## Phase 5 goal

After this phase, a customer who submits a request receives a Dutch
confirmation email containing a private link to their own status page.
When the owner sets a request's status to `quoted`, `done`, or `rejected`
in the admin dashboard, the customer receives an email about it. On the
status page the customer sees their request, the quote once it exists, and
an **Akkoord** button to accept a quote. No accounts, no login — access is
by an unguessable token in the link.

## Decisions made

- **Secret token in the URL, not Supabase Auth magic links.** Each request
  gets a random unguessable `access_token`; the status link is
  `/aanvraag/status/<token>` and works indefinitely with no login. This fits
  the roadmap's "no customer accounts" rule (Supabase Auth magic links would
  create real users, expire in ~1 hour, and force an email round-trip on
  every later visit). Accepted trade-off: anyone who has the link can view
  that one request — acceptable for non-sensitive print-job status.
- **Token access via `security definer` SQL functions, not a service-role
  key.** Anonymous users cannot read `requests` (Phase 2 RLS). Rather than
  introduce Supabase's secret admin key into the app (which would bypass
  ALL row-level security if any code path slipped), two small Postgres
  functions run with elevated rights but expose exactly one request per
  valid token, and never `admin_notes`. Keeps the project's "no secret
  Supabase keys in the app" architecture; the database stays the security
  boundary. `RESEND_API_KEY` is the only server secret introduced, and it
  can only send email.
- **Emails on `quoted`, `done`, `rejected` only** — plus the always-sent
  submit confirmation. `approved` and `printing` send no email; the status
  page already shows progress, and emailing every intermediate step is noise.
- **Quote acceptance is a button on the status page.** The page shows the
  quote with an **Akkoord** button; clicking it flips the status
  `quoted → approved` via a token function, and the owner sees it in the
  dashboard. Keeps the page account-free; no manual bookkeeping from email
  replies.
- **Resend via plain `fetch`, no new npm dependency.** A small module calls
  Resend's REST API directly. Consistent with the project's minimal-
  dependency rule.
- **Test mode is fine for v1 (no domain yet).** Resend's free sender
  `onboarding@resend.dev` only delivers to the owner's own registered inbox
  until a domain is DNS-verified. The app treats email failure as non-fatal,
  so this is a config swap later (`EMAIL_FROM` env var + DNS), not a code
  change. Testing is done by submitting requests with the owner's own email.
- **Email sending is never fatal.** If Resend is down or rejects an address,
  the request submission and the admin status change still succeed; the
  failure is logged, not surfaced as an error to the user or owner action.
- **Vitest for template logic only** — same pattern as Phase 3's validation
  module. Pure template functions are unit-tested; email delivery and UI
  flows stay on the manual checklist.

## The magic link (token)

- New column on `requests`: `access_token uuid`, `not null`, `unique`,
  default `gen_random_uuid()`. Unguessable (122 bits of randomness).
- Phase 3's `submitRequest` server action already generates the request's
  `id` itself (anonymous users cannot read inserted rows back). It generates
  the `access_token` the same way and embeds it in the confirmation email
  link. The DB default covers any row inserted without an explicit token.
- Status page URL: `/aanvraag/status/<token>`.
- The status page renders a `noindex` robots meta tag so a shared or leaked
  link never lands in a search index.

## Database changes — `supabase/migrations/0004_status_page.sql`

Run once by the owner in the Supabase web SQL editor (same workflow as
Phases 2–3).

- **Column:**
  `alter table requests add column access_token uuid not null default
  gen_random_uuid()`, then a unique constraint/index on it. The default
  backfills any existing rows with a token.
- **Function `public.get_request_by_token(p_token uuid)`** — `security
  definer`, `stable`. Returns exactly the customer-safe fields of the single
  request matching `p_token`: `type`, `status`, product name (joined from
  `products`), `quantity`, `description`, `color`, `material`,
  `quote_design_fee`, `quote_print_fee`, `created_at`, and the associated
  `request_files` original names. **Never returns `admin_notes`, `email`,
  `phone`, or the token itself.** Returns no rows for an unknown token.
- **Function `public.approve_quote_by_token(p_token uuid)`** — `security
  definer`, `volatile`. Sets `status = 'approved'` for the request matching
  `p_token` **only when its current status is `quoted`** (guard in the
  `where` clause). Returns a boolean / row count indicating whether it
  applied, so the UI can react. Idempotent-safe: a second click while already
  `approved` simply matches nothing and reports "no change".
- **`grant execute`** on both functions to the `anon` role (they are the
  controlled read/write surface for the token flow). No new anon table
  policies — the functions are the only exposure.
- `security definer` functions set a safe `search_path` (e.g. `public`) per
  Supabase's own linting guidance.

No new tables. `requests`, `request_files`, `products` already fit.

## Email module — no new dependency

| File | Role |
|---|---|
| `lib/email/send.ts` | `sendEmail({ to, subject, html })` — calls Resend's REST API with `fetch`. Reads `RESEND_API_KEY` and `EMAIL_FROM`. Returns success/failure; **never throws to the caller** (logs and reports failure instead). No-op-with-warning if env vars are missing, so local dev without a key still runs. |
| `lib/email/templates.ts` | Pure Dutch template functions, one per email type, each returning `{ subject, html }`. Money formatted Dutch-style (`€ 12,50`). Takes the request's customer-safe data + the absolute status-page URL. No I/O — unit-testable. |
| `lib/email/templates.test.ts` | Vitest: correct subject per type, fees formatted correctly, status-page link present in the body. |

Needs `NEXT_PUBLIC_SITE_URL` (or equivalent) to build absolute links in
emails — Vercel's deploy URL in production, `http://localhost:3000` locally.

## The four emails (all Dutch, simple inline HTML)

| Trigger | Subject (indicative) | Body essentials |
|---|---|---|
| Request submitted | "We hebben je aanvraag ontvangen" | Thanks; the status-page link ("volg je aanvraag"); what happens next (manual quote by email). |
| Status → `quoted` | "Je offerte staat klaar" | Design fee + print fee + total; link to view and accept (Akkoord). |
| Status → `done` | "Je print is klaar" | Print is finished; link; note on pickup/payment (bank transfer/Tikkie). |
| Status → `rejected` | "Over je aanvraag" | Polite decline; link. |

`approved` and `printing` send nothing.

## Routes and UX (all UI text Dutch)

### `/aanvraag/status/[token]` — customer status page

Server component. On load it calls `get_request_by_token` (via the anon
browser/server Supabase client, which may execute the granted function).

- **Valid token:** request summary (type, product/description, quantity,
  color/material, uploaded file names, submitted date), a simple status
  progress indicator across the pipeline
  (`received → quoted → approved → printing → done`, or a distinct
  `rejected` state), the quote block once `quote_design_fee` /
  `quote_print_fee` are set (design fee + print fee + total), and — **only
  while status is `quoted`** — the **Akkoord** button.
- **Akkoord button:** a small client interaction posting to a server action
  that calls `approve_quote_by_token`; on success the page re-renders showing
  `approved` and no button. If the status already moved on, the action
  reports no change and the page just reflects current state.
- **Invalid/unknown token:** a friendly Dutch "deze link is niet (meer)
  geldig" page. No distinction between a wrong token and one that never
  existed. HTTP 404.
- `noindex` on the route.

## Coordination with parallel sessions (Phases 3 & 4)

The owner runs multiple sessions; one is **executing Phase 3**, another is
**planning Phase 4**. Phase 5 must execute **after both are merged**.

- **Phase 3 touchpoint:** Phase 5 adds a few lines to
  `app/aanvraag/actions.ts` — generate `access_token`, and after a
  successful insert call `sendEmail` with the submit-confirmation template.
  The token column default means an un-updated Phase 3 still produces valid
  rows; Phase 5's wiring makes the confirmation email go out.
- **Phase 4 touchpoint:** Phase 5 hooks into Phase 4's status-update server
  action with a **single call** after a successful update:
  `sendStatusEmail(request, newStatus)` — a no-op for statuses that don't
  email (`received`, `approved`, `printing`). The Phase 4 plan does **not**
  need to anticipate this; the Phase 5 implementation plan owns the wiring
  step. Because the wiring edits Phase 4's action file, **Phase 5 executes
  after Phase 4**.

The Phase 5 implementation plan must state this ordering dependency
explicitly at the top.

## Error handling

- **Email send failure** → logged server-side; the triggering operation
  (request submit, status change) still succeeds. Never shown to the user;
  never blocks the owner's dashboard action. Expected in test mode for any
  recipient other than the owner's own inbox.
- **Missing email env vars** (local dev) → `sendEmail` no-ops with a console
  warning instead of crashing.
- **Invalid token on the status page** → 404 with a friendly Dutch page, no
  information leak.
- **Double-click Akkoord / already-approved** → `approve_quote_by_token`
  matches nothing, page reflects current status; no error.
- **RLS remains the security boundary:** the two `security definer`
  functions are the only anon exposure of request data, expose exactly one
  request per valid token, and never return `admin_notes`, `email`, or
  `phone`. A hand-crafted call with a random token returns nothing.

## Testing

- **Vitest** (`lib/email/templates.test.ts`): subject per email type, Dutch
  money formatting (`€ 12,50`), presence of the status-page link in the body.
- **Manual checklist (local, then live after deploy):**
  1. Submit a request using the owner's own email → confirmation email
     arrives → its link opens the correct status page.
  2. In the dashboard set the request to `quoted` (with fees) → quote email
     arrives showing design fee + print fee + total.
  3. Click **Akkoord** on the status page → status becomes `approved`,
     visible in the dashboard; button disappears.
  4. Set status to `done` → "je print is klaar" email; to `rejected` on
     another request → decline email.
  5. Open `/aanvraag/status/<made-up-token>` → friendly 404, no data.
  6. Anonymous REST/RPC call to `get_request_by_token` with a random token
     → empty; confirm `admin_notes`/`email`/`phone` never appear in the
     function's output for a valid token either.
  7. Confirm `approved`/`printing` transitions send no email.

## Manual steps (owner, once)

1. Create a free **Resend** account; create an API key (send-only).
2. Add environment variables to Vercel (Production + Preview) and
   `.env.local`:
   - `RESEND_API_KEY` — the Resend key.
   - `EMAIL_FROM` — `onboarding@resend.dev` for now (swap to a verified
     domain sender later; DNS + this var, no code change).
   - `NEXT_PUBLIC_SITE_URL` — the deployed site URL (and
     `http://localhost:3000` locally) for absolute email links.
3. Supabase SQL editor: run `0004_status_page.sql`.

The implementation plan must include these steps verbatim with the exact
SQL and env var names, marked as OWNER ACTION.

## Explicitly not in Phase 5

Domain verification / custom sending domain (later config swap), email on
`approved`/`printing`, customer accounts or login, editing a request after
submission, resending/regenerating a lost status link (revisit if needed).
