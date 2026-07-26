-- Orchestrator health persistence + analytics views
-- Survives Vercel cold starts: warm from DB on init.

CREATE TABLE IF NOT EXISTS public.ai_orch_health (
  provider            text PRIMARY KEY,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  consecutive_failures int NOT NULL DEFAULT 0,
  last_failure_at     timestamptz,
  last_success_at     timestamptz,
  cooldown_until      timestamptz,
  last_error_code     text,
  last_error_message  text,
  avg_latency_ms      int,
  is_quota_exhausted  boolean NOT NULL DEFAULT false,
  quota_reset_at      timestamptz,
  is_rate_limited     boolean NOT NULL DEFAULT false
);

ALTER TABLE public.ai_orch_health ENABLE ROW LEVEL SECURITY;
-- Only service_role can read/write

-- Provider-level analytics view (live, no materialization needed)
CREATE OR REPLACE VIEW public.ai_provider_analytics AS
SELECT
  provider,
  count(*) AS total_calls,
  count(*) FILTER (WHERE event = 'success') AS successes,
  count(*) FILTER (WHERE event = 'failure') AS failures,
  round(avg(duration_ms) FILTER (WHERE event = 'success'))::int AS avg_latency_ms,
  round(avg(duration_ms) FILTER (WHERE event = 'failure'))::int AS avg_failure_ms,
  round((count(*) FILTER (WHERE event = 'success') * 100.0) / nullif(count(*), 0), 1) AS success_rate_pct,
  string_agg(DISTINCT error_code, ', ') FILTER (WHERE error_code IS NOT NULL) AS error_codes,
  max(created_at) AS last_call_at
FROM public.ai_provider_log
GROUP BY provider
ORDER BY total_calls DESC;

-- AI quality trends (daily)
CREATE OR REPLACE VIEW public.ai_quality_daily AS
SELECT
  date_trunc('day', last_verified_at)::date AS day,
  count(*) AS jobs_analyzed,
  count(*) FILTER (WHERE model_version NOT LIKE 'regex%' AND model_version NOT LIKE 'no-ai%') AS ai_successes,
  round(avg(overall_confidence) FILTER (WHERE model_version NOT LIKE 'regex%' AND model_version NOT LIKE 'no-ai%'))::int AS ai_avg_conf,
  count(*) FILTER (WHERE africa_eligibility != 'unknown') AS africa_known,
  count(*) FILTER (WHERE remote_eligibility != 'unknown') AS remote_known,
  count(*) FILTER (WHERE salary_transparency = 'disclosed') AS salary_disclosed,
  count(*) FILTER (WHERE company_legitimacy != 'unknown') AS company_known,
  count(*) FILTER (WHERE array_length(COALESCE(required_skills, '{}'), 1) > 0) AS has_skills,
  string_agg(DISTINCT split_part(model_version, ':', 1), ', ') FILTER (WHERE model_version LIKE '%:%') AS providers_used
FROM public.job_ai_intelligence
GROUP BY 1
ORDER BY 1 DESC
LIMIT 30;
