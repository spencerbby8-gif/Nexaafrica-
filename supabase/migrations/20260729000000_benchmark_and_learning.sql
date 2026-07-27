-- Benchmark regression testing table
CREATE TABLE IF NOT EXISTS public.ai_benchmark_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  model_version text, quality_score int, provider text,
  latency_ms int, evidence_fields int, hallucination_risk int,
  ai_used boolean DEFAULT false, page_fetched boolean DEFAULT false
);
CREATE INDEX IF NOT EXISTS ai_benchmark_job_idx ON ai_benchmark_results(job_id, run_at DESC);

-- Provider learning history — accumulates permanently
ALTER TABLE public.ai_orch_health
  ADD COLUMN IF NOT EXISTS total_successes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_failures int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_quality_score int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_latency_ms int,
  ADD COLUMN IF NOT EXISTS worst_latency_ms int,
  ADD COLUMN IF NOT EXISTS total_tokens_used bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooldown_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_task_type text;

-- Provider analytics: quality by task type
CREATE OR REPLACE VIEW public.ai_provider_task_quality AS
SELECT
  split_part(model_version, ':', 1) AS provider,
  count(*) AS evaluations,
  round(avg(quality_score))::int AS avg_quality,
  round(avg((quality_breakdown->>'truth_score')::int))::int AS avg_truth,
  round(avg((quality_breakdown->>'evidence_coverage')::int))::int AS avg_evidence,
  round(avg((quality_breakdown->>'hallucination_risk')::int))::int AS avg_hall_risk
FROM job_ai_intelligence
WHERE quality_score IS NOT NULL
  AND model_version LIKE '%:%'
GROUP BY 1
ORDER BY avg_quality DESC;

-- View: benchmark trends
CREATE OR REPLACE VIEW public.ai_benchmark_trends AS
SELECT
  date_trunc('day', run_at)::date AS day,
  count(*) AS jobs_tested,
  round(avg(quality_score))::int AS avg_quality,
  round(avg(latency_ms))::int AS avg_latency,
  count(*) FILTER (WHERE ai_used) AS ai_successes,
  round(avg(evidence_fields))::int AS avg_evidence_fields
FROM ai_benchmark_results
GROUP BY 1 ORDER BY 1 DESC
LIMIT 30;
