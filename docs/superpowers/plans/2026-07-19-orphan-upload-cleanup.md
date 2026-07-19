# Orphan-Upload Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A daily Vercel Cron job that deletes storage objects in the private `request-files` bucket that no `request_files.storage_path` row references and that are older than 24 hours.

**Architecture:** Pure selection/listing logic lives in `lib/cleanup/orphans.ts` (unit-tested, no Supabase dependency). A cron-only route handler `app/api/cron/cleanup-uploads/route.ts` authenticates via `CRON_SECRET`, lists the bucket through a new service-role Supabase client (`lib/supabase/admin.ts`), diffs against the database, and deletes via the Storage API. `vercel.json` schedules the daily run.

**Tech Stack:** Next.js 16.2.10 (App Router route handler, standard Web `Request`/`Response`), `@supabase/supabase-js` v2, Vitest 4, Vercel Cron (Hobby plan: daily).

**Spec:** `docs/superpowers/specs/2026-07-19-orphan-upload-cleanup-design.md`

## Global Constraints

- **This Next.js is NOT the one you know** (AGENTS.md): consult `node_modules/next/dist/docs/` before deviating from the code given here. The route-handler API used below (plain `Request` in, `Response` out) is confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
- Bucket name: `request-files` (exact).
- Age threshold: 24 hours, from the storage object's `created_at`.
- Env var names (exact): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`.
- Referenced objects are NEVER deleted; objects with unknown age are NEVER deleted.
- Run tests with `npm test` (= `vitest run`). The `@/*` import alias works in both Next and Vitest (`vitest.config.ts` already maps it).
- Comment style: comments explain constraints/why, never restate code (match existing files like `lib/format.test.ts`).

---

### Task 1: Orphan selection logic (`selectOrphans`)

**Files:**
- Create: `lib/cleanup/orphans.ts`
- Test: `lib/cleanup/orphans.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no imports).
- Produces:
  - `interface BucketObject { path: string; createdAt: string | null }`
  - `selectOrphans(objects: BucketObject[], referencedPaths: ReadonlySet<string>, now: Date, maxAgeMs?: number): string[]` — returns the storage paths safe to delete. Default `maxAgeMs` is 24h.

- [ ] **Step 1: Write the failing tests**

Create `lib/cleanup/orphans.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectOrphans, type BucketObject } from "./orphans";

const NOW = new Date("2026-07-19T12:00:00Z");
const TWO_DAYS_AGO = "2026-07-17T12:00:00Z";
const ONE_HOUR_AGO = "2026-07-19T11:00:00Z";

function obj(path: string, createdAt: string | null): BucketObject {
  return { path, createdAt };
}

describe("selectOrphans", () => {
  it("selects old objects that no request references", () => {
    const objects = [obj("aaa/0-model.stl", TWO_DAYS_AGO)];
    expect(selectOrphans(objects, new Set(), NOW)).toEqual(["aaa/0-model.stl"]);
  });

  it("never selects objects referenced by a request_files row", () => {
    const objects = [obj("aaa/0-model.stl", TWO_DAYS_AGO)];
    const referenced = new Set(["aaa/0-model.stl"]);
    expect(selectOrphans(objects, referenced, NOW)).toEqual([]);
  });

  it("leaves young objects alone: they may belong to an in-flight submission", () => {
    const objects = [obj("bbb/0-photo.jpg", ONE_HOUR_AGO)];
    expect(selectOrphans(objects, new Set(), NOW)).toEqual([]);
  });

  // Exactly 24h old is still "young": the threshold must err toward keeping.
  it("does not select an object at exactly the age threshold", () => {
    const objects = [obj("ccc/0-a.stl", "2026-07-18T12:00:00Z")];
    expect(selectOrphans(objects, new Set(), NOW)).toEqual([]);
  });

  // A null timestamp means we cannot prove the object is old. Deleting a
  // file of unknown age risks racing a live upload, so it stays.
  it("never selects objects with an unknown timestamp", () => {
    const objects = [obj("ddd/0-b.stl", null)];
    expect(selectOrphans(objects, new Set(), NOW)).toEqual([]);
  });

  it("handles a mixed listing", () => {
    const objects = [
      obj("aaa/0-keep.stl", TWO_DAYS_AGO), // referenced
      obj("bbb/0-orphan.stl", TWO_DAYS_AGO), // orphan, old → delete
      obj("ccc/0-fresh.stl", ONE_HOUR_AGO), // orphan, young → keep
    ];
    const referenced = new Set(["aaa/0-keep.stl"]);
    expect(selectOrphans(objects, referenced, NOW)).toEqual([
      "bbb/0-orphan.stl",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/cleanup/orphans.test.ts`
Expected: FAIL — `Cannot find module './orphans'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `lib/cleanup/orphans.ts`:

```ts
// Pure logic for the daily orphan-upload cleanup: no Supabase imports here,
// so every rule is unit-testable. The cron route wires this to the real
// Storage API and database.

export interface BucketObject {
  path: string;
  createdAt: string | null;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Deleting is only safe when BOTH hold: no request_files row references the
// path, and the object is provably older than the threshold (a young or
// undated object may belong to a submission happening right now).
export function selectOrphans(
  objects: BucketObject[],
  referencedPaths: ReadonlySet<string>,
  now: Date,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): string[] {
  return objects
    .filter((object) => {
      if (referencedPaths.has(object.path)) return false;
      if (object.createdAt === null) return false;
      return now.getTime() - new Date(object.createdAt).getTime() > maxAgeMs;
    })
    .map((object) => object.path);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/cleanup/orphans.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/cleanup/orphans.ts lib/cleanup/orphans.test.ts
git commit -m "feat: orphan-selection logic for upload cleanup"
```

---

### Task 2: Recursive bucket listing with pagination (`listAllObjects`)

**Files:**
- Modify: `lib/cleanup/orphans.ts` (append; keep Task 1 code unchanged)
- Test: `lib/cleanup/orphans.test.ts` (append)

**Interfaces:**
- Consumes: `BucketObject` from Task 1.
- Produces:
  - `interface ListedEntry { name: string; id: string | null; created_at: string | null }` — mirrors what supabase-js `storage.list()` returns; `id === null` marks a folder (per the `FileObject` docs in `node_modules/@supabase/storage-js/dist/index.d.mts`).
  - `type ListPage = (prefix: string, offset: number, limit: number) => Promise<ListedEntry[]>`
  - `listAllObjects(listPage: ListPage, prefix?: string, pageSize?: number): Promise<BucketObject[]>` — walks folders recursively, paginating each level. Default `pageSize` 1000.

- [ ] **Step 1: Write the failing tests**

Append to `lib/cleanup/orphans.test.ts` (add `listAllObjects, type ListedEntry` to the existing import from `./orphans`):

```ts
const CREATED = "2026-07-17T12:00:00Z";

function file(name: string): ListedEntry {
  return { name, id: crypto.randomUUID(), created_at: CREATED };
}

function folder(name: string): ListedEntry {
  return { name, id: null, created_at: null };
}

// Fake Storage API over a prefix → entries map, slicing like the real
// list(prefix, { offset, limit }) endpoint does.
function fakeListPage(tree: Record<string, ListedEntry[]>) {
  return async (prefix: string, offset: number, limit: number) =>
    (tree[prefix] ?? []).slice(offset, offset + limit);
}

describe("listAllObjects", () => {
  it("walks folders and returns full paths with timestamps", async () => {
    const tree = {
      "": [folder("aaa"), folder("bbb")],
      aaa: [file("0-model.stl"), file("1-photo.jpg")],
      bbb: [file("0-thing.3mf")],
    };
    const objects = await listAllObjects(fakeListPage(tree));
    expect(objects).toEqual([
      { path: "aaa/0-model.stl", createdAt: CREATED },
      { path: "aaa/1-photo.jpg", createdAt: CREATED },
      { path: "bbb/0-thing.3mf", createdAt: CREATED },
    ]);
  });

  // The real bucket only nests one level (<uuid>/<n>-<name>), but the walk
  // must not silently drop deeper files if that ever changes.
  it("recurses into nested folders", async () => {
    const tree = {
      "": [folder("aaa")],
      aaa: [folder("deep")],
      "aaa/deep": [file("0-x.stl")],
    };
    const objects = await listAllObjects(fakeListPage(tree));
    expect(objects).toEqual([{ path: "aaa/deep/0-x.stl", createdAt: CREATED }]);
  });

  it("paginates: a level with more entries than one page is fully read", async () => {
    const tree = {
      "": [folder("aaa")],
      aaa: [file("0-a"), file("1-b"), file("2-c"), file("3-d"), file("4-e")],
    };
    const objects = await listAllObjects(fakeListPage(tree), "", 2);
    expect(objects.map((o) => o.path)).toEqual([
      "aaa/0-a",
      "aaa/1-b",
      "aaa/2-c",
      "aaa/3-d",
      "aaa/4-e",
    ]);
  });

  it("returns an empty list for an empty bucket", async () => {
    expect(await listAllObjects(fakeListPage({}))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/cleanup/orphans.test.ts`
Expected: FAIL — `listAllObjects` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/cleanup/orphans.ts`:

```ts
// Shape of one storage.list() entry we rely on: id is null for folders.
export interface ListedEntry {
  name: string;
  id: string | null;
  created_at: string | null;
}

export type ListPage = (
  prefix: string,
  offset: number,
  limit: number
) => Promise<ListedEntry[]>;

const LIST_PAGE_SIZE = 1000;

// storage.list() returns one folder level at a time and caps each response,
// so both recursion and offset-pagination are needed — otherwise growth past
// one page would silently truncate the scan and strand orphans forever.
export async function listAllObjects(
  listPage: ListPage,
  prefix = "",
  pageSize: number = LIST_PAGE_SIZE
): Promise<BucketObject[]> {
  const objects: BucketObject[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await listPage(prefix, offset, pageSize);
    for (const entry of page) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.id === null) {
        objects.push(...(await listAllObjects(listPage, path, pageSize)));
      } else {
        objects.push({ path, createdAt: entry.created_at });
      }
    }
    if (page.length < pageSize) break;
  }
  return objects;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/cleanup/orphans.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Run the full suite to catch regressions**

Run: `npm test`
Expected: PASS, no failures anywhere.

- [ ] **Step 6: Commit**

```bash
git add lib/cleanup/orphans.ts lib/cleanup/orphans.test.ts
git commit -m "feat: recursive paginated bucket listing for upload cleanup"
```

---

### Task 3: Service-role client and cron route handler

**Files:**
- Create: `lib/supabase/admin.ts`
- Create: `app/api/cron/cleanup-uploads/route.ts`
- Test: `app/api/cron/cleanup-uploads/route.test.ts`

**Interfaces:**
- Consumes: `listAllObjects`, `selectOrphans`, `BucketObject` from `@/lib/cleanup/orphans` (Tasks 1–2).
- Produces:
  - `createAdminClient(): SupabaseClient` in `lib/supabase/admin.ts` (service-role, RLS-bypassing).
  - `GET /api/cron/cleanup-uploads` — 401 without `Authorization: Bearer ${CRON_SECRET}`; with it, runs the cleanup and returns JSON `{ checked, orphans, dryRun }`; `?dry=1` scans without deleting; 500 on any Supabase failure.

- [ ] **Step 1: Write the failing auth tests**

Only the auth gate is unit-tested: everything past it talks to live Supabase and is covered by the manual dry run in Task 4. Create `app/api/cron/cleanup-uploads/route.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/cleanup-uploads", { headers });
}

describe("cleanup-uploads auth gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests without an Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const response = await GET(request());
    expect(response.status).toBe(401);
  });

  it("rejects requests with the wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const response = await GET(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  // If CRON_SECRET is missing from the environment the route must fail
  // closed, not fall through to comparing against undefined.
  it("rejects everything when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(request({ authorization: "Bearer " }));
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- app/api/cron/cleanup-uploads/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Create the admin client**

Create `lib/supabase/admin.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

// Service-role client for trusted server-only jobs (the cleanup cron). It
// bypasses RLS entirely, so it must never be imported from client
// components or from code paths a visitor's request can influence.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
```

- [ ] **Step 4: Create the route handler**

Create `app/api/cron/cleanup-uploads/route.ts`:

```ts
import {
  listAllObjects,
  selectOrphans,
  type BucketObject,
} from "@/lib/cleanup/orphans";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "request-files";

// Daily Vercel Cron (see vercel.json): deletes uploads no request_files row
// references, once they are older than 24h. Uploads happen browser → bucket
// BEFORE the request row exists, so abandoned submissions leak objects that
// anon can never delete — this is the only place they get cleaned up.
export async function GET(request: Request) {
  // Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron calls.
  // Fail closed when the env var is missing.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const supabase = createAdminClient();

    const objects = await listAllObjects(async (prefix, offset, limit) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(prefix, { offset, limit });
      if (error) {
        throw new Error(`Listing "${prefix}" failed: ${error.message}`);
      }
      return data;
    });

    const referenced = await fetchReferencedPaths(supabase, objects);
    const orphans = selectOrphans(objects, referenced, new Date());

    if (!dryRun && orphans.length > 0) {
      const { error } = await supabase.storage.from(BUCKET).remove(orphans);
      if (error) {
        throw new Error(`Deleting orphans failed: ${error.message}`);
      }
    }

    console.log(
      `[cleanup-uploads] checked=${objects.length} ` +
        `${dryRun ? "would-delete" : "deleted"}=${orphans.length}`,
      orphans
    );
    return Response.json({ checked: objects.length, orphans, dryRun });
  } catch (error) {
    // A failed run deletes nothing extra and the next daily run retries,
    // so log + 500 (Vercel marks the cron run failed) is all we need.
    console.error("[cleanup-uploads] run failed:", error);
    return new Response("Cleanup failed", { status: 500 });
  }
}

async function fetchReferencedPaths(
  supabase: ReturnType<typeof createAdminClient>,
  objects: BucketObject[]
): Promise<Set<string>> {
  if (objects.length === 0) return new Set();
  const { data, error } = await supabase
    .from("request_files")
    .select("storage_path")
    .in(
      "storage_path",
      objects.map((object) => object.path)
    );
  if (error) {
    throw new Error(`Loading request_files failed: ${error.message}`);
  }
  return new Set(data.map((row) => row.storage_path));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- app/api/cron/cleanup-uploads/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Full suite + lint**

Run: `npm test`
Expected: PASS.
Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/supabase/admin.ts app/api/cron/cleanup-uploads/route.ts app/api/cron/cleanup-uploads/route.test.ts
git commit -m "feat: cron route deleting orphaned request-files uploads"
```

---

### Task 4: Cron schedule, env vars, and live verification

**Files:**
- Create: `vercel.json`
- Modify: `.env.local` (two new vars; values never committed)

**Interfaces:**
- Consumes: the route from Task 3.
- Produces: a scheduled daily invocation in production.

- [ ] **Step 1: Create `vercel.json`**

At the repo root (03:00 UTC ≈ early morning Dutch time, when submissions are least likely to be in flight):

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-uploads",
      "schedule": "0 3 * * *"
    }
  ]
}
```

- [ ] **Step 2: Add env vars locally**

Ask the user (beginner — walk them through it) to:
1. Supabase dashboard → Project Settings → **API Keys** → reveal the **secret key** (starts with `sb_secret_`). NOT the publishable key.
2. Append to `.env.local`:

```bash
# Orphan-upload cleanup cron (server-only; never NEXT_PUBLIC_)
SUPABASE_SECRET_KEY=sb_secret_...
CRON_SECRET=<random string from the next step>
```

Generate the random secret in PowerShell: `[guid]::NewGuid().ToString("N")`.

- [ ] **Step 3: Local verification against the live bucket (dry run — deletes nothing)**

Start the dev server (`npm run dev`), then in another terminal (PowerShell):

```powershell
# Expect 401: no secret
curl.exe -i "http://localhost:3000/api/cron/cleanup-uploads?dry=1"
# Expect 200 + JSON listing would-be deletions (use the CRON_SECRET value from .env.local)
curl.exe -i -H "Authorization: Bearer <CRON_SECRET value>" "http://localhost:3000/api/cron/cleanup-uploads?dry=1"
```

Verify with the user that every path in `orphans` is a genuine leftover (compare against the admin dashboard's requests and their files) and that `checked` roughly matches the number of uploaded files they expect to exist.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "feat: schedule daily orphan-upload cleanup cron"
```

- [ ] **Step 5: Configure Vercel and deploy**

Ask the user to add both env vars in Vercel: project → Settings → Environment Variables → add `SUPABASE_SECRET_KEY` and `CRON_SECRET` (Production; values from `.env.local`). Setting `CRON_SECRET` is also what makes Vercel attach the Authorization header to cron calls. Then push:

```bash
git push
```

Vercel picks up `vercel.json` and registers the cron on this deploy.

- [ ] **Step 6: Production dry run, then real run**

```powershell
# Dry run against production (expect 200, sensible orphan list)
curl.exe -i -H "Authorization: Bearer <CRON_SECRET value>" "https://<production-domain>/api/cron/cleanup-uploads?dry=1"
# Real run (expect 200; orphans actually deleted)
curl.exe -i -H "Authorization: Bearer <CRON_SECRET value>" "https://<production-domain>/api/cron/cleanup-uploads"
```

Confirm afterwards: the dry-run list and the real-run list match, a re-run reports `checked` reduced by the deleted count and `orphans: []`, and existing requests in the admin dashboard still show/download their files. Show the user where cron runs appear: Vercel dashboard → project → Settings → Cron Jobs (and run logs under Logs, filtered by `/api/cron/cleanup-uploads`).

---

## Verification checklist (whole feature)

- `npm test` and `npm run lint` pass.
- Unauthenticated request → 401 (locally and in production).
- Dry run lists only genuine orphans; referenced files never appear.
- Real run deletes exactly the dry-run list; admin file downloads still work.
- Vercel dashboard shows the cron job registered for 03:00 UTC daily.
