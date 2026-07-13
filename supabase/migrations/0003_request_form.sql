-- Phase 3: public request form. Run once in the Supabase web SQL editor,
-- after 0002_rls_policies.sql.
--
-- Policies target both `anon` (plain visitors) and `authenticated` (the
-- logged-in admin filling the form, and Phase 5's magic-link customers)
-- so submitting never depends on being logged out.

-- Private bucket for customer uploads. file_size_limit is the
-- server-enforced 50MB cap; app-side checks are convenience only.
-- No MIME allowlist: browsers report 3D files inconsistently (usually
-- application/octet-stream), so extension checks live in app code.
insert into storage.buckets (id, name, public, file_size_limit)
values ('request-files', 'request-files', false, 52428800);

-- Upload only: no select/update/delete policies for anon, so uploaded
-- objects can never be read, listed, or removed by visitors.
create policy "Anon upload to request-files" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'request-files');

-- The admin manages uploads (Phase 4 downloads them via signed URLs).
create policy "Admin full access to request-files" on storage.objects
  for all
  using (bucket_id = 'request-files' and public.is_admin())
  with check (bucket_id = 'request-files' and public.is_admin());

-- Visitors may create requests, but only harmless ones: fresh status, no
-- quote fees, no admin notes, and file requests must accept the license.
-- The database enforces the license rule, not just the form UI.
create policy "Anon insert requests" on public.requests
  for insert to anon, authenticated
  with check (
    status = 'received'
    and quote_design_fee is null
    and quote_print_fee is null
    and admin_notes is null
    and (type <> 'file' or license_accepted)
  );

-- Metadata rows for uploads. The foreign key already guarantees the
-- request exists (FK checks bypass RLS), and request ids are unguessable
-- UUIDs, so a bare with-check is acceptable here.
create policy "Anon insert request_files" on public.request_files
  for insert to anon, authenticated
  with check (true);

-- The form's product dropdown (and Phase 6's catalog) may read active
-- products only.
create policy "Anon read active products" on public.products
  for select to anon, authenticated
  using (active);
