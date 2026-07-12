# Phase 1 Design — Project Setup, Supabase Connection, Hello-World Deploy

**Date:** 2026-07-12
**Project:** 3D print service web app (portfolio project)
**Scope:** Phase 1 only. Later phases (schema, auth, forms, admin, emails, catalog) are out of scope here.

## Project context

A web app where local customers order 3D prints three ways (catalog, file upload,
custom design), all feeding one request pipeline. No online payments — manual
quoting. Admin is a single user (the owner). UI language is Dutch; code and
comments are English.

Stack: Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Storage) +
Tailwind, deployed on Vercel. Dependencies kept minimal.

## Phase 1 goal

A TypeScript Next.js app on GitHub, live on a public `*.vercel.app` URL, with a
page that proves the Supabase connection works from real server code — so later
phases are purely about features, never plumbing.

## Decisions made

- **TypeScript** — ecosystem default; Supabase generates row types from the
  schema later, giving editor safety on database access.
- **Git-driven deploys** — Vercel imports the GitHub repo; every push deploys.
  No Vercel CLI.
- **Official Supabase packages** — `@supabase/supabase-js` + `@supabase/ssr`.
  The SSR helpers are installed now (Phase 1 barely uses them) to avoid
  rewiring when auth arrives in Phase 2.
- **No Supabase CLI / local Docker yet** — schema will live as SQL files in the
  repo (from Phase 2) and be run via the Supabase web SQL editor.
- **Supabase project settings** — region `eu-central-1` (Frankfurt), Data API
  enabled, automatic RLS on new tables enabled. Deny-by-default: tables are
  inaccessible until explicit policies are written (Phase 2).
- **Package name** `3d-print-site` — the folder name contains spaces, which npm
  package names don't allow.

## Structure

```
app/                    # App Router: every folder = a URL route
  layout.tsx            # Root HTML shell (lang="nl")
  page.tsx              # Placeholder homepage
  status/page.tsx       # Server-side Supabase connectivity check
  globals.css           # Tailwind entry point
lib/supabase/
  server.ts             # Supabase client for Server Components / actions
  client.ts             # Supabase client for browser code (used from Phase 2)
.env.local              # Supabase URL + publishable key — gitignored
.env.example            # Same keys, placeholder values — committed
```

The server/browser client split exists because Next.js runs some code on the
server (can hold secrets, reads cookies) and some in the browser (public).
Everything in later phases builds on this split.

## Environment variables

| Name | Value | Secret? |
|------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | No (public by design; RLS is the security boundary) |

The service role / secret key is not used in Phase 1 and is never committed or
sent to the browser in any phase.

## Manual steps (owner)

1. ~~Supabase: create project, copy URL + publishable key~~ — done.
2. GitHub: create an empty repository (no README/.gitignore — the local repo
   provides them).
3. Vercel: sign up with GitHub → Import the repo → add the two environment
   variables → deploy.

## Verification

Open `/status` on the live Vercel URL. The page makes a real server-side call
to Supabase and renders "Database verbonden ✓" (or the error). Success proves
the whole chain: GitHub → Vercel build → env vars → Supabase.

## Error handling

The `/status` page catches connection/config errors and renders them rather
than crashing — misconfigured env vars on Vercel must be visible, not a blank
500 page.

## Testing

Phase 1 is scaffolding and configuration; there is no unit-testable logic.
The `/status` page is the end-to-end test. Automated tests start in Phase 3
with the first real logic (file validation, form handling).
