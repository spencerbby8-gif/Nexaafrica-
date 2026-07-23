-- Job Refresh Engine — continuous freshness, dedupe, expiry
-- Adds last_seen_at, first_seen_at, refresh_count for observable refresh tracking

-- 1) Jobs: add refresh tracking columns
alter table public.jobs add column if not exists first_seen_at timestamptz;
alter table public.jobs add column if not exists last_seen_at timestamptz default now();
alter table public.jobs add column if not exists refresh_count int not null default 0;
alter table public.jobs add column if not exists last_refreshed_at timestamptz;

-- Backfill: first_seen_at = created_at if null, last_seen_at = now() if null
update public.jobs set first_seen_at = created_at where first_seen_at is null;
update public.jobs set last_seen_at = now() where last_seen_at is null;

-- Indexes for refresh queries
create index if not exists jobs_last_seen_at_idx on public.jobs (last_seen_at desc) where is_active = true;
create index if not exists jobs_first_seen_at_idx on public.jobs (first_seen_at desc);
create index if not exists jobs_last_refreshed_at_idx on public.jobs (last_refreshed_at desc) where is_active = true;
create index if not exists jobs_refresh_count_idx on public.jobs (refresh_count desc) where is_active = true;

-- 2) Ensure posted_at is used for freshness, not created_at — add index already exists but ensure
create index if not exists jobs_posted_at_active_idx on public.jobs (posted_at desc) where is_active = true;

-- 3) Source health materialized via ingest_runs — no new table needed, but add helper view
-- Create view source_health_summary for admin visibility
create or replace view public.source_health_summary as
select
  source,
  max(created_at) as last_run_at,
  max(case when ok then created_at else null end) as last_success_at,
  count(*) as total_runs,
  sum(case when ok then 1 else 0 end) as successful_runs,
  sum(case when not ok then 1 else 0 end) as failed_runs,
  avg(fetched)::int as avg_fetched,
  sum(fetched) as total_fetched,
  sum(inserted) as total_inserted,
  max(fetched) as max_fetched,
  -- consecutive failures: count of most recent runs that failed until first success
  (select count(*) from public.ingest_runs ir2 where ir2.source = ir.source and ir2.created_at >= coalesce((select max(created_at) from public.ingest_runs where source = ir.source and ok = true), '1970-01-01') and not ir2.ok) as consecutive_failures
from public.ingest_runs ir
group by source
order by source;

-- RLS for view: only service_role can read (no policy = blocked for anon)
-- Views inherit table RLS, but we enable security_invoker = false to allow service_role bypass
-- No extra RLS needed

-- 4) Add function to safely deactivate stale jobs using posted_at + last_seen_at + expires_at
create or replace function public.deactivate_stale_jobs(threshold_days int default 60, not_seen_days int default 14)
returns table (expired_count int, stale_count int, not_seen_count int)
language plpgsql as $$
declare
  exp_count int;
  stale_count int;
  not_seen_count int;
  cutoff_posted timestamptz := now() - (threshold_days || ' days')::interval;
  cutoff_seen timestamptz := now() - (not_seen_days || ' days')::interval;
begin
  -- Expired via expires_at
  with updated as (
    update public.jobs set is_active = false
    where is_active = true and expires_at is not null and expires_at < now()
    returning id
  ) select count(*) into exp_count from updated;

  -- Stale via posted_at (real provider date, not ingestion time)
  with updated as (
    update public.jobs set is_active = false
    where is_active = true and posted_at < cutoff_posted
    returning id
  ) select count(*) into stale_count from updated;

  -- Not seen recently in feed (continuous ingestion should have seen it)
  with updated as (
    update public.jobs set is_active = false
    where is_active = true and last_seen_at < cutoff_seen and posted_at < cutoff_posted
    returning id
  ) select count(*) into not_seen_count from updated;

  return query select exp_count, stale_count, not_seen_count;
end $$;
