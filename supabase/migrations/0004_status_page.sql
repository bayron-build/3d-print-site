-- Phase 5: customer status page via secret token.
-- Run once by the OWNER in the Supabase web SQL editor (same workflow as
-- Phases 2-3).

-- Every request gets an unguessable token (122 bits of randomness); the
-- status-page link is /aanvraag/status/<token>. The default backfills all
-- existing rows and covers any insert that omits the column.
alter table public.requests
  add column access_token uuid not null default gen_random_uuid();

alter table public.requests
  add constraint requests_access_token_key unique (access_token);

-- Read exactly one request's customer-safe fields by token. SECURITY DEFINER
-- runs with the function owner's rights (bypassing RLS), but the column list
-- is the exposure: never admin_notes, email, phone, or the token itself.
-- Unknown token -> zero rows. Fixed search_path per Supabase lint guidance.
create or replace function public.get_request_by_token(p_token uuid)
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

-- Accept a quote by token: quoted -> approved, nothing else. The status guard
-- in the WHERE clause makes a second click (or a stale page) match nothing
-- and return false instead of erroring.
create or replace function public.approve_quote_by_token(p_token uuid)
returns boolean
language sql
security definer
set search_path = public
volatile
as $$
  with updated as (
    update public.requests
       set status = 'approved'
     where access_token = p_token
       and status = 'quoted'
    returning id
  )
  select exists (select 1 from updated);
$$;

-- These functions are the only anon exposure of request data: revoke the
-- Postgres default (execute for everyone) and grant exactly the roles that
-- need them. authenticated is included so the owner can open a status link
-- while logged in as admin without an RPC permission error.
revoke execute on function public.get_request_by_token(uuid) from public;
revoke execute on function public.approve_quote_by_token(uuid) from public;
grant execute on function public.get_request_by_token(uuid) to anon, authenticated;
grant execute on function public.approve_quote_by_token(uuid) to anon, authenticated;
