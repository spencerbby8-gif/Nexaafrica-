-- Phase 2: AI Job Intelligence Foundation
-- Stores AI-enriched intelligence separately from raw job data, evidence-based, no fabrication

-- 1) job_ai_intelligence table - separate from jobs.intelligence and jobs.trust_signals
create table if not exists public.job_ai_intelligence (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  version int not null default 1,
  model_version text not null default 'gemini-2.5-flash-v1',

  -- Africa & Remote
  africa_eligibility text check (africa_eligibility in ('explicit','likely','restricted','unknown')),
  africa_confidence int check (africa_confidence >=0 and africa_confidence <=100),
  africa_evidence text,
  africa_source_urls text[] default '{}',

  country_restrictions text[] default '{}',
  visa_sponsorship text check (visa_sponsorship in ('available','not_available','unknown','conditional')),
  visa_confidence int,
  visa_evidence text,

  timezone_requirements text,
  timezone_confidence int,
  timezone_evidence text,

  remote_eligibility text check (remote_eligibility in ('fully_remote','hybrid','onsite','unknown')),
  remote_confidence int,
  remote_evidence text,

  -- Skills & Experience
  required_skills text[] default '{}',
  transferable_skills text[] default '{}',
  missing_skills text[] default '{}',
  experience_level text check (experience_level in ('entry','mid','senior','executive','unknown')),
  experience_confidence int,

  -- Salary truthfulness
  salary_min int,
  salary_max int,
  salary_currency text,
  salary_period text,
  salary_is_estimated boolean default false,
  salary_estimate_source text,
  salary_transparency text check (salary_transparency in ('disclosed','estimated','undisclosed','unknown')),
  salary_confidence int,
  salary_evidence text,

  -- Company & Quality
  company_legitimacy text check (company_legitimacy in ('verified','likely_legit','unknown','suspicious')),
  company_confidence int,
  company_evidence text,

  job_quality text check (job_quality in ('high','medium','low','unknown')),
  job_quality_confidence int,
  job_quality_evidence text,

  application_difficulty text check (application_difficulty in ('easy','medium','hard','unknown')),
  hiring_urgency text check (hiring_urgency in ('high','medium','low','unknown')),

  -- Overall
  overall_confidence int check (overall_confidence >=0 and overall_confidence <=100),
  evidence_urls text[] default '{}',
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(job_id)
);

-- Indexes
create index if not exists job_ai_intelligence_job_id_idx on public.job_ai_intelligence (job_id);
create index if not exists job_ai_intelligence_africa_eligibility_idx on public.job_ai_intelligence (africa_eligibility);
create index if not exists job_ai_intelligence_remote_eligibility_idx on public.job_ai_intelligence (remote_eligibility);
create index if not exists job_ai_intelligence_overall_confidence_idx on public.job_ai_intelligence (overall_confidence desc);
create index if not exists job_ai_intelligence_last_verified_idx on public.job_ai_intelligence (last_verified_at desc);

-- RLS: only service_role can read/write (no public policy)
alter table public.job_ai_intelligence enable row level security;

-- Updated_at trigger
create or replace function public.set_updated_at_ai() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists job_ai_intelligence_set_updated_at on public.job_ai_intelligence;
create trigger job_ai_intelligence_set_updated_at
  before update on public.job_ai_intelligence
  for each row execute function public.set_updated_at_ai();

-- 2) ai_processing_queue for async pipeline
create table if not exists public.ai_processing_queue (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','skipped')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  error text,
  priority int not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique(job_id)
);

create index if not exists ai_processing_queue_status_idx on public.ai_processing_queue (status, priority desc, created_at);
create index if not exists ai_processing_queue_job_id_idx on public.ai_processing_queue (job_id);

alter table public.ai_processing_queue enable row level security;

-- 3) ai_processing_stats for monitoring cost, coverage, confidence distribution
create table if not exists public.ai_processing_stats (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  total_jobs int not null default 0,
  processed int not null default 0,
  failed int not null default 0,
  avg_confidence int,
  cost_cents int default 0,
  created_at timestamptz not null default now(),
  unique(date)
);

alter table public.ai_processing_stats enable row level security;
