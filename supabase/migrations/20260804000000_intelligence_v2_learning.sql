-- Nexa Intelligence V2 — learning layer extension (2026-08-04)
-- Company Intelligence: hiring velocity, salary consistency, duplicates,
-- scam reports, AI confidence.
-- Source Intelligence: reliability (ingest history), freshness, expired
-- counts, AI quality per source, composite trust.

alter table public.company_intelligence
  add column if not exists hiring_velocity_30d int not null default 0,
  add column if not exists salary_consistency real not null default 0,
  add column if not exists duplicate_count int not null default 0,
  add column if not exists scam_reports int not null default 0,
  add column if not exists avg_ai_confidence int;

alter table public.source_intelligence
  add column if not exists reliability_score real not null default 0,
  add column if not exists runs_count int not null default 0,
  add column if not exists consecutive_failures int not null default 0,
  add column if not exists expired_count int not null default 0,
  add column if not exists avg_quality_score int not null default 0,
  add column if not exists avg_freshness_days int not null default 0,
  add column if not exists trust_score real not null default 0;

-- Extended company aggregation (replaces v1 — same name, richer output).
drop function if exists public.aggregate_company_intelligence();
create function public.aggregate_company_intelligence()
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
  trust_avg int,
  hiring_velocity_30d bigint,
  salary_consistency real,
  duplicate_count bigint,
  avg_ai_confidence int,
  scam_reports bigint
)
language sql
as $$
  with base as (
    select
      j.company,
      (j.eligibility in ('explicit','likely') AND coalesce(jai.africa_eligibility, 'unknown') <> 'restricted') AS africa_ok,
      j.is_remote AS remote_ok,
      (q.status = 'failed' OR (q.status = 'completed' AND (q.error LIKE 'Skipped%' OR q.error LIKE 'Rejected%'))) AS rejected,
      (jai.page_status IS NOT NULL AND jai.page_status >= 400) AS dead,
      (jai.model_version LIKE '%:%' AND jai.model_version NOT LIKE 'regex%') AS verified,
      j.trust_score,
      jai.overall_confidence,
      j.posted_at,
      j.duplicate_of IS NOT NULL AS dup,
      j.salary_range IS NOT NULL AS has_salary
    FROM public.jobs j
    LEFT JOIN public.job_ai_intelligence jai ON jai.job_id = j.id
    LEFT JOIN public.ai_processing_queue q ON q.job_id = j.id
    WHERE j.is_active
  ),
  agg AS (
    SELECT
      b.company,
      count(*)::bigint AS total_jobs,
      count(*) FILTER (WHERE b.africa_ok)::bigint AS africa_eligible_jobs,
      count(*) FILTER (WHERE b.remote_ok)::bigint AS remote_jobs,
      count(*) FILTER (WHERE b.rejected)::bigint AS rejected_jobs,
      count(*) FILTER (WHERE b.dead)::bigint AS dead_page_count,
      count(*) FILTER (WHERE b.verified)::bigint AS verified_count,
      (count(*) FILTER (WHERE b.africa_ok))::real / NULLIF(count(*), 0)::real AS africa_rate,
      (count(*) FILTER (WHERE b.rejected))::real / NULLIF(count(*), 0)::real AS rejection_rate,
      (count(*) FILTER (WHERE b.verified))::real / NULLIF(count(*), 0)::real AS verification_rate,
      round(avg(b.trust_score))::int AS trust_avg,
      count(*) FILTER (WHERE b.posted_at >= now() - interval '30 days')::bigint AS hiring_velocity_30d,
      (count(*) FILTER (WHERE b.has_salary))::real / NULLIF(count(*), 0)::real AS salary_consistency,
      count(*) FILTER (WHERE b.dup)::bigint AS duplicate_count,
      round(avg(b.overall_confidence))::int AS avg_ai_confidence
    FROM base b
    GROUP BY b.company
  )
  SELECT a.*, coalesce(r.scam, 0)::bigint AS scam_reports
  FROM agg a
  LEFT JOIN (
    SELECT j.company, count(*) AS scam
    FROM public.job_reports jr
    JOIN public.jobs j ON j.id = jr.job_id
    WHERE jr.reason IN ('scam','fake')
    GROUP BY j.company
  ) r ON r.company = a.company;
$$;
