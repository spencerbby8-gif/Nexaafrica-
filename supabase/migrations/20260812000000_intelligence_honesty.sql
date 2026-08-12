-- Nexa Intelligence Honesty V1 (2026-08-12)
-- Fixes (proven by live audit 2026-08-12):
--   1. refreshCompanyIntelligence() truncated at PostgREST's 1,000-row mutation
--      cap -> ~306 companies (everything after "Quizzly.ai", incl. Stripe/Ramp/
--      Reddit/Spotify/Supabase/Zapier) were permanently stale. Fix: server-side
--      upsert (no HTTP cap) + prune.
--   2. africa_rate was the loose deterministic regex flag, not AI truth
--      (Stripe showed 77.7% while AI said unknown on 92.6%). Fix: africa_rate =
--      AI-confirmed-open / all active postings; unknown share exposed; the old
--      deterministic value preserved as flag_africa_rate for the ingest gate
--      and crawl priority (behavior-preserving).
--   3. remote_friendliness was 1.0 for every company (is_remote=true on 100%
--      of jobs). Fix: AI fully-remote share over known remote verdicts.
--   4. verified_count counted any provider:model row regardless of output
--      quality (junk models inflated verification_rate). Fix: quality_score>=40.
--   5. company_intelligence rows for companies with zero active jobs were never
--      pruned (48-row placeholder "name" etc.). Fix: prune in refresh.
-- Idempotent: safe to re-run.

-- ── 1) New columns ──────────────────────────────────────────────────────────
alter table public.company_intelligence add column if not exists africa_open_jobs integer not null default 0;
alter table public.company_intelligence add column if not exists africa_restricted_jobs integer not null default 0;
alter table public.company_intelligence add column if not exists africa_unknown_jobs integer not null default 0;
alter table public.company_intelligence add column if not exists africa_decided_jobs integer not null default 0;
alter table public.company_intelligence add column if not exists africa_open_of_decided real not null default 0;
alter table public.company_intelligence add column if not exists africa_unknown_share real not null default 0;
alter table public.company_intelligence add column if not exists flag_africa_rate real not null default 0;
alter table public.company_intelligence add column if not exists remote_fully_jobs integer not null default 0;
alter table public.company_intelligence add column if not exists remote_onsite_hybrid_jobs integer not null default 0;
alter table public.company_intelligence add column if not exists remote_unknown_jobs integer not null default 0;
alter table public.company_intelligence add column if not exists remote_unknown_share real not null default 0;

-- ── 2) Honest aggregator (pure, STABLE — used by the audit suite + refresh) ──
-- NOTE: drop-first is REQUIRED — the return table gains columns (21 -> 34),
-- and CREATE OR REPLACE cannot change a function's return type. Verified:
-- nothing in the DB depends on the old signature. Transactional: the whole
-- migration runs inside one transaction, so drop+create is atomic.
drop function if exists public.aggregate_company_intelligence();
create or replace function public.aggregate_company_intelligence()
returns table (
  company text,
  total_jobs bigint,
  africa_eligible_jobs bigint,
  remote_jobs bigint,
  rejected_jobs bigint,
  dead_page_count bigint,
  verified_count bigint,
  africa_rate real,
  rejection_rate real,
  verification_rate real,
  trust_avg integer,
  hiring_velocity_30d bigint,
  salary_consistency real,
  duplicate_count bigint,
  avg_ai_confidence integer,
  scam_reports bigint,
  first_posted_at timestamptz,
  last_posted_at timestamptz,
  active_months bigint,
  distinct_months bigint,
  remote_friendliness real,
  africa_open_jobs bigint,
  africa_restricted_jobs bigint,
  africa_unknown_jobs bigint,
  africa_decided_jobs bigint,
  africa_open_of_decided real,
  africa_unknown_share real,
  flag_africa_rate real,
  remote_fully_jobs bigint,
  remote_onsite_hybrid_jobs bigint,
  remote_unknown_jobs bigint,
  remote_unknown_share real
)
language sql stable
as $fn$
  with base as (
    select
      j.company,
      j.eligibility,
      j.is_remote,
      jai.africa_eligibility,
      jai.remote_eligibility,
      jai.quality_score,
      jai.model_version,
      jai.page_status,
      jai.overall_confidence,
      q.status as qstatus,
      q.error as qerror,
      j.trust_score,
      j.posted_at,
      (j.duplicate_of is not null) as dup,
      (j.salary_range is not null) as has_salary
    from public.jobs j
    left join public.job_ai_intelligence jai on jai.job_id = j.id
    left join public.ai_processing_queue q on q.job_id = j.id
    where j.is_active
  ),
  agg as (
    select
      b.company,
      count(*)::bigint as total_jobs,
      count(*) filter (where b.africa_eligibility in ('explicit','likely'))::bigint as africa_open_jobs,
      count(*) filter (where b.africa_eligibility = 'restricted')::bigint as africa_restricted_jobs,
      count(*) filter (where b.africa_eligibility is null or b.africa_eligibility = 'unknown')::bigint as africa_unknown_jobs,
      count(*) filter (where b.africa_eligibility in ('explicit','likely','restricted'))::bigint as africa_decided_jobs,
      count(*) filter (where b.remote_eligibility = 'fully_remote')::bigint as remote_fully_jobs,
      count(*) filter (where b.remote_eligibility in ('onsite','hybrid'))::bigint as remote_onsite_hybrid_jobs,
      count(*) filter (where b.remote_eligibility is null or b.remote_eligibility = 'unknown')::bigint as remote_unknown_jobs,
      count(*) filter (where b.eligibility in ('explicit','likely') and coalesce(b.africa_eligibility,'unknown') <> 'restricted')::bigint as flag_africa_jobs,
      count(*) filter (where b.qstatus = 'failed' or (b.qstatus = 'completed' and (b.qerror like 'Skipped%' or b.qerror like 'Rejected%')))::bigint as rejected_jobs,
      count(*) filter (where b.page_status is not null and b.page_status >= 400)::bigint as dead_page_count,
      -- [HONEST] verified = real-AI model AND quality >= 40 (junk providers excluded)
      count(*) filter (where b.model_version like '%:%' and b.model_version not like 'regex%' and b.quality_score >= 40)::bigint as verified_count,
      count(*) filter (where b.posted_at >= now() - interval '30 days')::bigint as velocity,
      count(*) filter (where b.has_salary)::bigint as salary_count,
      count(*) filter (where b.dup)::bigint as dup_count,
      round(avg(b.trust_score))::int as trust_avg,
      round(avg(b.overall_confidence))::int as avg_conf,
      min(b.posted_at)::timestamptz as first_posted_at,
      max(b.posted_at)::timestamptz as last_posted_at,
      count(distinct date_trunc('month', b.posted_at))::bigint as distinct_months
    from base b
    group by b.company
  )
  select
    a.company,
    a.total_jobs,
    a.africa_open_jobs as africa_eligible_jobs,            -- compat: honest value
    a.remote_fully_jobs as remote_jobs,                    -- compat: honest value
    a.rejected_jobs,
    a.dead_page_count,
    a.verified_count,
    (a.africa_open_jobs::real / nullif(a.total_jobs, 0)) as africa_rate,
    (a.rejected_jobs::real / nullif(a.total_jobs, 0)) as rejection_rate,
    (a.verified_count::real / nullif(a.total_jobs, 0)) as verification_rate,
    a.trust_avg,
    a.velocity as hiring_velocity_30d,
    (a.salary_count::real / nullif(a.total_jobs, 0)) as salary_consistency,
    a.dup_count as duplicate_count,
    a.avg_conf as avg_ai_confidence,
    coalesce(r.scam, 0)::bigint as scam_reports,
    a.first_posted_at,
    a.last_posted_at,
    greatest(1, (date_part('year', a.last_posted_at) - date_part('year', a.first_posted_at)) * 12
      + date_part('month', a.last_posted_at) - date_part('month', a.first_posted_at) + 1)::bigint as active_months,
    a.distinct_months,
    coalesce((a.remote_fully_jobs::real / nullif(a.remote_fully_jobs + a.remote_onsite_hybrid_jobs, 0)), 0) as remote_friendliness,
    a.africa_open_jobs,
    a.africa_restricted_jobs,
    a.africa_unknown_jobs,
    a.africa_decided_jobs,
    -- coalesce: 0 decided / 0 known remote verdicts must yield 0, not NULL
    -- (the columns are NOT NULL) — zero evidence is zero, never "no data".
    coalesce((a.africa_open_jobs::real / nullif(a.africa_decided_jobs, 0)), 0) as africa_open_of_decided,
    (a.africa_unknown_jobs::real / nullif(a.total_jobs, 0)) as africa_unknown_share,
    (a.flag_africa_jobs::real / nullif(a.total_jobs, 0)) as flag_africa_rate,
    a.remote_fully_jobs,
    a.remote_onsite_hybrid_jobs,
    a.remote_unknown_jobs,
    (a.remote_unknown_jobs::real / nullif(a.total_jobs, 0)) as remote_unknown_share
  from agg a
  left join (
    select j.company, count(*) as scam
    from public.job_reports jr
    join public.jobs j on j.id = jr.job_id
    where jr.reason in ('scam','fake')
    group by j.company
  ) r on r.company = a.company
$fn$;

-- ── 3) Server-side refresh: atomic upsert (no PostgREST cap) + prune ────────
create or replace function public.refresh_company_intelligence()
returns integer
language plpgsql
as $fn$
declare
  updated_count integer;
begin
  insert into public.company_intelligence (
    company, total_jobs, africa_eligible_jobs, remote_jobs, rejected_jobs,
    dead_page_count, verified_count, africa_rate, rejection_rate, verification_rate,
    trust_avg, hiring_velocity_30d, salary_consistency, duplicate_count,
    scam_reports, avg_ai_confidence, first_posted_at, last_posted_at,
    active_months, distinct_months, remote_friendliness,
    africa_open_jobs, africa_restricted_jobs, africa_unknown_jobs, africa_decided_jobs,
    africa_open_of_decided, africa_unknown_share, flag_africa_rate,
    remote_fully_jobs, remote_onsite_hybrid_jobs, remote_unknown_jobs, remote_unknown_share,
    priority, last_updated
  )
  select
    company, total_jobs, africa_eligible_jobs, remote_jobs, rejected_jobs,
    dead_page_count, verified_count, africa_rate, rejection_rate, verification_rate,
    trust_avg, hiring_velocity_30d, salary_consistency, duplicate_count,
    scam_reports, avg_ai_confidence, first_posted_at, last_posted_at,
    active_months, distinct_months, remote_friendliness,
    africa_open_jobs, africa_restricted_jobs, africa_unknown_jobs, africa_decided_jobs,
    africa_open_of_decided, africa_unknown_share, flag_africa_rate,
    remote_fully_jobs, remote_onsite_hybrid_jobs, remote_unknown_jobs, remote_unknown_share,
    -- priority: same formula as the TS layer, but on the PRESERVED flag rate
    (case when total_jobs > 5 and (rejection_rate >= 0.4 or flag_africa_rate < 0.2) then 0 else 1 end)::smallint,
    now()
  from public.aggregate_company_intelligence()
  on conflict (company) do update set
    total_jobs = excluded.total_jobs,
    africa_eligible_jobs = excluded.africa_eligible_jobs,
    remote_jobs = excluded.remote_jobs,
    rejected_jobs = excluded.rejected_jobs,
    dead_page_count = excluded.dead_page_count,
    verified_count = excluded.verified_count,
    africa_rate = excluded.africa_rate,
    rejection_rate = excluded.rejection_rate,
    verification_rate = excluded.verification_rate,
    trust_avg = excluded.trust_avg,
    hiring_velocity_30d = excluded.hiring_velocity_30d,
    salary_consistency = excluded.salary_consistency,
    duplicate_count = excluded.duplicate_count,
    scam_reports = excluded.scam_reports,
    avg_ai_confidence = excluded.avg_ai_confidence,
    first_posted_at = excluded.first_posted_at,
    last_posted_at = excluded.last_posted_at,
    active_months = excluded.active_months,
    distinct_months = excluded.distinct_months,
    remote_friendliness = excluded.remote_friendliness,
    africa_open_jobs = excluded.africa_open_jobs,
    africa_restricted_jobs = excluded.africa_restricted_jobs,
    africa_unknown_jobs = excluded.africa_unknown_jobs,
    africa_decided_jobs = excluded.africa_decided_jobs,
    africa_open_of_decided = excluded.africa_open_of_decided,
    africa_unknown_share = excluded.africa_unknown_share,
    flag_africa_rate = excluded.flag_africa_rate,
    remote_fully_jobs = excluded.remote_fully_jobs,
    remote_onsite_hybrid_jobs = excluded.remote_onsite_hybrid_jobs,
    remote_unknown_jobs = excluded.remote_unknown_jobs,
    remote_unknown_share = excluded.remote_unknown_share,
    priority = excluded.priority,
    last_updated = excluded.last_updated;
  get diagnostics updated_count = row_count;

  -- [HONEST] prune companies with zero active jobs (placeholder garbage etc.)
  delete from public.company_intelligence ci
  where not exists (
    select 1 from public.jobs j where j.company = ci.company and j.is_active
  );

  return updated_count;
end
$fn$;
