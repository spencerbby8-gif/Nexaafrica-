-- Nexa V3 — Performance: search index (2026-08-04)
-- /api/jobs and hub pages filter with ilike on jobs.title / jobs.company.
-- pg_trgm GIN indexes make those LIKE '%term%' scans index-assisted instead
-- of seq-scanned over the whole table. Safe on existing data; no behavior
-- change — indexes are invisible to queries.

create extension if not exists pg_trgm;

create index if not exists jobs_title_trgm_idx on public.jobs using gin (title gin_trgm_ops);
create index if not exists jobs_company_trgm_idx on public.jobs using gin (company gin_trgm_ops);
