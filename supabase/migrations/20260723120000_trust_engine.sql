-- Nexa Trust Intelligence Engine — Core trust layer
-- Goals: dynamic Trust Score 0-100, evidence-based, explainable, admin moderation, user reporting

-- 1) Jobs: add trust columns (all IF NOT EXISTS, safe)
alter table public.jobs add column if not exists trust_score int check (trust_score >=0 and trust_score <=100);
alter table public.jobs add column if not exists trust_confidence text check (trust_confidence in ('high','medium','low','unknown')) default 'unknown';
alter table public.jobs add column if not exists trust_signals jsonb not null default '[]'::jsonb;
alter table public.jobs add column if not exists trust_version int not null default 1;
alter table public.jobs add column if not exists is_flagged boolean not null default false;
alter table public.jobs add column if not exists flagged_reason text;
alter table public.jobs add column if not exists duplicate_of uuid references public.jobs(id) on delete set null;

-- Backfill defaults for existing rows where null (non-blocking)
update public.jobs set trust_score = null where trust_score is null; -- will be backfilled by engine
update public.jobs set trust_confidence = 'unknown' where trust_confidence is null;
update public.jobs set trust_version = 1 where trust_version is null;
update public.jobs set is_flagged = false where is_flagged is null;

-- Indexes for trust queries (SEO/admin)
create index if not exists jobs_trust_score_idx on public.jobs (trust_score desc) where is_active = true;
create index if not exists jobs_is_flagged_idx on public.jobs (is_flagged) where is_flagged = true;
create index if not exists jobs_trust_confidence_idx on public.jobs (trust_confidence);
create index if not exists jobs_duplicate_of_idx on public.jobs (duplicate_of) where duplicate_of is not null;
create index if not exists jobs_trust_version_idx on public.jobs (trust_version);

-- 2) job_reports: user reporting for suspicious listings
create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('scam','fake','expired','wrong_location','discriminatory','spam','other')),
  details text,
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed','actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.job_reports enable row level security;

-- Allow anyone (anon) to report, but not read others' reports
drop policy if exists "job_reports anyone can insert" on public.job_reports;
create policy "job_reports anyone can insert" on public.job_reports
  for insert with check (true);

drop policy if exists "job_reports owner can read own" on public.job_reports;
create policy "job_reports owner can read own" on public.job_reports
  for select using (auth.uid() = user_id);

drop policy if exists "job_reports service can manage" on public.job_reports;
-- service_role bypasses RLS, so no policy needed for admin. But allow authenticated to see own reports.

create index if not exists job_reports_job_id_idx on public.job_reports (job_id);
create index if not exists job_reports_status_idx on public.job_reports (status);
create index if not exists job_reports_created_at_idx on public.job_reports (created_at desc);

-- 3) trust_audit_log: optional admin log
create table if not exists public.trust_audit_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  action text not null check (action in ('flagged','unflagged','score_updated','report_reviewed','auto_flagged')),
  old_score int,
  new_score int,
  reason text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.trust_audit_log enable row level security;
-- Only service_role can insert/read audit log (no public policy = denied for anon/auth)

create index if not exists trust_audit_log_job_id_idx on public.trust_audit_log (job_id);
create index if not exists trust_audit_log_created_at_idx on public.trust_audit_log (created_at desc);
