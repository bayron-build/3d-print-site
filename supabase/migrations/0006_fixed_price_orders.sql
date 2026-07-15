-- Fixed-price catalog orders: snapshot the product's price on the request at
-- order time. NULL for file/custom requests and for catalog requests created
-- before this migration (those keep the old quote flow).
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as 0001-0005).

alter table public.requests
  add column unit_price numeric(10,2);

-- The request form submits with the publishable key, so this insert arrives as
-- `anon`: unit_price is browser input like every other column here, and 0003's
-- rule of demanding the money columns be null cannot work for a column the
-- submission must actually fill. Re-derive the price instead of trusting it --
-- the row is only accepted when the submitted price equals the active product's
-- real one, so a hand-crafted POST cannot name its own price. An unknown,
-- inactive or unpriced product makes the subquery NULL, and a NULL with-check
-- fails closed. Non-catalog requests keep the quote flow and carry no price.
--
-- Deliberate consequence: if a product's price changes between the server
-- action's lookup and its insert, the insert fails and the customer sees a
-- generic error. Recording a stale price is the worse outcome, and with a
-- single admin this race is effectively unreachable.
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
        when type = 'catalog' then unit_price = (
          select p.indicative_price
            from public.products p
           where p.id = requests.product_id
             and p.active
        )
        else unit_price is null
      end
    )
  );

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
