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
