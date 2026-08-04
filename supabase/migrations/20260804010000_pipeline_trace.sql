-- Nexa Production Truthfulness V3 — AI pipeline traceability (2026-08-04)
-- Durable per-job trace of every pipeline decision: queued, claimed,
-- accepted, rejected (with gate + reason), retried, failed, completed
-- (with provider + latency). UI states derive from this + the queue row,
-- so every visible state maps to a real pipeline decision.

create table if not exists public.ai_pipeline_trace (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  event text not null,               -- queued|claimed|accepted|rejected|retried|failed|completed|protected|skipped
  gate text,                         -- admission gate for rejections (africa_eligibility|work_authorization|...)
  reason text,                       -- human-readable decision reason
  detail jsonb,                      -- structured extras (attempt, backoff_ms, provider, model, duration_ms)
  provider text,                     -- provider id when a model call completed/failed
  model text,
  duration_ms int,
  attempt int not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists ai_pipeline_trace_job_idx on public.ai_pipeline_trace (job_id, created_at desc);
create index if not exists ai_pipeline_trace_event_idx on public.ai_pipeline_trace (event);
create index if not exists ai_pipeline_trace_created_idx on public.ai_pipeline_trace (created_at desc);

-- Internal telemetry: no public policy (service_role bypasses RLS).
alter table public.ai_pipeline_trace enable row level security;
revoke all on public.ai_pipeline_trace from anon;
