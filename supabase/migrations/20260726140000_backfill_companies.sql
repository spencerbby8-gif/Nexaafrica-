-- Nexa prod hardening 2026-07-26: companies table empty (issue #6)
-- The companies table had 0 rows though every job carries a company name.
-- Backfill one canonical row per company (first non-null logo). Idempotent.
INSERT INTO public.companies (name, logo, website, description, verified)
SELECT company, company_logo, NULL, NULL, false
FROM (
  SELECT DISTINCT ON (lower(company)) company, company_logo
  FROM public.jobs
  WHERE company IS NOT NULL AND company <> ''
  ORDER BY lower(company), company_logo DESC NULLS LAST
) s
ON CONFLICT (name) DO NOTHING;
