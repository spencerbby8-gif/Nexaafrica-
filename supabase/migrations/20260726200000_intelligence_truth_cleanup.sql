-- Nexa prod hardening 2026-07-26: intelligence truthfulness cleanup (issue: templates)
-- Removes template / copied-default intelligence that violated the truth mandate.
-- 1) company legitimacy was FABRICATED from a logo ("Known company X + logo") ->
--    a logo is not proof of legitimacy. Downgrade to unknown.
UPDATE public.job_ai_intelligence
SET company_legitimacy='unknown', company_confidence=0, company_evidence=NULL
WHERE company_evidence ILIKE '%logo%';
-- 2) 'verified' must be ATS-backed; otherwise it is not verifiable -> unknown.
UPDATE public.job_ai_intelligence a
SET company_legitimacy='unknown', company_confidence=0
FROM public.jobs j
WHERE a.job_id=j.id AND a.company_legitimacy='verified'
  AND j.apply_url !~ 'greenhouse.io|lever.co|ashbyhq.com|smartrecruiters|workable.com|recruitee|personio';
-- 3) raw remote template tokens are not page evidence -> NULL.
UPDATE public.job_ai_intelligence
SET remote_evidence=NULL
WHERE remote_evidence IN ('is_remote=true','Fully remote language');
-- 4) contradictory salaries (evidence says none, yet values present) -> null/undisclosed.
UPDATE public.job_ai_intelligence
SET salary_min=NULL, salary_max=NULL, salary_currency=NULL, salary_period=NULL,
    salary_transparency='undisclosed', salary_confidence=0
WHERE salary_min IS NOT NULL
  AND (salary_evidence ILIKE '%no compensation%' OR salary_evidence ILIKE '%not listed%'
       OR salary_evidence ILIKE '%no salary%' OR salary_evidence ILIKE '%undisclosed%');
