# Nexa Africa Intelligence System

An evidence-based job intelligence system that verifies job legitimacy, determines Africa eligibility, and provides transparent scoring.

## Overview

The Intelligence System transforms Nexa from a static job board into a verified job intelligence platform by:

1. **Collecting evidence** from multiple sources (company websites, ATS systems, career pages, domain quality, etc.)
2. **Verifying job legitimacy** through cross-referencing and validation
3. **Determining Africa eligibility** using explicit mentions, global/remote indicators, and restriction detection
4. **Calculating transparent scores** with detailed breakdowns and reasoning
5. **Providing investigation-style transparency** showing all evidence and verification steps

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Intelligence Orchestrator                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Evidence    │  │   Scoring    │  │   Storage    │     │
│  │  Collectors  │──│   Engines    │──│   Layer      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  Collectors:              Engines:              Storage:    │
│  - Company Website        - Trust Score         - Evidence  │
│  - ATS Data               - Africa Eligibility  - Scores    │
│  - Career Page            - Intelligence Score  - Jobs      │
│  - Domain Quality                                       │
│  - Broken Links                                         │
│  - Duplicate Detection                                  │
│  - Salary Realism                                       │
│  - Company Reputation                                   │
└─────────────────────────────────────────────────────────────┘
```

## Evidence Collectors

### 1. Company Website Collector
- Verifies company website exists and is accessible
- Checks for job mentions on website
- Validates SSL certificate and domain age
- **Confidence factors**: Website accessibility, SSL validity, job mentions, domain age

### 2. ATS Data Collector
- Cross-references job with ATS systems (Greenhouse, Lever, Ashby, etc.)
- Verifies job exists in ATS database
- Checks for consistency between job posting and ATS data
- **Confidence factors**: ATS match, data consistency, source reliability

### 3. Career Page Collector
- Locates and verifies company career page
- Checks if job is listed on career page
- Extracts additional information (hiring regions, remote work policies)
- **Confidence factors**: Career page accessibility, job listing, company mentions

### 4. Domain Quality Collector
- Analyzes domain reputation and quality
- Checks for suspicious patterns (excessive hyphens, numbers, suspicious TLDs)
- Verifies SSL certificate
- Checks domain age
- **Confidence factors**: Domain age, SSL validity, reputation, suspicious patterns

### 5. Broken Links Collector
- Checks if apply URL is accessible
- Verifies company website links
- Detects broken or inaccessible links
- **Confidence factors**: Link accessibility, HTTP status codes

### 6. Duplicate Detection Collector
- Searches for duplicate job postings
- Uses fuzzy matching on title, company, and apply URL
- Identifies potential reposts or duplicates
- **Confidence factors**: Similarity scores, match reasons

### 7. Salary Realism Collector
- Validates salary range against market data
- Checks for unrealistic salaries (too high or too low)
- Considers role level and location
- **Confidence factors**: Salary range validity, market alignment

### 8. Company Reputation Collector
- Checks company reputation and legitimacy
- Searches for scam reports, complaints, and red flags
- Verifies company registration (simulated - would use real registries in production)
- Analyzes online reviews and ratings (simulated - would use Glassdoor, Indeed, etc. in production)
- **Confidence factors**: No red flags (+30), registration verified (+15), positive reviews (+10)
- **Red flags**: Scam reports, fraud allegations, lawsuits, negative reviews
- **Note**: Currently uses simulated data for registration and reviews. In production, integrate with:
  - Companies House (UK), SEC EDGAR (US) for registration
  - Glassdoor, Indeed, Google Reviews for ratings
  - Better Business Bureau, ScamAdviser for scam reports

## Scoring Engines

### Trust Score Engine
Calculates overall trust score (0-100%) based on evidence verification.

**Weights:**
- Company Website: 15%
- ATS Data: 20%
- Career Page: 15%
- Domain Quality: 10%
- Broken Links: 10%
- Duplicate Detection: 15%
- Salary Realism: 10%
- Company Reputation: 5%

**Levels:**
- **High** (80-100%): Strong evidence, well-verified
- **Medium** (60-79%): Good evidence, mostly verified
- **Low** (40-59%): Limited evidence, some concerns
- **Very Low** (0-39%): Poor evidence, significant concerns

### Africa Eligibility Engine
Determines if job is open to African candidates.

**Levels:**
- **Explicit**: Job explicitly mentions Africa or African countries
  - Keywords: "africa", "nigeria", "kenya", "south africa", "ghana", etc.
  - Confidence: 70-100%

- **Likely**: Global/EMEA role or remote work indicated
  - Keywords: "emea", "global", "worldwide", "remote worldwide", "international"
  - Confidence: 60-90%

- **Unknown**: No clear indication
  - No explicit mentions or restrictions
  - Confidence: 30-50%

- **Restricted**: Location restrictions detected
  - Keywords: "us only", "uk only", "must be located in", "us work authorization required"
  - Confidence: 70-100%

### Intelligence Score Engine
Calculates overall intelligence score combining all factors.

**Weights:**
- Trust Score: 40%
- Eligibility: 30%
- Evidence Quality: 20%
- Completeness: 10%

**Levels:**
- **Excellent** (80-100%): High trust, clear eligibility, comprehensive evidence
- **Good** (60-79%): Good trust, likely eligible, good evidence
- **Fair** (40-59%): Moderate trust, unknown eligibility, limited evidence
- **Poor** (0-39%): Low trust, restricted or unclear, poor evidence

## Database Schema

### job_evidence
Stores raw evidence from collectors.

```sql
CREATE TABLE job_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  
  -- Evidence metadata
  evidence_type TEXT NOT NULL, -- 'company_website', 'ats_data', etc.
  source_url TEXT,
  source_name TEXT,
  
  -- Evidence content
  evidence_data JSONB NOT NULL, -- Raw evidence data
  evidence_summary TEXT, -- Human-readable summary
  
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

-- Indexes for performance
CREATE INDEX idx_job_evidence_job_id ON job_evidence(job_id);
CREATE INDEX idx_job_evidence_type ON job_evidence(evidence_type);
CREATE INDEX idx_job_evidence_status ON job_evidence(verification_status);
CREATE INDEX idx_job_evidence_stale ON job_evidence(is_stale) WHERE is_stale = TRUE;
CREATE INDEX idx_job_evidence_collected_at ON job_evidence(collected_at DESC);
```

### job_scores
Stores calculated scores.

```sql
CREATE TABLE job_scores (
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
  
  -- AI Confidence (for future ML integration)
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

-- Indexes for performance
CREATE INDEX idx_job_scores_job_id ON job_scores(job_id);
CREATE INDEX idx_job_scores_trust ON job_scores(trust_score DESC) WHERE trust_score IS NOT NULL;
CREATE INDEX idx_job_scores_africa ON job_scores(africa_eligibility, africa_confidence DESC) WHERE africa_eligibility IS NOT NULL;
CREATE INDEX idx_job_scores_intelligence ON job_scores(intelligence_score DESC) WHERE intelligence_score IS NOT NULL;
CREATE INDEX idx_job_scores_stale ON job_scores(is_stale) WHERE is_stale = TRUE;
```

### job_moderation
Stores moderation status and history for automated quality control.

```sql
CREATE TABLE job_moderation (
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

-- Indexes for performance
CREATE INDEX idx_job_moderation_job_id ON job_moderation(job_id);
CREATE INDEX idx_job_moderation_status ON job_moderation(status);
CREATE INDEX idx_job_moderation_next_verification ON job_moderation(next_verification_at) WHERE status != 'deleted' AND next_verification_at IS NOT NULL;
CREATE INDEX idx_job_moderation_flags ON job_moderation(flag_count) WHERE flag_count > 0;
```

### job_investigations
Stores investigation trails for audit and transparency.

```sql
CREATE TABLE job_investigations (
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

-- Indexes for performance
CREATE INDEX idx_job_investigations_job_id ON job_investigations(job_id);
CREATE INDEX idx_job_investigations_type ON job_investigations(investigation_type);
CREATE INDEX idx_job_investigations_created ON job_investigations(created_at DESC);
```

### job_intelligence_summary (View)
Quick summary view for job listings.

```sql
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
```

### Updated jobs table
```sql
ALTER TABLE jobs 
  ADD COLUMN IF NOT EXISTS trust_score INTEGER CHECK (trust_score >= 0 AND trust_score <= 100),
  ADD COLUMN IF NOT EXISTS africa_eligibility TEXT CHECK (africa_eligibility IN ('Explicit', 'Likely', 'Unknown', 'Restricted')),
  ADD COLUMN IF NOT EXISTS africa_confidence INTEGER CHECK (africa_confidence >= 0 AND africa_confidence <= 100),
  ADD COLUMN IF NOT EXISTS intelligence_score INTEGER CHECK (intelligence_score >= 0 AND intelligence_score <= 100),
  ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'quarantined', 'archived', 'deleted')),
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_verification_at TIMESTAMPTZ;

-- Indexes for performance
CREATE INDEX idx_jobs_trust_score ON jobs(trust_score DESC) WHERE moderation_status = 'approved' AND trust_score IS NOT NULL;
CREATE INDEX idx_jobs_africa_eligibility ON jobs(africa_eligibility, africa_confidence DESC) WHERE moderation_status = 'approved' AND africa_eligibility IS NOT NULL;
CREATE INDEX idx_jobs_intelligence_score ON jobs(intelligence_score DESC) WHERE moderation_status = 'approved' AND intelligence_score IS NOT NULL;
CREATE INDEX idx_jobs_moderation_status ON jobs(moderation_status);
CREATE INDEX idx_jobs_next_verification ON jobs(next_verification_at) WHERE moderation_status != 'deleted' AND next_verification_at IS NOT NULL;
```

## API Endpoints

### POST /api/intelligence/analyze
Analyze a single job.

**Request:**
```json
{
  "job_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "job_id": "uuid",
  "evidence_count": 8,
  "trust_score": {
    "score": 85,
    "level": "high",
    "breakdown": {...},
    "reasons": [...]
  },
  "eligibility": {
    "level": "Likely",
    "confidence": 75,
    "evidence": [...],
    "reasons": [...]
  },
  "intelligence_score": {
    "score": 78,
    "level": "good",
    "trust_score": 85,
    "eligibility_level": "Likely",
    "eligibility_confidence": 75,
    "evidence_quality": 80,
    "completeness": 70,
    "reasons": [...]
  },
  "errors": []
}
```

### GET /api/intelligence/analyze?job_id=uuid
Get existing intelligence for a job.

**Response:**
```json
{
  "job_id": "uuid",
  "scores": {...},
  "evidence": [...]
}
```

### POST /api/intelligence/batch
Analyze multiple jobs in batch.

**Request:**
```json
{
  "job_ids": ["uuid1", "uuid2", ...],
  "concurrency": 5
}
```

**Response:**
```json
{
  "success": true,
  "total_jobs": 10,
  "successful": 10,
  "failed": 0,
  "summary": {
    "avg_trust_score": 75,
    "avg_intelligence_score": 70,
    "eligibility_breakdown": {
      "Explicit": 3,
      "Likely": 5,
      "Unknown": 2,
      "Restricted": 0
    }
  },
  "results": [...]
}
```

## UI Components

### IntelligenceBadge
Displays intelligence scores with tooltips.

```tsx
<IntelligenceBadge
  trustScore={85}
  trustLevel="high"
  eligibility="Likely"
  eligibilityConfidence={75}
  intelligenceScore={78}
  intelligenceLevel="good"
  showDetails={false}
/>
```

## Usage Examples

### Analyze a single job
```typescript
const orchestrator = new IntelligenceOrchestrator()
const result = await orchestrator.analyze(job)

console.log('Trust Score:', result.trust_score.score)
console.log('Eligibility:', result.eligibility.level)
console.log('Intelligence:', result.intelligence_score.score)
```

### Batch analyze jobs
```typescript
const orchestrator = new IntelligenceOrchestrator()
const results = await orchestrator.analyzeBatch(jobs, 5)

console.log('Analyzed:', results.length, 'jobs')
console.log('Average trust:', results.reduce((sum, r) => sum + r.trust_score.score, 0) / results.length)
```

### Fetch existing intelligence
```typescript
const supabase = createClient(...)
const { data: scores } = await supabase
  .from('job_scores')
  .select('*')
  .eq('job_id', jobId)
  .single()

console.log('Trust:', scores.trust_score)
console.log('Eligibility:', scores.africa_eligibility)
```

## Moderation Rules

### Auto-quarantine
Jobs are automatically quarantined if:
- Trust score < 40%
- Multiple broken links
- Duplicate detection > 90% similarity
- Salary unrealistic (too high or too low)
- Suspicious domain patterns

### Auto-archive
Jobs are automatically archived if:
- Trust score < 20%
- Company website doesn't exist
- ATS data not found
- Multiple red flags detected

### Manual review required
Jobs require manual review if:
- Trust score 40-60%
- Eligibility "Unknown" with low confidence
- Mixed evidence (some verified, some failed)

## Performance Considerations

### Batch Processing
- Process jobs in batches of 5-10 for optimal performance
- Use concurrency control to avoid overwhelming external APIs
- Implement rate limiting for ATS API calls

### Caching
- Cache evidence for 24 hours to avoid redundant API calls
- Cache scores until job is updated
- Use Redis for distributed caching in production

### Database Optimization
- Index `job_evidence` on `(job_id, evidence_type)`
- Index `job_scores` on `job_id`
- Index `jobs` on `(intelligence_score, is_active)`

## Security Considerations

### API Rate Limiting
- Rate limit intelligence analysis endpoints
- Implement request throttling for batch operations
- Use API keys for external services

### Data Privacy
- Don't store sensitive company information
- Redact personal information from evidence
- Comply with GDPR and data protection regulations

### Input Validation
- Validate job IDs before processing
- Sanitize URLs before fetching
- Validate evidence data structure

## Future Enhancements

### Additional Collectors
- **Social Media**: Check company social media presence
- **News**: Monitor news for company updates
- **Reviews**: Aggregate employee reviews (Glassdoor, Indeed)
- **Financial**: Check company financial health (for public companies)

### Machine Learning
- Train ML models to predict job legitimacy
- Use NLP to extract eligibility from job descriptions
- Implement anomaly detection for suspicious jobs

### Real-time Updates
- Monitor jobs for changes (salary updates, status changes)
- Re-analyze jobs when evidence expires
- Send alerts for significant changes

### User Feedback
- Allow users to report suspicious jobs
- Incorporate user feedback into scoring
- Build community-driven verification

## Troubleshooting

### Common Issues

**Issue**: Low trust scores for legitimate jobs
**Solution**: Check if collectors are failing due to network issues or API limits

**Issue**: Eligibility "Unknown" for global roles
**Solution**: Add more keywords to LIKELY_KEYWORDS list

**Issue**: Slow batch processing
**Solution**: Reduce concurrency or implement better caching

**Issue**: Database errors
**Solution**: Check indexes and run ANALYZE on tables

### Debugging

Enable debug logging:
```typescript
const orchestrator = new IntelligenceOrchestrator({ debug: true })
```

Check evidence collection:
```sql
SELECT evidence_type, verification_status, confidence_score
FROM job_evidence
WHERE job_id = 'uuid'
ORDER BY collected_at DESC;
```

Check score calculation:
```sql
SELECT * FROM job_scores WHERE job_id = 'uuid';
```

## Contributing

### Adding a New Collector

1. Create collector class extending `BaseEvidenceCollector`
2. Implement `collect(job: Job)` method
3. Add to `COLLECTOR_REGISTRY` in `collectors/index.ts`
4. Add weight to `TrustScoreEngine.WEIGHTS`
5. Update documentation

### Adding a New Eligibility Keyword

1. Add keyword to appropriate list in `AfricaEligibilityEngine`
2. Test with sample job descriptions
3. Update documentation

### Adjusting Scoring Weights

1. Modify weights in scoring engines
2. Test with sample jobs
3. Validate scores make sense
4. Update documentation

## License

MIT

## Support

For issues or questions:
- Open an issue on GitHub
- Contact the development team
- Check the troubleshooting section above
