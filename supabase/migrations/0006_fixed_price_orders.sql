-- Fixed-price catalog orders: snapshot the product's price on the request at
-- order time. NULL for file/custom requests and for catalog requests created
-- before this migration (those keep the old quote flow).
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as 0001-0005).
--
-- Breaks nothing when run before the code that fills the column ships: the
-- column is nullable and today's insert never names it, and the RPC's extra
-- result key is read by name, so callers that don't know it ignore it. The rule
-- that makes unit_price trustworthy is deliberately NOT here -- it would reject
-- the current code's price-less catalog inserts. It lives in 0007, to be run
-- after the app that fills the column is deployed.
--
-- Even so, run this immediately before that deploy rather than days ahead. This
-- migration is a no-op for availability, not for forgeability: it creates the
-- column, and 0003's insert policy says nothing about unit_price, so until 0007
-- lands an anon insert can name its own price. 0006 -> deploy -> 0007 in one
-- sitting keeps that window short. See 0007's header for the (small) impact.

alter table public.requests
  add column unit_price numeric(10,2);

-- Recreate get_request_by_token with unit_price in the result. A function's
-- return table cannot be altered in place: drop + recreate, then re-grant
-- (grants are dropped together with the function).
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
