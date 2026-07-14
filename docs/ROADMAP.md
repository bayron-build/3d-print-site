# 3D Print Service — Project Roadmap

The stable, high-level plan for the whole project. Detailed designs and
implementation plans are written per phase in `docs/superpowers/specs/` and
`docs/superpowers/plans/` when that phase starts.

## What this is

A web app where local customers order 3D prints three ways:

1. **Ready-made** — catalog of own designs with photos and indicative prices
   → "order this" (choose color/quantity)
2. **Print my file** — upload STL/3MF/STEP (max 50MB) + description +
   color/material preference. License checkbox required: "own design or
   commercial printing permitted".
3. **Custom design** — describe what's needed (dimensions, purpose), no file
   required

All three feed **one request pipeline**. No online payment — quotes are made
manually; customers pay by bank transfer/Tikkie.

## Stack

Next.js (App Router, TypeScript) + Supabase (Postgres, Auth, Storage) +
Tailwind, deployed on Vercel. Email via Resend free tier. Minimal
dependencies. **UI language: Dutch. Code, comments, variable names: English.**

## Data model (guide — refine in Phase 2)

- `products`: id, name, description, photos, indicative_price, active
- `requests`: id, type (catalog|file|custom), customer_name, email,
  description, status (received|quoted|approved|printing|done|rejected),
  quote_design_fee, quote_print_fee, admin_notes, created_at
- `request_files`: uploads linked to a request, stored in a private
  Supabase Storage bucket

## Flows

- **Customer:** submits request → confirmation email → magic link to a
  status page (no account needed).
- **Admin (single user, email+password):** dashboard listing requests,
  view/download files, set quote (design fee + print fee), update status,
  add notes. Status changes trigger an email to the customer.

## Build phases (one at a time; owner reviews and runs after each)

| Phase | Delivers | Status |
|-------|----------|--------|
| 1 | Project setup, Supabase connection, hello-world deploy to Vercel | done |
| 2 | Database schema + admin auth + empty admin dashboard | done |
| 3 | Request form (all three types) + file upload + license checkbox | done |
| 4 | Admin dashboard: list, detail view, quoting, status updates | done |
| 5 | Emails + customer status page via magic link | done |
| 6 | Public landing page + catalog (Dutch copy provided by owner) | done |
| — | Site redesign: light/violet theme, shared UI components (2026-07-14) | done |

## Explicitly NOT in v1 (do not build, do not scaffold)

Online payments, customer accounts, shopping cart, stock tracking, automatic
pricing, English version, reviews, multi-printer support.
