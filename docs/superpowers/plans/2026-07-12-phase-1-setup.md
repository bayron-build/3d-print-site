# Phase 1: Setup, Supabase Connection, Hello-World Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript Next.js app on GitHub, live on Vercel, with a `/status` page proving the Supabase connection works from server code.

**Architecture:** Standard `create-next-app` scaffold (App Router, no `src/` dir) with a `lib/supabase/` module exposing separate server and browser Supabase clients via `@supabase/ssr`. Deploys are git-driven: Vercel watches the GitHub repo. The `/status` page performs a server-side health check against the Supabase REST API.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind v4, ESLint), `@supabase/supabase-js`, `@supabase/ssr`, Vercel, GitHub.

## Global Constraints

- UI copy: **Dutch**. Code, comments, variable names: **English**.
- Dependencies beyond the scaffold: **only** `@supabase/supabase-js` and `@supabase/ssr`.
- npm package name: `3d-print-site` (folder name has spaces; npm names can't).
- `.env.local` is never committed; `.env.example` (placeholders only) is.
- The Supabase service role / secret key is not used anywhere in Phase 1.
- Working directory: `C:\Users\Bayu\Documents\projects\3d print site` (PowerShell). The repo already exists with one commit (design doc) on branch `master`.
- Supabase project: URL `https://pufuggwyyoybkadhtbef.supabase.co`, publishable key `sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ` (public by design — safe in `NEXT_PUBLIC_*` vars).
- Phase 1 has no unit-testable logic (scaffolding + configuration only); each task's verification is a build/run check. Automated tests start in Phase 3.

---

### Task 1: Scaffold the Next.js app

**Files:**
- Create: entire Next.js scaffold at repo root (`app/`, `public/`, `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, …)
- Modify: `package.json` (name field)

**Interfaces:**
- Consumes: nothing (first code task).
- Produces: a running Next.js app; `npm run dev` / `npm run build` work from repo root. Later tasks add files under `app/` and `lib/`.

**Why the temp-directory dance:** `create-next-app` derives the npm package name from the target directory name and rejects `3d print site` (spaces are not valid in npm names). So we scaffold into a subdirectory with a valid name, move the contents up to the repo root, and delete the empty subdirectory. Because the subdirectory is inside an existing git repo, `create-next-app` skips its own `git init` — no nested repo to clean up.

- [x] **Step 1: Scaffold into a temporary subdirectory**

Run (from repo root):
```powershell
npx create-next-app@latest 3d-print-site-tmp --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```
Expected: exits successfully, prints "Success! Created 3d-print-site-tmp". (`--yes` auto-accepts any prompt not covered by a flag, e.g. Turbopack.)

- [x] **Step 2: Move the scaffold to the repo root and remove the temp dir**

```powershell
Get-ChildItem -Force "3d-print-site-tmp" | Move-Item -Destination "."
Remove-Item "3d-print-site-tmp"
```
Expected: repo root now contains `app/`, `public/`, `package.json`, `node_modules/`, etc. `Remove-Item` succeeds because the dir is empty (if not, something failed to move — investigate before deleting).

- [x] **Step 3: Fix the package name**

In `package.json`, change:
```json
  "name": "3d-print-site-tmp",
```
to:
```json
  "name": "3d-print-site",
```

- [x] **Step 4: Verify the build**

Run: `npm run build`
Expected: completes with "Compiled successfully" and a route table listing `/`. This is the same command Vercel runs, so a green build here means a green deploy later.

- [x] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: scaffold Next.js app (TypeScript, Tailwind, App Router)"
```
Expected: commit created; `git status` clean. Note: `node_modules/` must NOT appear in the commit — the scaffold's `.gitignore` excludes it.

---

### Task 2: Supabase packages, environment variables, client modules

**Files:**
- Create: `.env.local`, `.env.example`, `lib/supabase/server.ts`, `lib/supabase/client.ts`
- Modify: `.gitignore`, `package.json` (dependencies)

**Interfaces:**
- Consumes: scaffold from Task 1.
- Produces: `createClient(): Promise<SupabaseClient>` exported from `lib/supabase/server.ts` (async — reads request cookies) and `createClient(): SupabaseClient` from `lib/supabase/client.ts` (sync, browser). Env var names `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — all later phases use these exact names.

- [x] **Step 1: Install Supabase packages**

```powershell
npm install @supabase/supabase-js @supabase/ssr
```
Expected: both appear under `dependencies` in `package.json`.

- [x] **Step 2: Create `.env.local`** (real values, gitignored)

```
NEXT_PUBLIC_SUPABASE_URL=https://pufuggwyyoybkadhtbef.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ
```

- [x] **Step 3: Create `.env.example`** (placeholders, committed — documents required config for anyone cloning the repo)

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

- [x] **Step 4: Un-ignore `.env.example`**

The scaffold's `.gitignore` contains a `.env*` rule that would also hide `.env.example`. Add a negation line directly below it:
```gitignore
.env*
!.env.example
```

- [x] **Step 5: Create `lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Safe to use in Client Components:
// it only ever sees the public URL and publishable key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

- [x] **Step 6: Create `lib/supabase/server.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client for Server Components, Server Actions and
// Route Handlers. Reads the caller's auth cookies so queries run as the
// logged-in user (relevant from Phase 2 when auth arrives).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is a no-op when called from a Server Component;
            // middleware will handle session refresh (Phase 2).
          }
        },
      },
    }
  );
}
```

- [x] **Step 7: Verify build and gitignore behavior**

Run: `npm run build` — Expected: "Compiled successfully".
Run: `git status --short` — Expected: `.env.example` listed as untracked, `.env.local` **absent** (proves it's ignored). If `.env.local` appears, STOP and fix `.gitignore` before committing.

- [x] **Step 8: Commit**

```powershell
git add -A; git commit -m "feat: add Supabase client modules and env configuration"
```

---

### Task 3: Dutch shell, placeholder homepage, /status health-check page

**Files:**
- Modify: `app/layout.tsx`, `app/page.tsx`
- Create: `app/status/page.tsx`

**Interfaces:**
- Consumes: env var names from Task 2 (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- Produces: routes `/` and `/status`. Note: `/status` deliberately uses a raw `fetch` to a Supabase health endpoint instead of the client modules — with no tables yet (Phase 2), a plain authenticated HTTP 200 is the honest "URL + key + network all work" check. The client modules are exercised from Phase 2 onward. **Amended during execution:** the REST root `/rest/v1/` only accepts *secret* keys (gateway error `UNAUTHORIZED_INVALID_API_KEY_TYPE`), so the check uses `/auth/v1/health` instead — verified to return 200 with the publishable key and 401 with a wrong/missing key.

- [x] **Step 1: Replace `app/layout.tsx`**

Keep the font setup the scaffold generated (Geist imports and the `className` on `<body>`) and change only the metadata and `lang`:

```typescript
export const metadata: Metadata = {
  title: "3D Print Service",
  description: "Lokale 3D-printservice: bestel uit de catalogus, upload je eigen ontwerp of vraag een ontwerp op maat aan.",
};
```
And on the `<html>` element: `<html lang="nl">` — tells browsers, screen readers and search engines the page is Dutch.

- [x] **Step 2: Replace `app/page.tsx`**

```typescript
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">3D Print Service</h1>
      <p className="text-lg text-gray-600">
        Binnenkort kun je hier 3D-prints bestellen.
      </p>
    </main>
  );
}
```

- [x] **Step 3: Create `app/status/page.tsx`**

```typescript
// Health-check page: proves the full chain (deploy -> env vars -> Supabase)
// works. Rendered on the server so the check runs from server code, exactly
// like real queries will in later phases.

// Re-run the check on every request instead of caching the result at build time.
export const dynamic = "force-dynamic";

type HealthResult = { ok: true } | { ok: false; detail: string };

async function checkSupabase(): Promise<HealthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return { ok: false, detail: "Omgevingsvariabelen ontbreken" };
  }

  try {
    // The auth health endpoint returns 200 for any valid API key; a wrong or
    // missing key gives 401. (The REST root /rest/v1/ can't be used here: it
    // only accepts secret keys, which Phase 1 deliberately never touches.)
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Onbekende fout",
    };
  }
}

export default async function StatusPage() {
  const result = await checkSupabase();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-bold">Systeemstatus</h1>
      {result.ok ? (
        <p className="text-green-700">Database verbonden ✓</p>
      ) : (
        <p className="text-red-700">Geen verbinding ✗ ({result.detail})</p>
      )}
    </main>
  );
}
```

- [x] **Step 4: Verify locally**

Start the dev server in the background: `npm run dev`
Then check both routes:
```powershell
(Invoke-WebRequest http://localhost:3000 -UseBasicParsing).StatusCode
(Invoke-WebRequest http://localhost:3000/status -UseBasicParsing).Content -match "Database verbonden"
```
Expected: `200` and `True`. Then stop the dev server.
Also run `npm run build` — Expected: "Compiled successfully", route table shows `/`, `/status`, and `/status` marked dynamic (ƒ).

- [x] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: Dutch shell, placeholder homepage, /status health check"
```

---

### Task 4: Push to GitHub

**Files:** none (git/remote configuration only)

**Interfaces:**
- Consumes: all commits from Tasks 1–3.
- Produces: public (or private) GitHub repo `3d-print-site` on branch `main` — Vercel imports from it in Task 5.

- [x] **Step 1 (MANUAL — repo owner): Create the GitHub repository** *(done via `gh` CLI: `bayron-build/3d-print-site`, public)*

On github.com: New repository → name `3d-print-site` → visibility: owner's choice (public shows it as portfolio work) → **do not** add a README, .gitignore, or license (the local repo already has history; extra files would conflict).

- [x] **Step 2: Rename branch and push**

```powershell
git branch -M main
git remote add origin https://github.com/<username>/3d-print-site.git
git push -u origin main
```
Expected: push succeeds; the repo page on GitHub shows `app/`, `lib/`, `docs/` and 4 commits. Confirm `.env.local` is NOT visible on GitHub.

---

### Task 5: Deploy to Vercel and verify live

**Files:** none (Vercel dashboard configuration only)

**Interfaces:**
- Consumes: GitHub repo from Task 4, env var names from Task 2.
- Produces: live `https://<project>.vercel.app` URL; every future `git push` to `main` auto-deploys.

- [ ] **Step 1 (MANUAL — repo owner): Sign up and import**

1. vercel.com → "Sign up" → **Continue with GitHub** (Hobby/free plan).
2. "Add New… → Project" → Import `3d-print-site` (authorize GitHub access when asked).
3. Framework preset: Next.js is auto-detected — leave all build settings untouched.

- [ ] **Step 2 (MANUAL — repo owner): Add environment variables**

In the import screen, expand **Environment Variables** and add both, exactly as in `.env.local`:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pufuggwyyoybkadhtbef.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ` |

Then click **Deploy**.

- [ ] **Step 3: Verify the live deployment**

Open `https://<project>.vercel.app/status` in a browser.
Expected: "Database verbonden ✓".
If it shows "Omgevingsvariabelen ontbreken": env vars weren't set for the Production environment — add them in Vercel → Settings → Environment Variables and redeploy.
If it shows "HTTP 401": the key was pasted wrong — compare against `.env.local`.

- [ ] **Step 4: Mark Phase 1 done**

No commit needed. Record the live URL for later phases (Phase 5 emails link to it).
