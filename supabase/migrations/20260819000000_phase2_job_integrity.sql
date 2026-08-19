-- ============================================================================
-- Nexa Phase 2 — Job Integrity backfill (2026-08-19)
-- Companion to the code changes on fix/phase2-job-integrity:
--   1) Generic location-bound reclassification — SQL mirror of
--      lib/locationPolicy.ts. Jobs whose location/country names a SPECIFIC
--      place (not a global token, not an African location) and whose
--      description carries NO strong global outreach are not Africa-compatible
--      and become restricted. Conservative: rows with ANY outreach token are
--      left untouched (the live classifier/admission gate applies the full
--      LOCAL_QUALIFIER refinement going forward).
--   2) Remote truth reconciliation — SQL mirror of the engine write-back:
--      jobs the AI verified as hybrid/onsite (confidence >= 60, with
--      evidence, from a real provider row) stop claiming is_remote=true.
-- Idempotent: safe to re-run. SELECT-first dry-run measured 1,111 + 329 rows.
-- ============================================================================

-- ── 1) Location-bound backfill ─────────────────────────────────────────────
UPDATE public.jobs
SET eligibility = 'restricted', is_open_to_africa = false
WHERE is_active
  AND eligibility = 'likely'
  AND (
    (location IS NOT NULL AND btrim(location) <> ''
      AND location !~* '\y(worldwide|anywhere|remote|africa|emea|global|international|earth|world)\y'
      AND location !~* '\y(nigeria|kenya|south africa|ghana|egypt|morocco|rwanda|uganda|ethiopia|tanzania)\y')
    OR
    (lower(country) NOT IN ('','worldwide','anywhere','remote','africa','emea','global','international','world')
      AND country !~* '\y(africa|nigeria|kenya|south africa|ghana|egypt|morocco|rwanda|uganda|ethiopia|tanzania)\y')
  )
  AND description_md !~* '\y(worldwide|anywhere|emea)\y'
  AND description_md !~* 'africa'
  AND description_md !~* 'any\s+(time\s*zone|location|country)'
  AND description_md !~* 'remote\s*[-—,]?\s*(global|worldwide|anywhere|international)';

-- ── 2) Remote truth reconciliation ─────────────────────────────────────────
UPDATE public.jobs j
SET is_remote = false
FROM public.job_ai_intelligence a
WHERE a.job_id = j.id
  AND j.is_active
  AND j.is_remote = true
  AND a.remote_eligibility IN ('hybrid','onsite')
  AND a.remote_confidence >= 60
  AND a.remote_evidence IS NOT NULL
  AND a.model_version LIKE '%:%'
  AND a.model_version NOT LIKE 'regex%'
  AND a.model_version NOT LIKE 'no-ai%';
