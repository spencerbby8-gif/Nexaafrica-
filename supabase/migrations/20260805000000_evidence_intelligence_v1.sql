-- Nexa Evidence Intelligence V1 (2026-08-05)
-- 1) job_evidence_v1: durable evidence store — every AI decision links back
--    to the exact page evidence it used (source kind, url, hash, excerpt,
--    http status, crawler state).
-- 2) jobs.evidence_state: per-job crawler state surfaced truthfully in UI.
-- 3) job_ai_intelligence.evidence_refs: per-dimension evidence provenance.

create table if not exists public.job_evidence_v1 (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  evidence_type text not null,          -- page_html|visible_text|structured_data|ats_api|rss|sitemap|screenshot
  source_url text,
  source_kind text not null,            -- ats_api|structured_data|page_html|browser_render|rss|sitemap
  -- Crawler states: queued|fetching|fetched|blocked|partial|verified|failed|stale
  status text not null default 'queued',
  http_status int,
  content_hash text,                    -- sha256 of fetched content
  excerpt text,                         -- first ~800 chars of extracted text
  detail jsonb,                         -- structured extras (structured data, challenge type, retry_after, bytes)
  fetched_at timestamptz,
  retry_at timestamptz,                 -- when a blocked/failed fetch may be retried
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_evidence_v1_job_idx on public.job_evidence_v1 (job_id, created_at desc);
create index if not exists job_evidence_v1_status_idx on public.job_evidence_v1 (status);
create index if not exists job_evidence_v1_kind_idx on public.job_evidence_v1 (source_kind);

-- per-job latest crawler state (surfaced in UI + pipeline)
alter table public.jobs add column if not exists evidence_state text;
create index if not exists jobs_evidence_state_idx on public.jobs (evidence_state) where evidence_state is not null;

-- per-dimension evidence provenance for AI decisions
alter table public.job_ai_intelligence add column if not exists evidence_refs jsonb;

-- Internal table: no public access (service_role bypasses RLS).
alter table public.job_evidence_v1 enable row level security;
revoke all on public.job_evidence_v1 from anon;
