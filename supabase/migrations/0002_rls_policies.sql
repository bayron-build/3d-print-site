-- Phase 2: RLS policies. Run once in the Supabase web SQL editor,
-- after 0001_initial_schema.sql.
--
-- The admin is whoever's JWT carries app_metadata.role = 'admin'.
-- app_metadata is server-controlled: a user can never change it about
-- themself, which is why it is safe to trust here.

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- Admin may do everything. Nobody else may do anything (deny-by-default);
-- customer-facing policies arrive in the phases that need them.

create policy "Admin full access" on public.products
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin full access" on public.requests
  for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Admin full access" on public.request_files
  for all
  using (public.is_admin())
  with check (public.is_admin());
