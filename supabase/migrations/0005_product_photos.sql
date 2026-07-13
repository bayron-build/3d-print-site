-- Phase 6: product catalog photos. Run once in the Supabase web SQL editor,
-- after 0004_status_page.sql.

-- PUBLIC bucket: catalog photos are served straight from the CDN public URL
-- (/storage/v1/object/public/...), no signing. file_size_limit is the
-- server-enforced 10MB cap; app-side checks are convenience only.
-- No MIME allowlist: extension checks live in app code, consistent with
-- request-files.
insert into storage.buckets (id, name, public, file_size_limit)
values ('product-photos', 'product-photos', true, 10485760);

-- Only the admin writes or lists. Public *reads* need no policy: public
-- buckets serve objects at the public URL regardless of RLS. The select
-- policy is for the admin dashboard's list() call (used by the
-- delete-product sweep), not for visitors.
create policy "Admin insert product-photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_admin());

create policy "Admin read product-photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-photos' and public.is_admin());

create policy "Admin delete product-photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_admin());

-- No update policy: photos are immutable; replace = delete + upload.
