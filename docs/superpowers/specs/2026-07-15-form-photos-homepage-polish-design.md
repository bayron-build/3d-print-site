# Reference photos + homepage polish — design

**Date:** 2026-07-15
**Status:** approved by owner (brainstormed in session)

## Goal

One small batch with two themes:

1. **Feature:** visitors can attach reference photos to an "Eigen ontwerp"
   (custom) request.
2. **Polish:** public copy stops promising email (the current flow shares the
   quote link personally), plus five small visual fixes that came out of a
   homepage design review.

Out of scope: Modellen catalog content (owner handles data), Resend
verified-domain work, any admin flow changes beyond showing photos.

## 1. Reference photos on the custom flow

### Decision

Reuse the existing upload pipeline end to end (**no migration**): photos go
into the same private `request-files` bucket, browser → Supabase Storage
directly (same reason as model files: server actions cap at 1MB, Vercel
~4.5MB), and their metadata lands in the same `request_files` table. A photo
is distinguished from a model file only by its extension. The rejected
alternative — separate bucket + `kind` column — needs a migration and parallel
code paths for no user-visible benefit.

The bucket's 50MB `file_size_limit` already covers the 10MB photo cap, and the
anon insert-only storage policy plus the `request_files` insert policy apply
unchanged. Extension rules live in app code (bucket has no MIME allowlist,
Phase 3 decision).

### Validation (`lib/requests/validation.ts`, pure + tested)

New constants and rules, mirroring the existing file rules:

- `MAX_PHOTOS = 5`
- `MAX_PHOTO_SIZE_BYTES = 10485760` (10MB, same as product photos)
- `ALLOWED_PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"]`
- `RequestInput` gains `photos: FileMeta[]`.
- New `validatePhotos(photos)`: **zero photos is valid** (optional feature);
  otherwise max count, allowed extension, max size — Dutch error strings in
  the same voice as `validateFiles` (error key `photos`).
- `validateRequest` runs `validatePhotos` for `type === "custom"`. For
  `catalog`, any uploads (files or photos) are invalid; for `file`, the
  existing file rules apply and photos must be empty. The client only ever
  sends the matching kind, so these rejections only hit hand-crafted POSTs.

HEIC note: Safari converts HEIC → JPEG when picking from the photo library,
so iPhone users pass. A raw `.heic` file gets the clear extension error.

### Form (`app/aanvraag/request-form.tsx`)

- When type is `custom`, show a second dashed dropzone under the description:
  label **"Foto's ter referentie (optioneel)"**, helper line
  "Max 5 foto's · .jpg, .png, .webp · max 10MB per stuk",
  `accept=".jpg,.jpeg,.png,.webp"`, `multiple`, no `name` attribute (bytes
  must never enter the action's FormData — same rule as model files).
- Separate `photos` state. Selected photos render as small thumbnail
  previews (`URL.createObjectURL`, revoked on replacement/unmount) with
  original name + `formatFileSize`.
- Submit flow keeps the orphan-prevention order: full client validation
  (including photos) BEFORE any upload. For custom requests the photos are
  uploaded with the existing `uploadFiles` helper (same random `groupId`
  folder, index-prefixed sanitized names) and ride along in the existing
  `uploadedFiles` JSON metadata field.

### Server action (`app/aanvraag/actions.ts`)

- The parsed `uploadedFiles` metadata is validated as **photos** when
  `type === "custom"` and as **model files** when `type === "file"` (pass
  them into `validateRequest` under the matching key).
- `request_files` rows are inserted whenever validated uploads exist
  (currently the insert is gated on `type === "file"`; it becomes
  "uploads present"). Catalog requests never have uploads; hand-crafted
  POSTs that attach uploads to a catalog request are rejected by validation
  (photos/files must be empty for catalog).

### Admin (`app/admin/(protected)/aanvragen/[id]/page.tsx`)

- In the existing files list, entries whose stored name has an image
  extension render as a clickable thumbnail (`<img>` with the already-created
  signed URL, fixed small size, `object-cover`, rounded) linking to the full
  signed URL in a new tab; name + size stay visible. Non-image files keep the
  current download-link row. Small pure helper (e.g. `isImageFileName`) lives
  with the validation helpers and gets a test.

### Tests

Extend `lib/requests/validation.test.ts` (Vitest): photo count/extension/size
rules, zero-photos-valid, custom-only enforcement, catalog-rejects-uploads,
image-name helper.

## 2. Channel-neutral quote copy

Outbound Resend email only delivers to the owner's inbox until a domain is
verified, so the public pages must not promise email. Inbound email TO the
owner works fine, so "contact us" pointers use `SITE_EMAIL` from `lib/site.ts`.
Email templates themselves keep their wording (if one arrives, it was email).

| Place | New copy |
| --- | --- |
| `app/page.tsx` step 2 | "Je ontvangt een prijsvoorstel met een persoonlijke link." |
| `app/page.tsx` STEPS comment | note quote link is currently shared personally (WhatsApp) |
| `app/aanvraag/page.tsx` intro | "Vertel ons wat je wilt laten printen. Je ontvangt een prijsvoorstel — je betaalt pas na akkoord." |
| `app/aanvraag/page.tsx` sidebar step "Offerte per e-mail" | "Offerte op maat" |
| `app/aanvraag/page.tsx` "antwoord per e-mail" bullet | "Je krijgt meestal binnen 1–2 dagen antwoord." |
| `app/aanvraag/verzonden/page.tsx` | "We bekijken je aanvraag en nemen zo snel mogelijk contact met je op met een prijsvoorstel." |
| `app/aanvraag/status/[token]/page.tsx` rejected text | "Deze aanvraag is helaas afgewezen. Vragen? Neem contact met ons op via {SITE_EMAIL}." |
| `app/aanvraag/status/[token]/not-found.tsx` | "Controleer of je de volledige link hebt gebruikt. Kom je er niet uit? Neem contact met ons op via {SITE_EMAIL}." |

When the owner later verifies a domain, only these public lines need
revisiting (grep for "prijsvoorstel" / "contact met ons op").

## 3. Small visual fixes

1. **Dragon frame** (`app/page.tsx`): the dragon JPG has a baked-in white
   background that currently reads as a glitch and clips at the card edge.
   Wrap it in a deliberate white "photo frame": white background, padding,
   rounded corners, soft shadow, fully inside the violet-50 card. Keep
   `hidden sm:block` and the ~7rem width.
2. **Mobile menu** (`components/site-header.tsx` + new client component):
   below `sm` the nav links currently vanish. Add a hamburger button
   (`aria-expanded`, Dutch `aria-label`, menu/close icons added to
   `components/ui/icons.tsx`) that toggles a slate-950 panel under the header
   with Modellen / Hoe het werkt / Contact and the "Offerte aanvragen"
   button. Closes on link tap. Desktop (`sm:`+) unchanged. The header stays a
   server component; only the menu is `"use client"`. `CubeLogo`'s export
   location must not change (`request-form.tsx` imports it).
3. **Header seam** (`components/site-header.tsx`): remove
   `border-b border-slate-800` so the header truly melts into the homepage
   hero; on light pages the dark/light color change is separation enough.
4. **Ghost button presence** (`components/ui/button.tsx`,
   `inverse-outline` variant): currently `border-white/40 text-white
   hover:bg-white/10`, which recedes against the hero photo. Give it a faint
   resting fill and stronger border, e.g. `border-white/60 bg-white/5
   hover:bg-white/15`. Only used in the hero, so no other surfaces change.
5. **Footer bookend** (`components/site-footer.tsx`): `bg-slate-900` →
   `bg-slate-950` so both dark bookends match the header/hero. Keep
   `border-t border-slate-800` for structure.

## Error handling

No new posture: photo upload failures reuse the existing
"Uploaden mislukt, controleer je verbinding…" client error; validation errors
render inline per field like today; admin thumbnail falls back to the plain
row when a signed URL is missing (existing behavior).

## Verification

- `npm test` (extended Vitest suite), lint, build.
- Browser: submit a custom request with 2 photos (see them in admin as
  thumbnails, download works), custom request with 0 photos, `.heic`/oversize
  rejection message, file-type flow unchanged (license + .stl still
  enforced), mobile menu at 390px, homepage hero seam/button/footer visuals,
  all copy spots.
