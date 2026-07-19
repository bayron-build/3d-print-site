-- Product versions ("uitvoeringen"): optional per-product configurations with
-- their own manual price and an optional struck-through compare-at price.
-- Products without versions behave exactly as before.
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as
-- 0001-0008), BEFORE deploying the code that uses it. Safe to run early: the
-- current app never names these columns, and the recreated insert policy
-- still accepts today's version-less catalog inserts.

create table public.product_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price > 0),
  compare_at_price numeric(10,2) check (compare_at_price is null or compare_at_price > price),
  photo_path text,
  sort_order integer not null default 0
);

-- Every read is "versions of product X"; the FK alone creates no index.
create index product_versions_product_id_idx
  on public.product_versions (product_id);

alter table public.product_versions enable row level security;

create policy "Admin full access" on public.product_versions
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Mirrors "Anon read active products" (0003): visitors only see versions of
-- active products. The subquery runs under the caller's own products RLS,
-- which already limits anon to active rows.
create policy "Anon read versions of active products" on public.product_versions
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
       where p.id = product_id
         and p.active
    )
  );

-- Customer-facing label of the base-price option (e.g. 'Enkel'), shown only
-- when the product has versions; the UI falls back to 'Standaard' when empty.
alter table public.products
  add column base_version_label text;

-- Point-in-time snapshot of the chosen version's name. NULL = base-price
-- order (or any pre-versions request). Price is already snapshotted in
-- unit_price, so editing or deleting a version never rewrites past orders.
alter table public.requests
  add column version_name text;

-- Recreate get_request_by_token with version_name in the result. A function's
-- return table cannot be altered in place: drop + recreate, then re-grant
-- (grants are dropped together with the function). Same procedure as 0006.
drop function public.get_request_by_token(uuid);

create function public.get_request_by_token(p_token uuid)
returns table (
  type text,
  status text,
  product_name text,
  quantity integer,
  description text,
  color text,
  material text,
  quote_design_fee numeric(10, 2),
  quote_print_fee numeric(10, 2),
  unit_price numeric(10, 2),
  version_name text,
  created_at timestamptz,
  file_names text[]
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.type,
    r.status,
    p.name,
    r.quantity,
    r.description,
    r.color,
    r.material,
    r.quote_design_fee,
    r.quote_print_fee,
    r.unit_price,
    r.version_name,
    r.created_at,
    coalesce(
      (select array_agg(f.original_name order by f.created_at)
         from public.request_files f
        where f.request_id = r.id),
      '{}'
    )
  from public.requests r
  left join public.products p on p.id = r.product_id
  where r.access_token = p_token;
$$;

revoke execute on function public.get_request_by_token(uuid) from public;
grant execute on function public.get_request_by_token(uuid) to anon, authenticated;

-- Extend 0007's forgeability rule to versions. A catalog insert must carry
-- either (no version_name + the product's own indicative_price) or a
-- (version_name, unit_price) pair that exists on that product. The exists()
-- check tolerates duplicate version names; forging still requires naming a
-- real version's name AND price on an active product. Non-catalog requests
-- carry neither a price nor a version name.
drop policy "Anon insert requests" on public.requests;

create policy "Anon insert requests" on public.requests
  for insert to anon, authenticated
  with check (
    status = 'received'
    and quote_design_fee is null
    and quote_print_fee is null
    and admin_notes is null
    and (type <> 'file' or license_accepted)
    and (
      case
        when type <> 'catalog' then unit_price is null and version_name is null
        when version_name is null then unit_price = (
          select p.indicative_price
            from public.products p
           where p.id = requests.product_id
             and p.active
        )
        else exists (
          select 1
            from public.product_versions v
            join public.products p on p.id = v.product_id
           where v.product_id = requests.product_id
             and v.name = requests.version_name
             and v.price = requests.unit_price
             and p.active
        )
      end
    )
  );
