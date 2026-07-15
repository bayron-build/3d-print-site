# Reference Photos + Homepage Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-15-form-photos-homepage-polish-design.md` (approved)

**Goal:** Visitors can attach up to 5 reference photos to an "Eigen ontwerp" (custom) request, public copy stops promising email, and five small homepage visual fixes land (photo frame, mobile menu, header seam, ghost button, footer color).

**Architecture:** Photos reuse the existing upload pipeline end to end — **no migration**. Bytes go browser → Supabase Storage into the same private `request-files` bucket via the existing `uploadFiles` helper; metadata rides in the existing `uploadedFiles` JSON field and lands in the same `request_files` table. A photo is distinguished from a model file only by its extension. All new validation is pure functions in `lib/requests/validation.ts` with Vitest coverage.

**Tech Stack:** Next.js 16.2.10 (App Router, server actions), React 19, Supabase (`@supabase/ssr`), Tailwind 4, Vitest 4.

## Global Constraints

- **This is NOT the Next.js you know** (AGENTS.md): read the relevant guide in `node_modules/next/dist/docs/` before writing code you're unsure about. Known here: `params`/`searchParams` are Promises and must be awaited (existing code already does this — follow it).
- File-input elements must have **no `name` attribute**: upload bytes must never enter the server action's FormData (1MB action cap, ~4.5MB Vercel cap). Bytes go browser → Supabase Storage only.
- Client validates fully **before** any upload (orphan prevention: anon has insert-only storage access, no delete).
- All user-facing copy is Dutch, in the existing voice of `validateFiles` errors and page copy.
- Photo rules (exact values): `MAX_PHOTOS = 5`, `MAX_PHOTO_SIZE_BYTES = 10485760` (10MB), `ALLOWED_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"]`. Zero photos is valid.
- No migrations, no changes to storage buckets or RLS policies.
- `CubeLogo` must remain exported from `components/site-header.tsx` (`request-form.tsx` imports it).
- Commands: `npm test` (vitest run), `npm run lint`, `npm run build`. Windows/PowerShell environment.
- Each task ends with its own commit.

---

### Task 1: Photo validation rules (pure, tested)

**Files:**
- Modify: `lib/requests/validation.ts`
- Modify: `lib/requests/validation.test.ts`
- Modify: `app/aanvraag/actions.ts:39-56` (one-line compile fix only)
- Modify: `app/aanvraag/request-form.tsx:102-117` (one-line compile fix only)

**Interfaces:**
- Consumes: existing `FileMeta`, `RequestInput`, `validateRequest`, `hasAllowedExtension` in `lib/requests/validation.ts`.
- Produces (later tasks rely on these exact names):
  - `MAX_PHOTOS: 5`, `MAX_PHOTO_SIZE_BYTES: 10485760`, `ALLOWED_PHOTO_EXTENSIONS: readonly [".jpg", ".jpeg", ".png", ".webp"]`
  - `RequestInput.photos: FileMeta[]` (new required field)
  - `validatePhotos(photos: FileMeta[]): string | null`
  - `isImageFileName(fileName: string): boolean`
  - Error keys on `validateRequest` failure: `photos` (photo rule violations, or photos present on non-custom types), `files` (files present on catalog).

- [ ] **Step 1: Write the failing tests**

In `lib/requests/validation.test.ts`:

1. Add to the imports from `./validation`: `validatePhotos`, `isImageFileName`.
2. Update the `input()` helper's baseline object: add `photos: [],` on the line after `files: [],`.
3. Add below the `stlFile` constant:

```ts
const jpgPhoto = { name: "voorbeeld.jpg", sizeBytes: 1024 };
```

4. Add these cases inside `describe("validateRequest", ...)`:

```ts
  it("accepts a custom request with valid photos", () => {
    const result = validateRequest(input({ photos: [jpgPhoto] }));
    expect(result.ok).toBe(true);
  });

  it("rejects a custom request with invalid photos under the photos key", () => {
    const result = validateRequest(
      input({ photos: Array(6).fill(jpgPhoto) })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.photos).toBeDefined();
  });

  it("rejects catalog requests that carry files or photos", () => {
    const result = validateRequest(
      input({
        type: "catalog",
        productId: "abc-123",
        files: [stlFile],
        photos: [jpgPhoto],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.files).toBeDefined();
      expect(result.errors.photos).toBeDefined();
    }
  });

  it("rejects file requests that carry photos", () => {
    const result = validateRequest(
      input({
        type: "file",
        files: [stlFile],
        licenseAccepted: true,
        photos: [jpgPhoto],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.photos).toBeDefined();
  });
```

5. Add two new describe blocks at the end of the file:

```ts
describe("validatePhotos", () => {
  it("accepts zero photos (photos are optional)", () => {
    expect(validatePhotos([])).toBeNull();
  });

  it("accepts 1 to 5 valid photos", () => {
    expect(validatePhotos([jpgPhoto])).toBeNull();
    expect(validatePhotos(Array(5).fill(jpgPhoto))).toBeNull();
  });

  it("rejects more than 5 photos", () => {
    expect(validatePhotos(Array(6).fill(jpgPhoto))).not.toBeNull();
  });

  it("rejects unsupported extensions", () => {
    expect(
      validatePhotos([{ name: "foto.heic", sizeBytes: 10 }])
    ).not.toBeNull();
    expect(
      validatePhotos([{ name: "geen-extensie", sizeBytes: 10 }])
    ).not.toBeNull();
  });

  it("accepts all allowed extensions case-insensitively", () => {
    expect(validatePhotos([{ name: "A.JPG", sizeBytes: 10 }])).toBeNull();
    expect(validatePhotos([{ name: "b.jpeg", sizeBytes: 10 }])).toBeNull();
    expect(validatePhotos([{ name: "c.PNG", sizeBytes: 10 }])).toBeNull();
    expect(validatePhotos([{ name: "d.webp", sizeBytes: 10 }])).toBeNull();
  });

  it("rejects photos over 10MB but accepts exactly 10MB", () => {
    expect(
      validatePhotos([{ name: "groot.jpg", sizeBytes: 10485761 }])
    ).not.toBeNull();
    expect(
      validatePhotos([{ name: "rand.jpg", sizeBytes: 10485760 }])
    ).toBeNull();
  });
});

describe("isImageFileName", () => {
  it("matches image extensions case-insensitively", () => {
    expect(isImageFileName("foto.JPG")).toBe(true);
    expect(isImageFileName("0-scan.webp")).toBe(true);
    expect(isImageFileName("model.stl")).toBe(false);
    expect(isImageFileName("doc.pdf")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — new tests error because `validatePhotos` / `isImageFileName` are not exported and `RequestInput` has no `photos` field.

- [ ] **Step 3: Implement the validation rules**

In `lib/requests/validation.ts`:

1. After the `ALLOWED_EXTENSIONS` constant (line 13), add:

```ts
export const MAX_PHOTOS = 5;
// Same 10MB cap as product photos; well under the bucket's 50MB limit,
// which stays the server-enforced boundary.
export const MAX_PHOTO_SIZE_BYTES = 10485760; // 10MB
export const ALLOWED_PHOTO_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;
```

2. In `RequestInput`, after `files: FileMeta[];` add:

```ts
  photos: FileMeta[];
```

3. In `validateRequest`, replace the existing `if (type === "file") { ... }` block (lines 96-105) with:

```ts
  if (type === "file") {
    const fileError = validateFiles(input.files);
    if (fileError) {
      errors.files = fileError;
    }
    if (!input.licenseAccepted) {
      errors.licenseAccepted =
        "Bevestig dat je het ontwerp mag (laten) printen.";
    }
    if (input.photos.length > 0) {
      errors.photos = "Foto's horen niet bij dit type aanvraag.";
    }
  }

  // Reference photos are a custom-only feature. The client only ever sends
  // the matching upload kind; these rejections only hit hand-crafted POSTs.
  if (type === "custom") {
    const photoError = validatePhotos(input.photos);
    if (photoError) {
      errors.photos = photoError;
    }
  }

  if (type === "catalog") {
    if (input.files.length > 0) {
      errors.files = "Bestanden horen niet bij dit type aanvraag.";
    }
    if (input.photos.length > 0) {
      errors.photos = "Foto's horen niet bij dit type aanvraag.";
    }
  }
```

4. After the `hasAllowedExtension` function, add:

```ts
// Photos are optional on custom requests: zero photos is valid.
export function validatePhotos(photos: FileMeta[]): string | null {
  if (photos.length > MAX_PHOTOS) {
    return `Maximaal ${MAX_PHOTOS} foto's per aanvraag.`;
  }
  for (const photo of photos) {
    if (!isImageFileName(photo.name)) {
      return `"${photo.name}" is geen ondersteund fototype (${ALLOWED_PHOTO_EXTENSIONS.join(", ")}).`;
    }
    if (photo.sizeBytes > MAX_PHOTO_SIZE_BYTES) {
      return `"${photo.name}" is groter dan 10MB.`;
    }
  }
  return null;
}

// Doubles as the admin detail page's thumbnail-vs-download-row switch:
// an upload is a photo purely by extension (spec: no kind column).
export function isImageFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_PHOTO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
```

5. Keep the two existing `validateRequest` callers compiling (real wiring comes in Tasks 2 and 3):
   - `app/aanvraag/actions.ts` — inside the `validateRequest({ ... })` call, after the `files: uploadedFiles.map(...)` entry, add the line `photos: [],`.
   - `app/aanvraag/request-form.tsx` — inside the `const input: RequestInput = { ... }` literal, after the `files: files.map(...)` entry, add the line `photos: [],`.

- [ ] **Step 4: Run tests and build to verify green**

Run: `npm test`
Expected: PASS (all suites, including all pre-existing tests).

Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/requests/validation.ts lib/requests/validation.test.ts app/aanvraag/actions.ts app/aanvraag/request-form.tsx
git commit -m "feat: photo validation rules for custom requests"
```

---

### Task 2: Server action accepts photo uploads for custom requests

**Files:**
- Modify: `app/aanvraag/actions.ts:39-103`

**Interfaces:**
- Consumes: `validatePhotos` wiring inside `validateRequest` from Task 1 (`RequestInput.photos`); existing `UploadedFile`, `parseUploadedFiles`.
- Produces: the action treats parsed `uploadedFiles` as **photos** when `type === "custom"` and as **model files** when `type === "file"`; `request_files` rows are inserted whenever validated uploads exist. No signature changes — the client contract (`uploadedFiles` JSON field) is unchanged, which Task 3 relies on.

- [ ] **Step 1: Route upload metadata to the matching validation key**

In `app/aanvraag/actions.ts`, replace lines 39-56 (the `validateRequest` call) with:

```ts
  const type = String(formData.get("type") ?? "");
  const uploadMeta = uploadedFiles.map(
    (file): FileMeta => ({
      name: file.originalName,
      sizeBytes: file.sizeBytes,
    })
  );

  // Custom uploads are reference photos, file uploads are 3D models; catalog
  // must have neither. Validation rejects uploads under the wrong key, so a
  // hand-crafted POST can't smuggle files onto the wrong request type.
  const result = validateRequest({
    type,
    customerName: String(formData.get("customerName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    description: String(formData.get("description") ?? ""),
    color: String(formData.get("color") ?? ""),
    material: String(formData.get("material") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    licenseAccepted: formData.get("licenseAccepted") === "on",
    files: type === "custom" ? [] : uploadMeta,
    photos: type === "custom" ? uploadMeta : [],
  });
```

- [ ] **Step 2: Insert `request_files` rows whenever uploads exist**

Still in `app/aanvraag/actions.ts`, change the insert gate (line 91) from:

```ts
  if (result.data.type === "file") {
```

to:

```ts
  // Photos (custom) and model files (file) share the request_files table;
  // validation has already confirmed uploads match the request type.
  if (uploadedFiles.length > 0) {
```

- [ ] **Step 3: Verify tests and build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: compiles with no type errors.

- [ ] **Step 4: Commit**

```bash
git add app/aanvraag/actions.ts
git commit -m "feat: server action stores reference photos on custom requests"
```

---

### Task 3: Photo dropzone with thumbnails in the request form

**Files:**
- Modify: `app/aanvraag/request-form.tsx`

**Interfaces:**
- Consumes: `MAX_PHOTOS` from `@/lib/requests/validation` (Task 1); existing `uploadFiles` helper, `formatFileSize`, `UploadedFile`; the server action contract from Task 2 (photos ride in the same `uploadedFiles` JSON field).
- Produces: user-visible dropzone; no exports change.

- [ ] **Step 1: Add photo state and preview lifecycle**

In `app/aanvraag/request-form.tsx`:

1. Change the react import (line 3) to:

```ts
import { useActionState, useEffect, useState, useTransition } from "react";
```

2. Add `MAX_PHOTOS` to the `@/lib/requests/validation` import list.

3. After the `const [files, setFiles] = useState<File[]>([]);` line, add:

```ts
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  // Object URLs for the thumbnails; revoked when the selection changes or
  // the form unmounts, so replaced previews don't leak blobs.
  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo));
    setPhotoPreviews(urls);
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [photos]);
```

- [ ] **Step 2: Include photos in client validation and upload**

1. In `handleSubmit`, inside the `const input: RequestInput = { ... }` literal, replace the Task 1 placeholder line `photos: [],` with:

```ts
      photos: photos.map((photo): FileMeta => ({
        name: photo.name,
        sizeBytes: photo.size,
      })),
```

2. Replace the upload block (currently `let uploaded: UploadedFile[] = []; if (type === "file") { ... }`) with:

```ts
    // Custom requests upload reference photos through the same pipeline as
    // model files: same bucket, same groupId folder, same metadata field.
    let uploaded: UploadedFile[] = [];
    const uploadTargets =
      type === "file" ? files : type === "custom" ? photos : [];
    if (uploadTargets.length > 0) {
      setIsUploading(true);
      try {
        uploaded = await uploadFiles(uploadTargets);
      } catch {
        setClientError(
          "Uploaden mislukt, controleer je verbinding en probeer het opnieuw."
        );
        return;
      } finally {
        setIsUploading(false);
      }
    }
```

- [ ] **Step 3: Render the photo dropzone for custom requests**

Directly after the description `<Field>` (the one with `<Textarea name="description" rows={4} />`), add:

```tsx
        {type === "custom" && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">
              Foto&apos;s ter referentie (optioneel)
            </span>
            {/* Deliberately no `name`: the bytes must never end up in the
                FormData the server action receives. */}
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition-colors hover:border-violet-400 hover:bg-violet-50">
              <IconUpload className="h-8 w-8 text-violet-600" />
              <span className="text-sm font-medium text-slate-700">
                Kies foto&apos;s
              </span>
              <span className="text-xs text-slate-500">
                Max {MAX_PHOTOS} foto&apos;s · .jpg, .png, .webp · max 10MB
                per stuk
              </span>
              <input
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(event) =>
                  setPhotos(Array.from(event.target.files ?? []))
                }
                className="sr-only"
              />
            </label>
            {photos.length > 0 && (
              <ul className="flex flex-wrap gap-3">
                {photos.map((photo, index) => (
                  <li key={photo.name} className="flex w-28 flex-col gap-1">
                    {photoPreviews[index] && (
                      // Blob URL preview; next/image can't optimize blobs.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoPreviews[index]}
                        alt={photo.name}
                        className="h-24 w-28 rounded-lg border border-slate-200 object-cover"
                      />
                    )}
                    <span className="truncate text-xs text-slate-900">
                      {photo.name}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatFileSize(photo.size)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {errors.photos && (
              <p className="text-sm text-red-600">{errors.photos}</p>
            )}
          </div>
        )}
```

- [ ] **Step 4: Verify tests, lint, build**

Run: `npm test` — Expected: PASS.
Run: `npm run lint` — Expected: no errors (the `eslint-disable-next-line` keeps `no-img-element` quiet).
Run: `npm run build` — Expected: compiles.

- [ ] **Step 5: Browser check**

Run `npm run dev`, open `http://localhost:3000/aanvraag?type=custom` (Playwright MCP or manually):
- Dropzone appears under the description with the label "Foto's ter referentie (optioneel)" and helper "Max 5 foto's · .jpg, .png, .webp · max 10MB per stuk".
- Selecting 2 images shows 2 thumbnails with name + size.
- Switching type to "Print mijn bestand" hides the photo dropzone.
- Submitting with a `.heic` or oversized file selected shows the inline Dutch error under the dropzone (client validation, before any upload).
- Full happy path: custom request with 2 photos submits and redirects to `/aanvraag/verzonden`.

- [ ] **Step 6: Commit**

```bash
git add app/aanvraag/request-form.tsx
git commit -m "feat: reference photo dropzone on the custom request form"
```

---

### Task 4: Admin request detail shows photo thumbnails

**Files:**
- Modify: `app/admin/(protected)/aanvragen/[id]/page.tsx:157-189`

**Interfaces:**
- Consumes: `isImageFileName(fileName: string): boolean` from `@/lib/requests/validation` (Task 1); existing `signedUrls` map and `formatFileSize`.
- Produces: admin-visible thumbnails; no exports change.

- [ ] **Step 1: Render the files section for custom requests and thumbnail image entries**

In `app/admin/(protected)/aanvragen/[id]/page.tsx`:

1. Add the import:

```ts
import { isImageFileName } from "@/lib/requests/validation";
```

2. Replace the whole files section (lines 157-189, from `{request.type === "file" && (` through its closing `)}`) with:

```tsx
        {(request.type === "file" || request.type === "custom") && (
          <section className="mt-6">
            <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">Bestanden</h2>
            {filesError ? (
              <p className="mt-2 text-sm text-red-700 dark:text-red-400">
                Kon bestanden niet laden.
              </p>
            ) : files && files.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {files.map((file) => {
                  const url = signedUrls[file.storage_path];
                  return (
                    <li key={file.id} className="flex items-center gap-3">
                      {url && isImageFileName(file.original_name) ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3"
                        >
                          {/* Signed URL expires within the hour, so
                              next/image's cacheable optimization buys
                              nothing here. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={file.original_name}
                            className="h-16 w-16 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                          />
                          <span className="text-violet-700 hover:underline dark:text-violet-400">
                            {file.original_name}
                          </span>
                        </a>
                      ) : url ? (
                        <a href={url} className="text-violet-700 hover:underline dark:text-violet-400">
                          {file.original_name}
                        </a>
                      ) : (
                        <span>{file.original_name}</span>
                      )}
                      <span className="text-slate-500 dark:text-slate-400">
                        ({formatFileSize(file.size_bytes)})
                        {url ? "" : " — download tijdelijk niet beschikbaar"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Geen bestanden.</p>
            )}
          </section>
        )}
```

Behavior notes baked into that markup: an image entry with a signed URL renders as a clickable thumbnail (opens the full signed URL in a new tab) with name + size still visible; non-image files keep the download-link row; a missing signed URL falls back to the plain row — existing behavior, unchanged.

- [ ] **Step 2: Verify lint and build**

Run: `npm run lint` — Expected: no errors.
Run: `npm run build` — Expected: compiles.

- [ ] **Step 3: Browser check**

With `npm run dev` running, log into `/admin`, open the custom request submitted in Task 3 Step 5:
- Both photos render as 64px thumbnails; clicking one opens the full image in a new tab; name + size shown next to each.
- Open an existing file-type request: `.stl` entries still render as plain download links.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(protected)/aanvragen/[id]/page.tsx"
git commit -m "feat: photo thumbnails on the admin request detail page"
```

---

### Task 5: Channel-neutral quote copy

**Files:**
- Modify: `app/page.tsx:20-27`
- Modify: `app/aanvraag/page.tsx:52-55,89-93,111-114`
- Modify: `app/aanvraag/verzonden/page.tsx:20-23`
- Modify: `app/aanvraag/status/[token]/page.tsx:104-108`
- Modify: `app/aanvraag/status/[token]/not-found.tsx`

**Interfaces:**
- Consumes: `SITE_EMAIL` from `@/lib/site` (already exists; value `bayron.build@gmail.com`).
- Produces: copy only, no API changes. Grep anchor for future revisit: "prijsvoorstel" / "contact met ons op".

- [ ] **Step 1: Apply all copy edits**

1. `app/page.tsx` — replace the STEPS comment and step 2 entry (lines 20-27) with:

```ts
// Matches the real pipeline: manual quote, Akkoord on the status page,
// pickup with bank transfer/Tikkie. The quote link is currently shared
// personally (e.g. WhatsApp) until a verified email domain exists, so the
// public copy stays channel-neutral.
const STEPS = [
  ["Contact", "Stuur je idee, bestand of aanvraag via het formulier.", IconChat],
  ["Offerte", "Je ontvangt een prijsvoorstel met een persoonlijke link.", IconClipboard],
  ["Printen", "Na jouw akkoord wordt je opdracht met zorg geprint.", IconPrinter],
  ["Levering", "Ophalen of bezorgen; betalen per bankoverschrijving of Tikkie.", IconTruck],
] as const;
```

2. `app/aanvraag/page.tsx` intro (lines 52-55) — replace the `<p>` content with:

```tsx
          <p className="mt-2 text-slate-600">
            Vertel ons wat je wilt laten printen. Je ontvangt een
            prijsvoorstel — je betaalt pas na akkoord.
          </p>
```

3. `app/aanvraag/page.tsx` sidebar step (line 91): change `["Offerte per e-mail", IconClipboard],` to `["Offerte op maat", IconClipboard],`.

4. `app/aanvraag/page.tsx` sidebar bullet (line 113): change to:

```tsx
          <li>Je krijgt meestal binnen 1–2 dagen antwoord.</li>
```

5. `app/aanvraag/verzonden/page.tsx` (lines 20-23) — replace the `<p>` with:

```tsx
          <p className="text-slate-600">
            We bekijken je aanvraag en nemen zo snel mogelijk contact met je
            op met een prijsvoorstel.
          </p>
```

6. `app/aanvraag/status/[token]/page.tsx` — add the import `import { SITE_EMAIL } from "@/lib/site";` and replace the rejected banner (lines 104-108) with:

```tsx
        {status === "rejected" ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-red-800">
            Deze aanvraag is helaas afgewezen. Vragen? Neem contact met ons op
            via{" "}
            <a href={`mailto:${SITE_EMAIL}`} className="font-medium underline">
              {SITE_EMAIL}
            </a>
            .
          </p>
        ) : (
```

7. `app/aanvraag/status/[token]/not-found.tsx` — add `import { SITE_EMAIL } from "@/lib/site";` and replace the `<p>` with:

```tsx
      <p className="max-w-md text-slate-600">
        Controleer of je de volledige link hebt gebruikt. Kom je er niet uit?
        Neem contact met ons op via{" "}
        <a
          href={`mailto:${SITE_EMAIL}`}
          className="font-medium text-violet-700 underline"
        >
          {SITE_EMAIL}
        </a>
        .
      </p>
```

- [ ] **Step 2: Verify no email promise remains on public pages**

Run: `git grep -n "per e-mail" -- app`
Expected: matches only in `lib/email/` templates or admin pages, if anywhere — **zero matches under `app/` public pages** (`app/page.tsx`, `app/aanvraag/**`). (Email templates keep their wording per spec — they live under `lib/email/`, not `app/`.)

Run: `npm run build` — Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/aanvraag/page.tsx app/aanvraag/verzonden/page.tsx "app/aanvraag/status/[token]/page.tsx" "app/aanvraag/status/[token]/not-found.tsx"
git commit -m "fix: channel-neutral quote copy on all public pages"
```

---

### Task 6: Mobile menu + header seam removal

**Files:**
- Create: `components/mobile-menu.tsx`
- Modify: `components/site-header.tsx`
- Modify: `components/ui/icons.tsx`

**Interfaces:**
- Consumes: existing `ButtonLink`, `Icon` wrapper pattern in `icons.tsx`, `SITE_NAME`/`SITE_BYLINE`.
- Produces: `MobileMenu()` (named export, `"use client"`), `IconMenu`/`IconClose` icons. `SiteHeader` and `CubeLogo` stay exported from `components/site-header.tsx` with unchanged signatures — the header remains a server component.

- [ ] **Step 1: Add menu and close icons**

Append to `components/ui/icons.tsx`:

```tsx
export function IconMenu({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function IconClose({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}
```

- [ ] **Step 2: Create the mobile menu client component**

Create `components/mobile-menu.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { IconClose, IconMenu } from "@/components/ui/icons";

const LINKS = [
  ["/modellen", "Modellen"],
  ["/#hoe-het-werkt", "Hoe het werkt"],
  ["/#contact", "Contact"],
] as const;

// Only the menu is a client component; the header stays a server component.
// The panel is absolutely positioned against the header (which is
// `relative`), so it overlays page content instead of pushing it down.
export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Menu sluiten" : "Menu openen"}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 hover:text-white"
      >
        {open ? (
          <IconClose className="h-6 w-6" />
        ) : (
          <IconMenu className="h-6 w-6" />
        )}
      </button>
      {open && (
        <nav className="absolute inset-x-0 top-full z-20 flex flex-col gap-1 border-b border-slate-800 bg-slate-950 px-6 pb-6 pt-2">
          {LINKS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-2 text-sm text-slate-300 hover:text-violet-300"
            >
              {label}
            </Link>
          ))}
          <ButtonLink
            href="/aanvraag"
            onClick={() => setOpen(false)}
            className="mt-2"
          >
            Offerte aanvragen
          </ButtonLink>
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire the header**

Replace `components/site-header.tsx`'s `SiteHeader` (keep `CubeLogo` exactly where it is) with:

```tsx
// Public-site header. Dark (mockup): on the homepage it melts into the
// full-bleed hero — no bottom border, the color change is separation enough
// on light pages. Mobile gets a hamburger menu; `relative` anchors its
// dropdown panel.
export function SiteHeader() {
  return (
    <header className="relative bg-slate-950">
      <div className="mx-auto flex w-full max-w-[88rem] items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <CubeLogo className="h-8 w-8 text-violet-400" />
          <span className="flex flex-col leading-tight">
            <span className="font-bold text-white">{SITE_NAME}</span>
            <span className="text-xs text-slate-400">{SITE_BYLINE}</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 sm:flex">
          <Link href="/modellen" className="hover:text-violet-300">
            Modellen
          </Link>
          <Link href="/#hoe-het-werkt" className="hover:text-violet-300">
            Hoe het werkt
          </Link>
          <Link href="/#contact" className="hover:text-violet-300">
            Contact
          </Link>
        </nav>
        {/* max-sm:hidden (media-query variant) reliably beats the BASE
            inline-flex; a plain `hidden` utility would tie on specificity.
            Below sm the CTA lives inside the menu panel instead — logo +
            CTA + hamburger don't fit a 390px bar. */}
        <ButtonLink href="/aanvraag" className="max-sm:hidden">
          Offerte aanvragen
        </ButtonLink>
        <MobileMenu />
      </div>
    </header>
  );
}
```

And add the import at the top: `import { MobileMenu } from "./mobile-menu";`

Note this step also implements spec visual fix 3 (header seam): the old `border-b border-slate-800` is gone from the `<header>` className.

- [ ] **Step 4: Verify lint, build, browser**

Run: `npm run lint` — Expected: no errors.
Run: `npm run build` — Expected: compiles.

With `npm run dev`, in a 390px-wide viewport (Playwright MCP `browser_resize` or devtools):
- Hamburger visible; desktop nav and header CTA hidden.
- Tap opens a dark panel under the header with Modellen / Hoe het werkt / Contact / Offerte aanvragen; button switches to a close icon and `aria-expanded="true"`.
- Tapping a link closes the panel and navigates.
- At ≥640px: hamburger gone, nav + CTA exactly as before, no bottom border seam between header and hero.

- [ ] **Step 5: Commit**

```bash
git add components/mobile-menu.tsx components/site-header.tsx components/ui/icons.tsx
git commit -m "feat: mobile hamburger menu; drop header seam into the hero"
```

---

### Task 7: Dragon frame, ghost button, footer bookend

**Files:**
- Modify: `app/page.tsx:151-155`
- Modify: `components/ui/button.tsx:14`
- Modify: `components/site-footer.tsx:6-11`

**Interfaces:**
- Consumes: nothing new.
- Produces: visual changes only; the `inverse-outline` variant is used solely by the homepage hero, so no other surfaces change.

- [ ] **Step 1: Frame the dragon photo**

In `app/page.tsx`, replace the dragon `<Image>` (lines 151-155) with:

```tsx
              {/* The JPG has a baked-in white background; a deliberate white
                  photo frame turns that from glitch into feature. */}
              <div className="hidden shrink-0 rounded-xl bg-white p-3 shadow-md sm:block">
                <Image
                  src={dragon}
                  alt="3D-geprinte paarse draak"
                  className="w-28 rounded-md"
                />
              </div>
```

(`hidden sm:block` and the ~7rem width (`w-28`) are preserved; the frame sits fully inside the violet-50 card.)

- [ ] **Step 2: Strengthen the ghost button**

In `components/ui/button.tsx`, change the `inverse-outline` variant (line 14) to:

```ts
  // Ghost outline for dark surfaces (homepage hero secondary CTA): a faint
  // resting fill + stronger border so it doesn't recede into the photo.
  "inverse-outline": "border border-white/60 bg-white/5 text-white hover:bg-white/15",
```

- [ ] **Step 3: Match the footer to the dark bookends**

In `components/site-footer.tsx`, change the `<footer>` element (line 11) to:

```tsx
    <footer id="contact" className="border-t border-slate-800 bg-slate-950">
```

And update the comment above it (lines 6-8) to:

```tsx
// Carries the site's contact block; header/homepage "#contact" links land here.
// slate-950 so both dark bookends match the header/hero; the top border
// keeps the structural edge against light page content.
```

- [ ] **Step 4: Verify build and browser**

Run: `npm run lint` — Expected: no errors.
Run: `npm run build` — Expected: compiles.

With `npm run dev` on the homepage (desktop width):
- Dragon sits in a white rounded frame with soft shadow, fully inside the violet card, no edge clipping.
- Hero's "Custom ontwerp aanvragen" button has a visible resting fill and clearer border against the photo.
- Footer background matches the header/hero near-black; top border still present.

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/ui/button.tsx components/site-footer.tsx
git commit -m "fix: dragon photo frame, stronger hero ghost button, slate-950 footer"
```

---

### Task 8: Final verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Automated checks**

Run: `npm test` — Expected: PASS, including all new photo/validation tests.
Run: `npm run lint` — Expected: no errors.
Run: `npm run build` — Expected: clean production build.

- [ ] **Step 2: Browser checklist (spec's verification section)**

With `npm run dev` (Playwright MCP or manually):

1. Submit a custom request with 2 photos → thumbnails visible in admin detail, clicking opens full image, download works.
2. Submit a custom request with 0 photos → succeeds (photos optional).
3. Select a `.heic` or an oversized (>10MB) image → clear Dutch inline error, no upload happens.
4. File-type flow unchanged: `.stl` required extensions and license checkbox still enforced; `.stl` entries in admin still plain download links.
5. Mobile menu at 390px: open/close, links navigate, CTA present in panel.
6. Homepage visuals: header melts into hero (no seam), ghost button visible against photo, dragon framed, footer matches header color.
7. Copy spots: homepage step 2, aanvraag intro + sidebar ("Offerte op maat", no "per e-mail"), verzonden page, rejected status banner and invalid-token page both point to bayron.build@gmail.com.

- [ ] **Step 3: Report**

Report any failures back before merging; do not claim success without the outputs above.
