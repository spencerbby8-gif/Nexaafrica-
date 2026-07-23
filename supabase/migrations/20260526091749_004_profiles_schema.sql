-- Phase 3 — Profiles, AI metadata, RLS
-- Run after 001/002/003.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  country text,
  headline text,
  summary text,
  cv_storage_path text,
  status text not null default 'incomplete' check (status in ('incomplete', 'parsing', 'ready', 'failed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_skills (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists profile_skills_unique
  on public.profile_skills (profile_id, lower(name));

create table if not exists public.profile_experience (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  company text not null,
  start_date text,
  end_date text,
  description text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists profile_experience_profile_idx
  on public.profile_experience (profile_id, position);

create table if not exists public.profile_ai_metadata (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  model text,
  prompt_version text,
  raw_text_chars int,
  tokens_input int,
  tokens_output int,
  parse_attempts int not null default 0,
  last_error text,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.profile_skills enable row level security;
alter table public.profile_experience enable row level security;
alter table public.profile_ai_metadata enable row level security;

drop policy if exists "profiles owner read" on public.profiles;
create policy "profiles owner read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles owner insert" on public.profiles;
create policy "profiles owner insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "skills owner all" on public.profile_skills;
create policy "skills owner all" on public.profile_skills
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists "experience owner all" on public.profile_experience;
create policy "experience owner all" on public.profile_experience
  for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

drop policy if exists "ai_metadata owner read" on public.profile_ai_metadata;
create policy "ai_metadata owner read" on public.profile_ai_metadata
  for select using (auth.uid() = profile_id);
