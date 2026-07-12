# Phase 2 Implementation Plan — Schema, Admin Auth, Empty Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full database schema live in Supabase with RLS, working single-admin login (email + password), and an `/admin` page proving the chain with a live request count.

**Architecture:** SQL migration files in `supabase/migrations/` run manually by the owner in the Supabase web SQL editor. Admin identity = `role: "admin"` claim in the user's `app_metadata`, checked by a SQL helper `is_admin()` in RLS policies and by `getClaims()` in server code. Session cookies refreshed in `proxy.ts` (Next 16's rename of `middleware.ts`). Admin pages live in an `app/admin/(protected)/` route group so the auth gate never wraps the login page.

**Tech Stack:** Next.js 16.2.10 (App Router, `proxy.ts`), React 19 (`useActionState`), @supabase/ssr 0.12, @supabase/supabase-js 2.110, Tailwind 4. Spec: `docs/superpowers/specs/2026-07-12-phase-2-schema-auth-design.md`.

## Global Constraints

- UI language **Dutch**; code, comments, identifiers **English**.
- **No new npm dependencies.**
- Env var names (already set locally and on Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Supabase project URL `https://pufuggwyyoybkadhtbef.supabase.co`, publishable key `sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ` (public by design).
- This Next.js version deprecates `middleware.ts` — the file **must** be `proxy.ts` with a function named `proxy` or a default export.
- **No automated tests in Phase 2** (decided in Phase 1; tests start in Phase 3). Every task verifies via `npm run build` and the manual checks written into its steps — do not skip them.
- Steps marked **OWNER ACTION** need the owner (Supabase dashboard or admin credentials). Pause and ask the owner to do them; do not attempt to work around them.
- No Supabase CLI, no Docker. SQL runs only via the web SQL editor.

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: tables `public.products`, `public.requests`, `public.request_files` (columns below) that Tasks 2 and 5 rely on; the `requests` count query in Task 5 needs `requests` to exist with RLS enabled.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0001_initial_schema.sql`:

```sql
-- Phase 2: initial schema. Run once in the Supabase web SQL editor.
-- Money columns use numeric(10,2): exact decimals, never floating point.
-- type/status are text + CHECK instead of enums: same safety, easier to change.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  photos text[] not null default '{}',
  indicative_price numeric(10,2),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('catalog', 'file', 'custom')),
  -- Set for catalog orders only; products must not disappear from under a
  -- request, hence no cascade.
  product_id uuid references public.products (id),
  customer_name text not null,
  email text not null,
  phone text,
  description text,
  color text,
  material text,
  quantity integer not null default 1 check (quantity > 0),
  license_accepted boolean not null default false,
  status text not null default 'received'
    check (status in ('received', 'quoted', 'approved', 'printing', 'done', 'rejected')),
  quote_design_fee numeric(10,2),
  quote_print_fee numeric(10,2),
  admin_notes text,
  created_at timestamptz not null default now()
);

create table public.request_files (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  storage_path text not null,
  original_name text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

-- Explicit RLS enable: the migration must not depend on the project's
-- "automatic RLS" dashboard setting. Deny-by-default until policies exist.
alter table public.products enable row level security;
alter table public.requests enable row level security;
alter table public.request_files enable row level security;
```

- [ ] **Step 2: OWNER ACTION — run the migration**

Ask the owner to open Supabase → SQL Editor, paste the full contents of `supabase/migrations/0001_initial_schema.sql`, and run it.
Expected: "Success. No rows returned".

- [ ] **Step 3: Verify the tables exist and anonymous access is blocked**

Run:

```powershell
curl.exe -s -H "apikey: sb_publishable_2v1mWyS0G3FpqseTulIpcw_nRaP_6aQ" "https://pufuggwyyoybkadhtbef.supabase.co/rest/v1/requests?select=id"
```

Expected: `[]` — the table exists (a missing table returns a JSON error mentioning "Could not find the table") and RLS hides all rows from anonymous callers.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/0001_initial_schema.sql
git commit -m "feat: add initial schema migration (products, requests, request_files)"
```

---

### Task 2: RLS policies and the admin role claim

**Files:**
- Create: `supabase/migrations/0002_rls_policies.sql`

**Interfaces:**
- Consumes: the three tables from Task 1.
- Produces: SQL function `public.is_admin() returns boolean`; "Admin full access" policies on all three tables; a Supabase user whose `app_metadata` contains `"role": "admin"`. Tasks 4–5 log in as this user; the Task 5 count query succeeds only because of these policies.

- [ ] **Step 1: Write the policies file**

Create `supabase/migrations/0002_rls_policies.sql`:

```sql
-- Phase 2: RLS policies. Run once in the Supabase web SQL editor,
-- after 0001_initial_schema.sql.
--
-- The admin is whoever's JWT carries app_metadata.role = 'admin'.
-- app_metadata is server-controlled: a user can never change it about
-- themself, which is why it is safe to trust here.

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- Admin may do everything. Nobody else may do anything (deny-by-default);
-- customer-facing policies arrive in the phases that need them.

create policy "Admin full access" on public.products
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin full access" on public.requests
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin full access" on public.request_files
  for all
  using (public.is_admin())
  with check (public.is_admin());
```

- [ ] **Step 2: OWNER ACTION — run the policies file**

Ask the owner to run the full contents of `supabase/migrations/0002_rls_policies.sql` in the SQL Editor.
Expected: "Success. No rows returned".

- [ ] **Step 3: OWNER ACTION — create the admin user**

Ask the owner: Supabase → Authentication → Users → Add user → Create new user. Enter their admin email and a strong password, enable **Auto Confirm User**, create.

- [ ] **Step 4: OWNER ACTION — stamp the admin claim**

Ask the owner to run this in the SQL Editor **with their admin email filled in**:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"role": "admin"}'::jsonb
where email = 'THEIR-ADMIN-EMAIL';
```

Expected: "Success. 1 rows affected". **0 rows means the email doesn't match — fix and re-run.** The claim lands in the JWT at the next login, so any already-open session must log out and back in.

- [ ] **Step 5: OWNER ACTION — disable public signups**

Ask the owner: Supabase → Authentication → Sign In / Providers → turn **off** "Allow new users to sign up" → save.

- [ ] **Step 6: Verify claim and function**

Ask the owner to run in the SQL Editor:

```sql
select email, raw_app_meta_data from auth.users;
select public.is_admin();
```

Expected: one row whose `raw_app_meta_data` contains `"role": "admin"`; the `is_admin()` call returns `false` (the SQL editor has no user JWT — this only proves the function runs).

- [ ] **Step 7: Commit**

```powershell
git add supabase/migrations/0002_rls_policies.sql
git commit -m "feat: add RLS policies with admin role claim"
```

---

### Task 3: Session refresh in proxy.ts

**Files:**
- Create: `lib/supabase/proxy.ts`
- Create: `proxy.ts` (repo root, next to `package.json`)

**Interfaces:**
- Consumes: env vars (Global Constraints).
- Produces: `updateSession(request: NextRequest): Promise<NextResponse>` exported from `lib/supabase/proxy.ts`; automatic session-cookie refresh on every page request, which Tasks 4–5 rely on to keep the admin logged in.

- [ ] **Step 1: Write the session-refresh helper**

Create `lib/supabase/proxy.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session on every request — the standard
// @supabase/ssr pattern: wire a client to the request's cookies, let
// getClaims() refresh an (almost) expired token, and mirror any new
// cookies onto both the request (for this render) and the response
// (for the browser).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getClaims();

  return supabaseResponse;
}
```

- [ ] **Step 2: Write the proxy entry point**

Create `proxy.ts` in the repo root:

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16 renamed the `middleware` file convention to `proxy`
// (https://nextjs.org/docs/messages/middleware-to-proxy). Runs before
// every matched request; its only job is keeping auth cookies fresh.
export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Everything except static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds with no type errors and the output mentions the proxy (and **no** deprecation warning about `middleware`).

- [ ] **Step 4: Verify existing pages still work**

Start `npm run dev` in the background, then:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/status
```

Expected: `200`. Stop the dev server afterwards (or leave it running for later tasks).

- [ ] **Step 5: Commit**

```powershell
git add proxy.ts lib/supabase/proxy.ts
git commit -m "feat: refresh Supabase session via Next 16 proxy"
```

---

### Task 4: Login page with server action

**Files:**
- Create: `lib/supabase/auth.ts`
- Create: `app/admin/login/actions.ts`
- Create: `app/admin/login/login-form.tsx`
- Create: `app/admin/login/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase/server.ts` (Phase 1); session refresh from Task 3; admin user from Task 2.
- Produces: `getAdminSession(): Promise<{ isAdmin: boolean; email: string | null }>` from `lib/supabase/auth.ts` (Task 5 uses it); `login(prevState: LoginState, formData: FormData): Promise<LoginState>` and `type LoginState = { error: string | null }` from `app/admin/login/actions.ts`; the `/admin/login` route.

- [ ] **Step 1: Write the admin-session helper**

Create `lib/supabase/auth.ts`:

```typescript
import { createClient } from "./server";

// Answers "is the caller the admin?" from locally verified JWT claims
// (getClaims verifies the token against Supabase's public signing keys —
// no network round-trip per request). The admin is the user whose
// app_metadata carries role "admin"; see the Phase 2 design doc.
export async function getAdminSession(): Promise<{
  isAdmin: boolean;
  email: string | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  return {
    isAdmin: claims?.app_metadata?.role === "admin",
    email: claims?.email ?? null,
  };
}
```

- [ ] **Step 2: Write the login server action**

Create `app/admin/login/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Deliberately vague: don't reveal whether the email exists.
    return { error: "E-mailadres of wachtwoord onjuist." };
  }

  redirect("/admin");
}
```

- [ ] **Step 3: Write the login form (client component)**

Create `app/admin/login/login-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">E-mailadres</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Wachtwoord</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Bezig met inloggen…" : "Inloggen"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Write the login page**

Create `app/admin/login/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/supabase/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const { isAdmin } = await getAdminSession();
  if (isAdmin) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Inloggen</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 5: Verify the build**

Run: `npm run build`
Expected: succeeds, `/admin/login` listed in the route output.

- [ ] **Step 6: Verify the login flow (dev server + owner)**

With `npm run dev` running:

1. `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/admin/login` → expected `200`.
2. **OWNER ACTION:** open `http://localhost:3000/admin/login` in a browser. Submit a wrong password → the Dutch error "E-mailadres of wachtwoord onjuist." appears inline. Then log in with the real admin credentials → redirect to `/admin`, which shows a **404 for now** (the dashboard is Task 5). The redirect + 404 is the expected success signal at this point.

- [ ] **Step 7: Commit**

```powershell
git add lib/supabase/auth.ts app/admin/login/actions.ts app/admin/login/login-form.tsx app/admin/login/page.tsx
git commit -m "feat: admin login page with server action"
```

---

### Task 5: Protected route group with empty dashboard and logout

**Files:**
- Create: `app/admin/(protected)/layout.tsx`
- Create: `app/admin/(protected)/actions.ts`
- Create: `app/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: `getAdminSession()` from Task 4; `createClient()` from `lib/supabase/server.ts`; tables + policies from Tasks 1–2.
- Produces: `logout(): Promise<void>` server action (always ends in a redirect); the gated `/admin` route. Phase 4 will replace the placeholder page content but keep this layout and gate.

- [ ] **Step 1: Write the logout action**

Create `app/admin/(protected)/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
```

- [ ] **Step 2: Write the gate layout**

Create `app/admin/(protected)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/supabase/auth";
import { logout } from "./actions";

// Server-side gate for every admin page. The (protected) route group keeps
// /admin/login outside this layout — a gate in a plain app/admin/layout.tsx
// would wrap the login page too and redirect-loop. This check is
// convenience; row level security in the database is the security boundary.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isAdmin, email } = await getAdminSession();
  if (!isAdmin) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-8 py-4">
        <span className="font-bold">Beheer</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Ingelogd als {email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded border border-gray-300 px-3 py-1 text-sm"
            >
              Uitloggen
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Write the dashboard page**

Create `app/admin/(protected)/page.tsx` (served at `/admin`):

```tsx
import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  // head: true fetches only the count, no row data.
  const { count, error } = await supabase
    .from("requests")
    .select("*", { count: "exact", head: true });

  return (
    <>
      <h1 className="text-2xl font-bold">Aanvragen</h1>
      {error ? (
        <p className="mt-4 text-red-700">
          Kon aanvragen niet laden: {error.message}
        </p>
      ) : (
        <p className="mt-4">
          {count ?? 0} {count === 1 ? "aanvraag" : "aanvragen"}
        </p>
      )}
      <p className="mt-2 text-sm text-gray-600">
        Het volledige overzicht komt in fase 4.
      </p>
    </>
  );
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: succeeds; `/admin` and `/admin/login` both in the route output.

- [ ] **Step 5: Verify the full local checklist**

With `npm run dev` running:

1. `curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/admin` (no cookies = logged out) → expected `307`.
2. **OWNER ACTION** in the browser:
   - Logged out, open `http://localhost:3000/admin` → lands on `/admin/login`.
   - Log in → dashboard shows "Aanvragen", "0 aanvragen", "Ingelogd als <email>".
   - Open `/admin/login` while logged in → bounced back to `/admin`.
   - Click "Uitloggen" → back on the login page; `/admin` redirects again.

If the dashboard shows "Kon aanvragen niet laden" instead of a count, the role claim is not in the JWT — the owner must log out and back in (Task 2 Step 4 note), not skip this.

- [ ] **Step 6: Commit**

```powershell
git add "app/admin/(protected)/layout.tsx" "app/admin/(protected)/actions.ts" "app/admin/(protected)/page.tsx"
git commit -m "feat: gated admin area with empty dashboard and logout"
```

---

### Task 6: Deploy, live verification, roadmap update

**Files:**
- Modify: `docs/ROADMAP.md` (phase table, lines 47–54)

**Interfaces:**
- Consumes: everything above; Vercel auto-deploys pushes to `main`.
- Produces: Phase 2 live and recorded as done.

- [ ] **Step 1: Push**

```powershell
git push
```

- [ ] **Step 2: OWNER ACTION — verify on the live site**

After Vercel finishes deploying (a minute or two), repeat the Task 5 browser checklist on `https://3d-print-site-five.vercel.app` (`/admin`, `/admin/login`, login, count, logout). Also confirm `/status` still shows "Database verbonden ✓".

- [ ] **Step 3: Update the roadmap**

In `docs/ROADMAP.md`, update the phase table rows for Phase 1 and Phase 2:

```markdown
| 1 | Project setup, Supabase connection, hello-world deploy to Vercel | done |
| 2 | Database schema + admin auth + empty admin dashboard | done |
```

- [ ] **Step 4: Commit and push**

```powershell
git add docs/ROADMAP.md
git commit -m "docs: mark Phase 2 complete"
git push
```
