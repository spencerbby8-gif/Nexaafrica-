# AI Provider Orchestration - Implementation Complete

**Date**: 2026-07-27  
**Commit**: `c69d6d4`  
**Branch**: `fix/ai-pipeline-reliability-8-critical-fixes`  
**Status**: ✅ IMPLEMENTED, AWAITING LIVE VERIFICATION

---

## What Was Implemented

### 1. Ten AI Providers Configured

All 10 requested providers are now configured with task-based routing:

| # | Provider | Model | Priority | Task Types | Status |
|---|----------|-------|----------|------------|--------|
| 1 | **Gemini** | gemini-2.5-flash | 1 | cv_parsing, profile_transform, complex_analysis | ✅ Enabled |
| 2 | **Gemini Backup** | gemini-2.5-flash | 2 | cv_parsing, profile_transform, complex_analysis | ✅ Enabled (as requested) |
| 3 | **Groq** | llama-3.3-70b-versatile | 3 | job_intelligence, fast_extraction, simple_analysis | ✅ Enabled |
| 4 | **Cerebras** | gpt-oss-120b | 4 | job_intelligence, fast_extraction, bulk_processing | ✅ Enabled |
| 5 | **OpenRouter** | meta-llama/llama-4-maverick | 5 | job_intelligence, fallback | ✅ Enabled |
| 6 | **HuggingFace** | zephyr-7b-beta | 6 | simple_analysis | ❌ Disabled (fetch failed in Vercel) |
| 7 | **GitHub Models** | gpt-4o-mini | 7 | job_intelligence, code_analysis | ✅ Enabled |
| 8 | **Cloudflare Workers AI** | llama-3.3-70b-instruct-fp8-fast | 8 | fast_extraction, edge_processing | ✅ Enabled |
| 9 | **Mistral** | mistral-large-latest | 9 | complex_analysis, european_jobs | ✅ Enabled |
| 10 | **NVIDIA NIM** | llama-3.1-70b-instruct | 10 | job_intelligence, gpu_accelerated | ✅ Enabled |

**Total**: 9 providers enabled, 1 disabled (HuggingFace - known Vercel issue)

### 2. Task-Based Routing System

**Implementation**: `lib/ai/orchestrator.ts`

**How it works**:

1. **Task Type Detection**: Automatically detects task type from `agentId`:
   ```typescript
   function detectTaskType(agentId: string): string | undefined {
     const id = agentId.toLowerCase()
     if (id.includes('cv') || id.includes('profile')) return 'cv_parsing'
     if (id.includes('job') || id.includes('intelligence')) return 'job_intelligence'
     if (id.includes('verifier') || id.includes('extract')) return 'fast_extraction'
     if (id.includes('analysis') || id.includes('complex')) return 'complex_analysis'
     // ... more patterns
     return undefined
   }
   ```

2. **Provider Filtering**: Filters providers by task type compatibility:
   ```typescript
   const candidates = taskType 
     ? enabled.filter(p => !p.taskTypes || p.taskTypes.length === 0 || p.taskTypes.includes(taskType))
     : enabled
   ```

3. **Intelligent Scoring**: Scores providers based on multiple factors:
   ```typescript
   const score = usable 
     ? priorityBonus - latencyPenalty - failurePenalty + taskBonus 
     : -9999
   
   // Where:
   // - priorityBonus = (10 - cfg.priority) * 5  // Lower priority number = higher bonus
   // - latencyPenalty = avgLatencyMs / 100      // Penalize slow providers
   // - failurePenalty = consecutiveFailures * 10 // Penalize failing providers
   // - taskBonus = 20 if provider excels at this task type
   ```

4. **Automatic Fallback**: If selected provider fails, automatically tries next best provider:
   ```typescript
   async function tryProvider(cfg, req, diag, taskType) {
     try {
       const response = await rawCallProvider(cfg.id, req, rc, diag)
       recordOrchSuccess(cfg.id, response.latencyMs)
       return { response, fallbackUsed: rc > 0, fallbackChain: [cfg.id], diag }
     } catch (e) {
       recordOrchFailure(cfg.id, e.message)
       const next = await selectProvider(taskType)
       if (next && next.id !== cfg.id) return tryProvider(next, req, diag, taskType)
       throw e
     }
   }
   ```

### 3. Provider-Specific Implementations

**Gemini** (`lib/ai/gateway.ts:60-80`):
- Uses `@google/genai` SDK
- Supports system instructions and JSON response schema
- Tracks token usage for cost calculation

**OpenAI-Compatible Providers** (Groq, Cerebras, OpenRouter, GitHub Models, Mistral, NVIDIA):
- Standard OpenAI chat completions API
- Provider-specific endpoints:
  - Groq: `https://api.groq.com/openai/v1/chat/completions`
  - Cerebras: `https://api.cerebras.ai/v1/chat/completions`
  - OpenRouter: `https://openrouter.ai/api/v1/chat/completions`
  - GitHub Models: `https://models.inference.ai.azure.com/chat/completions` (requires `api-version` header)
  - Mistral: `https://api.mistral.ai/v1/chat/completions`
  - NVIDIA: `https://integrate.api.nvidia.com/v1/chat/completions`

**Cloudflare Workers AI** (`lib/ai/gateway.ts:180-210`):
- Uses Cloudflare AI API
- Requires `CLOUDFLARE_ACCOUNT_ID` in addition to API token
- Endpoint: `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/{model}`

**HuggingFace** (`lib/ai/gateway.ts:212-235`):
- Uses HuggingFace Inference API
- Endpoint: `https://api-inference.huggingface.co/models/{model}`
- Currently disabled due to Vercel fetch issues

### 4. Health-Aware Routing

**Implementation**: `lib/ai/orchestrator.ts`

**Features**:
- **DB-Persisted Health**: Provider health state persists across Vercel cold starts via `ai_orch_health` table
- **Automatic Cooldown**: Failed providers are automatically cooled down (exponential backoff)
- **Quota Detection**: Detects 429 errors and quota exhaustion, sets appropriate cooldown
- **Rate Limit Detection**: Detects rate limit errors and backs off accordingly
- **Automatic Probing**: Probes providers every 2 minutes to detect recovery
- **Health Warming**: Warms health state from DB on cold start

**Cooldown Logic**:
```typescript
if (c.isQuota) { 
  s.isQuotaExhausted = true
  s.quotaResetAt = Date.now() + c.retryAfterMs
  s.cooldownUntil = s.quotaResetAt 
}
else if (c.isRateLimit) { 
  s.isRateLimited = true
  s.cooldownUntil = Date.now() + c.retryAfterMs 
}
else if (c.isAuth || c.isNotFound) { 
  s.cooldownUntil = Date.now() + 300_000 // 5 minutes
}
else { 
  s.cooldownUntil = Date.now() + Math.min(2 ** s.consecutiveFailures * 2000, 300_000)
}
```

### 5. Comprehensive Logging

**Provider Call Diagnostics**: Every provider call is logged with:
```typescript
interface ProviderCallDiag {
  provider: string
  model: string
  event: 'attempt' | 'success' | 'failure'
  httpStatus?: number
  errorCode?: string
  errorMessage?: string
  errorBody?: string
  retryCount: number
  durationMs?: number
  promptLen?: number
  responseLen?: number
}
```

**Audit Trail**: All AI decisions are logged to `ai_audit_log` table with:
- Decision made
- Evidence used
- Model used
- Confidence score
- Action taken

---

## How to Verify Providers Live

### Method 1: Use the Health Endpoint

Call the health endpoint to see provider status:

```bash
curl https://v0-nexa-platform-architecture-*.vercel.app/api/ai/health
```

**Expected Response**:
```json
{
  "providers": [
    {
      "id": "gemini",
      "enabled": true,
      "healthy": true,
      "inCooldown": false,
      "consecutiveFailures": 0,
      "avgLatencyMs": 1500,
      "quotaExhausted": false,
      "lastError": ""
    },
    // ... more providers
  ]
}
```

### Method 2: Test Individual Providers

Create a test script that calls each provider directly:

```typescript
// scripts/test-providers-live.ts
import { aiGateway } from '@/lib/ai/gateway'

const testPrompt = 'Extract job intelligence: Senior React Developer at Google, remote worldwide, $150k-$200k salary. Return JSON.'

async function testProvider(providerId: string) {
  console.log(`\n=== Testing ${providerId} ===`)
  const start = Date.now()
  
  try {
    const result = await aiGateway({
      prompt: testPrompt,
      agentId: `test:${providerId}`,
      temperature: 0.2,
      maxTokens: 1000
    })
    
    const latency = Date.now() - start
    console.log(`✅ SUCCESS: ${latency}ms`)
    console.log(`Provider: ${result.response.provider}`)
    console.log(`Model: ${result.response.model}`)
    console.log(`Response: ${result.response.text.substring(0, 200)}...`)
    
    return { success: true, latency, provider: result.response.provider }
  } catch (e: any) {
    const latency = Date.now() - start
    console.log(`❌ FAILED: ${latency}ms`)
    console.log(`Error: ${e.message.substring(0, 200)}`)
    
    return { success: false, latency, error: e.message }
  }
}

async function main() {
  const providers = ['gemini', 'gemini_backup', 'groq', 'cerebras', 'openrouter', 'github_models', 'cloudflare', 'mistral', 'nvidia']
  
  const results = []
  for (const provider of providers) {
    const result = await testProvider(provider)
    results.push({ provider, ...result })
  }
  
  console.log('\n=== SUMMARY ===')
  results.forEach(r => {
    const status = r.success ? '✅' : '❌'
    const latency = r.latency ? `${r.latency}ms` : 'N/A'
    console.log(`${status} ${r.provider}: ${latency}`)
  })
}

main().catch(console.error)
```

Run with:
```bash
npx tsx scripts/test-providers-live.ts
```

### Method 3: Test Through Job Intelligence Pipeline

Trigger intelligence analysis on a real job and check which provider was used:

```bash
# Get a job ID from the database
psql $DATABASE_URL -c "SELECT id FROM jobs WHERE intelligence_score IS NULL LIMIT 1"

# Trigger intelligence analysis
curl -X POST https://v0-nexa-platform-architecture-*.vercel.app/api/intelligence/analyze \
  -H "Content-Type: application/json" \
  -d '{"job_id": "JOB_ID_HERE"}'

# Check which provider was used
psql $DATABASE_URL -c "SELECT model_version FROM job_ai_intelligence WHERE job_id = 'JOB_ID_HERE'"
```

---

## Expected Behavior

### Scenario 1: CV Parsing Task

**Request**:
```typescript
aiGateway({
  prompt: 'Parse this CV...',
  agentId: 'cv:parser',
  temperature: 0.3
})
```

**Routing**:
1. Detects task type: `cv_parsing`
2. Filters providers: `[gemini, gemini_backup]` (only these have `cv_parsing` in taskTypes)
3. Selects best: `gemini` (priority 1, healthy)
4. If Gemini fails → falls back to `gemini_backup`
5. If both fail → throws error

### Scenario 2: Job Intelligence Task

**Request**:
```typescript
aiGateway({
  prompt: 'Extract job intelligence...',
  agentId: 'verifier:job_intelligence',
  temperature: 0.2
})
```

**Routing**:
1. Detects task type: `job_intelligence`
2. Filters providers: `[groq, cerebras, openrouter, github_models, nvidia]` (all have `job_intelligence`)
3. Scores each based on health, latency, failures
4. Selects best (likely `groq` - fast, low latency)
5. If fails → tries next best (likely `cerebras`)
6. Continues fallback chain until success or all fail

### Scenario 3: Complex Analysis Task

**Request**:
```typescript
aiGateway({
  prompt: 'Perform complex analysis...',
  agentId: 'analysis:complex',
  temperature: 0.3
})
```

**Routing**:
1. Detects task type: `complex_analysis`
2. Filters providers: `[gemini, gemini_backup, mistral]` (have `complex_analysis`)
3. Selects best (likely `gemini` - most capable)
4. Falls back to `gemini_backup` or `mistral` if needed

---

## Monitoring and Observability

### Check Provider Health

```sql
-- Check current provider health
SELECT 
  provider,
  consecutive_failures,
  is_quota_exhausted,
  is_rate_limited,
  cooldown_until,
  avg_latency_ms,
  total_successes,
  total_failures
FROM ai_orch_health
ORDER BY provider;
```

### Check Provider Usage

```sql
-- Check which providers are being used
SELECT 
  provider,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE event = 'success') as successes,
  COUNT(*) FILTER (WHERE event = 'failure') as failures,
  ROUND(AVG(duration_ms) FILTER (WHERE event = 'success')) as avg_latency_ms
FROM ai_provider_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY provider
ORDER BY total_calls DESC;
```

### Check Fallback Behavior

```sql
-- Check how often fallbacks are used
SELECT 
  agent_id,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE fallback_used = true) as fallbacks,
  ROUND(COUNT(*) FILTER (WHERE fallback_used = true) * 100.0 / COUNT(*), 2) as fallback_rate_pct
FROM ai_provider_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY agent_id
ORDER BY total_requests DESC;
```

---

## Troubleshooting

### Issue: All Providers Failing

**Symptoms**: "All providers unhealthy" error

**Diagnosis**:
```sql
-- Check provider health
SELECT * FROM ai_orch_health WHERE cooldown_until > NOW();

-- Check recent failures
SELECT provider, error_code, error_message, created_at
FROM ai_provider_log
WHERE event = 'failure'
ORDER BY created_at DESC
LIMIT 20;
```

**Solutions**:
1. Check if API keys are set in Vercel environment variables
2. Check if providers are rate limited or quota exhausted
3. Wait for cooldown to expire (check `cooldown_until`)
4. Manually reset provider health:
   ```sql
   UPDATE ai_orch_health
   SET consecutive_failures = 0, cooldown_until = NULL, is_quota_exhausted = false
   WHERE provider = 'provider_id';
   ```

### Issue: Wrong Provider Selected

**Symptoms**: Task routed to unexpected provider

**Diagnosis**:
```sql
-- Check which provider was used for a specific job
SELECT model_version, created_at
FROM job_ai_intelligence
WHERE job_id = 'JOB_ID'
ORDER BY created_at DESC
LIMIT 1;
```

**Solutions**:
1. Check if task type is being detected correctly (add logging to `detectTaskType`)
2. Check if providers have correct `taskTypes` configured
3. Check provider health scores (may be routing to less ideal provider due to failures)

### Issue: High Fallback Rate

**Symptoms**: Many requests using fallback providers

**Diagnosis**:
```sql
-- Check fallback rate by provider
SELECT 
  provider,
  COUNT(*) FILTER (WHERE fallback_used = true) as fallbacks,
  COUNT(*) as total
FROM ai_provider_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY provider;
```

**Solutions**:
1. Check why primary provider is failing (rate limits, quota, errors)
2. Increase rate limits or upgrade API tier
3. Add more providers to distribute load
4. Implement request queuing to stay within rate limits

---

## Performance Expectations

### Latency by Provider (Estimated)

| Provider | Expected Latency | Use Case |
|----------|------------------|----------|
| Groq | 500-1000ms | Fast extraction, simple analysis |
| Cerebras | 800-1500ms | Job intelligence, bulk processing |
| Gemini | 1500-3000ms | CV parsing, complex analysis |
| OpenRouter | 2000-4000ms | Fallback, Llama 4 |
| GitHub Models | 1500-3000ms | Job intelligence, code analysis |
| Cloudflare | 500-1500ms | Edge processing, fast extraction |
| Mistral | 2000-4000ms | Complex analysis, European jobs |
| NVIDIA | 1500-3000ms | GPU-accelerated tasks |

### Throughput Expectations

With 9 providers and intelligent routing:
- **Single request**: 500-4000ms depending on provider
- **Batch processing**: Can process 100+ jobs per minute with parallel processing
- **Rate limit handling**: Automatic backoff and retry prevents quota exhaustion
- **Fallback success rate**: >95% (at least one provider should be available)

---

## Next Steps

### Immediate (Verify Live)

1. **Test all providers**: Run `scripts/test-providers-live.ts` to verify each provider works
2. **Check health endpoint**: Call `/api/ai/health` to see provider status
3. **Test job intelligence**: Trigger intelligence on 10 jobs, verify providers are selected correctly
4. **Check fallback behavior**: Intentionally fail one provider, verify fallback works

### Short-term (Optimize)

1. **Monitor provider usage**: Check which providers are being used most
2. **Tune scoring**: Adjust priority, latency penalty, failure penalty based on real data
3. **Add more task types**: Add more granular task types for better routing
4. **Implement caching**: Cache provider responses to reduce API calls

### Long-term (Scale)

1. **Add more providers**: Add Anthropic Claude, Cohere, AI21, etc.
2. **Implement smart batching**: Batch similar requests to reduce API calls
3. **Add cost tracking**: Track cost per provider, optimize for cost-efficiency
4. **Implement A/B testing**: Test different routing strategies

---

## Summary

✅ **10 providers configured** (9 enabled, 1 disabled)  
✅ **Task-based routing implemented** (automatic task type detection)  
✅ **Health-aware routing** (DB-persisted, automatic cooldown, probing)  
✅ **Comprehensive logging** (provider diagnostics, audit trail)  
✅ **Automatic fallback** (tries next best provider on failure)  
✅ **Gemini Backup enabled** (as requested)

**Next**: Verify all providers work live, test full pipeline end-to-end, monitor performance.

**Status**: ✅ IMPLEMENTED, AWAITING LIVE VERIFICATION
