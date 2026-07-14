# Admin Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin area (everything under `/admin`, including `/admin/login`) always renders dark; the public site stays pixel-identical. Spec: `docs/superpowers/specs/2026-07-14-admin-dark-mode-design.md`.

**Architecture:** Tailwind class-based dark mode: one `@custom-variant dark` line in `globals.css` makes `dark:*` utilities activate under a `.dark` ancestor. The `.dark` class (plus `[color-scheme:dark]` for native controls) goes on exactly two roots — the admin layout wrapper and the login page `<main>`. Shared `components/ui/` components gain additive `dark:` variants (inert on the public site); admin page files gain `dark:` counterparts per a fixed mapping table.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (no config file; CSS-first via `globals.css`), vitest.

## Global Constraints

- **No behavior changes.** Classes only. No queries, server actions, props, state, handlers, or copy change anywhere. No new components.
- **Only two elements ever carry the `.dark` class:** the admin layout root div and the login page `<main>`. No `.dark` on public pages, `<html>`, or `<body>`.
- **`dark:` classes may only appear in:** `app/globals.css` (the variant declaration), `components/ui/*`, `lib/requests/status.ts`, and files under `app/admin/`. Never in public page files or `components/site-*.tsx`.
- **Mapping table (apply mechanically — every occurrence of the light class in a touched admin file gains the dark counterpart):**
  | Light | add Dark |
  |---|---|
  | `bg-slate-50` (page bg) | `dark:bg-slate-950` |
  | `bg-white` (surfaces) | `dark:bg-slate-900` |
  | `border-slate-200` / `divide-slate-100` | `dark:border-slate-800` / `dark:divide-slate-800` |
  | `border-slate-300` (inputs) | `dark:border-slate-700` |
  | `text-slate-900` (headings) | `dark:text-white` |
  | `text-slate-600` / `text-slate-700` | `dark:text-slate-300` |
  | `text-slate-500` | `dark:text-slate-400` |
  | `hover:bg-violet-50/60` | `dark:hover:bg-violet-500/10` |
  | `text-violet-700` (links) | `dark:text-violet-400` |
  | `text-red-600` / `text-red-700` | `dark:text-red-400` |
  | `text-green-700` | `dark:text-green-400` |
  | `border-red-200` | `dark:border-red-500/40` |
- Status colors stay in `lib/requests/status.ts` only; `STATUS_DOT_CLASSES` unchanged.
- **Verification commands:** `npm run test` (66 tests), `npm run lint`, `npm run build` — all pass at the end of every task, then commit.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Next 16 note (AGENTS.md): read `node_modules/next/dist/docs/` before using any Next API not already present. This plan needs none.
- Repo context: the 2026-07-14 redesign commits may still be unpushed — that's fine, work on top of current `main` HEAD.

---

### Task 1: Dark variants for shared UI + status colors + globals.css

Nothing activates these yet (no `.dark` class exists until Task 2), so the site — public AND admin — must look completely unchanged after this task. That's the point: this task is provably inert.

**Files:**
- Modify: `app/globals.css`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/field.tsx`
- Modify: `lib/requests/status.ts`
- Modify: `app/admin/(protected)/admin-nav.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: every export keeps its exact current signature; only class strings grow. Later tasks rely on: `Card`, `Button`/`ButtonLink` (variants `primary`|`secondary`|`danger`|`danger-outline`), `Field`/`Input`/`Textarea`/`Select`/`inputClasses`, `STATUS_BADGE_CLASSES`, `AdminNav` — all rendering dark automatically under a `.dark` ancestor.

- [ ] **Step 1: Declare the dark variant in `app/globals.css`**

Insert between the `@theme inline { … }` block and the `body { … }` rule:

```css
/* Dark mode is opt-in per subtree: any element with .dark (the admin shell,
   the admin login page) turns dark: utilities on for itself and descendants.
   The public site never sets .dark, so it is unaffected. */
@custom-variant dark (&:where(.dark, .dark *));
```

The file then reads, in full:

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

/* Dark mode is opt-in per subtree: any element with .dark (the admin shell,
   the admin login page) turns dark: utilities on for itself and descendants.
   The public site never sets .dark, so it is unaffected. */
@custom-variant dark (&:where(.dark, .dark *));

body {
  background: #ffffff;
  color: #0f172a; /* slate-900 */
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}
```

- [ ] **Step 2: `components/ui/card.tsx`** — one class string change:

```
rounded-xl border border-slate-200 bg-white p-6 shadow-sm
```
→
```
rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900
```

- [ ] **Step 3: `components/ui/button.tsx`** — replace the `VARIANTS` const with (primary and danger are unchanged — violet/red work on both backgrounds):

```tsx
const VARIANTS = {
  primary: "bg-violet-600 text-white hover:bg-violet-500",
  secondary:
    "border border-slate-300 bg-white text-slate-700 hover:border-violet-400 hover:text-violet-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-300",
  danger: "bg-red-600 text-white hover:bg-red-500",
  "danger-outline":
    "border border-red-300 bg-white text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-500/10",
} as const;
```

- [ ] **Step 4: `components/ui/field.tsx`** — three changes:

`inputClasses` becomes:

```tsx
export const inputClasses =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-500 dark:focus:ring-violet-500/30";
```

Inside `Field`:
- label span: `text-sm font-medium text-slate-700` → `text-sm font-medium text-slate-700 dark:text-slate-300`
- hint span: `text-xs text-slate-500` → `text-xs text-slate-500 dark:text-slate-400`
- error span: `text-sm text-red-600` → `text-sm text-red-600 dark:text-red-400`

- [ ] **Step 5: `lib/requests/status.ts`** — replace the `STATUS_BADGE_CLASSES` block (pattern: translucent tint + light text on dark; slate gets /20 for enough contrast). `STATUS_DOT_CLASSES` stays untouched:

```ts
// Badge colours per status: neutral for new, blue while in progress, green
// for done, red for rejected. Violet marks the customer's "akkoord" moment.
// The dark: variants render inside the always-dark admin shell.
export const STATUS_BADGE_CLASSES: Record<RequestStatus, string> = {
  received: "bg-slate-100 text-slate-800 dark:bg-slate-500/20 dark:text-slate-300",
  quoted: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  approved: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  printing: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  done: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};
```

- [ ] **Step 6: `app/admin/(protected)/admin-nav.tsx`** — in the link className ternary:
- active: `bg-violet-100 text-violet-800` → `bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300`
- inactive: `text-slate-600 hover:bg-slate-100 hover:text-slate-900` → `text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100`

- [ ] **Step 7: Verify (must be visually inert)**

Run: `npm run test` → 66 pass. `npm run lint` → clean. `npm run build` → succeeds. No test asserts the badge class strings (verified while planning), so nothing needs updating.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/ui/card.tsx components/ui/button.tsx components/ui/field.tsx lib/requests/status.ts "app/admin/(protected)/admin-nav.tsx"
git commit -m "feat: dark-variant groundwork — custom variant, shared UI and status badge dark classes"
```

---

### Task 2: Turn the admin shell dark — layout + dashboard

The `.dark` class lands on the admin layout root here; from this task on the whole protected admin renders dark.

**Files:**
- Modify: `app/admin/(protected)/layout.tsx`
- Modify: `app/admin/(protected)/page.tsx`

**Interfaces:**
- Consumes: Task 1's dark variants (`Card`, `Button` secondary, `AdminNav`, `STATUS_BADGE_CLASSES` via `StatusBadge`).
- Produces: the `.dark [color-scheme:dark]` root that Tasks 3–4 rely on (their pages render inside this layout and need no root of their own).

- [ ] **Step 1: `layout.tsx`** — auth gate and structure untouched; three class changes:
- root div: `flex min-h-screen flex-col bg-slate-50` → `dark flex min-h-screen flex-col bg-slate-50 [color-scheme:dark] dark:bg-slate-950 dark:text-slate-100`
  (`dark:text-slate-100` matters: unstyled text — `<dd>`, "Zeker weten?", table cells — inherits the body's near-black color and would be invisible on dark without it. `[color-scheme:dark]` makes native selects/checkboxes/file inputs render dark.)
- header: `border-b border-slate-200 bg-white` → `border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900`
- "Beheer" span: `font-bold text-slate-900` → `font-bold text-slate-900 dark:text-white`
- email span: `hidden text-sm text-slate-500 sm:inline` → `hidden text-sm text-slate-500 sm:inline dark:text-slate-400`

- [ ] **Step 2: `page.tsx` (dashboard)** — apply the mapping table; every changed line listed:
- h1: `text-2xl font-bold text-slate-900` → `text-2xl font-bold text-slate-900 dark:text-white`
- count p: `mt-1 text-sm text-slate-500` → `mt-1 text-sm text-slate-500 dark:text-slate-400`
- error p: `mt-6 text-red-700` → `mt-6 text-red-700 dark:text-red-400`
- table header div: `hidden gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid sm:grid-cols-[7rem_1.4fr_1fr_4rem_9rem]` → same + ` dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400`
- ul: `divide-y divide-slate-100` → `divide-y divide-slate-100 dark:divide-slate-800`
- row Link: `… hover:bg-violet-50/60 …` → add `dark:hover:bg-violet-500/10` (rest of the string unchanged)
- date span: `text-slate-500` → `text-slate-500 dark:text-slate-400`
- customer name span: `block truncate font-medium text-slate-900` → `block truncate font-medium text-slate-900 dark:text-white`
- email span: `block truncate text-xs text-slate-500` → `block truncate text-xs text-slate-500 dark:text-slate-400`
- type + quantity spans: `text-slate-600` → `text-slate-600 dark:text-slate-300` (two occurrences)
- empty-state p: `text-slate-600` → `text-slate-600 dark:text-slate-300`
- `FilterCard` Link: `rounded-xl border bg-white p-3 transition-colors` → `rounded-xl border bg-white p-3 transition-colors dark:bg-slate-900`; active branch `border-violet-600 ring-1 ring-violet-600` → `border-violet-600 ring-1 ring-violet-600 dark:border-violet-500 dark:ring-violet-500`; inactive branch `border-slate-200 hover:border-violet-300` → `border-slate-200 hover:border-violet-300 dark:border-slate-800 dark:hover:border-violet-500`
- FilterCard label span: `flex items-center gap-1.5 text-xs font-medium text-slate-500` → same + ` dark:text-slate-400`
- FilterCard count span: `mt-1 block text-2xl font-bold text-slate-900` → same + ` dark:text-white`

- [ ] **Step 3: Verify**

Run: `npm run test && npm run lint && npm run build` → all pass.
Public-site guard: `grep -rn "dark" app/page.tsx app/modellen app/aanvraag components/site-header.tsx components/site-footer.tsx components/product-card.tsx` → no matches.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(protected)/layout.tsx" "app/admin/(protected)/page.tsx"
git commit -m "feat: dark admin shell and dashboard"
```

---

### Task 3: Dark request detail

**Files:**
- Modify: `app/admin/(protected)/aanvragen/[id]/page.tsx`
- Modify: `app/admin/(protected)/aanvragen/[id]/quote-form.tsx`
- Modify: `app/admin/(protected)/aanvragen/[id]/copy-status-link.tsx`
- Modify: `app/admin/(protected)/aanvragen/[id]/delete-button.tsx`

**Interfaces:**
- Consumes: Task 2's dark layout root; Task 1's `Card`/`Field`/`Button`/`StatusBadge` dark variants (they do most of the work — these files only need their own literal classes mapped).
- Produces: nothing new.

- [ ] **Step 1: `page.tsx`** — apply the mapping table; every changed line:
- top-level error p: `text-red-700` → `text-red-700 dark:text-red-400`
- back link: `text-sm text-violet-700 hover:underline` → `text-sm text-violet-700 hover:underline dark:text-violet-400`
- h1: `text-2xl font-bold text-slate-900` → `text-2xl font-bold text-slate-900 dark:text-white`
- every `<dt className="text-slate-600">` → `text-slate-600 dark:text-slate-300` (9 occurrences: Type, Ontvangen, E-mail, Telefoon, Product, Aantal, Kleur, Materiaal, Omschrijving)
- mailto link: `text-violet-700 hover:underline` → `text-violet-700 hover:underline dark:text-violet-400`
- Bestanden h2: `text-sm font-medium text-slate-600` → `text-sm font-medium text-slate-600 dark:text-slate-400`
- filesError p: `mt-2 text-sm text-red-700` → `mt-2 text-sm text-red-700 dark:text-red-400`
- file link: `text-violet-700 hover:underline` → `text-violet-700 hover:underline dark:text-violet-400`
- file size span: `text-slate-500` → `text-slate-500 dark:text-slate-400`
- "Geen bestanden." p: `mt-2 text-sm text-slate-500` → `mt-2 text-sm text-slate-500 dark:text-slate-400`
- both card h2s "Statuspagina van de klant" / "Offerte & status": `text-lg font-bold text-slate-900` → `text-lg font-bold text-slate-900 dark:text-white`
- both intro/explainer p's: `mt-1 text-sm text-slate-600` → `mt-1 text-sm text-slate-600 dark:text-slate-300` (two occurrences: statuspagina card, verwijderen card)
- danger Card: `<Card className="mt-6 border-red-200">` → `<Card className="mt-6 border-red-200 dark:border-red-500/40">`
- Verwijderen h2: `text-lg font-bold text-red-700` → `text-lg font-bold text-red-700 dark:text-red-400`

- [ ] **Step 2: `quote-form.tsx`** — three lines:
- Totaal p: `text-sm text-slate-600` → `text-sm text-slate-600 dark:text-slate-300`
- errors.form p: `text-sm text-red-600` → `text-sm text-red-600 dark:text-red-400`
- success p: `text-sm text-green-700` → `text-sm text-green-700 dark:text-green-400`

- [ ] **Step 3: `copy-status-link.tsx`** — two lines:
- code: `min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs` → same + ` dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300`
- failed p: `text-sm text-red-600` → `text-sm text-red-600 dark:text-red-400`

- [ ] **Step 4: `delete-button.tsx`** — no changes needed ("Zeker weten?" inherits the root's `dark:text-slate-100`; buttons come from Task 1). Verify by reading it; if that matches, leave the file untouched and don't include it in the commit.

- [ ] **Step 5: Verify**

Run: `npm run test && npm run lint && npm run build` → all pass.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/(protected)/aanvragen"
git commit -m "feat: dark admin request detail"
```

---

### Task 4: Dark products pages

**Files:**
- Modify: `app/admin/(protected)/producten/page.tsx`
- Modify: `app/admin/(protected)/producten/product-form.tsx`
- Modify: `app/admin/(protected)/producten/nieuw/page.tsx`
- Modify: `app/admin/(protected)/producten/[id]/page.tsx`
- Modify: `app/admin/(protected)/producten/[id]/photo-manager.tsx`
- Modify: `app/admin/(protected)/producten/[id]/delete-button.tsx`

**Interfaces:**
- Consumes: Task 2's dark layout root; Task 1's component dark variants.
- Produces: nothing new.

- [ ] **Step 1: `producten/page.tsx`** — every changed line:
- error p: `text-red-700` → `text-red-700 dark:text-red-400`
- h1: `text-2xl font-bold text-slate-900` → `text-2xl font-bold text-slate-900 dark:text-white`
- empty-state p: `text-slate-600` → `text-slate-600 dark:text-slate-300`
- thead tr: `border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500` → same + ` dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400`
- tbody tr: `border-b border-slate-100 hover:bg-violet-50/60` → `border-b border-slate-100 hover:bg-violet-50/60 dark:border-slate-800 dark:hover:bg-violet-500/10`
- photo placeholder span: `inline-block h-10 w-10 rounded-lg bg-slate-100` → same + ` dark:bg-slate-800`
- name Link: `font-medium text-violet-700 hover:underline` → `font-medium text-violet-700 hover:underline dark:text-violet-400`
- badge ternary: active `bg-green-100 text-green-800` → `bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300`; inactive `bg-slate-200 text-slate-700` → `bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300`

- [ ] **Step 2: `product-form.tsx`** — two lines (checkbox label span has no color class and inherits the dark root; the checkbox's `accent-violet-600` works on dark):
- errors.form p: `text-sm text-red-600` → `text-sm text-red-600 dark:text-red-400`
- success p: `text-sm text-green-700` → `text-sm text-green-700 dark:text-green-400`

- [ ] **Step 3: `nieuw/page.tsx` and `[id]/page.tsx`** — in each:
- h1: `text-2xl font-bold text-slate-900` → `text-2xl font-bold text-slate-900 dark:text-white`
- (`nieuw` only) intro p: `max-w-xl text-sm text-slate-600` → `max-w-xl text-sm text-slate-600 dark:text-slate-300`

- [ ] **Step 4: `photo-manager.tsx`** — every changed line:
- h2: `text-lg font-semibold text-slate-900` → `text-lg font-semibold text-slate-900 dark:text-white`
- intro p: `text-sm text-slate-600` → `text-sm text-slate-600 dark:text-slate-300`
- img: `aspect-square w-full rounded-lg border border-slate-200 object-cover` → same + ` dark:border-slate-800`
- per-photo delete button: `text-sm text-red-600 hover:underline disabled:opacity-50` → `text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400`
- file input: `text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-violet-700 hover:file:bg-violet-200` → same + ` dark:text-slate-400 dark:file:bg-violet-500/20 dark:file:text-violet-300 dark:hover:file:bg-violet-500/30`
- error p: `text-sm text-red-600` → `text-sm text-red-600 dark:text-red-400`

- [ ] **Step 5: `[id]/delete-button.tsx`** — one line ("Zeker weten?" inherits):
- state.error p: `text-sm text-red-600` → `text-sm text-red-600 dark:text-red-400`

- [ ] **Step 6: Verify**

Run: `npm run test && npm run lint && npm run build` → all pass.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/(protected)/producten"
git commit -m "feat: dark admin products pages"
```

---

### Task 5: Dark login page + verification pass

**Files:**
- Modify: `app/admin/login/page.tsx`
- Modify: `app/admin/login/login-form.tsx`

**Interfaces:**
- Consumes: Task 1's dark variants (`Field`/`Input`/`Button`). The login page sits OUTSIDE the (protected) layout, so it needs its own `.dark` root — that is why `<main>` gets the class here.
- Produces: nothing new.

- [ ] **Step 1: `login/page.tsx`** — three class changes:
- main: `flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8` → `dark flex min-h-screen flex-col items-center justify-center bg-slate-50 p-8 [color-scheme:dark] dark:bg-slate-950 dark:text-slate-100`
- card div: `flex w-full max-w-sm flex-col gap-6 rounded-xl border border-slate-200 bg-white p-8 shadow-sm` → same + ` dark:border-slate-800 dark:bg-slate-900`
- h1: `text-2xl font-bold text-slate-900` → `text-2xl font-bold text-slate-900 dark:text-white`
- subtitle p: `text-sm text-slate-500` → `text-sm text-slate-500 dark:text-slate-400`

- [ ] **Step 2: `login-form.tsx`** — one line:
- state.error p: `text-sm text-red-600` → `text-sm text-red-600 dark:text-red-400`

- [ ] **Step 3: Full suite**

Run: `npm run test && npm run lint && npm run build` → all pass.

- [ ] **Step 4: Scope guard greps**

From repo root:
- `grep -rln "dark:" app components lib` → hits ONLY in `components/ui/` (button, card, field), `lib/requests/status.ts`, and files under `app/admin/`. Any other file is a stray — fix it.
- `grep -rn "\"dark \|'dark \|\`dark " app components` → exactly two hits: the admin layout root div and the login page main. (The `.dark` class always leads those two class strings.)

- [ ] **Step 5: Visual check (no credentials needed)**

Start `npm run dev` in the background (reuse an existing server on :3000 if one is running). With the Playwright browser MCP tools, load `http://localhost:3000/admin/login` at 1440×900 and 390×844 and screenshot both: expect a slate-950 screen, slate-900 card, readable labels/inputs, violet button. Also load `http://localhost:3000/` and confirm the homepage still renders light (white/violet-50 hero, no dark surfaces). Stop the dev server and close the browser afterwards. Logged-in admin checks (dashboard, detail, products, native select rendering dark) are OWNER ACTIONS — defer, and list them in your report.

- [ ] **Step 6: Commit**

```bash
git add app/admin/login
git commit -m "feat: dark admin login and scope-guard verification"
```

---

## Owner checklist (after all tasks, local `npm run dev`, logged in)

- [ ] Dashboard: dark cards readable, badge colors distinguishable, filter cards + hover states work
- [ ] Request detail: dl text legible, quote form inputs dark with light text, native status dropdown renders dark, success "Opgeslagen." readable, danger card visible
- [ ] Products: table legible, active/inactief badges readable, photo manager file input + tiles look right
- [ ] Login: dark card, autofill doesn't leave white-on-white text
- [ ] Public site spot check: homepage, /modellen, /aanvraag all still light

## Self-review notes (already applied)

- Spec coverage: mechanism → Task 1 Step 1 + Task 2 Step 1 + Task 5 Step 1; component-level decisions → Task 1; page inventory → Tasks 2–5; testing section → per-task verify + Task 5 Steps 4–5 + owner checklist.
- The `dark:text-slate-100` on both roots covers all unstyled inherited text (dd, spans, td) — checked against every touched file.
- Type consistency: no signatures change anywhere; class strings verified against the actual current file contents (read on 2026-07-14 after commit e5a4011).
