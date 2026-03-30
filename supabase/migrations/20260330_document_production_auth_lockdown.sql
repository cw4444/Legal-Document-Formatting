alter table public.style_profiles
add column if not exists owner_user_id uuid;

alter table public.batch_runs
add column if not exists owner_user_id uuid;

alter table public.batch_documents
add column if not exists owner_user_id uuid;

drop policy if exists "allow read style_profiles" on public.style_profiles;
drop policy if exists "allow write style_profiles" on public.style_profiles;
drop policy if exists "allow update style_profiles" on public.style_profiles;

create policy "authenticated users read own style_profiles"
on public.style_profiles
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "authenticated users insert own style_profiles"
on public.style_profiles
for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy "authenticated users update own style_profiles"
on public.style_profiles
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "allow read batch_runs" on public.batch_runs;
drop policy if exists "allow write batch_runs" on public.batch_runs;

create policy "authenticated users read own batch_runs"
on public.batch_runs
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "authenticated users insert own batch_runs"
on public.batch_runs
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "allow read batch_documents" on public.batch_documents;
drop policy if exists "allow write batch_documents" on public.batch_documents;

create policy "authenticated users read own batch_documents"
on public.batch_documents
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "authenticated users insert own batch_documents"
on public.batch_documents
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "public read document-production objects" on storage.objects;
drop policy if exists "public write document-production objects" on storage.objects;
drop policy if exists "public update document-production objects" on storage.objects;

create policy "authenticated users read own document-production objects"
on storage.objects
for select
to authenticated
using (bucket_id = 'document-production' and split_part(name, '/', 1) = auth.uid()::text);

create policy "authenticated users write own document-production objects"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'document-production' and split_part(name, '/', 1) = auth.uid()::text);

create policy "authenticated users update own document-production objects"
on storage.objects
for update
to authenticated
using (bucket_id = 'document-production' and split_part(name, '/', 1) = auth.uid()::text)
with check (bucket_id = 'document-production' and split_part(name, '/', 1) = auth.uid()::text);
