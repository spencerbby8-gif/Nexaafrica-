-- Nexa Intelligence Phase 2: Intelligent Job Admission
-- Company + source learning tables, and queue TTL support.

-- ── Company intelligence ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_intelligence (
  company              TEXT PRIMARY KEY,
  total_jobs           INT NOT NULL DEFAULT 0,
  africa_eligible_jobs INT NOT NULL DEFAULT 0,
  remote_jobs          INT NOT NULL DEFAULT 0,
  rejected_jobs        INT NOT NULL DEFAULT 0,
  dead_page_count      INT NOT NULL DEFAULT 0,
  verified_count       INT NOT NULL DEFAULT 0,
  africa_rate          REAL NOT NULL DEFAULT 0,
  rejection_rate       REAL NOT NULL DEFAULT 0,
  verification_rate    REAL NOT NULL DEFAULT 0,
  trust_avg            INT,
  priority             SMALLINT NOT NULL DEFAULT 1,  -- 1=normal 0=reduced -1=skip
  last_updated         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Source intelligence ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.source_intelligence (
  source              TEXT PRIMARY KEY,
  total_jobs          INT NOT NULL DEFAULT 0,
  accepted_jobs       INT NOT NULL DEFAULT 0,
  africa_eligible_jobs INT NOT NULL DEFAULT 0,
  verified_jobs       INT NOT NULL DEFAULT 0,
  dead_link_count     INT NOT NULL DEFAULT 0,
  duplicate_count     INT NOT NULL DEFAULT 0,
  ai_quota_used       INT NOT NULL DEFAULT 0,
  acceptance_rate     REAL NOT NULL DEFAULT 0,
  africa_rate         REAL NOT NULL DEFAULT 0,
  verification_rate   REAL NOT NULL DEFAULT 0,
  crawl_priority      SMALLINT NOT NULL DEFAULT 1,  -- 1=normal 0=reduced -1=disabled
  last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_intelligence ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ci_priority_idx ON public.company_intelligence(priority);
CREATE INDEX IF NOT EXISTS si_priority_idx ON public.source_intelligence(crawl_priority);
