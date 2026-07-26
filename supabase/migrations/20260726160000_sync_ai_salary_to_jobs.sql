-- Nexa prod hardening 2026-07-26: AI salary not synced to jobs (issue #9)
-- Only sync EVIDENCE-BACKED AI salaries (salary_evidence present) into jobs
-- where the job has no salary. Never invents pay. Idempotent.
UPDATE public.jobs j
SET salary_min     = a.salary_min,
    salary_max     = a.salary_max,
    salary_currency= a.salary_currency,
    salary_period  = a.salary_period,
    salary_range   = CASE
      WHEN a.salary_min IS NOT NULL AND a.salary_max IS NOT NULL AND a.salary_min <> a.salary_max
        THEN COALESCE(NULLIF(a.salary_currency,'')||' ','')||a.salary_min||' - '||a.salary_max
      ELSE COALESCE(NULLIF(a.salary_currency,'')||' ','')||COALESCE(a.salary_max,a.salary_min)::text
    END
FROM public.job_ai_intelligence a
WHERE a.job_id = j.id
  AND a.salary_min IS NOT NULL
  AND COALESCE(a.salary_evidence, '') <> ''
  AND j.salary_min IS NULL;
