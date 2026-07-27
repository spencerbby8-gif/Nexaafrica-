-- Add metadata column to profile_versions for full pipeline observability
ALTER TABLE public.profile_versions ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Add pipeline quality columns to profile_ai_metadata
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS validation_result jsonb;
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS consistency_result jsonb;
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS quality_score integer;
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS ats_score integer;
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS reviewer_changes jsonb;
ALTER TABLE public.profile_ai_metadata ADD COLUMN IF NOT EXISTS factual_consistency_score integer;
