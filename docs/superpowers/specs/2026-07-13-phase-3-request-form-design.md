# Phase 3 Design — Public Request Form, File Upload, License Checkbox

**Date:** 2026-07-13
**Project:** 3D print service web app (portfolio project)
**Scope:** Phase 3 only. The full admin dashboard (Phase 4), emails/customer
status page (Phase 5), and public landing page/catalog (Phase 6) are out of
scope. This phase also delivers the items Phase 2 explicitly deferred to it:
the storage bucket + upload policies, the anonymous insert policies, and the
first automated tests.

## Phase 3 goal

Any visitor can submit a request of all three types — ready-made (catalog),
print-my-file (with uploads), or custom design — through one Dutch form at
`/aanvraag`, without logging in. Submitted requests appear in the `requests`
table (the Phase 2 dashboard count goes up), uploaded files land in a private
storage bucket, and anonymous visitors still cannot read any request data.

## Decisions made

- **One form for all three types** at `/aanvraag`, with a type selector.
  The catalog type gets a product dropdown now (populated from `products
  where active`); Phase 6's catalog pages will link to
  `/aanvraag?product=<id>` to pre-select a product — no rework later.
- **Files upload browser → Supabase Storage directly.** A Next.js server
  action caps request bodies at 1MB by default and Vercel serverless caps
  them at ~4.5MB regardless of configuration, so a 50MB model file can never
  travel through the server. Only small metadata goes through the action.
- **Anonymous upload policy, not signed URLs** — a storage RLS policy lets
  anon INSERT into the private bucket (never read/list/delete). Keeps the
  no-secret-keys architecture of Phases 1–2. Accepted trade-off: bots could
  dump files; mitigated by the honeypot, the bucket's 50MB cap, and the
  easily monitored 1GB free tier.
- **Up to 5 files per request**, each max 50MB, extensions `.stl`, `.3mf`,
  `.step`, `.stp` (case-insensitive). Covers multi-part models; the
  `request_files` schema already supports many files per request.
- **No MIME allowlist on the bucket** — browsers report 3D file types
  inconsistently (usually `application/octet-stream`), so MIME checks are
  theater. Enforcement = extension checks in app code + the bucket-level
  50MB size cap that Supabase enforces server-side.
- **Honeypot spam protection** — an invisible field; submissions that fill
  it are silently dropped (the action pretends success, saves nothing). No
  dependencies, no user friction. CAPTCHA deliberately rejected for v1.
- **Server action generates the request UUID itself** instead of reading it
  back from the insert. PostgREST only returns inserted rows to callers with
  SELECT permission, and anon SELECT on `requests` would expose all customer
  data. Anon stays insert-only, read-nothing.
- **License rule enforced in the database**, not only the UI: the anon
  insert policy requires `license_accepted = true` whenever `type = 'file'`.
- **Vitest, logic only** — one new dev dependency; unit tests for the pure
  validation module. UI flows stay on the manual checklist, like previous
  phases. (Testing from Phase 3 onward was decided in Phase 1.)
- **Orphaned uploads accepted** — files uploaded but never submitted stay in
  the private bucket. Harmless and manually cleanable; revisit in Phase 4 if
  it ever matters.

## Routes and UX (all UI text Dutch)

### `/aanvraag` — the request form

Type selector (radio, required): *Kant-en-klaar ontwerp* / *Print mijn
bestand* / *Eigen ontwerp*. Selecting a type shows its fields; common fields
are always visible.

| Field | Types | Rules |
|---|---|---|
| Naam | all | required |
| E-mailadres | all | required, email format |
| Telefoonnummer | all | optional |
| Product | catalog | required; dropdown of active products; pre-selected via `?product=<id>` (unknown/inactive id: no pre-selection, no error) |
| Bestanden | file | 1–5 files, `.stl`/`.3mf`/`.step`/`.stp`, ≤ 50MB each |
| Licentie-checkbox | file | required to submit: own design or commercial printing permitted |
| Omschrijving | all | required for custom (hint: dimensions + purpose); optional otherwise |
| Kleur | all | optional, free text |
| Materiaal | file, custom | optional, free text |
| Aantal | catalog, file | integer ≥ 1, default 1 |
| Honeypot | all | invisible to humans; must be empty |

### `/aanvraag/verzonden` — confirmation

Static page: thanks, "je hoort van ons via e-mail". No request ID shown —
the customer status page arrives with magic links in Phase 5.

### Homepage link

The placeholder homepage gets a link to `/aanvraag` so the form is reachable
before Phase 6 builds the real landing page.

## Submission flow

1. Client-side validation runs first (required fields, file count/extension/
   size) — as UX, not security; the server re-validates everything.
2. On submit, for the file type, the browser uploads each file to the
   private bucket `request-files` at `{crypto.randomUUID()}/{sanitized
   filename}` (sanitize = keep letters, digits, `.`, `-`, `_`; replace the
   rest with `_`; the original name is preserved in `request_files`) using
   the existing browser Supabase client (publishable key +
   anon upload policy). Upload state is shown; any failure stops the submit
   with a retryable Dutch error — no half-saved requests.
3. The server action `submitRequest` then receives only text fields + file
   metadata (storage path, original name, size). It: checks the honeypot
   (silently pretends success if filled) → validates with the shared
   validation module → generates the request UUID → inserts the `requests`
   row and `request_files` rows via the anon server client.
4. Success → redirect to `/aanvraag/verzonden`.

## Database changes — `supabase/migrations/0003_request_form.sql`

Run once by the owner in the web SQL editor (same workflow as Phase 2).

- **Bucket:** insert into `storage.buckets`: id/name `request-files`,
  `public = false`, `file_size_limit = 52428800` (50MB). No
  `allowed_mime_types` (see decisions).
- **Storage policies on `storage.objects`:**
  - anon INSERT restricted to `bucket_id = 'request-files'` — upload only
  - admin full access for that bucket via `public.is_admin()` (Phase 4
    downloads files; costs one policy now)
- **Table policies:**
  - anon INSERT on `requests` `with check`: `status = 'received'`,
    `quote_design_fee is null`, `quote_print_fee is null`,
    `admin_notes is null`, and `(type <> 'file' or license_accepted)`
  - anon INSERT on `request_files` (metadata rows for uploads)
  - anon SELECT on `products` restricted to `active = true` (form dropdown;
    Phase 6 catalog needs it anyway)

No new tables or columns; Phase 2's schema already fits.

## Code structure

| File | Role |
|---|---|
| `app/aanvraag/page.tsx` | Server component: fetches active products, reads `?product=`, renders the form |
| `app/aanvraag/request-form.tsx` | Client component: type switching, file picking + direct uploads with progress state, `useActionState` submit |
| `app/aanvraag/actions.ts` | `submitRequest` server action (honeypot → validate → insert) |
| `app/aanvraag/verzonden/page.tsx` | Static confirmation page |
| `lib/requests/validation.ts` | Pure shared validation: field rules per type, file rules (extension/size/count), honeypot check. No I/O — unit-testable and usable from both client and server |
| `lib/requests/validation.test.ts` | Vitest unit tests |

## Error handling

- Validation errors → Dutch inline messages next to the fields, form state
  preserved.
- Upload failure → Dutch error, submit aborted, user can retry; nothing was
  saved server-side yet by design (uploads happen before the insert).
- Supabase/insert errors → generic Dutch message ("Er ging iets mis,
  probeer het later opnieuw."), no English internals leaked to the UI.
- Honeypot filled → indistinguishable-from-success response, nothing saved.
- RLS remains the security boundary: even a hand-crafted request bypassing
  the UI cannot read data, set a status other than `received`, set quote
  fees, or insert a file-type request without the license flag.

## Testing

- **Vitest** (dev dependency) + `npm test` script; config kept minimal.
- Unit tests for `lib/requests/validation.ts`: per-type required fields,
  email format, quantity bounds, file extension/size/count rules, the
  license rule, honeypot detection.
- **Manual checklist (local, then live after deploy):**
  1. Submit one request of each type (catalog needs a test product inserted
     via SQL first) → confirmation page shows.
  2. Admin dashboard count increases accordingly; rows correct in Supabase.
  3. File request: objects visible under Storage → `request-files`;
     `request_files` rows match (path, name, size).
  4. File > 50MB or wrong extension → Dutch validation error, no upload.
  5. File type without license checkbox → blocked.
  6. Anonymous REST read of `/rest/v1/requests` with the publishable key →
     still `[]` (RLS proof).
  7. Honeypot filled (via devtools) → "success" but no new row.

## Manual steps (owner, once)

1. Supabase SQL editor: run `0003_request_form.sql`.
2. Insert one test product via SQL (provided in the plan) to exercise the
   catalog type.

The implementation plan must include these verbatim, marked as owner
actions.
