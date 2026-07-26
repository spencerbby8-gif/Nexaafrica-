-- Nexa prod hardening 2026-07-27: drop orphaned duplicate GIN index
--
-- jobs_intelligence_gin is an orphan — it was NOT created by any migration file
-- (the migrations create jobs_intelligence_gin_idx). Both are identical
-- jsonb_path_ops GIN indexes on jobs.intelligence, both have idx_scan = 0
-- (never used by any query). The duplicate wastes 1.6 MB of storage and
-- doubles write overhead on every INSERT/UPDATE to jobs.
--
-- We drop ONLY the orphan. The migration-tracked jobs_intelligence_gin_idx
-- is preserved. Safe: no query uses either index.
--
-- Idempotent: IF EXISTS.

DROP INDEX IF EXISTS public.jobs_intelligence_gin;
