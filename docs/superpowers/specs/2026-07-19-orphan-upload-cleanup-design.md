# Orphan-upload cleanup — design

**Date:** 2026-07-19
**Status:** approved

## Problem

The request form uploads files from the browser straight into the private
`request-files` bucket *before* the server action creates the request row
(`app/aanvraag/request-form.tsx`, `uploadFiles`). If the visitor abandons the
form, loses connection, or the submit fails after upload, those storage
objects stay behind forever: the anon role has insert-only access (no
delete), and every retry re-uploads under a fresh random folder.

Admin request-deletion already removes its own storage objects
(`app/admin/(protected)/aanvragen/[id]/actions.ts`, `deleteRequest`), so the
only leak is abandoned/failed submissions.

## Goal

Automatically delete storage objects in `request-files` that are **not
referenced** by any `request_files.storage_path` row and are **older than 24
hours**, once a day, with no manual involvement.

## Decisions made

- **Trigger:** automatic daily Vercel Cron (no admin button).
- **Reporting:** silent; one summary log line per run, visible in Vercel
  logs. No email.
- **Orphan detection:** list the bucket via the Storage API and diff against
  the database in the route (option A). A SQL function joining
  `storage.objects` (option B) was rejected: needs another migration and
  splits logic across two places, with no benefit at this volume.
- **Age threshold:** 24 hours, based on the storage object's upload
  timestamp. Anything younger may belong to an in-flight submission.

## Components

### 1. Cron API route — `app/api/cron/cleanup-uploads/route.ts`

- GET handler, called daily by Vercel Cron.
- **Auth:** rejects unless the request carries
  `Authorization: Bearer ${CRON_SECRET}` (Vercel sends this header
  automatically for cron invocations). Wrong/missing secret → 401, no work
  done.
- **Dry-run mode:** `?dry=1` performs the full scan and logs what *would* be
  deleted, but deletes nothing. Used for the first live verification.

Logic per run:

1. List top-level folders of `request-files`, then the files inside each
   (paths look like `<uuid>/<index>-<name>`). Use a high page limit and
   paginate if a listing returns a full page, so growth never silently
   truncates the scan.
2. Keep only objects with upload timestamp older than 24 hours.
3. Single query: `request_files.storage_path IN (candidate paths)` →
   referenced set. Referenced objects are never touched.
4. Delete unreferenced objects via the Storage API (`storage.remove`).
5. Log one summary line: files checked, orphans deleted (or "would delete"
   in dry-run), and the deleted paths.

### 2. Admin Supabase client — `lib/supabase/admin.ts`

- Plain `@supabase/supabase-js` client (no cookies) using
  `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`.
- Bypasses RLS; server-only. Only the cron route imports it.

### 3. `vercel.json`

- Cron entry: path `/api/cron/cleanup-uploads`, daily schedule (Hobby plan
  allows once-per-day crons; exact hour is best-effort).

### 4. Environment variables

- `SUPABASE_SECRET_KEY` — the secret API key from the Supabase dashboard
  (server-only; never exposed to the browser).
- `CRON_SECRET` — random string; set in Vercel so cron invocations carry it.
- Both go in Vercel project settings and `.env.local` for local testing.

## Error handling

- Listing or DB-query failure → log the error, return 500, delete nothing
  that run. Vercel marks the cron run failed.
- Deletion failure → log and return 500; already-deleted objects stay
  deleted (harmless — they were orphans).
- No in-run retries. The next daily run naturally retries; the operation is
  idempotent.

## Testing

- Unit tests for the pure orphan-picking logic: given a listing (paths +
  timestamps) and the set of referenced paths, assert which paths are
  selected for deletion (too-young excluded, referenced excluded). The
  pagination loop in the listing helper gets its own test.
- Manual verification: dry run against the live bucket
  (`curl` with the secret + `?dry=1`), confirm the logged candidates are
  real orphans, then a real run.

## Out of scope

- Product-photos bucket (admin-managed, no anon uploads).
- Email notifications.
- Admin-dashboard cleanup button.
