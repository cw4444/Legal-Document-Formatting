alter table public.batch_runs
add column if not exists bundle_storage_path text;

alter table public.batch_documents
add column if not exists cleaned_doc_storage_path text,
add column if not exists report_storage_path text;

insert into storage.buckets (id, name, public)
values ('document-production', 'document-production', true)
on conflict (id) do nothing;

drop policy if exists "public read document-production objects" on storage.objects;
create policy "public read document-production objects"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'document-production');

drop policy if exists "public write document-production objects" on storage.objects;
create policy "public write document-production objects"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'document-production');

drop policy if exists "public update document-production objects" on storage.objects;
create policy "public update document-production objects"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'document-production')
with check (bucket_id = 'document-production');
