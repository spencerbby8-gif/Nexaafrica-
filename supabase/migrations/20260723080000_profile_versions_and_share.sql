-- Nexa God Tier V2 — Measurable transformation: before/after, versions, share link, ATS
-- Adds raw_cv_text, share_token, profile_versions table

-- 1) Profiles: store raw CV text for Before vs After comparison
alter table public.profiles add column if not exists raw_cv_text text;
alter table public.profiles add column if not exists share_token text;

-- unique share_token for /p/[token] links
create unique index if not exists profiles_share_token_unique on public.profiles (share_token) where share_token is not null;

-- 2) profile_versions: store multiple AI versions for comparison + ATS + improvements
create table if not exists public.profile_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  version_number int not null,
  prompt_version text not null,
  model text not null,
  headline text not null,
  summary text not null,
  skills jsonb not null default '[]'::jsonb,
  experience jsonb not null default '[]'::jsonb,
  ats_score int,
  ats_breakdown jsonb default '{}'::jsonb,
  improvements jsonb default '[]'::jsonb,
  is_selected boolean not null default false,
  created_at timestamptz not null default now(),
  unique(profile_id, version_number)
);

create index if not exists profile_versions_profile_id_idx on public.profile_versions (profile_id, created_at desc);
create index if not exists profile_versions_profile_selected_idx on public.profile_versions (profile_id) where is_selected = true;

alter table public.profile_versions enable row level security;

drop policy if exists "profile_versions owner read" on public.profile_versions;
create policy "profile_versions owner read" on public.profile_versions
  for select using (auth.uid() = profile_id);

drop policy if exists "profile_versions owner insert" on public.profile_versions;
create policy "profile_versions owner insert" on public.profile_versions
  for insert with check (auth.uid() = profile_id);

drop policy if exists "profile_versions owner update" on public.profile_versions;
create policy "profile_versions owner update" on public.profile_versions
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists "profile_versions owner delete" on public.profile_versions;
create policy "profile_versions owner delete" on public.profile_versions
  for delete using (auth.uid() = profile_id);

-- 3) Function to generate share_token if missing
create or replace function public.generate_share_token() returns text
language plpgsql as $$
begin
  return substr(encode(gen_random_bytes(9), 'base64'), 1, 12);
end $$;

-- 4) Backfill share_token for existing ready profiles (optional, non-blocking)
-- update public.profiles set share_token = public.generate_share_token() where status='ready' and share_token is null;
