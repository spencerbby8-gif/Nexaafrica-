-- Nexa Phase 2: core schema
-- Run order: 001

-- Enable extensions
create extension if not exists "pgcrypto";

-- Categories
create table if not exists public.categories (
  slug text primary key,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

-- Companies
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  logo text,
  website text,
  description text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists companies_name_idx on public.companies (name);

-- Jobs
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  company text not null,
  company_logo text,
  description_md text not null,
  apply_url text not null,
  category text not null references public.categories(slug) on update cascade,
  location text,
  country text not null,
  salary_range text,
  employment_type text not null check (employment_type in ('full_time','part_time','contract','internship')),
  tags text[] not null default '{}',
  is_remote boolean not null default true,
  is_open_to_africa boolean not null default true,
  source text,
  source_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- Indexes for common queries
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);
create index if not exists jobs_category_idx on public.jobs (category);
create index if not exists jobs_country_idx on public.jobs (country);
create index if not exists jobs_employment_type_idx on public.jobs (employment_type);
create index if not exists jobs_is_remote_idx on public.jobs (is_remote);
create index if not exists jobs_is_open_to_africa_idx on public.jobs (is_open_to_africa);
create index if not exists jobs_expires_at_idx on public.jobs (expires_at);

-- Duplicate prevention for ingestion (same source + source_id is unique)
create unique index if not exists jobs_source_unique
  on public.jobs (source, source_id)
  where source is not null and source_id is not null;

-- Row Level Security
alter table public.categories enable row level security;
alter table public.companies enable row level security;
alter table public.jobs enable row level security;

-- Public read access (jobs board is public)
drop policy if exists "categories are public" on public.categories;
create policy "categories are public"
  on public.categories for select
  using (true);

drop policy if exists "companies are public" on public.companies;
create policy "companies are public"
  on public.companies for select
  using (true);

drop policy if exists "jobs are public" on public.jobs;
create policy "jobs are public"
  on public.jobs for select
  using (true);

-- Writes are restricted to service role only (no policy = denied for anon/authenticated).
-- The /api/ingest route uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
