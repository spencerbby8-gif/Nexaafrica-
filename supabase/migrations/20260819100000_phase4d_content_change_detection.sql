-- ============================================================================
-- Nexa Phase 4D — Intelligence content change detection (2026-08-19)
-- Adds a content fingerprint so a re-ingested job whose source material
-- actually changed becomes eligible for re-verification. A timestamp or
-- refresh counter alone never triggers AI — only a materially different
-- description/location/salary/remote fingerprint does.
-- Idempotent. NO backfill: rows with NULL content_hash are treated as
-- "unknown prior state" and simply have the hash recorded on their next
-- ingest without triggering AI.
-- ============================================================================
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS materially_changed_at timestamptz;
CREATE INDEX IF NOT EXISTS jobs_content_hash_idx ON public.jobs (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_materially_changed_idx ON public.jobs (materially_changed_at) WHERE materially_changed_at IS NOT NULL;
