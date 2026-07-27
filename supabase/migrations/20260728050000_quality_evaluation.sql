ALTER TABLE public.job_ai_intelligence
  ADD COLUMN IF NOT EXISTS quality_score int,
  ADD COLUMN IF NOT EXISTS quality_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS quality_evaluated_at timestamptz;

CREATE INDEX IF NOT EXISTS jai_quality_score_idx
  ON public.job_ai_intelligence (quality_score DESC)
  WHERE quality_score IS NOT NULL;

CREATE OR REPLACE VIEW public.ai_quality_scores AS
SELECT jai.job_id, j.title, j.company, jai.model_version,
  jai.overall_confidence, jai.quality_score, jai.quality_breakdown,
  jai.last_verified_at, jai.quality_evaluated_at
FROM job_ai_intelligence jai JOIN jobs j ON j.id=jai.job_id
WHERE jai.quality_score IS NOT NULL ORDER BY jai.quality_score DESC;
