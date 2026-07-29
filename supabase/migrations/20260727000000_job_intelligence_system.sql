-- Job Intelligence System - Database Schema
-- Created: 2026-07-27
-- Version: 1.0

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: job_evidence
-- Stores all evidence items collected for each job
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  
  -- Evidence metadata
  evidence_type TEXT NOT NULL,
  source_url TEXT,
  source_name TEXT,
  
  -- Evidence content
  evidence_data JSONB NOT NULL,
  evidence_summary TEXT,
  
  -- Verification
  verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'failed', 'partial', 'pending')),
  verification_details JSONB,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Confidence
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  confidence_reasons JSONB,
  
  -- Metadata
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_stale BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job_evidence
CREATE INDEX IF NOT EXISTS idx_job_evidence_job_id ON job_evidence(job_id);
CREATE INDEX IF NOT EXISTS idx_job_evidence_type ON job_evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_job_evidence_status ON job_evidence(verification_status);
CREATE INDEX IF NOT EXISTS idx_job_evidence_stale ON job_evidence(is_stale) WHERE is_stale = TRUE;
CREATE INDEX IF NOT EXISTS idx_job_evidence_collected_at ON job_evidence(collected_at DESC);

-- ============================================================================
-- Table: job_scores
-- Stores all calculated scores for each job
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
  
  -- Trust Score (0-100)
  trust_score INTEGER CHECK (trust_score >= 0 AND trust_score <= 100),
  trust_breakdown JSONB,
  trust_reasons JSONB,
  trust_level TEXT CHECK (trust_level IN ('high', 'medium', 'low', 'very_low')),
  
  -- Africa Eligibility
  africa_eligibility TEXT CHECK (africa_eligibility IN ('Explicit', 'Likely', 'Unknown', 'Restricted')),
  africa_confidence INTEGER CHECK (africa_confidence >= 0 AND africa_confidence <= 100),
  africa_breakdown JSONB,
  africa_reasons JSONB,
  africa_evidence JSONB,
  
  -- Intelligence Score (0-100)
  intelligence_score INTEGER CHECK (intelligence_score >= 0 AND intelligence_score <= 100),
  intelligence_breakdown JSONB,
  intelligence_reasons JSONB,
  
  -- AI Confidence
  ai_confidence INTEGER CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
  ai_providers_used JSONB,
  ai_agreement_score INTEGER CHECK (ai_agreement_score >= 0 AND ai_agreement_score <= 100),
  
  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_stale BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job_scores
CREATE INDEX IF NOT EXISTS idx_job_scores_job_id ON job_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_job_scores_trust ON job_scores(trust_score DESC) WHERE trust_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_scores_africa ON job_scores(africa_eligibility, africa_confidence DESC) WHERE africa_eligibility IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_scores_intelligence ON job_scores(intelligence_score DESC) WHERE intelligence_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_scores_stale ON job_scores(is_stale) WHERE is_stale = TRUE;

-- ============================================================================
-- Table: job_moderation
-- Stores moderation status and history for each job
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_moderation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
  
  -- Moderation status
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'quarantined', 'archived', 'deleted')),
  status_reason TEXT,
  
  -- Quality gates
  quality_gates JSONB,
  gates_passed INTEGER DEFAULT 0,
  gates_total INTEGER DEFAULT 0,
  gates_failed JSONB,
  
  -- Re-verification
  last_verified_at TIMESTAMPTZ,
  next_verification_at TIMESTAMPTZ,
  verification_count INTEGER DEFAULT 0,
  verification_history JSONB,
  
  -- Flags
  flags JSONB,
  flag_count INTEGER DEFAULT 0,
  
  -- Actions taken
  actions JSONB,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job_moderation
CREATE INDEX IF NOT EXISTS idx_job_moderation_job_id ON job_moderation(job_id);
CREATE INDEX IF NOT EXISTS idx_job_moderation_status ON job_moderation(status);
CREATE INDEX IF NOT EXISTS idx_job_moderation_next_verification ON job_moderation(next_verification_at) WHERE status != 'deleted' AND next_verification_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_moderation_flags ON job_moderation(flag_count) WHERE flag_count > 0;

-- ============================================================================
-- Table: job_investigations
-- Stores investigation trails for each job
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_investigations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  
  -- Investigation metadata
  investigation_type TEXT NOT NULL CHECK (investigation_type IN ('initial', 're_verification', 'manual_review', 'user_report')),
  triggered_by TEXT,
  
  -- Investigation results
  findings JSONB NOT NULL,
  conclusions JSONB NOT NULL,
  recommendations JSONB,
  
  -- Scores at time of investigation
  trust_score_at_investigation INTEGER,
  africa_eligibility_at_investigation TEXT,
  intelligence_score_at_investigation INTEGER,
  
  -- Actions taken
  actions_taken JSONB,
  
  -- Metadata
  investigation_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job_investigations
CREATE INDEX IF NOT EXISTS idx_job_investigations_job_id ON job_investigations(job_id);
CREATE INDEX IF NOT EXISTS idx_job_investigations_type ON job_investigations(investigation_type);
CREATE INDEX IF NOT EXISTS idx_job_investigations_created ON job_investigations(created_at DESC);

-- ============================================================================
-- Add columns to existing jobs table
-- ============================================================================

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS trust_score INTEGER CHECK (trust_score >= 0 AND trust_score <= 100),
  ADD COLUMN IF NOT EXISTS africa_eligibility TEXT CHECK (africa_eligibility IN ('Explicit', 'Likely', 'Unknown', 'Restricted')),
  ADD COLUMN IF NOT EXISTS africa_confidence INTEGER CHECK (africa_confidence >= 0 AND africa_confidence <= 100),
  ADD COLUMN IF NOT EXISTS intelligence_score INTEGER CHECK (intelligence_score >= 0 AND intelligence_score <= 100),
  ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'quarantined', 'archived', 'deleted')),
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_verification_at TIMESTAMPTZ;

-- Indexes for jobs table
CREATE INDEX IF NOT EXISTS idx_jobs_trust_score ON jobs(trust_score DESC) WHERE moderation_status = 'approved' AND trust_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_africa_eligibility ON jobs(africa_eligibility, africa_confidence DESC) WHERE moderation_status = 'approved' AND africa_eligibility IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_intelligence_score ON jobs(intelligence_score DESC) WHERE moderation_status = 'approved' AND intelligence_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_moderation_status ON jobs(moderation_status);
CREATE INDEX IF NOT EXISTS idx_jobs_next_verification ON jobs(next_verification_at) WHERE moderation_status != 'deleted' AND next_verification_at IS NOT NULL;

-- ============================================================================
-- Trigger: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to job_scores
DROP TRIGGER IF EXISTS update_job_scores_updated_at ON job_scores;
CREATE TRIGGER update_job_scores_updated_at
  BEFORE UPDATE ON job_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to job_moderation
DROP TRIGGER IF EXISTS update_job_moderation_updated_at ON job_moderation;
CREATE TRIGGER update_job_moderation_updated_at
  BEFORE UPDATE ON job_moderation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- View: job_intelligence_summary
-- Provides a quick summary of job intelligence data
-- ============================================================================

CREATE OR REPLACE VIEW job_intelligence_summary AS
SELECT 
  j.id AS job_id,
  j.title,
  j.company,
  j.posted_at,
  j.moderation_status,
  
  -- Scores
  COALESCE(js.trust_score, 0) AS trust_score,
  js.trust_level,
  COALESCE(js.africa_eligibility, 'Unknown') AS africa_eligibility,
  COALESCE(js.africa_confidence, 0) AS africa_confidence,
  COALESCE(js.intelligence_score, 0) AS intelligence_score,
  
  -- Evidence count
  COUNT(je.id) AS evidence_count,
  COUNT(je.id) FILTER (WHERE je.verification_status = 'verified') AS verified_evidence_count,
  
  -- Moderation
  jm.status AS moderation_status_detailed,
  jm.flag_count,
  jm.next_verification_at
  
FROM jobs j
LEFT JOIN job_scores js ON j.id = js.job_id
LEFT JOIN job_moderation jm ON j.id = jm.job_id
LEFT JOIN job_evidence je ON j.id = je.job_id
WHERE j.moderation_status != 'deleted'
GROUP BY j.id, j.title, j.company, j.posted_at, j.moderation_status,
         js.trust_score, js.trust_level, js.africa_eligibility, js.africa_confidence, js.intelligence_score,
         jm.status, jm.flag_count, jm.next_verification_at;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE job_evidence IS 'Stores all evidence items collected for each job from various sources';
COMMENT ON TABLE job_scores IS 'Stores all calculated scores (trust, Africa eligibility, intelligence) for each job';
COMMENT ON TABLE job_moderation IS 'Stores moderation status and history for each job';
COMMENT ON TABLE job_investigations IS 'Stores investigation trails showing how conclusions were reached';
COMMENT ON VIEW job_intelligence_summary IS 'Quick summary view of job intelligence data';

COMMENT ON COLUMN job_evidence.evidence_type IS 'Type of evidence: company_website, ats_data, career_page, domain_quality, broken_links, duplicate_detection, salary_realism, company_reputation, hiring_regions, visa_support, eor_payroll, prior_intelligence';
COMMENT ON COLUMN job_evidence.verification_status IS 'Verification result: verified, failed, partial, pending';
COMMENT ON COLUMN job_evidence.confidence_score IS 'Confidence in this evidence (0-100)';

COMMENT ON COLUMN job_scores.trust_score IS 'Overall trust score (0-100) based on evidence quality';
COMMENT ON COLUMN job_scores.africa_eligibility IS 'Africa eligibility: Explicit, Likely, Unknown, Restricted';
COMMENT ON COLUMN job_scores.africa_confidence IS 'Confidence in Africa eligibility decision (0-100)';
COMMENT ON COLUMN job_scores.intelligence_score IS 'Overall intelligence score (0-100) combining trust, Africa, salary, remote, recency';

COMMENT ON COLUMN job_moderation.status IS 'Moderation status: pending, approved, quarantined, archived, deleted';
COMMENT ON COLUMN job_moderation.quality_gates IS 'Results of quality gate checks';
COMMENT ON COLUMN job_moderation.flags IS 'Flags for issues: scam, spam, duplicate, expired, broken_link, placeholder_company, impossible_salary, low_quality';

-- ============================================================================
-- Migration complete
-- ============================================================================
