# Phase 2 Design — Database Schema, Admin Auth, Empty Admin Dashboard

**Date:** 2026-07-12
**Project:** 3D print service web app (portfolio project)
**Scope:** Phase 2 only. The request form (Phase 3), full dashboard (Phase 4),
emails/status page (Phase 5) and public catalog (Phase 6) are out of scope.

## Phase 2 goal

The complete database schema live in Supabase with row-level security, a
working admin login (email + password, single user), and an `/admin` page
that proves the whole chain by reading a live count from the `requests`
table. After this phase, later phases only add features on top — never
plumbing.

## Decisions made

- **Optional phone field** on requests — quoting is manual and payment goes
  via bank transfer/Tikkie, so a phone number helps follow-up. Name + email
  stay required; phone is optional.
- **Admin = role claim, not "any logged-in user"** — a one-time SQL statement
  stamps `role: "admin"` into the admin user's `app_metadata` (server-only;
  users can never edit their own `app_metadata`). Both RLS policies and app
  code check this claim. Chosen because Phase 5 may make customers
  authenticated users via magic links; "logged in = admin" would then break.
- **SQL as numbered migration files** in `supabase/migrations/`, run manually
  in the Supabase web SQL editor (no CLI/Docker, per project constraints).
  The folder follows the Supabase CLI convention so adopting the CLI later
  requires no restructuring.
- **Text + CHECK constraints instead of Postgres enums** for `type` and
  `status` — same safety, easier to read and to change later.
- **`numeric(10,2)` for money** — exact decimal arithmetic; never float.
- **`proxy.ts`, not `middleware.ts`** — this repo runs Next.js 16, where the
  `middleware` file convention is deprecated and renamed to `proxy`
  (verified against `node_modules/next`; see
  https://nextjs.org/docs/messages/middleware-to-proxy).
- **Deferred on purpose:** storage bucket + upload policies (Phase 3),
  anonymous insert policy for form submissions (Phase 3), product
  photos/catalog content (Phase 6), automated tests (start Phase 3).

## Database schema

Two migration files:

### `supabase/migrations/0001_initial_schema.sql`

**`products`** — the owner's own catalog designs.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `name` | `text` | not null |
| `description` | `text` | |
| `photos` | `text[]` | storage paths, default `'{}'` |
| `indicative_price` | `numeric(10,2)` | |
| `active` | `boolean` | not null, default `true` |
| `created_at` | `timestamptz` | not null, default `now()` |

**`requests`** — one row per customer request, all three types.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `type` | `text` | not null, CHECK in `catalog\|file\|custom` |
| `product_id` | `uuid` | nullable FK → `products`; set for catalog orders |
| `customer_name` | `text` | not null |
| `email` | `text` | not null |
| `phone` | `text` | nullable (optional field) |
| `description` | `text` | |
| `color` | `text` | free text; Phase 3 decides the form control |
| `material` | `text` | free text |
| `quantity` | `integer` | not null, default `1`, CHECK `> 0` |
| `license_accepted` | `boolean` | not null, default `false`; Phase 3 checkbox |
| `status` | `text` | not null, default `received`, CHECK in `received\|quoted\|approved\|printing\|done\|rejected` |
| `quote_design_fee` | `numeric(10,2)` | nullable until quoted |
| `quote_print_fee` | `numeric(10,2)` | nullable until quoted |
| `admin_notes` | `text` | |
| `created_at` | `timestamptz` | not null, default `now()` |

**`request_files`** — uploaded files linked to a request.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | PK, `gen_random_uuid()` |
| `request_id` | `uuid` | not null, FK → `requests` `on delete cascade` |
| `storage_path` | `text` | not null |
| `original_name` | `text` | not null |
| `size_bytes` | `bigint` | not null |
| `created_at` | `timestamptz` | not null, default `now()` |

RLS is enabled explicitly on all three tables in the migration (the project
has automatic RLS on, but the migration must not depend on a dashboard
setting).

### `supabase/migrations/0002_rls_policies.sql`

- Helper function `public.is_admin()` (`sql`, `stable`): returns whether the
  caller's JWT carries `app_metadata.role = 'admin'`, i.e.
  `coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'`.
- One policy per table: admin may do everything (`for all using
  (is_admin()) with check (is_admin())`).
- No anonymous policies in Phase 2. Deny-by-default stands for everyone
  else; customer-facing policies arrive with the features that need them.

## Admin auth in the app

- **`proxy.ts`** (repo root) — runs before every request; calls a
  `lib/supabase/proxy.ts` helper that refreshes the Supabase auth cookies
  (the standard `@supabase/ssr` session-refresh pattern, adapted to the
  Next 16 proxy convention). Matcher excludes static assets.
- **`app/admin/login/page.tsx`** — Dutch email + password form. Submits to a
  Server Action that calls `signInWithPassword`; on success redirect to
  `/admin`, on failure re-render with a Dutch error message ("E-mailadres of
  wachtwoord onjuist."). If already logged in as admin, visiting the login
  page redirects to `/admin`.
- **`app/admin/(protected)/layout.tsx`** — server-side gate: verify the
  session locally via `supabase.auth.getClaims()` and require
  `app_metadata.role === 'admin'`; otherwise `redirect('/admin/login')`.
  The `(protected)` route group (parentheses folders don't appear in the
  URL) exists so the gate wraps every admin page *except* the login page —
  a gate in a plain `app/admin/layout.tsx` would also wrap `/admin/login`
  and redirect-loop. This gate is convenience; RLS is the security boundary.
- **Logout** — Server Action calling `signOut`, wired to a button in the
  admin shell; redirects to `/admin/login`.

## Empty admin dashboard

`app/admin/(protected)/page.tsx` (server component, Dutch UI, served at
`/admin`): heading "Aanvragen", the
logged-in email, a logout button, and a live count of rows in `requests`
("0 aanvragen") queried through the admin's session. The count proves
schema + auth + role claim + RLS end to end — Phase 2's equivalent of
Phase 1's `/status` page.

## Error handling

- Login failure → Dutch inline error, no crash, no English Supabase message
  leaked to the UI.
- Unauthenticated or non-admin visit to `/admin` → redirect to
  `/admin/login`, never a 500.
- Dashboard count query failure → render the error message on the page
  (same philosophy as `/status`: misconfiguration must be visible).

## Manual steps (owner, once)

1. Supabase SQL editor: run `0001_initial_schema.sql`, then
   `0002_rls_policies.sql`.
2. Dashboard → Authentication: create the admin user (email + password,
   auto-confirm).
3. SQL editor: run the provided one-line `update auth.users …` statement
   (with the admin email filled in) to stamp the `role: "admin"` claim.
   Sign out/in afterwards so the claim lands in a fresh token.
4. Dashboard → Auth settings: disable public signups.

The implementation plan must include these steps verbatim with the exact
SQL, marked as owner actions.

## Verification (manual checklist, local + live)

1. Logged out, open `/admin` → redirected to `/admin/login`.
2. Wrong password → Dutch error message.
3. Correct login → dashboard shows the email and "0 aanvragen".
4. Logout → back to login; `/admin` redirects again.
5. Anonymous REST call to `/rest/v1/requests` with only the publishable key
   → empty result/denied (RLS proof).
6. Repeat 1–4 on the live Vercel URL after push.

## Testing

No automated tests in Phase 2 (decided in Phase 1: tests start with the
first real logic in Phase 3). The checklist above is the acceptance test.
