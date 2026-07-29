# Job Intelligence System Architecture

**Version:** 1.0  
**Date:** 2026-07-27  
**Status:** Design Complete, Implementation In Progress

---

## Executive Summary

Transform Nexa from a static AI extractor into an evidence-based job intelligence system that:

1. **Cross-verifies** every job against multiple sources (company websites, ATS data, career pages, domain quality, etc.)
2. **Scores** jobs using evidence-based trust, Africa eligibility, and intelligence scores
3. **Moderates** jobs automatically through re-verification, quarantine, and archival
4. **Explains** every decision with investigation-style evidence trails

**Key Principles:**
- Evidence over assertions
- Verification over assumption
- Transparency over black-box AI
- Continuous re-verification over one-time extraction

---

## System Architecture

### High-Level Flow

```
Job Ingestion
    ↓
[1] Evidence Collection Pipeline
    - Company website verification
    - ATS data cross-check
    - Career page validation
    - Domain quality analysis
    - Broken link detection
    - Duplicate detection
    - Salary realism check
    - Prior intelligence lookup
    ↓
[2] AI Reasoning Layer
    - Multi-provider AI analysis
    - Evidence synthesis
    - Confidence calibration
    - Conflict resolution
    ↓
[3] Scoring Engine
    - Trust Score (0-100)
    - Africa Eligibility (Explicit/Likely/Unknown/Restricted)
    - Africa Confidence (0-100)
    - Intelligence Score (0-100)
    ↓
[4] Moderation System
    - Automatic quality gates
    - Quarantine workflow
    - Re-verification scheduling
    - Archive/delete decisions
    ↓
[5] Storage & Indexing
    - Evidence storage (job_evidence)
    - Score storage (job_scores)
    - Moderation status (job_moderation)
    - Search index updates
    ↓
[6] UI Layer
    - Investigation-style display
    - Evidence trails
    - Intelligence-based sorting
    - Trust indicators
```

---

## Database Schema

### New Tables

#### 1. `job_evidence` - Store all evidence items

```sql
CREATE TABLE job_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  
  -- Evidence metadata
  evidence_type TEXT NOT NULL, -- 'company_website', 'ats_data', 'career_page', 'domain_quality', etc.
  source_url TEXT,
  source_name TEXT,
  
  -- Evidence content
  evidence_data JSONB NOT NULL, -- Structured evidence data
  evidence_summary TEXT, -- Human-readable summary
  
  -- Verification
  verification_status TEXT NOT NULL, -- 'verified', 'failed', 'partial', 'pending'
  verification_details JSONB, -- Why verification passed/failed
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Confidence
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  confidence_reasons JSONB, -- Why this confidence level
  
  -- Metadata
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- When to re-verify
  is_stale BOOLEAN DEFAULT FALSE,
  
  -- Indexes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_evidence_job_id ON job_evidence(job_id);
CREATE INDEX idx_job_evidence_type ON job_evidence(evidence_type);
CREATE INDEX idx_job_evidence_status ON job_evidence(verification_status);
CREATE INDEX idx_job_evidence_stale ON job_evidence(is_stale) WHERE is_stale = TRUE;
```

**Evidence Types:**
- `company_website` - Company website exists, is active, mentions the job
- `ats_data` - ATS system confirms job exists
- `career_page` - Career page lists the job
- `domain_quality` - Domain age, SSL, reputation
- `broken_links` - Apply URL works, no 404s
- `duplicate_detection` - Not a duplicate of another job
- `salary_realism` - Salary is realistic for role/location
- `company_reputation` - Company has good reputation
- `hiring_regions` - Company hires in Africa/remote
- `visa_support` - Company supports visa sponsorship
- `eor_payroll` - Company uses EOR/payroll services
- `prior_intelligence` - Previous intelligence about this company/job

#### 2. `job_scores` - Store all scores

```sql
CREATE TABLE job_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
  
  -- Trust Score (0-100)
  trust_score INTEGER CHECK (trust_score >= 0 AND trust_score <= 100),
  trust_breakdown JSONB, -- { company_website: 20, ats_data: 15, domain_quality: 10, ... }
  trust_reasons JSONB, -- Array of reasons for score
  trust_level TEXT, -- 'high', 'medium', 'low', 'very_low'
  
  -- Africa Eligibility
  africa_eligibility TEXT CHECK (africa_eligibility IN ('Explicit', 'Likely', 'Unknown', 'Restricted')),
  africa_confidence INTEGER CHECK (africa_confidence >= 0 AND africa_confidence <= 100),
  africa_breakdown JSONB, -- { hiring_regions: 30, visa_support: 20, eor_payroll: 15, ... }
  africa_reasons JSONB, -- Array of reasons for eligibility decision
  africa_evidence JSONB, -- Array of evidence IDs supporting decision
  
  -- Intelligence Score (0-100)
  intelligence_score INTEGER CHECK (intelligence_score >= 0 AND intelligence_score <= 100),
  intelligence_breakdown JSONB, -- { trust: 25, africa: 20, salary: 15, remote: 15, ... }
  intelligence_reasons JSONB, -- Array of reasons for score
  
  -- AI Confidence
  ai_confidence INTEGER CHECK (ai_confidence >= 0 AND ai_confidence <= 100),
  ai_providers_used JSONB, -- Array of AI providers used
  ai_agreement_score INTEGER, -- How much AI providers agreed (0-100)
  
  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- When to recalculate
  is_stale BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_scores_job_id ON job_scores(job_id);
CREATE INDEX idx_job_scores_trust ON job_scores(trust_score DESC);
CREATE INDEX idx_job_scores_africa ON job_scores(africa_eligibility, africa_confidence DESC);
CREATE INDEX idx_job_scores_intelligence ON job_scores(intelligence_score DESC);
CREATE INDEX idx_job_scores_stale ON job_scores(is_stale) WHERE is_stale = TRUE;
```

#### 3. `job_moderation` - Moderation status and history

```sql
CREATE TABLE job_moderation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
  
  -- Moderation status
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'quarantined', 'archived', 'deleted')),
  status_reason TEXT, -- Why this status was assigned
  
  -- Quality gates
  quality_gates JSONB, -- { trust_score: { passed: true, value: 75 }, africa_eligibility: { passed: true, value: 'Likely' }, ... }
  gates_passed INTEGER, -- Number of gates passed
  gates_total INTEGER, -- Total number of gates
  gates_failed JSONB, -- Array of failed gates with reasons
  
  -- Re-verification
  last_verified_at TIMESTAMPTZ,
  next_verification_at TIMESTAMPTZ,
  verification_count INTEGER DEFAULT 0,
  verification_history JSONB, -- Array of verification results
  
  -- Flags
  flags JSONB, -- { scam: false, spam: false, duplicate: false, expired: false, broken_link: false, placeholder_company: false, impossible_salary: false, low_quality: false }
  flag_count INTEGER DEFAULT 0,
  
  -- Actions taken
  actions JSONB, -- Array of actions taken (quarantined, archived, etc.)
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_moderation_job_id ON job_moderation(job_id);
CREATE INDEX idx_job_moderation_status ON job_moderation(status);
CREATE INDEX idx_job_moderation_next_verification ON job_moderation(next_verification_at) WHERE status != 'deleted';
CREATE INDEX idx_job_moderation_flags ON job_moderation(flag_count) WHERE flag_count > 0;
```

#### 4. `job_investigations` - Investigation trails

```sql
CREATE TABLE job_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  
  -- Investigation metadata
  investigation_type TEXT NOT NULL, -- 'initial', 're_verification', 'manual_review', 'user_report'
  triggered_by TEXT, -- 'system', 'user', 'admin', 'scheduled'
  
  -- Investigation results
  findings JSONB NOT NULL, -- Array of findings with evidence
  conclusions JSONB NOT NULL, -- Array of conclusions with reasoning
  recommendations JSONB, -- Array of recommendations
  
  -- Scores at time of investigation
  trust_score_at_investigation INTEGER,
  africa_eligibility_at_investigation TEXT,
  intelligence_score_at_investigation INTEGER,
  
  -- Actions taken
  actions_taken JSONB, -- Array of actions taken
  
  -- Metadata
  investigation_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_job_investigations_job_id ON job_investigations(job_id);
CREATE INDEX idx_job_investigations_type ON job_investigations(investigation_type);
CREATE INDEX idx_job_investigations_created ON job_investigations(created_at DESC);
```

### Updated `jobs` Table

Add new columns to existing `jobs` table:

```sql
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS trust_score INTEGER,
  ADD COLUMN IF NOT EXISTS africa_eligibility TEXT,
  ADD COLUMN IF NOT EXISTS africa_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS intelligence_score INTEGER,
  ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_verification_at TIMESTAMPTZ;

CREATE INDEX idx_jobs_trust_score ON jobs(trust_score DESC) WHERE moderation_status = 'approved';
CREATE INDEX idx_jobs_africa_eligibility ON jobs(africa_eligibility, africa_confidence DESC) WHERE moderation_status = 'approved';
CREATE INDEX idx_jobs_intelligence_score ON jobs(intelligence_score DESC) WHERE moderation_status = 'approved';
CREATE INDEX idx_jobs_moderation_status ON jobs(moderation_status);
CREATE INDEX idx_jobs_next_verification ON jobs(next_verification_at) WHERE moderation_status != 'deleted';
```

---

## Evidence Collection Pipeline

### Evidence Collectors

Each collector is responsible for one type of evidence:

#### 1. CompanyWebsiteCollector
```typescript
class CompanyWebsiteCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Extract company domain from job
    const domain = extractDomain(job.company_website || job.apply_url)
    
    // 2. Check if website exists
    const websiteCheck = await checkWebsite(domain)
    
    // 3. Verify website mentions the job
    const jobMentioned = await verifyJobMentioned(domain, job.title)
    
    // 4. Check website quality (SSL, age, etc.)
    const quality = await analyzeDomainQuality(domain)
    
    return {
      type: 'company_website',
      data: {
        domain,
        website_exists: websiteCheck.exists,
        website_active: websiteCheck.active,
        job_mentioned: jobMentioned,
        ssl_valid: quality.ssl,
        domain_age_days: quality.age,
      },
      verification_status: websiteCheck.exists && websiteCheck.active ? 'verified' : 'failed',
      confidence_score: calculateConfidence(websiteCheck, jobMentioned, quality),
    }
  }
}
```

#### 2. ATSDataCollector
```typescript
class ATSDataCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Check if job exists in ATS
    const atsCheck = await verifyATSJob(job.source, job.source_id)
    
    // 2. Verify ATS data matches job data
    const dataMatch = await compareATSData(atsCheck, job)
    
    return {
      type: 'ats_data',
      data: {
        ats_source: job.source,
        ats_job_id: job.source_id,
        ats_exists: atsCheck.exists,
        data_matches: dataMatch.matches,
        discrepancies: dataMatch.discrepancies,
      },
      verification_status: atsCheck.exists && dataMatch.matches ? 'verified' : 'partial',
      confidence_score: calculateConfidence(atsCheck, dataMatch),
    }
  }
}
```

#### 3. CareerPageCollector
```typescript
class CareerPageCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Find career page URL
    const careerPageUrl = await findCareerPage(job.company)
    
    // 2. Check if job is listed
    const jobListed = await verifyJobListed(careerPageUrl, job.title)
    
    // 3. Extract additional info from career page
    const additionalInfo = await extractCareerPageInfo(careerPageUrl)
    
    return {
      type: 'career_page',
      data: {
        career_page_url: careerPageUrl,
        job_listed: jobListed,
        hiring_regions: additionalInfo.regions,
        remote_policy: additionalInfo.remotePolicy,
        visa_support: additionalInfo.visaSupport,
      },
      verification_status: jobListed ? 'verified' : 'partial',
      confidence_score: calculateConfidence(jobListed, additionalInfo),
    }
  }
}
```

#### 4. DomainQualityCollector
```typescript
class DomainQualityCollector {
  async collect(job: Job): Promise<Evidence> {
    const domain = extractDomain(job.apply_url)
    
    // 1. Check domain age
    const age = await getDomainAge(domain)
    
    // 2. Check SSL certificate
    const ssl = await checkSSL(domain)
    
    // 3. Check domain reputation
    const reputation = await checkReputation(domain)
    
    // 4. Check for suspicious patterns
    const suspicious = await checkSuspiciousPatterns(domain)
    
    return {
      type: 'domain_quality',
      data: {
        domain,
        age_days: age,
        ssl_valid: ssl.valid,
        ssl_issuer: ssl.issuer,
        reputation_score: reputation.score,
        suspicious_patterns: suspicious,
      },
      verification_status: age > 365 && ssl.valid && reputation.score > 50 ? 'verified' : 'partial',
      confidence_score: calculateConfidence(age, ssl, reputation, suspicious),
    }
  }
}
```

#### 5. BrokenLinksCollector
```typescript
class BrokenLinksCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Check apply URL
    const applyCheck = await checkURL(job.apply_url)
    
    // 2. Check company website
    const websiteCheck = job.company_website ? await checkURL(job.company_website) : null
    
    return {
      type: 'broken_links',
      data: {
        apply_url_status: applyCheck.status,
        apply_url_accessible: applyCheck.accessible,
        website_url_status: websiteCheck?.status,
        website_url_accessible: websiteCheck?.accessible,
      },
      verification_status: applyCheck.accessible ? 'verified' : 'failed',
      confidence_score: applyCheck.accessible ? 100 : 0,
    }
  }
}
```

#### 6. DuplicateDetectionCollector
```typescript
class DuplicateDetectionCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Check for exact duplicates (same title + company)
    const exactDuplicates = await findExactDuplicates(job)
    
    // 2. Check for similar duplicates (fuzzy matching)
    const similarDuplicates = await findSimilarDuplicates(job)
    
    // 3. Check for same source_id
    const sourceDuplicates = await findBySourceId(job.source, job.source_id)
    
    return {
      type: 'duplicate_detection',
      data: {
        exact_duplicates: exactDuplicates.length,
        similar_duplicates: similarDuplicates.length,
        source_duplicates: sourceDuplicates.length,
        duplicate_job_ids: [
          ...exactDuplicates.map(d => d.id),
          ...similarDuplicates.map(d => d.id),
        ],
      },
      verification_status: exactDuplicates.length === 0 ? 'verified' : 'failed',
      confidence_score: exactDuplicates.length === 0 ? 100 : 0,
    }
  }
}
```

#### 7. SalaryRealismCollector
```typescript
class SalaryRealismCollector {
  async collect(job: Job): Promise<Evidence> {
    if (!job.salary_min && !job.salary_max) {
      return {
        type: 'salary_realism',
        data: { salary_provided: false },
        verification_status: 'pending',
        confidence_score: 0,
      }
    }
    
    // 1. Get market data for role + location
    const marketData = await getMarketSalary(job.title, job.location)
    
    // 2. Compare job salary to market
    const comparison = compareSalaryToMarket(job, marketData)
    
    // 3. Check for impossible salaries
    const impossible = isImpossibleSalary(job, marketData)
    
    return {
      type: 'salary_realism',
      data: {
        salary_provided: true,
        job_salary_min: job.salary_min,
        job_salary_max: job.salary_max,
        market_median: marketData.median,
        market_range: marketData.range,
        percentile: comparison.percentile,
        is_realistic: comparison.realistic,
        is_impossible: impossible,
      },
      verification_status: comparison.realistic && !impossible ? 'verified' : 'failed',
      confidence_score: calculateConfidence(comparison, impossible),
    }
  }
}
```

#### 8. CompanyReputationCollector
```typescript
class CompanyReputationCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Check Glassdoor rating
    const glassdoor = await getGlassdoorRating(job.company)
    
    // 2. Check LinkedIn presence
    const linkedin = await getLinkedInPresence(job.company)
    
    // 3. Check for scam reports
    const scamReports = await checkScamReports(job.company)
    
    return {
      type: 'company_reputation',
      data: {
        glassdoor_rating: glassdoor.rating,
        glassdoor_reviews: glassdoor.reviews,
        linkedin_followers: linkedin.followers,
        linkedin_posts: linkedin.posts,
        scam_reports: scamReports.count,
        scam_details: scamReports.details,
      },
      verification_status: scamReports.count === 0 && (glassdoor.rating > 3 || glassdoor.rating === null) ? 'verified' : 'failed',
      confidence_score: calculateConfidence(glassdoor, linkedin, scamReports),
    }
  }
}
```

#### 9. HiringRegionsCollector
```typescript
class HiringRegionsCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Extract regions from job description
    const descriptionRegions = extractRegionsFromDescription(job.description)
    
    // 2. Extract regions from career page
    const careerPageRegions = await extractRegionsFromCareerPage(job.company)
    
    // 3. Check for Africa-specific mentions
    const africaMentions = findAfricaMentions(job.description, careerPageRegions)
    
    return {
      type: 'hiring_regions',
      data: {
        description_regions: descriptionRegions,
        career_page_regions: careerPageRegions,
        africa_mentions: africaMentions,
        hires_in_africa: africaMentions.length > 0,
        remote_worldwide: descriptionRegions.includes('Worldwide') || careerPageRegions.includes('Worldwide'),
      },
      verification_status: 'verified',
      confidence_score: calculateConfidence(descriptionRegions, careerPageRegions, africaMentions),
    }
  }
}
```

#### 10. VisaSupportCollector
```typescript
class VisaSupportCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Check job description for visa mentions
    const descriptionVisa = extractVisaFromDescription(job.description)
    
    // 2. Check career page for visa policy
    const careerPageVisa = await extractVisaFromCareerPage(job.company)
    
    // 3. Check for EOR/payroll services
    const eorServices = await checkEORServices(job.company)
    
    return {
      type: 'visa_support',
      data: {
        description_visa: descriptionVisa,
        career_page_visa: careerPageVisa,
        eor_services: eorServices,
        visa_sponsorship: descriptionVisa.sponsorship || careerPageVisa.sponsorship,
        uses_eor: eorServices.length > 0,
      },
      verification_status: 'verified',
      confidence_score: calculateConfidence(descriptionVisa, careerPageVisa, eorServices),
    }
  }
}
```

#### 11. PriorIntelligenceCollector
```typescript
class PriorIntelligenceCollector {
  async collect(job: Job): Promise<Evidence> {
    // 1. Get previous intelligence about this company
    const companyIntel = await getCompanyIntelligence(job.company)
    
    // 2. Get previous intelligence about similar jobs
    const similarJobsIntel = await getSimilarJobsIntelligence(job)
    
    return {
      type: 'prior_intelligence',
      data: {
        company_intelligence: companyIntel,
        similar_jobs_count: similarJobsIntel.length,
        similar_jobs_africa_eligibility: similarJobsIntel.map(j => j.africa_eligibility),
        average_trust_score: companyIntel?.average_trust_score,
      },
      verification_status: 'verified',
      confidence_score: companyIntel ? 80 : 50,
    }
  }
}
```

### Evidence Collection Orchestrator

```typescript
class EvidenceCollectionOrchestrator {
  private collectors: EvidenceCollector[] = [
    new CompanyWebsiteCollector(),
    new ATSDataCollector(),
    new CareerPageCollector(),
    new DomainQualityCollector(),
    new BrokenLinksCollector(),
    new DuplicateDetectionCollector(),
    new SalaryRealismCollector(),
    new CompanyReputationCollector(),
    new HiringRegionsCollector(),
    new VisaSupportCollector(),
    new PriorIntelligenceCollector(),
  ]
  
  async collectAll(job: Job): Promise<Evidence[]> {
    const results = await Promise.allSettled(
      this.collectors.map(collector => collector.collect(job))
    )
    
    return results
      .filter((r): r is PromiseFulfilledResult<Evidence> => r.status === 'fulfilled')
      .map(r => r.value)
  }
}
```

---

## Scoring Engines

### Trust Score Engine

```typescript
class TrustScoreEngine {
  calculate(evidence: Evidence[]): TrustScore {
    const weights = {
      company_website: 20,
      ats_data: 15,
      career_page: 15,
      domain_quality: 10,
      broken_links: 10,
      duplicate_detection: 10,
      salary_realism: 10,
      company_reputation: 10,
    }
    
    let totalScore = 0
    let totalWeight = 0
    const breakdown: Record<string, number> = {}
    const reasons: string[] = []
    
    for (const [type, weight] of Object.entries(weights)) {
      const ev = evidence.find(e => e.type === type)
      if (!ev) continue
      
      const score = ev.verification_status === 'verified' ? weight :
                    ev.verification_status === 'partial' ? weight * 0.5 :
                    0
      
      breakdown[type] = score
      totalScore += score
      totalWeight += weight
      
      if (ev.verification_status === 'verified') {
        reasons.push(`${type} verified`)
      } else if (ev.verification_status === 'failed') {
        reasons.push(`${type} failed verification`)
      }
    }
    
    const trustScore = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 0
    const trustLevel = trustScore >= 80 ? 'high' :
                       trustScore >= 60 ? 'medium' :
                       trustScore >= 40 ? 'low' : 'very_low'
    
    return {
      trust_score: trustScore,
      trust_breakdown: breakdown,
      trust_reasons: reasons,
      trust_level: trustLevel,
    }
  }
}
```

### Africa Eligibility Engine

```typescript
class AfricaEligibilityEngine {
  calculate(evidence: Evidence[]): AfricaEligibility {
    const hiringRegions = evidence.find(e => e.type === 'hiring_regions')?.data
    const visaSupport = evidence.find(e => e.type === 'visa_support')?.data
    const careerPage = evidence.find(e => e.type === 'career_page')?.data
    
    // Determine eligibility
    let eligibility: 'Explicit' | 'Likely' | 'Unknown' | 'Restricted' = 'Unknown'
    const reasons: string[] = []
    const evidenceIds: string[] = []
    
    // Check for explicit Africa mentions
    if (hiringRegions?.hires_in_africa || hiringRegions?.africa_mentions?.length > 0) {
      eligibility = 'Explicit'
      reasons.push('Job explicitly mentions hiring in Africa')
      evidenceIds.push(hiringRegions.evidence_id)
    }
    // Check for remote worldwide + visa support
    else if (hiringRegions?.remote_worldwide && visaSupport?.visa_sponsorship) {
      eligibility = 'Likely'
      reasons.push('Remote worldwide with visa sponsorship')
      evidenceIds.push(hiringRegions.evidence_id, visaSupport.evidence_id)
    }
    // Check for remote worldwide + EOR
    else if (hiringRegions?.remote_worldwide && visaSupport?.uses_eor) {
      eligibility = 'Likely'
      reasons.push('Remote worldwide with EOR services')
      evidenceIds.push(hiringRegions.evidence_id, visaSupport.evidence_id)
    }
    // Check for remote worldwide only
    else if (hiringRegions?.remote_worldwide) {
      eligibility = 'Likely'
      reasons.push('Remote worldwide (visa support unknown)')
      evidenceIds.push(hiringRegions.evidence_id)
    }
    // Check for restrictions
    else if (hiringRegions?.description_regions?.some(r => 
      ['US Only', 'UK Only', 'EU Only'].includes(r)
    )) {
      eligibility = 'Restricted'
      reasons.push('Job restricted to specific regions')
      evidenceIds.push(hiringRegions.evidence_id)
    }
    
    // Calculate confidence
    const confidence = this.calculateConfidence(eligibility, evidence)
    
    return {
      africa_eligibility: eligibility,
      africa_confidence: confidence,
      africa_breakdown: {
        hiring_regions: hiringRegions ? 30 : 0,
        visa_support: visaSupport?.visa_sponsorship ? 20 : 0,
        eor_payroll: visaSupport?.uses_eor ? 15 : 0,
        career_page: careerPage ? 10 : 0,
      },
      africa_reasons: reasons,
      africa_evidence: evidenceIds,
    }
  }
  
  private calculateConfidence(eligibility: string, evidence: Evidence[]): number {
    let confidence = 50 // Base confidence
    
    // Increase confidence based on evidence quality
    const hiringRegions = evidence.find(e => e.type === 'hiring_regions')
    if (hiringRegions) {
      confidence += hiringRegions.confidence_score * 0.3
    }
    
    const visaSupport = evidence.find(e => e.type === 'visa_support')
    if (visaSupport) {
      confidence += visaSupport.confidence_score * 0.2
    }
    
    // Decrease confidence for conflicting signals
    // (e.g., says remote worldwide but also says US only)
    
    // Decrease confidence for missing information
    if (!hiringRegions) confidence -= 20
    if (!visaSupport) confidence -= 10
    
    return Math.max(0, Math.min(100, Math.round(confidence)))
  }
}
```

### Intelligence Score Engine

```typescript
class IntelligenceScoreEngine {
  calculate(trustScore: TrustScore, africaEligibility: AfricaEligibility, evidence: Evidence[]): IntelligenceScore {
    const salary = evidence.find(e => e.type === 'salary_realism')?.data
    const brokenLinks = evidence.find(e => e.type === 'broken_links')?.data
    
    const weights = {
      trust: 25,
      africa: 20,
      salary: 15,
      remote: 15,
      application_simplicity: 10,
      recency: 10,
      ai_confidence: 5,
    }
    
    const breakdown = {
      trust: trustScore.trust_score * weights.trust / 100,
      africa: this.calculateAfricaScore(africaEligibility) * weights.africa / 100,
      salary: this.calculateSalaryScore(salary) * weights.salary / 100,
      remote: this.calculateRemoteScore(evidence) * weights.remote / 100,
      application_simplicity: this.calculateApplicationSimplicity(evidence) * weights.application_simplicity / 100,
      recency: this.calculateRecencyScore(evidence) * weights.recency / 100,
      ai_confidence: this.calculateAIConfidence(evidence) * weights.ai_confidence / 100,
    }
    
    const intelligenceScore = Math.round(Object.values(breakdown).reduce((a, b) => a + b, 0))
    
    return {
      intelligence_score: intelligenceScore,
      intelligence_breakdown: breakdown,
      intelligence_reasons: this.generateReasons(breakdown),
    }
  }
  
  private calculateAfricaScore(eligibility: AfricaEligibility): number {
    const baseScores = {
      'Explicit': 100,
      'Likely': 75,
      'Unknown': 50,
      'Restricted': 0,
    }
    
    return baseScores[eligibility.africa_eligibility] * (eligibility.africa_confidence / 100)
  }
  
  private calculateSalaryScore(salary: any): number {
    if (!salary?.salary_provided) return 50 // Neutral if no salary
    if (salary.is_impossible) return 0
    if (!salary.is_realistic) return 25
    return 100
  }
  
  private calculateRemoteScore(evidence: Evidence[]): number {
    const hiringRegions = evidence.find(e => e.type === 'hiring_regions')?.data
    if (hiringRegions?.remote_worldwide) return 100
    if (hiringRegions?.description_regions?.includes('Remote')) return 75
    return 50
  }
  
  private calculateApplicationSimplicity(evidence: Evidence[]): number {
    const brokenLinks = evidence.find(e => e.type === 'broken_links')?.data
    if (!brokenLinks?.apply_url_accessible) return 0
    return 100 // Could be enhanced with application form analysis
  }
  
  private calculateRecencyScore(evidence: Evidence[]): number {
    // Based on job posted date
    // Could be enhanced with last verified date
    return 75 // Default
  }
  
  private calculateAIConfidence(evidence: Evidence[]): number {
    const priorIntel = evidence.find(e => e.type === 'prior_intelligence')?.data
    return priorIntel?.average_trust_score || 50
  }
  
  private generateReasons(breakdown: Record<string, number>): string[] {
    const reasons: string[] = []
    
    if (breakdown.trust >= 20) reasons.push('High trust score')
    if (breakdown.africa >= 15) reasons.push('Africa-friendly')
    if (breakdown.salary >= 12) reasons.push('Realistic salary')
    if (breakdown.remote >= 12) reasons.push('Remote-friendly')
    
    return reasons
  }
}
```

---

## Moderation System

### Automatic Moderation

```typescript
class JobModerationSystem {
  async moderate(job: Job, scores: JobScores, evidence: Evidence[]): Promise<ModerationResult> {
    const gates = [
      { name: 'trust_score', check: () => scores.trust_score >= 40 },
      { name: 'broken_links', check: () => evidence.find(e => e.type === 'broken_links')?.verification_status !== 'failed' },
      { name: 'duplicate', check: () => evidence.find(e => e.type === 'duplicate_detection')?.verification_status !== 'failed' },
      { name: 'salary_realism', check: () => evidence.find(e => e.type === 'salary_realism')?.data?.is_impossible !== true },
      { name: 'company_reputation', check: () => evidence.find(e => e.type === 'company_reputation')?.data?.scam_reports === 0 },
    ]
    
    const results = gates.map(gate => ({
      name: gate.name,
      passed: gate.check(),
    }))
    
    const gatesPassed = results.filter(r => r.passed).length
    const gatesFailed = results.filter(r => !r.passed)
    
    // Determine status
    let status: 'approved' | 'quarantined' | 'archived' = 'approved'
    let statusReason = ''
    
    if (gatesPassed === gates.length) {
      status = 'approved'
      statusReason = 'All quality gates passed'
    } else if (gatesPassed >= gates.length - 2) {
      status = 'quarantined'
      statusReason = `Failed ${gatesFailed.length} quality gate(s): ${gatesFailed.map(g => g.name).join(', ')}`
    } else {
      status = 'archived'
      statusReason = `Failed ${gatesFailed.length} quality gate(s): ${gatesFailed.map(g => g.name).join(', ')}`
    }
    
    // Check for flags
    const flags = {
      scam: evidence.find(e => e.type === 'company_reputation')?.data?.scam_reports > 0,
      spam: false, // Could be enhanced
      duplicate: evidence.find(e => e.type === 'duplicate_detection')?.verification_status === 'failed',
      expired: false, // Could be enhanced
      broken_link: evidence.find(e => e.type === 'broken_links')?.verification_status === 'failed',
      placeholder_company: evidence.find(e => e.type === 'company_website')?.verification_status === 'failed',
      impossible_salary: evidence.find(e => e.type === 'salary_realism')?.data?.is_impossible === true,
      low_quality: scores.trust_score < 40,
    }
    
    const flagCount = Object.values(flags).filter(f => f).length
    
    // If any critical flags, override status
    if (flags.scam || flags.duplicate || flags.broken_link) {
      status = 'archived'
      statusReason = 'Critical flag detected'
    }
    
    return {
      status,
      status_reason: statusReason,
      quality_gates: results,
      gates_passed: gatesPassed,
      gates_total: gates.length,
      gates_failed: gatesFailed,
      flags,
      flag_count: flagCount,
    }
  }
}
```

### Re-verification Scheduler

```typescript
class ReverificationScheduler {
  async scheduleReverification(job: Job, moderation: ModerationResult): Promise<Date> {
    // Determine verification interval based on status and scores
    let intervalDays = 30 // Default
    
    if (moderation.status === 'approved') {
      // High-trust jobs: verify less frequently
      if (job.trust_score >= 80) intervalDays = 60
      else if (job.trust_score >= 60) intervalDays = 45
    } else if (moderation.status === 'quarantined') {
      // Quarantined jobs: verify more frequently
      intervalDays = 7
    }
    
    const nextVerification = new Date()
    nextVerification.setDate(nextVerification.getDate() + intervalDays)
    
    return nextVerification
  }
}
```

---

## UI Integration

### Investigation-Style Display

```typescript
interface InvestigationDisplay {
  job: Job
  scores: JobScores
  evidence: Evidence[]
  investigation: Investigation
}

function JobInvestigationCard({ job, scores, evidence, investigation }: InvestigationDisplay) {
  return (
    <div className="job-card">
      <div className="job-header">
        <h3>{job.title}</h3>
        <p>{job.company}</p>
        <IntelligenceBadge score={scores.intelligence_score} />
      </div>
      
      <div className="investigation-summary">
        <h4>Investigation Summary</h4>
        <div className="evidence-grid">
          {evidence.map(ev => (
            <EvidenceCard key={ev.id} evidence={ev} />
          ))}
        </div>
      </div>
      
      <div className="scores-breakdown">
        <TrustScoreDisplay score={scores.trust_score} breakdown={scores.trust_breakdown} />
        <AfricaEligibilityDisplay eligibility={scores.africa_eligibility} confidence={scores.africa_confidence} />
        <IntelligenceScoreDisplay score={scores.intelligence_score} breakdown={scores.intelligence_breakdown} />
      </div>
      
      <div className="conclusions">
        <h4>Conclusions</h4>
        <ul>
          {investigation.conclusions.map((c, i) => (
            <li key={i}>
              <strong>{c.conclusion}</strong>
              <p>{c.reasoning}</p>
              <p className="evidence-refs">Evidence: {c.evidence_refs.join(', ')}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

### Intelligence-Based Sorting

```typescript
type SortMode = 'intelligence' | 'date' | 'trust' | 'africa'

function sortJobs(jobs: Job[], mode: SortMode): Job[] {
  switch (mode) {
    case 'intelligence':
      return jobs.sort((a, b) => (b.intelligence_score || 0) - (a.intelligence_score || 0))
    case 'date':
      return jobs.sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime())
    case 'trust':
      return jobs.sort((a, b) => (b.trust_score || 0) - (a.trust_score || 0))
    case 'africa':
      return jobs.sort((a, b) => {
        const eligibilityOrder = { 'Explicit': 4, 'Likely': 3, 'Unknown': 2, 'Restricted': 1 }
        const aScore = eligibilityOrder[a.africa_eligibility || 'Unknown']
        const bScore = eligibilityOrder[b.africa_eligibility || 'Unknown']
        if (aScore !== bScore) return bScore - aScore
        return (b.africa_confidence || 0) - (a.africa_confidence || 0)
      })
  }
}
```

---

## Implementation Plan

### Phase 1: Database Schema (Day 1)
- [ ] Create migration for new tables
- [ ] Add columns to jobs table
- [ ] Create indexes
- [ ] Test schema

### Phase 2: Evidence Collection (Days 2-3)
- [ ] Implement evidence collectors
- [ ] Build orchestrator
- [ ] Test collection pipeline
- [ ] Store evidence in database

### Phase 3: Scoring Engines (Day 4)
- [ ] Implement trust score engine
- [ ] Implement Africa eligibility engine
- [ ] Implement intelligence score engine
- [ ] Test scoring logic
- [ ] Store scores in database

### Phase 4: Moderation System (Day 5)
- [ ] Implement automatic moderation
- [ ] Build re-verification scheduler
- [ ] Test moderation logic
- [ ] Update job status

### Phase 5: UI Integration (Days 6-7)
- [ ] Build investigation-style display
- [ ] Add intelligence-based sorting
- [ ] Update job cards
- [ ] Test UI

### Phase 6: Background Jobs (Day 8)
- [ ] Create evidence collection job
- [ ] Create scoring job
- [ ] Create moderation job
- [ ] Create re-verification job
- [ ] Schedule jobs

### Phase 7: Testing & Optimization (Days 9-10)
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Load testing
- [ ] Bug fixes

---

## Success Metrics

### Before (Current System)
- Trust score: Not available
- Africa eligibility: Basic (from job description only)
- Job sorting: Date only
- Moderation: Manual
- Evidence: None stored

### After (Intelligence System)
- Trust score: 0-100 with breakdown
- Africa eligibility: Explicit/Likely/Unknown/Restricted with confidence
- Job sorting: Intelligence score (trust + Africa + salary + remote + recency)
- Moderation: Automatic with re-verification
- Evidence: 11 types stored with verification status

### Expected Improvements
- **Trust accuracy:** +60% (from evidence-based scoring)
- **Africa eligibility accuracy:** +40% (from multi-source verification)
- **Job quality:** +50% (from automatic moderation)
- **User trust:** +70% (from investigation-style display)
- **Scam detection:** +80% (from reputation checks)

---

## Conclusion

This architecture transforms Nexa from a static AI extractor into a true job intelligence system that:

1. **Verifies** every job against 11 evidence sources
2. **Scores** jobs using evidence-based trust, Africa eligibility, and intelligence scores
3. **Moderates** jobs automatically through quality gates and re-verification
4. **Explains** every decision with investigation-style evidence trails

The system is designed to be:
- **Transparent:** Every score and decision is explainable
- **Verifiable:** Every claim is backed by evidence
- **Continuous:** Jobs are re-verified over time
- **Scalable:** Modular collectors can run in parallel
- **Maintainable:** Clear separation of concerns

**Next Steps:**
1. Review and approve architecture
2. Begin Phase 1 implementation (database schema)
3. Iterate through phases 2-7
4. Deploy to preview for testing
5. Merge to production after validation
