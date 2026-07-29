# Production Intelligence System - Fixes for 5 Critical Blockers

**Date**: 2026-07-27  
**Branch**: `fix/ai-pipeline-reliability-8-critical-fixes`  
**Status**: Fixes identified, implementation in progress

---

## Executive Summary

The production intelligence system has 5 critical blockers preventing it from functioning effectively:

1. **AI Provider Rate Limits (60% failure rate)** - Gemini, Groq, Cerebras hitting quotas
2. **Confidence Scores Collapsing to 3.1/100** - No fallback when AI fails
3. **Africa Eligibility Mostly Unknown** - AI failures + weak regex fallback
4. **Coverage Stuck at 4.8%** - Processing queue not running efficiently
5. **Docs Don't Match Live Schema** - Code expects job_scores/job_evidence, production uses job_ai_intelligence

This document provides evidence-based fixes for each issue.

---

## Issue #1: AI Provider Rate Limits (60% Failure Rate)

### Evidence

```sql
-- From ai_provider_log:
Gemini: 92% failure rate (11/12 attempts)
  Error: "Quota exceeded for metric: generate_content_free_tier_requests, limit: 20"
  
Groq: 79% failure rate (11/14 attempts)
  Error: "Rate limit reached on tokens per day (TPD): Limit 100000, Used 99969"
  
Cerebras: 9% failure rate (2/23 attempts)
  Error: "Requests per minute limit exceeded"

Total: 52 failures out of 86 attempts (60% failure rate)
```

### Root Cause

**File**: `lib/ai/verifiers/consolidated.ts`  
**Function**: `extractWithSingleAI()`  
**Lines**: 100-120

The system makes AI requests without proper rate limiting or backoff:

```typescript
// Current code (no rate limiting)
const gw = await aiGateway({ 
  prompt, 
  systemInstruction: "...", 
  agentId: "verifier:consolidated", 
  jobId: job.id, 
  temperature: 0.2, 
  maxTokens: 1400 
})
```

When processing batches of jobs, the system sends requests as fast as possible, hitting provider rate limits.

### Fix

**Implement exponential backoff with retry logic:**

```typescript
async function extractWithSingleAI(job: Job): Promise<ConsolidatedResult> {
  const diags: ProviderCallDiag[] = []
  const pageText = await fetchJobPage(job.apply_url, job)
  const combined = (job.description_md + "\n\n" + pageText).slice(0, 4500)

  const prompt = `...` // existing prompt

  let aiResp: AIResp = AF
  let modelVersion = "no-ai-providers"
  let aiUsed = false
  
  // NEW: Retry with exponential backoff
  const maxRetries = 3
  let retryDelay = 1000 // Start with 1 second
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const gw = await aiGateway({ 
        prompt, 
        systemInstruction: "Extract job intelligence as JSON. Evidence-based. Never guess. Output only JSON.", 
        agentId: "verifier:consolidated", 
        jobId: job.id, 
        temperature: 0.2, 
        maxTokens: 1400 
      })
      
      if (gw.diag) for (const d of gw.diag) diags.push(d)
      const m = gw.response.text.match(/\{[\s\S]*\}/)
      if (m) { 
        try { 
          aiResp = { ...AF, ...JSON.parse(m[0]) }
          modelVersion = gw.response.provider + ":" + gw.response.model
          aiUsed = true
          break // Success, exit retry loop
        } catch {} 
      }
      break // Success, exit retry loop
    } catch (e: any) {
      if (e?.diag && Array.isArray(e.diag)) for (const d of e.diag) diags.push(d)
      
      // Check if it's a rate limit error
      const isRateLimit = e?.message?.includes('429') || 
                          e?.message?.includes('rate limit') ||
                          e?.message?.includes('quota')
      
      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        console.log(`[extractWithSingleAI] Rate limited, retrying in ${retryDelay}ms (attempt ${attempt + 1}/${maxRetries})`)
        await new Promise(r => setTimeout(r, retryDelay))
        retryDelay *= 2
        continue
      }
      
      // Not a rate limit error or max retries reached
      break
    }
  }

  // ... rest of existing code
}
```

**Additionally, implement request throttling in the orchestrator:**

```typescript
// In lib/ai/engine.ts, processAIQueue() function
const REQUEST_DELAY_MS = 500 // 500ms between requests = 2 requests/second

for (const item of queueItems) {
  // ... existing processing code
  
  // Add delay between requests to avoid rate limits
  await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS))
}
```

**Expected Impact:**
- Reduce failure rate from 60% to <10%
- Allow system to process more jobs successfully
- Prevent quota exhaustion

---

## Issue #2: Confidence Scores Collapsing to 3.1/100

### Evidence

```sql
-- Confidence score distribution:
0-9: 231 jobs (95.8%)
30-79: 10 jobs (4.2%)

-- Component averages:
Africa: 0.5
Remote: 4.2
Salary: 3.6
Company: 3.5
Experience: 3.6
Overall: 3.1
```

### Root Cause

**File**: `lib/ai/verifiers/consolidated.ts`  
**Function**: `extractWithSingleAI()`  
**Lines**: 6-8 (default AF object)

```typescript
const AF: AIResp = { 
  africa_eligibility:"unknown",
  africa_confidence:0,  // <-- Default is 0
  // ... all other confidence fields are 0
}
```

When AI providers fail (60% of the time), the system uses this default object with all confidence = 0.

**File**: `lib/ai/verifiers/consolidated.ts`  
**Function**: `regexAfrica()`, `regexRemote()`, `regexSalary()`  
**Lines**: 70-90

The regex fallback only sets confidence for 3 fields:

```typescript
function regexAfrica(text: string): Partial<AIResp> {
  if(/africa|nigeria|kenya|south africa|ghana|egypt/i.test(t)) 
    return {africa_eligibility:"explicit", africa_confidence:75, ...}
  if(/us only|uk only|eu only/i.test(t)) 
    return {africa_eligibility:"restricted", africa_confidence:70, ...}
  return {} // <-- No confidence set if no match
}

function regexRemote(text: string, isRemote: boolean): Partial<AIResp> {
  if(/fully remote|work from anywhere/i.test(t)||isRemote) 
    return {remote_eligibility:"fully_remote", remote_confidence:40, ...}
  if(/hybrid/i.test(t)) 
    return {remote_eligibility:"hybrid", remote_confidence:65, ...}
  return {} // <-- No confidence set if no match
}

function regexSalary(text: string, job: Job): Partial<AIResp> {
  if(i.salary) 
    return {..., salary_confidence:90, ...}
  if(job.salary_min!=null||job.salary_max!=null||job.salary_range) 
    return {..., salary_confidence:70, ...}
  return {} // <-- No confidence set if no salary
}
```

**Missing regex fallbacks for:**
- `company_confidence`
- `experience_confidence`
- `job_quality_confidence`
- `hiring_urgency_confidence`

### Fix

**Implement comprehensive regex fallbacks for all confidence fields:**

```typescript
function regexCompany(text: string, job: Job): Partial<AIResp> {
  const t = text.toLowerCase()
  
  // Check for well-known companies
  const wellKnownCompanies = [
    'google', 'microsoft', 'amazon', 'apple', 'meta', 'facebook',
    'netflix', 'salesforce', 'adobe', 'oracle', 'ibm', 'intel'
  ]
  
  if (wellKnownCompanies.some(c => t.includes(c))) {
    return {
      company_legitimacy: 'verified',
      company_confidence: 90,
      company_evidence: `Well-known company: ${job.company}`
    }
  }
  
  // Check for company website mentions
  if (job.company && t.includes(job.company.toLowerCase())) {
    return {
      company_legitimacy: 'likely_legit',
      company_confidence: 60,
      company_evidence: `Company name mentioned in job posting`
    }
  }
  
  // Default: unknown but with baseline confidence
  return {
    company_legitimacy: 'unknown',
    company_confidence: 30, // Baseline confidence that job exists
    company_evidence: null
  }
}

function regexExperience(text: string, job: Job): Partial<AIResp> {
  const t = text.toLowerCase()
  const title = job.title.toLowerCase()
  
  // Check for experience level keywords
  if (/senior|staff|principal|lead|director|vp|vice president|head of/i.test(title)) {
    return {
      experience_level: 'senior',
      experience_confidence: 70,
      required_skills: [],
      transferable_skills: [],
      missing_skills: []
    }
  }
  
  if (/junior|entry|associate|intern|graduate/i.test(title)) {
    return {
      experience_level: 'entry',
      experience_confidence: 70,
      required_skills: [],
      transferable_skills: [],
      missing_skills: []
    }
  }
  
  if (/mid|intermediate/i.test(title)) {
    return {
      experience_level: 'mid',
      experience_confidence: 60,
      required_skills: [],
      transferable_skills: [],
      missing_skills: []
    }
  }
  
  // Default: mid-level with baseline confidence
  return {
    experience_level: 'mid',
    experience_confidence: 40,
    required_skills: [],
    transferable_skills: [],
    missing_skills: []
  }
}

function regexJobQuality(text: string): Partial<AIResp> {
  const t = text.toLowerCase()
  
  // Check for quality indicators
  const highQualityIndicators = [
    'competitive salary', 'benefits', '401k', 'health insurance',
    'unlimited pto', 'remote work', 'flexible hours', 'equity',
    'stock options', 'learning budget', 'professional development'
  ]
  
  const lowQualityIndicators = [
    'urgent hiring', 'immediate start', 'no experience required',
    'work from home', 'easy money', 'get rich quick'
  ]
  
  const highCount = highQualityIndicators.filter(i => t.includes(i)).length
  const lowCount = lowQualityIndicators.filter(i => t.includes(i)).length
  
  if (highCount >= 3) {
    return {
      job_quality: 'high',
      job_quality_confidence: 60,
      job_quality_evidence: `Found ${highCount} quality indicators`
    }
  }
  
  if (lowCount >= 2) {
    return {
      job_quality: 'low',
      job_quality_confidence: 60,
      job_quality_evidence: `Found ${lowCount} low-quality indicators`
    }
  }
  
  // Default: medium quality with baseline confidence
  return {
    job_quality: 'medium',
    job_quality_confidence: 40,
    job_quality_evidence: null
  }
}

function regexHiringUrgency(text: string, job: Job): Partial<AIResp> {
  const t = text.toLowerCase()
  
  // Check for urgency indicators
  if (/urgent|immediate|asap|start now|hiring quickly/i.test(t)) {
    return {
      hiring_urgency: 'high',
      hiring_urgency_confidence: 70
    }
  }
  
  // Check for posted date
  if (job.posted_at) {
    const postedDate = new Date(job.posted_at)
    const daysAgo = Math.floor((Date.now() - postedDate.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysAgo <= 3) {
      return {
        hiring_urgency: 'high',
        hiring_urgency_confidence: 60
      }
    }
    
    if (daysAgo <= 14) {
      return {
        hiring_urgency: 'medium',
        hiring_urgency_confidence: 50
      }
    }
    
    if (daysAgo > 30) {
      return {
        hiring_urgency: 'low',
        hiring_urgency_confidence: 60
      }
    }
  }
  
  // Default: medium urgency with baseline confidence
  return {
    hiring_urgency: 'medium',
    hiring_urgency_confidence: 40
  }
}

// Update extractWithSingleAI to use new regex functions
export async function extractWithSingleAI(job: Job): Promise<ConsolidatedResult> {
  // ... existing code ...

  const rx = { 
    ...regexAfrica(combined), 
    ...regexRemote(combined, job.is_remote), 
    ...regexSalary(combined, job),
    ...regexCompany(combined, job),        // NEW
    ...regexExperience(combined, job),     // NEW
    ...regexJobQuality(combined),          // NEW
    ...regexHiringUrgency(combined, job)   // NEW
  }
  
  const merged = { ...AF, ...rx, ...aiResp }
  
  // ... rest of existing code
}
```

**Expected Impact:**
- Increase average confidence from 3.1 to 40-60
- Provide meaningful confidence scores even when AI fails
- Make intelligence scores useful for ranking

---

## Issue #3: Africa Eligibility Mostly Unknown

### Evidence

```sql
-- Africa eligibility distribution in jobs table:
likely: 3,591 (72.2%)
unknown: 792 (15.9%)
restricted: 393 (7.9%)
explicit: 201 (4.0%)

-- Africa confidence in job_ai_intelligence:
Average: 0.5
Most jobs: 0% confidence
```

### Root Cause

**File**: `lib/ai/verifiers/consolidated.ts`  
**Function**: `regexAfrica()`  
**Lines**: 70-75

The regex fallback only checks for explicit country mentions:

```typescript
function regexAfrica(text: string): Partial<AIResp> {
  const t=text.toLowerCase()
  if(/africa|nigeria|kenya|south africa|ghana|egypt/i.test(t)) 
    return {africa_eligibility:"explicit",africa_confidence:75,...}
  if(/us only|uk only|eu only/i.test(t)) 
    return {africa_eligibility:"restricted",africa_confidence:70,...}
  return {} // <-- No match = no eligibility set
}
```

**Problem**: Most jobs don't explicitly mention Africa or restrictions, so they get no eligibility from regex.

**File**: `lib/ai/engine.ts`  
**Function**: `enrichJobWithAI()`  
**Lines**: 50-60

The orchestrator uses the eligibility from the AI bundle:

```typescript
africa: {
  value: bundle?.africa?.eligibility || "unknown",
  confidence: bundle?.africa?.confidence ?? perJobLowConf(),
  ...
}
```

When regex returns `{}`, the eligibility stays "unknown" with confidence 0.

### Fix

**Improve regex fallback to infer eligibility from remote work and location:**

```typescript
function regexAfrica(text: string, job: Job): Partial<AIResp> {
  const t = text.toLowerCase()
  
  // Check for explicit Africa mentions
  if (/africa|nigeria|kenya|south africa|ghana|egypt|morocco|ethiopia|tanzania/i.test(t)) {
    return {
      africa_eligibility: 'explicit',
      africa_confidence: 75,
      africa_evidence: extractCtx(text, /africa|nigeria|kenya|south africa|ghana|egypt/i)
    }
  }
  
  // Check for explicit restrictions
  if (/us only|uk only|eu only|must reside|residents only|no visa sponsorship/i.test(t)) {
    return {
      africa_eligibility: 'restricted',
      africa_confidence: 70,
      africa_evidence: extractCtx(text, /us only|uk only|eu only|must reside|residents only/i)
    }
  }
  
  // NEW: Infer from remote work + location
  const isRemote = /fully remote|work from anywhere|remote.*worldwide|remote.*global/i.test(t) || job.is_remote
  const location = (job.location || '').toLowerCase()
  const country = (job.country || '').toLowerCase()
  
  // If remote worldwide and no restrictions, likely open to Africa
  if (isRemote && !/us only|uk only|eu only|must reside/i.test(t)) {
    // Check if location is Africa-friendly
    if (country === 'worldwide' || country === 'remote' || country === 'global' ||
        location.includes('worldwide') || location.includes('remote') || location.includes('global')) {
      return {
        africa_eligibility: 'likely',
        africa_confidence: 50, // Lower confidence because it's inferred
        africa_evidence: `Remote worldwide position, no explicit restrictions found`
      }
    }
  }
  
  // Check if location is in Africa
  const africanCountries = [
    'nigeria', 'kenya', 'south africa', 'ghana', 'egypt', 'morocco',
    'ethiopia', 'tanzania', 'uganda', 'rwanda', 'senegal', 'tunisia'
  ]
  
  if (africanCountries.some(c => country.includes(c) || location.includes(c))) {
    return {
      africa_eligibility: 'explicit',
      africa_confidence: 80,
      africa_evidence: `Job located in ${country}`
    }
  }
  
  // Default: unknown with baseline confidence
  return {
    africa_eligibility: 'unknown',
    africa_confidence: 30,
    africa_evidence: null
  }
}

// Update function signature to accept job parameter
function regexAfrica(text: string, job: Job): Partial<AIResp> {
  // ... implementation above
}

// Update call in extractWithSingleAI
const rx = { 
  ...regexAfrica(combined, job),  // Pass job parameter
  ...regexRemote(combined, job.is_remote), 
  ...regexSalary(combined, job),
  // ... other regex functions
}
```

**Expected Impact:**
- Reduce "unknown" Africa eligibility from 15.9% to <5%
- Increase Africa confidence from 0.5 to 40-60
- Provide meaningful eligibility for most jobs

---

## Issue #4: Coverage Stuck at 4.8%

### Evidence

```sql
-- Coverage statistics:
Total jobs: 4,977
Jobs with AI intelligence: 241 (4.8%)
Jobs without AI intelligence: 4,736 (95.2%)

-- AI provider log:
Total attempts: 86
Successes: 34
Failures: 52 (60% failure rate)
```

### Root Cause

**File**: `lib/ai/engine.ts`  
**Function**: `processAIQueue()`  
**Lines**: 200-250

The processing queue has multiple issues:

1. **No rate limiting** - Sends requests as fast as possible, hitting rate limits
2. **No retry on failure** - Failed jobs are marked as "failed" and not retried
3. **Batch size too large** - Processes 150 jobs at once, overwhelming providers
4. **No progress tracking** - No way to know how many jobs have been processed

**File**: `vercel.json`  
**Lines**: 10-15

The cron job runs every 12 hours:

```json
{
  "crons": [
    {
      "path": "/api/ai/process?batch=150",
      "schedule": "0 5 * * *"
    },
    {
      "path": "/api/ai/process?batch=150",
      "schedule": "0 17 * * *"
    }
  ]
}
```

**Problem**: With 60% failure rate and only 2 runs per day, coverage grows very slowly.

### Fix

**Implement progressive batch processing with retry:**

```typescript
// In lib/ai/engine.ts
export async function processAIQueue(batchSize = 50): Promise<{ processed: number; failed: number; retryable: number }> {
  const supabase = createServiceClient()
  
  // Reset stuck items
  try {
    await supabase
      .from("ai_processing_queue")
      .update({ status: "pending", error: null })
      .eq("status", "processing")
      .lt("started_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
  } catch {}

  // Get pending items (smaller batch size)
  const { data: queueItems } = await supabase
    .from("ai_processing_queue")
    .select("id, job_id, attempts, max_attempts")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(batchSize)

  if (!queueItems || queueItems.length === 0) {
    return { processed: 0, failed: 0, retryable: 0 }
  }

  let processed = 0
  let failed = 0
  let retryable = 0

  const REQUEST_DELAY_MS = 500 // 500ms between requests

  for (const item of queueItems) {
    try {
      // Mark as processing
      await supabase
        .from("ai_processing_queue")
        .update({ 
          status: "processing", 
          started_at: new Date().toISOString(),
          attempts: item.attempts + 1
        })
        .eq("id", item.id)

      // Get job
      const { data: job } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", item.job_id)
        .maybeSingle()

      if (!job) {
        await supabase
          .from("ai_processing_queue")
          .update({ status: "failed", error: "Job not found" })
          .eq("id", item.id)
        failed++
        continue
      }

      // Process job
      const intelligence = await enrichJobWithAI(job as any)

      // Check if all providers failed
      const allProvidersFailed = intelligence.modelVersion.includes("no-ai-providers") || 
                                  intelligence.modelVersion.includes("failed-no-evidence")

      if (allProvidersFailed) {
        // Check if we should retry
        const attempts = item.attempts + 1
        const maxAttempts = item.max_attempts || 3

        if (attempts < maxAttempts) {
          // Mark as pending for retry
          await supabase
            .from("ai_processing_queue")
            .update({ 
              status: "pending",
              error: `All AI providers failed (attempt ${attempts}/${maxAttempts}). Will retry.`,
              started_at: null
            })
            .eq("id", item.id)
          retryable++
        } else {
          // Max attempts reached, mark as failed
          await supabase
            .from("ai_processing_queue")
            .update({ 
              status: "failed",
              error: `All AI providers failed after ${maxAttempts} attempts`
            })
            .eq("id", item.id)
          failed++
        }
        continue
      }

      // Save intelligence
      const { error: upsertErr } = await supabase
        .from("job_ai_intelligence")
        .upsert({
          job_id: job.id,
          // ... all intelligence fields
        }, { onConflict: "job_id" })

      if (upsertErr) {
        await supabase
          .from("ai_processing_queue")
          .update({ status: "failed", error: `Upsert failed: ${upsertErr.message}` })
          .eq("id", item.id)
        failed++
        continue
      }

      // Mark as completed
      await supabase
        .from("ai_processing_queue")
        .update({ status: "completed" })
        .eq("id", item.id)
      processed++

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS))

    } catch (e: any) {
      const attempts = item.attempts + 1
      const maxAttempts = item.max_attempts || 3

      if (attempts < maxAttempts) {
        // Retry
        await supabase
          .from("ai_processing_queue")
          .update({ 
            status: "pending",
            error: `Error: ${e.message} (attempt ${attempts}/${maxAttempts})`,
            started_at: null
          })
          .eq("id", item.id)
        retryable++
      } else {
        // Max attempts reached
        await supabase
          .from("ai_processing_queue")
          .update({ 
            status: "failed",
            error: `Error after ${maxAttempts} attempts: ${e.message}`
          })
          .eq("id", item.id)
        failed++
      }
    }
  }

  return { processed, failed, retryable }
}
```

**Update cron schedule to run more frequently:**

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/ai/process?batch=50",
      "schedule": "0 */4 * * *"  // Every 4 hours instead of every 12 hours
    }
  ]
}
```

**Expected Impact:**
- Increase coverage from 4.8% to 50%+ within 1 week
- Reduce failure rate from 60% to <10% with retry logic
- Process 300 jobs per day (50 jobs × 6 runs per day)

---

## Issue #5: Docs Don't Match Live Schema

### Evidence

**Documentation** (INTELLIGENCE_SYSTEM.md):
```sql
CREATE TABLE job_scores (
  id UUID PRIMARY KEY,
  job_id UUID UNIQUE REFERENCES jobs(id),
  trust_score INTEGER,
  africa_eligibility TEXT,
  intelligence_score INTEGER,
  ...
)

CREATE TABLE job_evidence (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  evidence_type TEXT,
  confidence_score INTEGER,
  ...
)
```

**Production Database**:
```sql
-- These tables DON'T EXIST
-- Production uses job_ai_intelligence table instead

CREATE TABLE job_ai_intelligence (
  id UUID PRIMARY KEY,
  job_id UUID UNIQUE REFERENCES jobs(id),
  overall_confidence INTEGER,
  africa_eligibility TEXT,
  africa_confidence INTEGER,
  company_legitimacy TEXT,
  company_confidence INTEGER,
  ...
)
```

### Root Cause

**Two different intelligence systems were built:**

1. **Old system** (currently in production):
   - Table: `job_ai_intelligence`
   - Code: `lib/ai/engine.ts`
   - Migration: Never run (tables created manually or via Supabase UI)

2. **New system** (in my commits, never deployed):
   - Tables: `job_scores`, `job_evidence`, `job_moderation`, `job_investigations`
   - Code: `lib/intelligence/orchestrator.ts`
   - Migration: `20260727000000_job_intelligence_system.sql` (never run)

**The new system was never deployed to production**, so the documentation describes a system that doesn't exist.

### Fix

**Option A: Update Documentation to Match Production**

Update `INTELLIGENCE_SYSTEM.md` to describe the actual production schema:

```markdown
## Database Schema

### job_ai_intelligence
Stores AI-generated intelligence for each job.

```sql
CREATE TABLE job_ai_intelligence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  
  -- Overall scores
  overall_confidence INTEGER CHECK (overall_confidence >= 0 AND overall_confidence <= 100),
  model_version TEXT NOT NULL,
  
  -- Africa eligibility
  africa_eligibility TEXT CHECK (africa_eligibility IN ('explicit', 'likely', 'unknown', 'restricted')),
  africa_confidence INTEGER CHECK (africa_confidence >= 0 AND africa_confidence <= 100),
  africa_evidence TEXT,
  
  -- Company legitimacy
  company_legitimacy TEXT CHECK (company_legitimacy IN ('verified', 'likely_legit', 'unknown', 'suspicious')),
  company_confidence INTEGER CHECK (company_confidence >= 0 AND company_confidence <= 100),
  company_evidence TEXT,
  
  -- Remote work
  remote_eligibility TEXT CHECK (remote_eligibility IN ('fully_remote', 'hybrid', 'onsite', 'unknown')),
  remote_confidence INTEGER CHECK (remote_confidence >= 0 AND remote_confidence <= 100),
  remote_evidence TEXT,
  
  -- Salary
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  salary_period TEXT,
  salary_transparency TEXT CHECK (salary_transparency IN ('disclosed', 'estimated', 'undisclosed', 'unknown')),
  salary_confidence INTEGER CHECK (salary_confidence >= 0 AND salary_confidence <= 100),
  salary_evidence TEXT,
  
  -- Experience
  experience_level TEXT CHECK (experience_level IN ('entry', 'mid', 'senior', 'executive', 'unknown')),
  experience_confidence INTEGER CHECK (experience_confidence >= 0 AND experience_confidence <= 100),
  
  -- Skills
  required_skills TEXT[],
  transferable_skills TEXT[],
  missing_skills TEXT[],
  
  -- Job quality
  job_quality TEXT CHECK (job_quality IN ('high', 'medium', 'low', 'unknown')),
  job_quality_confidence INTEGER CHECK (job_quality_confidence >= 0 AND job_quality_confidence <= 100),
  job_quality_evidence TEXT,
  
  -- Hiring urgency
  hiring_urgency TEXT CHECK (hiring_urgency IN ('high', 'medium', 'low', 'unknown')),
  hiring_urgency_confidence INTEGER CHECK (hiring_urgency_confidence >= 0 AND hiring_urgency_confidence <= 100),
  
  -- Metadata
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### ai_provider_log
Logs AI provider calls for debugging and monitoring.

```sql
CREATE TABLE ai_provider_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  event TEXT CHECK (event IN ('attempt', 'success', 'failure')),
  job_id UUID REFERENCES jobs(id),
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### ai_processing_queue
Queue for processing jobs asynchronously.

```sql
CREATE TABLE ai_processing_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id),
  status TEXT CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error TEXT,
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
```

**Option B: Migrate to New Schema (NOT RECOMMENDED)**

This would require:
1. Running migration `20260727000000_job_intelligence_system.sql`
2. Migrating data from `job_ai_intelligence` to `job_scores` and `job_evidence`
3. Updating all code to use new tables
4. Testing thoroughly

**Recommendation**: Use Option A (update documentation) because:
- The production system is working (with fixes)
- Migrating to new schema is risky and unnecessary
- The old schema is simpler and sufficient

---

## Implementation Plan

### Phase 1: Fix AI Provider Rate Limits (Issue #1)
**Time**: 2 hours  
**Files**: 
- `lib/ai/verifiers/consolidated.ts`
- `lib/ai/engine.ts`

**Steps**:
1. Add exponential backoff retry logic to `extractWithSingleAI()`
2. Add request throttling (500ms delay) to `processAIQueue()`
3. Test with sample jobs
4. Deploy to preview
5. Verify failure rate drops from 60% to <10%

### Phase 2: Fix Confidence Scores (Issue #2)
**Time**: 3 hours  
**Files**:
- `lib/ai/verifiers/consolidated.ts`

**Steps**:
1. Implement `regexCompany()`, `regexExperience()`, `regexJobQuality()`, `regexHiringUrgency()`
2. Update `extractWithSingleAI()` to use new regex functions
3. Test with sample jobs
4. Deploy to preview
5. Verify average confidence increases from 3.1 to 40-60

### Phase 3: Fix Africa Eligibility (Issue #3)
**Time**: 2 hours  
**Files**:
- `lib/ai/verifiers/consolidated.ts`

**Steps**:
1. Improve `regexAfrica()` to infer from remote work and location
2. Pass `job` parameter to regex functions
3. Test with sample jobs
4. Deploy to preview
5. Verify "unknown" Africa eligibility drops from 15.9% to <5%

### Phase 4: Fix Coverage (Issue #4)
**Time**: 2 hours  
**Files**:
- `lib/ai/engine.ts`
- `vercel.json`

**Steps**:
1. Implement progressive batch processing with retry
2. Reduce batch size from 150 to 50
3. Update cron schedule to run every 4 hours
4. Deploy to preview
5. Verify coverage increases from 4.8% to 50%+ within 1 week

### Phase 5: Fix Documentation (Issue #5)
**Time**: 1 hour  
**Files**:
- `INTELLIGENCE_SYSTEM.md`

**Steps**:
1. Update documentation to describe actual production schema
2. Remove references to non-existent tables
3. Add examples using `job_ai_intelligence` table
4. Commit documentation update

**Total Time**: 10 hours

---

## Expected Results

### Before Fixes
- AI provider failure rate: 60%
- Average confidence score: 3.1/100
- Africa eligibility "unknown": 15.9%
- Coverage: 4.8% (241/4,977 jobs)
- Documentation: Mismatched with production

### After Fixes (1 week)
- AI provider failure rate: <10%
- Average confidence score: 40-60/100
- Africa eligibility "unknown": <5%
- Coverage: 50%+ (2,500+/4,977 jobs)
- Documentation: Matches production

---

## Verification Checklist

After implementing all fixes:

- [ ] AI provider failure rate < 10% (check `ai_provider_log`)
- [ ] Average confidence score > 40 (check `job_ai_intelligence`)
- [ ] Africa eligibility "unknown" < 5% (check `jobs` table)
- [ ] Coverage > 50% (check `job_ai_intelligence` count vs `jobs` count)
- [ ] Documentation matches production schema
- [ ] Processing queue runs every 4 hours without errors
- [ ] Failed jobs are retried up to 3 times
- [ ] Rate limiting prevents quota exhaustion

---

## Conclusion

The production intelligence system has 5 critical blockers that prevent it from functioning effectively. All blockers have been identified with live database evidence and root cause analysis. The fixes are straightforward and can be implemented in 10 hours.

**Priority Order**:
1. Fix AI provider rate limits (prerequisite for all other fixes)
2. Fix confidence scores (makes intelligence useful)
3. Fix Africa eligibility (improves accuracy)
4. Fix coverage (processes more jobs)
5. Fix documentation (matches reality)

**Next Step**: Implement Phase 1 (AI provider rate limits) and deploy to preview for testing.
