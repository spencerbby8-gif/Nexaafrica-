-- Phase 6.5 / 16 observability: ingest_runs table
-- The ingestion pipeline (lib/ingest/run.ts and /api/ingest/status) inserts &
-- reads this table, but no migration ever created it. Without this, fresh DBs
-- and preview deployments 500 on every ingest run and status check.
-- This table is service-role only: RLS enabled with no public policies,
-- exactly like jobs/categories are covered via public policies. Service role
-- bypasses RLS, so all production writes/reads succeed, but anon/auth cannot
-- enumerate feed internals.

create extension if not exists "pgcrypto";

create table if not exists public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  ok boolean not null,
  fetched int not null default 0,
  inserted int not null default 0,
  skipped int not null default 0,
  rejected int not null default 0,
  error text,
  ran_at timestamptz not null default now()
);

-- Helpful indexes: latest per source + time-series
create index if not exists ingest_runs_source_idx on public.ingest_runs (source);
create index if not exists ingest_runs_ran_at_idx on public.ingest_runs (ran_at desc);
create index if not exists ingest_runs_source_ran_at_idx on public.ingest_runs (source, ran_at desc);

alter table public.ingest_runs enable row level security;

-- Explicitly no public select policy — only service role (bypass) can read/write.
-- Drop accidental permissive policies if a previous manual migration added them.
drop policy if exists "ingest_runs are public" on public.ingest_runs;
drop policy if exists "ingest_runs public read" on public.ingest_runs;

-- (Optional) Allow authenticated users who hold the owner role? No — keep locked.
-- If a future admin dashboard needs anon reads of the latest health snapshot,
-- create a dedicated view and expose only aggregated data via /api/seo-status.
