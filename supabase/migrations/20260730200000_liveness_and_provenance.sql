-- P6: liveness sweeper support + evidence provenance labelling
-- page_status persists the last HEAD/GET status of the apply_url during
-- AI processing — the stale-job sweep can then deactivate listings whose
-- pages are confirmed dead (404/410 repeatedly, not transient timeout).

alter table public.job_ai_intelligence
  add column if not exists page_status    int,        -- HTTP status (null = never checked, 0 = timeout/error)
  add column if not exists page_checked_at timestamptz,
  add column if not exists evidence_provenance text; -- 'page' | 'ats_metadata' | 'company_page' | 'regex' | null

create index if not exists jai_page_status_idx
  on public.job_ai_intelligence (page_status) where page_status is not null;
