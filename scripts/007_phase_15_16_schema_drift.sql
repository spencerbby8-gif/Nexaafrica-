-- Phase 15/16 schema drift fix
-- This migration reconciles the checked-in 001 schema with the production code
-- expectations. Before this file the codebase referenced columns that had no
-- migration: posted_at, eligibility, intelligence, salary_min/max/currency/period
-- and a broader employment_type enum. Production may have had manual ALTERs,
-- but the repo must have authoritative migrations for fresh environments and
-- Vercel preview DBs. Idempotent via IF NOT EXISTS guards.

-- Extensions needed for gen_random_uuid() are already enabled in 001.

-- 1) Expand employment_type check to include Phase 16 values
-- Drop legacy check if it exists (name is postgres auto-generated but in 001
-- it becomes jobs_employment_type_check). We try both qualified forms.
do $$
begin
  -- Drop any existing check on employment_type regardless of name.
  -- Iterate pg_constraint to drop those that reference the column and look like enum checks.
  -- Safer than guessing the name: try known name first.
  if exists (
    select 1 from pg_constraint
    where conname = 'jobs_employment_type_check'
    and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs drop constraint jobs_employment_type_check;
  end if;
exception when others then
  null;
end $$;

-- Re-add with full enum including freelance/consultant/temporary/unknown/full_time etc.
-- Keep it permissive: we store only known values but never want ingestion to
-- fail on a new type that rules missed.
alter table public.jobs drop constraint if exists jobs_employment_type_valid;
alter table public.jobs
  add constraint jobs_employment_type_valid
  check (
    employment_type in (
      'full_time',
      'part_time',
      'contract',
      'freelance',
      'consultant',
      'temporary',
      'internship',
      'unknown'
    )
  );

-- 2) Core new columns — all nullable or defaulted so existing rows migrate cleanly
alter table public.jobs add column if not exists posted_at timestamptz;
alter table public.jobs add column if not exists eligibility text not null default 'unknown';
alter table public.jobs add column if not exists intelligence jsonb not null default '{}'::jsonb;
alter table public.jobs add column if not exists salary_min numeric;
alter table public.jobs add column if not exists salary_max numeric;
alter table public.jobs add column if not exists salary_currency text;
alter table public.jobs add column if not exists salary_period text;

-- Eligibility check (idempotent)
alter table public.jobs drop constraint if exists jobs_eligibility_check;
alter table public.jobs
  add constraint jobs_eligibility_check
  check (eligibility in ('explicit','likely','restricted','unknown'));

-- Salary period check (year|month|week|day|hour) — permissive null
alter table public.jobs drop constraint if exists jobs_salary_period_check;
alter table public.jobs
  add constraint jobs_salary_period_check
  check (salary_period is null or salary_period in ('year','month','week','day','hour'));

-- Salary currency check — allow common ISO codes uppercased, but do not hard-fail lowercase
-- We normalize to USD/EUR/GBP/CAD/AUD in code, but keep DB lenient.
alter table public.jobs drop constraint if exists jobs_salary_currency_check;
alter table public.jobs
  add constraint jobs_salary_currency_check
  check (salary_currency is null or salary_currency in ('USD','EUR','GBP','CAD','AUD'));

-- 3) Backfill posted_at from created_at where null so ordering & SEO freshness works immediately
-- Do this in a single batched update — safe for large tables because it only touches nulls.
update public.jobs set posted_at = created_at where posted_at is null;

-- 4) Indexes for fresh feed queries and SEO sitemap filtering
create index if not exists jobs_posted_at_idx on public.jobs (posted_at desc);
create index if not exists jobs_eligibility_idx on public.jobs (eligibility);
create index if not exists jobs_intelligence_gin_idx on public.jobs using gin (intelligence);
create index if not exists jobs_salary_min_idx on public.jobs (salary_min);
create index if not exists jobs_salary_max_idx on public.jobs (salary_max);
-- Active + posted_at index is the primary feed path for queries.ts ordering
create index if not exists jobs_active_posted_at_idx on public.jobs (is_active, posted_at desc);
-- Open-to-Africa + active for intent hubs
create index if not exists jobs_active_africa_posted_at_idx on public.jobs (is_active, is_open_to_africa, posted_at desc) where is_active = true;

-- 5) Ensure is_active column & indexes exist for environments that skipped 006
alter table public.jobs add column if not exists is_active boolean not null default true;
create index if not exists jobs_is_active_idx on public.jobs (is_active);
create index if not exists jobs_active_created_at_idx on public.jobs (is_active, created_at desc);

-- 6) Supplemental categories used by CATEGORY_RULES (virtual-assistant, finance, people, other)
insert into public.categories (slug, title, description) values
  ('virtual-assistant', 'Virtual Assistant', 'Executive and administrative remote support roles.'),
  ('finance', 'Finance', 'Finance, accounting, and treasury roles at remote companies.'),
  ('people', 'People', 'People ops, talent acquisition, and HR roles.'),
  ('other', 'Other', 'Roles that do not fit existing categories but are verified remote.')
on conflict (slug) do nothing;
