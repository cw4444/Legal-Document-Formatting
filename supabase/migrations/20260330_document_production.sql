create extension if not exists pgcrypto;

create table if not exists public.style_profiles (
  id text primary key,
  name text not null,
  description text not null default '',
  preferred_fonts text[] not null default '{}',
  preferred_sizes text[] not null default '{}',
  footer_watch_terms text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.batch_runs (
  id uuid primary key default gen_random_uuid(),
  profile_name text not null,
  files_processed integer not null default 0,
  issues_logged integer not null default 0,
  critical_checks integer not null default 0,
  watch_hits integer not null default 0,
  watch_terms text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.batch_documents (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references public.batch_runs(id) on delete cascade,
  source_file_name text not null,
  applied_profile_name text not null,
  watch_terms_found text[] not null default '{}',
  issue_count integer not null default 0,
  critical_count integer not null default 0,
  processed_parts text[] not null default '{}',
  dominant_fonts text[] not null default '{}',
  dominant_sizes text[] not null default '{}',
  preview text[] not null default '{}',
  issue_payload jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_batch_runs_created_at on public.batch_runs (created_at desc);
create index if not exists idx_batch_documents_batch_run_id on public.batch_documents (batch_run_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_style_profiles_updated_at on public.style_profiles;
create trigger trg_style_profiles_updated_at
before update on public.style_profiles
for each row
execute function public.set_updated_at();

alter table public.style_profiles enable row level security;
alter table public.batch_runs enable row level security;
alter table public.batch_documents enable row level security;

drop policy if exists "allow read style_profiles" on public.style_profiles;
create policy "allow read style_profiles"
on public.style_profiles
for select
to anon, authenticated
using (true);

drop policy if exists "allow write style_profiles" on public.style_profiles;
create policy "allow write style_profiles"
on public.style_profiles
for insert
to anon, authenticated
with check (true);

drop policy if exists "allow update style_profiles" on public.style_profiles;
create policy "allow update style_profiles"
on public.style_profiles
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "allow read batch_runs" on public.batch_runs;
create policy "allow read batch_runs"
on public.batch_runs
for select
to anon, authenticated
using (true);

drop policy if exists "allow write batch_runs" on public.batch_runs;
create policy "allow write batch_runs"
on public.batch_runs
for insert
to anon, authenticated
with check (true);

drop policy if exists "allow read batch_documents" on public.batch_documents;
create policy "allow read batch_documents"
on public.batch_documents
for select
to anon, authenticated
using (true);

drop policy if exists "allow write batch_documents" on public.batch_documents;
create policy "allow write batch_documents"
on public.batch_documents
for insert
to anon, authenticated
with check (true);
