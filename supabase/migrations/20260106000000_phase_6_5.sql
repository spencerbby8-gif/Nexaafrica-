-- Phase 6.5: light retention + freshness
-- Saved jobs (user-scoped bookmarks) and an is_active flag on jobs for
-- stale-job handling. Run after 005.

create extension if not exists "pgcrypto";

-- 1) Saved jobs ------------------------------------------------------------
create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One row per user/job — enables fast upsert/toggle semantics.
create unique index if not exists saved_jobs_user_job_unique
  on public.saved_jobs (user_id, job_id);

create index if not exists saved_jobs_user_created_idx
  on public.saved_jobs (user_id, created_at desc);

alter table public.saved_jobs enable row level security;

drop policy if exists "saved_jobs owner read" on public.saved_jobs;
create policy "saved_jobs owner read" on public.saved_jobs
  for select using (auth.uid() = user_id);

drop policy if exists "saved_jobs owner insert" on public.saved_jobs;
create policy "saved_jobs owner insert" on public.saved_jobs
  for insert with check (auth.uid() = user_id);

drop policy if exists "saved_jobs owner delete" on public.saved_jobs;
create policy "saved_jobs owner delete" on public.saved_jobs
  for delete using (auth.uid() = user_id);

-- 2) Job activity flag -----------------------------------------------------
-- is_active = false means "no longer surfaced in feeds" (closed/expired).
-- Defaults to true; the stale-cleanup endpoint flips this for listings
-- whose expires_at has passed. Public read RLS still applies.
alter table public.jobs
  add column if not exists is_active boolean not null default true;

create index if not exists jobs_is_active_idx on public.jobs (is_active);

-- Convenience index for "active and recent" feed queries.
create index if not exists jobs_active_created_at_idx
  on public.jobs (is_active, created_at desc);
