-- Nexa Phase 16.5: Fix schema drift between app, migrations, and production
-- Fixes: jobs.posted_at, jobs.eligibility, jobs.intelligence, salary_* , employment_type check, ingest_runs, missing categories, indexes
-- Run after 006. Safe, idempotent (IF NOT EXISTS).

create extension if not exists "pgcrypto";

-- 1) Jobs: add missing columns -------------------------------------------------
alter table public.jobs
  add column if not exists posted_at timestamptz,
  add column if not exists eligibility text,
  add column if not exists intelligence jsonb not null default '{}'::jsonb,
  add column if not exists salary_min int,
  add column if not exists salary_max int,
  add column if not exists salary_currency text,
  add column if not exists salary_period text;

-- Backfill posted_at from created_at for historic rows so ordering / sitemap / JSON-LD never sees NULL
update public.jobs set posted_at = created_at where posted_at is null;

-- Make posted_at default now() for future inserts that omit it
alter table public.jobs alter column posted_at set default now();

-- 2) Fix employment_type constraint (was 4 values, code writes 8)
do $$
declare
  r record;
begin
  -- Drop old check if exists (Postgres auto-names it jobs_employment_type_check)
  if exists (select 1 from pg_constraint where conname = 'jobs_employment_type_check' and conrelid = 'public.jobs'::regclass) then
    alter table public.jobs drop constraint jobs_employment_type_check;
  end if;
  -- Also handle any other check that might have been created with different name in prod
  for r in select conname from pg_constraint where conrelid = 'public.jobs'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%employment_type%' loop
    execute 'alter table public.jobs drop constraint if exists ' || quote_ident(r.conname);
  end loop;
end$$;

alter table public.jobs
  add constraint jobs_employment_type_check
  check (employment_type in ('full_time','part_time','contract','freelance','consultant','temporary','internship','unknown'));

-- 3) Eligibility check ---------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'jobs_eligibility_check' and conrelid = 'public.jobs'::regclass) then
    alter table public.jobs drop constraint jobs_eligibility_check;
  end if;
end$$;

alter table public.jobs
  add constraint jobs_eligibility_check
  check (eligibility in ('explicit','likely','restricted','unknown'));

-- Backfill eligibility from legacy is_open_to_africa flag when null
update public.jobs set eligibility = case when is_open_to_africa then 'likely' else 'unknown' end where eligibility is null;

alter table public.jobs alter column eligibility set default 'unknown';

-- 4) Salary sanity checks (optional, non-blocking)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_salary_currency_check' and conrelid = 'public.jobs'::regclass) then
    alter table public.jobs add constraint jobs_salary_currency_check check (salary_currency is null or salary_currency in ('USD','EUR','GBP','CAD','AUD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_salary_period_check' and conrelid = 'public.jobs'::regclass) then
    alter table public.jobs add constraint jobs_salary_period_check check (salary_period is null or salary_period in ('hour','day','week','month','year'));
  end if;
end$$;

-- 5) ingest_runs — was missing, run.ts inserts here, cron observability depends on it
create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  ok boolean not null default false,
  fetched int not null default 0,
  inserted int not null default 0,
  skipped int not null default 0,
  rejected int not null default 0,
  error text,
  created_at timestamptz not null default now()
);

-- If table already existed with different schema (remote has old version without created_at), add missing cols idempotently
alter table public.ingest_runs add column if not exists id uuid default gen_random_uuid();
alter table public.ingest_runs add column if not exists source text;
alter table public.ingest_runs add column if not exists ok boolean default false;
alter table public.ingest_runs add column if not exists fetched int default 0;
alter table public.ingest_runs add column if not exists inserted int default 0;
alter table public.ingest_runs add column if not exists skipped int default 0;
alter table public.ingest_runs add column if not exists rejected int default 0;
alter table public.ingest_runs add column if not exists error text;
alter table public.ingest_runs add column if not exists created_at timestamptz default now();

alter table public.ingest_runs enable row level security;

-- Public cannot read ingest_runs (internal telemetry). Service role bypasses RLS.
drop policy if exists "ingest_runs no public read" on public.ingest_runs;
-- No select policy = anon/authenticated denied, service_role allowed

-- Indexes now safe even if table existed without created_at before
create index if not exists ingest_runs_created_at_idx on public.ingest_runs (created_at desc);
create index if not exists ingest_runs_source_idx on public.ingest_runs (source);
create index if not exists ingest_runs_ok_idx on public.ingest_runs (ok);

-- 6) Missing categories that CATEGORY_RULES can emit (FK would otherwise fail)
insert into public.categories (slug, title, description) values
  ('virtual-assistant', 'Virtual Assistant', 'Executive and administrative assistance roles for remote teams.'),
  ('finance', 'Finance', 'Finance, accounting, and treasury roles.'),
  ('people', 'People & HR', 'Human resources, talent, and people operations roles.'),
  ('engineering', 'Engineering', 'Software, infrastructure, and platform roles building modern products.'),
  ('design', 'Design', 'Product design, UX, and brand roles at companies that take craft seriously.'),
  ('product', 'Product', 'Product management roles across early-stage and growth-stage teams.'),
  ('data', 'Data', 'Data engineering, analytics, and machine learning roles.'),
  ('marketing', 'Marketing', 'Growth, content, and lifecycle marketing roles.'),
  ('operations', 'Operations', 'People, finance, and business operations roles.'),
  ('customer-support', 'Customer Support', 'Support and customer experience roles for global teams.'),
  ('sales', 'Sales', 'Sales, partnerships, and revenue roles.')
on conflict (slug) do update set
  title = excluded.title,
  description = coalesce(excluded.description, public.categories.description);

-- 7) Critical indexes for SEO freshness & feeds (posted_at is now the canonical ordering key)
create index if not exists jobs_posted_at_idx on public.jobs (posted_at desc);
create index if not exists jobs_active_posted_at_idx on public.jobs (is_active, posted_at desc) where is_active = true;
create index if not exists jobs_eligibility_idx on public.jobs (eligibility);
create index if not exists jobs_salary_currency_idx on public.jobs (salary_currency) where salary_currency is not null;
create index if not exists jobs_intelligence_gin_idx on public.jobs using gin (intelligence jsonb_path_ops);

-- 8) Also ensure is_active column exists (006 added it, but prod might be behind)
alter table public.jobs add column if not exists is_active boolean not null default true;
create index if not exists jobs_is_active_idx on public.jobs (is_active);
create index if not exists jobs_active_created_at_idx on public.jobs (is_active, created_at desc);
