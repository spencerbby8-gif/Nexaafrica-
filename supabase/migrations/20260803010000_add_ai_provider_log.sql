-- Nexa schema drift fix — 2026-08-03 (triage #2)
-- ai_provider_log existed in production (written by lib/ai/engine.ts,
-- secondOpinion.ts, admission.ts, providerProfiles.ts and read by the
-- ai_provider_analytics view) but had NO migration in this repository, so a
-- fresh environment could not recreate production. This migration reproduces
-- the production table exactly (verified via information_schema) and is a
-- no-op where the table already exists.

create table if not exists public.ai_provider_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete cascade,
  agent_id text not null,
  provider text not null,
  model text not null,
  event text not null,
  http_status int,
  error_code text,
  error_message text,
  error_body text,
  retry_count int not null default 0,
  duration_ms int,
  prompt_len int,
  response_len int,
  fallback_used boolean not null default false,
  created_at timestamptz not null default now()
);

-- Production carries a CHECK on event values (attempt/success/failure).
-- Add it conditionally so existing prod (which already has it) is untouched.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.ai_provider_log'::regclass
      and conname = 'ai_provider_log_event_check'
  ) then
    alter table public.ai_provider_log
      add constraint ai_provider_log_event_check
      check (event in ('attempt', 'success', 'failure'));
  end if;
end $$;

-- Indexes matching production
create index if not exists ai_provider_log_job_id_idx on public.ai_provider_log (job_id);
create index if not exists ai_provider_log_provider_idx on public.ai_provider_log (provider);
create index if not exists ai_provider_log_created_at_idx on public.ai_provider_log (created_at desc);

-- RLS: internal telemetry — no public policy (service_role bypasses RLS).
alter table public.ai_provider_log enable row level security;
