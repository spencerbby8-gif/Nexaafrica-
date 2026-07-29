-- Smart Router v2 (P1) — measured routing support
--
-- Adds per-task-type outcome statistics so task fit is a MEASURED signal
-- instead of the removed static `taskTypes` affinity. The remaining columns
-- referenced by the router (total_successes/total_failures) were previously
-- added to production out-of-band; they are declared here idempotently so
-- production can be recreated from the repository.

alter table public.ai_orch_health
  add column if not exists task_stats jsonb not null default '{}'::jsonb;

alter table public.ai_orch_health
  add column if not exists total_successes int not null default 0;

alter table public.ai_orch_health
  add column if not exists total_failures int not null default 0;

-- Freshness index for scheduled warming/probing.
create index if not exists ai_orch_health_updated_idx on public.ai_orch_health (updated_at desc);
