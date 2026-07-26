-- Nexa prod hardening 2026-07-26: Salary truth fix (issue #2)
--
-- Problem (verified live):
--   job_ai_intelligence had 487 rows with salary_transparency='disclosed', but
--   475 of them had NO salary_evidence — i.e. salary figures presented as
--   employer-disclosed facts with no verbatim proof. This violates the Nexa
--   truth mandate: "UNKNOWN is allowed when evidence is missing; never invent."
--
-- Fix:
--   Any 'disclosed' salary lacking evidence is downgraded to 'unknown' and its
--   numeric values are cleared, so unproven compensation is never surfaced to
--   users. Evidence-backed disclosed rows are preserved untouched.
--
-- Safety:
--   Applied to production after a full backup of affected columns
--   (table public._bk_jai_salary_20260726). Idempotent: safe to re-run.
--   Verified live: after apply, disclosed_without_evidence = 0.
UPDATE public.job_ai_intelligence
SET salary_transparency = 'unknown',
    salary_min = NULL,
    salary_max = NULL,
    salary_currency = NULL,
    salary_period = NULL,
    salary_is_estimated = false,
    salary_confidence = 0
WHERE salary_transparency = 'disclosed'
  AND (salary_evidence IS NULL OR salary_evidence = '');
