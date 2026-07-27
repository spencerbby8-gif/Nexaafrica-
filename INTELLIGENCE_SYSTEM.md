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
- Looks for red flags (scam reports, complaints)
- Verifies company registration and history
- **Confidence factors**: Reputation score, red flags, verification status

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
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  evidence_type TEXT, -- 'company_website', 'ats_data', etc.
  verification_status TEXT, -- 'verified', 'failed', 'pending', 'partial'
  confidence_score INTEGER, -- 0-100
  evidence_data JSONB, -- Raw evidence data
  evidence_summary TEXT, -- Human-readable summary
  source_url TEXT,
  source_name TEXT,
  collected_at TIMESTAMPTZ,
  verification_details JSONB
);
```

### job_scores
Stores calculated scores.

```sql
CREATE TABLE job_scores (
  id UUID PRIMARY KEY,
  job_id UUID UNIQUE REFERENCES jobs(id),
  trust_score INTEGER, -- 0-100
  trust_level TEXT, -- 'high', 'medium', 'low', 'very_low'
  trust_breakdown JSONB,
  trust_reasons JSONB,
  africa_eligibility TEXT, -- 'Explicit', 'Likely', 'Unknown', 'Restricted'
  africa_confidence INTEGER, -- 0-100
  africa_evidence JSONB,
  africa_reasons JSONB,
  intelligence_score INTEGER, -- 0-100
  intelligence_level TEXT, -- 'excellent', 'good', 'fair', 'poor'
  evidence_quality INTEGER, -- 0-100
  completeness INTEGER, -- 0-100
  intelligence_reasons JSONB,
  calculated_at TIMESTAMPTZ
);
```

### Updated jobs table
```sql
ALTER TABLE jobs ADD COLUMN intelligence_score INTEGER;
ALTER TABLE jobs ADD COLUMN trust_score INTEGER;
ALTER TABLE jobs ADD COLUMN africa_eligibility TEXT;
ALTER TABLE jobs ADD COLUMN africa_confidence INTEGER;
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
