-- Nexa intelligence truth cleanup (audit: intelligence not job-specific / template-driven)
-- Root causes (verified live):
--  1. company legitimacy fabricated from logo presence ("likely_legit"/"verified" conf 60-80).
--  2. africa eligibility disagreed with the deterministic classifier in 1954 rows because the
--     AI verifier matched "worldwide/anywhere" in MARKETING BOILERPLATE (e.g. Figma product
--     copy) and labelled it "likely" conf 70 with the boilerplate as evidence.
--  3. Evidence columns held generic labels ("Marked as remote in ATS", "No compensation listed
--     in posting", "Worldwide language", "Geo restriction") presented as verbatim quotes.
--  4. Confidence was template buckets (africa=60 for 2976 rows) not per-job.
-- Truth rules applied: evidence must be verbatim or empty; weak evidence => UNKNOWN/low; never
-- a copied score. Africa is aligned to the reliable deterministic classifier (jobs.eligibility)
-- computed from full normalized text. Salary disclosed still requires real evidence.
-- Backup table: public._bk_jai_truth_20260726b. Idempotent.

-- Company: a logo is not legitimacy evidence -> unknown
UPDATE public.job_ai_intelligence
SET company_legitimacy = 'unknown', company_confidence = 0
WHERE company_legitimacy IS NOT NULL AND company_legitimacy <> 'unknown';

-- Africa: align to deterministic source of truth + honest confidence + drop boilerplate evidence
UPDATE public.job_ai_intelligence a
SET africa_eligibility = j.eligibility,
    africa_confidence  = CASE j.eligibility WHEN 'explicit' THEN 75 WHEN 'restricted' THEN 70 WHEN 'likely' THEN 45 ELSE 0 END,
    africa_evidence    = NULL
FROM public.jobs j
WHERE j.id = a.job_id;
UPDATE public.job_ai_intelligence SET africa_evidence = NULL WHERE africa_evidence IS NOT NULL AND africa_evidence <> '';

-- Remote: drop generic labels, metadata-only honest confidence
UPDATE public.job_ai_intelligence
SET remote_evidence = NULL
WHERE remote_evidence ~* 'marked as remote|fully remote language|hybrid language|onsite only|no remote policy';
UPDATE public.job_ai_intelligence
SET remote_confidence = CASE WHEN remote_eligibility = 'fully_remote' THEN 40 ELSE 0 END;

-- Salary: drop generic "no compensation" evidence (keep evidence-backed disclosed rows)
UPDATE public.job_ai_intelligence
SET salary_evidence = NULL
WHERE salary_evidence ~* 'no compensation listed';

-- Experience: title-based is real but weak -> cap, unknown => 0
UPDATE public.job_ai_intelligence
SET experience_confidence = CASE WHEN experience_level = 'unknown' THEN 0 ELSE LEAST(experience_confidence, 60) END;

-- Recompute overall honestly across the verifiable dimensions
UPDATE public.job_ai_intelligence
SET overall_confidence = ROUND(
  (COALESCE(africa_confidence,0) + COALESCE(remote_confidence,0) + COALESCE(salary_confidence,0)
   + COALESCE(company_confidence,0) + COALESCE(experience_confidence,0)) / 5.0);

-- Dedupe duplicated skill arrays
UPDATE public.job_ai_intelligence
SET required_skills = (SELECT array_agg(DISTINCT x) FROM unnest(required_skills) x)
WHERE required_skills IS NOT NULL AND array_length(required_skills,1) > 1;
