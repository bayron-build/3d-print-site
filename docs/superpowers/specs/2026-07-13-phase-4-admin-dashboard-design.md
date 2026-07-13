# Phase 4 Design — Admin Dashboard: List, Detail, Quoting, Status Updates

**Date:** 2026-07-13
**Project:** 3D print service web app (portfolio project)
**Scope:** Phase 4 only. Emails and the customer status page (Phase 5), the
public landing page/catalog, and admin product management (both Phase 6) are
out of scope. Phase 4 assumes Phase 3 is complete: requests and files exist,
and migration `0003` already granted the admin full access to the
`request-files` bucket.

## Phase 4 goal

The admin (single owner account) can run the whole request pipeline from the
app: see all requests in a filterable list, open any request, download its
uploaded model files, set a quote (design fee + print fee), change the
status, keep notes, and delete junk requests including their stored files.
After this phase the Supabase dashboard is no longer needed for day-to-day
operation.

## Decisions made

- **Requests only** — no admin product management in this phase. Products
  keep going in via SQL; admin product CRUD joins the catalog work in
  Phase 6.
- **One edit form, manual status** — design fee, print fee, status dropdown
  and admin notes save together with one button. Nothing changes status
  automatically and no transition rules are enforced: the admin picks any of
  the six statuses at any time. Predictable, and Phase 5 hooks its
  status-change emails onto this single save path.
- **List gets a status filter only** — newest first, filter via `?status=`
  in the URL. No search, no pagination: a local print service will not
  outgrow one page for a long time, and both are easy to add later.
- **Delete with confirmation** — removes the storage objects first, then the
  request row (DB cascade removes `request_files` rows). Keeps spam and test
  junk from eating the 1GB free storage tier.
- **Downloads via short-lived signed URLs** (1 hour), generated server-side
  when the detail page renders. The browser downloads directly from Supabase
  Storage — Phase 3's rule in reverse: a 50MB file must not pass through a
  Vercel function in either direction.
- **No database migration and no owner SQL in this phase.** The admin
  all-access RLS policies (migration `0002`) and the admin storage policy on
  `request-files` (migration `0003`) already cover every read, update,
  delete and signed-URL creation Phase 4 performs.
- **Server components + server actions**, the same architecture as Phases
  2–3. No new dependencies. Client-side data fetching with API routes was
  rejected (new pattern, more code, no gain for one admin); doing quoting in
  the Supabase table editor was rejected (fails the phase goal).
- **Dutch decimal commas accepted** in fee inputs ("12,50" and "12.50" both
  parse). Fees are optional: empty input saves `null`.

## Routes and UX (all UI text Dutch)

### `/admin` — request list (upgrades the existing count page)

- Table, newest first: date, customer name, type, quantity, status.
- Each row links to `/admin/aanvragen/[id]`.
- Status filter links above the table: *Alle* plus one per status, driven by
  `?status=` (server component; `searchParams` is a Promise in Next 16 —
  await it). Unknown `?status=` values are treated as *Alle*.
- Statuses render as colored badges with Dutch labels from one shared
  mapping: `received` → *Ontvangen*, `quoted` → *Offerte gestuurd*,
  `approved` → *Akkoord*, `printing` → *Wordt geprint*, `done` →
  *Afgerond*, `rejected` → *Afgewezen*.
- The existing "N aanvragen" count stays as a subtitle; empty result shows a
  Dutch empty-state line.

### `/admin/aanvragen/[id]` — detail page

Lives inside the existing `(protected)` route group so the auth gate covers
it. Dutch URL segment to match the public `/aanvraag`. Three parts:

1. **Read-only info:** customer name, email (`mailto:` link), phone, type,
   description, color, material, quantity, submission date. Catalog
   requests also show the product name (join). File requests list each
   uploaded file: original filename, human-readable size, download link
   (signed URL, 1 hour).
2. **Edit form (one save button):** design fee and print fee as text inputs
   (optional, comma or dot decimals), status dropdown (six Dutch labels),
   notes textarea. The computed total of both fees is displayed for
   convenience. Saving shows a Dutch confirmation ("Opgeslagen"); validation
   errors appear inline, form state preserved (`useActionState`, as in the
   public form).
3. **Danger zone:** delete button → explicit confirmation step → delete
   action → redirect to `/admin`.

Unknown or malformed id → `notFound()` (404).

## Data flow

- **Reads:** both pages are server components querying through the admin's
  session (`lib/supabase/server`). RLS is the security boundary; the
  `(protected)` layout gate is convenience. The detail page fetches the
  request (+ product name), its `request_files` rows, and creates all
  signed URLs in one `createSignedUrls` batch call.
- **`updateRequest` server action:** receives id + form fields → validates
  via the pure module (below) → updates `quote_design_fee`,
  `quote_print_fee`, `status`, `admin_notes` → `revalidatePath` for the
  list and detail pages → returns state for inline errors/confirmation.
  This action is deliberately the single place status changes happen, so
  Phase 5 can attach "status changed → email customer" here without
  restructuring.
- **`deleteRequest` server action:** fetches the request's storage paths →
  removes the storage objects (skipped when the request has none) → only if that succeeds, deletes the request
  row (cascade removes `request_files`) → redirects to `/admin`. If storage
  removal fails, abort with a Dutch error and leave everything intact —
  retryable, and never a file left behind without a request pointing at it.

## Validation — `lib/requests/admin-validation.ts`

Pure module, no I/O, unit-tested (same pattern as Phase 3's
`validation.ts`):

- Fee: empty/whitespace → `null`; otherwise must parse as a non-negative
  amount with at most 2 decimals, comma or dot separator; anything else →
  Dutch field error.
- Status: must be one of the six known values (allowlist, shared from
  `lib/requests/status.ts`).
- Notes: free text, trimmed, empty → `null`.

## Code structure

| File | Role |
|---|---|
| `app/admin/(protected)/page.tsx` | modify: list table + status filter |
| `app/admin/(protected)/aanvragen/[id]/page.tsx` | detail server component (`params` is a Promise in Next 16 — await it) |
| `app/admin/(protected)/aanvragen/[id]/quote-form.tsx` | client: edit form with `useActionState` |
| `app/admin/(protected)/aanvragen/[id]/delete-button.tsx` | client: confirmation step + delete action |
| `app/admin/(protected)/aanvragen/[id]/actions.ts` | `updateRequest`, `deleteRequest` server actions |
| `lib/requests/status.ts` | status values, Dutch labels, badge styles — shared by list, detail, validation; Phase 5 reuses it |
| `lib/requests/admin-validation.ts` | pure fee/status/notes validation |
| `lib/requests/admin-validation.test.ts` | Vitest unit tests |

## Error handling

- Unknown request id → 404 via `notFound()`. Logged out → existing layout
  gate redirects to `/admin/login`.
- List/detail query failure → visible Dutch error on the page (the
  `/status` philosophy: misconfiguration must be visible, never a white
  screen).
- Signed-URL creation failure → page still renders; the file list shows a
  Dutch "download tijdelijk niet beschikbaar" note instead of links.
- Save/delete failure → generic Dutch message ("Er ging iets mis, probeer
  het later opnieuw."), no English Supabase internals leaked to the UI.
- Validation errors → inline Dutch messages next to the fields, form state
  preserved.

## Testing

- **Vitest unit tests** for `admin-validation.ts`: fee parsing ("12,50",
  "12.50", empty → null, negative, three decimals, garbage, zero), status
  allowlist, notes trimming.
- **Manual checklist (local, then live after deploy):**
  1. List shows Phase 3's test requests, newest first; status filter works;
     unknown `?status=` behaves as *Alle*.
  2. Detail of each type renders correctly (product name for catalog, files
     for file type).
  3. A file downloads via its link and matches the uploaded model.
  4. Save a quote with a comma decimal → confirmation shown, values correct
     in Supabase, badge in the list updates after status change.
  5. Invalid fee (e.g. "abc", "-5") → inline Dutch error, nothing saved.
  6. Delete a file-type request → confirmation step, row gone, bucket
     objects gone, back at the list.
  7. Unknown id → 404. Logged out → `/admin/aanvragen/[id]` redirects to
     the login page.

## Manual steps (owner)

None before implementation — no migration, no SQL. Only the manual
verification checklist above (owner browser test), as in every phase.
