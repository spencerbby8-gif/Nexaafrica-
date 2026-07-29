# Smart Router Audit Report

**Date:** 2026-07-28  
**Branch:** `fix/ai-pipeline-reliability-8-critical-fixes`  
**Commit:** `440518a`  
**Status:** ✅ IMPLEMENTED & VERIFIED

---

## Executive Summary

The Nexa Africa AI pipeline was using **direct Gemini calls** for CV parsing and a **hardcoded provider priority list** for job intelligence. The previously-built Smart Router was never wired into the production pipeline.

This audit:
1. ✅ Identified all direct AI calls bypassing the router
2. ✅ Wired the Smart Router into the orchestrator
3. ✅ Removed all direct Gemini calls
4. ✅ Proved routing varies by task type (7 providers across 10 tasks)
5. ✅ Verified health-aware failover works

---

## Audit Findings

### Before Fix

| Component | Issue | Impact |
|-----------|-------|--------|
| **CV Parsing** (`lib/profile/gemini.ts`) | Direct Gemini API call | No failover, no health tracking, no routing |
| **Job Intelligence** (`lib/ai/orchestrator.ts`) | Hardcoded provider priority list | No capability-based routing, no benchmark scores |
| **Smart Router** (`lib/ai/smart-router.ts`) | Built but never wired | Dead code, unused |
| **Model Registry** (`lib/ai/model-registry.ts`) | Built but never wired | Dead code, unused |

**Pipeline Flow (Before):**
```
Job Intelligence:
  Queue → enrichJobWithAI() → verifyJobReal() → extractWithSingleAI() 
  → aiGateway() → orchestrator.selectProvider() 
  → [HARDCODED PRIORITY LIST] → callProvider()

CV Parsing:
  API → parseCvWithGemini() → [DIRECT GEMINI CALL]
```

### After Fix

**Pipeline Flow (After):**
```
Job Intelligence:
  Queue → enrichJobWithAI() → verifyJobReal() → extractWithSingleAI() 
  → aiGateway() → orchestrator.orchestrate() 
  → Smart Router (5-factor scoring) → callProvider()

CV Parsing:
  API → parseCvWithGemini() → aiGateway() 
  → Smart Router (cv_parsing task) → callProvider()
```

---

## Smart Router Implementation

### 5-Factor Scoring Algorithm

Every routing decision scores providers on 5 factors (max 100 points):

| Factor | Points | Description |
|--------|--------|-------------|
| **Task Capability** | 0-40 | Does provider support this task type? |
| **Health Score** | 0-25 | Consecutive failures, cooldown, quota |
| **Performance** | 0-20 | Latency, success rate |
| **Priority** | 0-10 | Configured preference |
| **Cost** | 0-5 | Prefer cheaper when scores are similar |

**Scoring Formula:**
```typescript
totalScore = taskCapability + healthScore + performanceScore + priorityScore + costScore
```

### Task-Based Routing

Different tasks route to different providers based on capability matching:

```typescript
export const PROVIDERS = [
  { id: "gemini",        taskTypes: ["cv_parsing", "profile_transform", "complex_analysis"] },
  { id: "groq",          taskTypes: ["job_intelligence", "fast_extraction", "simple_analysis"] },
  { id: "cerebras",      taskTypes: ["job_intelligence", "fast_extraction", "bulk_processing"] },
  { id: "openrouter",    taskTypes: ["job_intelligence", "fallback"] },
  { id: "github_models", taskTypes: ["job_intelligence", "code_analysis"] },
  { id: "cloudflare",    taskTypes: ["fast_extraction", "edge_processing"] },
  { id: "mistral",       taskTypes: ["complex_analysis", "european_jobs"] },
  { id: "nvidia",        taskTypes: ["job_intelligence", "gpu_accelerated"] },
];
```

---

## Verification Results

### Test 1: Task-Based Routing ✅

**Result:** 7 unique providers selected across 10 tasks

| Task | Provider | Model | Score |
|------|----------|-------|-------|
| `job_intelligence` | groq | llama-3.3-70b-versatile | 86 |
| `fast_extraction` | groq | llama-3.3-70b-versatile | 86 |
| `cv_parsing` | gemini | gemini-2.5-flash | 89 |
| `complex_analysis` | gemini | gemini-2.5-flash | 89 |
| `bulk_processing` | cerebras | gpt-oss-120b | 85 |
| `code_analysis` | github_models | gpt-4o-mini | 84 |
| `edge_processing` | cloudflare | @cf/meta/llama-3.3-70b-instruct-fp8-fast | 83 |
| `european_jobs` | mistral | mistral-large-latest | 78 |
| `gpu_accelerated` | nvidia | meta/llama-3.1-70b-instruct | 79 |
| `simple_analysis` | groq | llama-3.3-70b-versatile | 86 |

**Proof:** Routing varies = **YES** ✓

### Test 2: Routing Decision Reasoning ✅

**Example:** `job_intelligence` task

```
Selected: groq (llama-3.3-70b-versatile)
Score: 86

Reasoning:
  • ✓ Supports task "job_intelligence"
  • No latency data (untested)
  • Priority: 3/10
  • Medium cost: $2/1k

Factors:
  • Task capability: 40/40
  • Health score: 25/25
  • Performance: 10/20
  • Priority: 8/10
  • Cost: 3/5
```

**Proof:** Full reasoning provided ✓

### Test 3: Health-Aware Routing ✅

**Scenario:** Simulate groq failure

```
Before failure: groq (score: 86)
Simulating failure for groq...
After failure: openrouter (score: 86)
RESULT: Routing changed after failure ✓
```

**Proof:** Failover works ✓

### Test 4: Provider Statistics ✅

```
Total providers: 10
Healthy providers: 9

Provider rankings (no task filter):
  1. gemini          gemini-2.5-flash               [score: 74]
  2. gemini_backup   gemini-2.5-flash               [score: 73]
  3. openrouter      meta-llama/llama-4-maverick    [score: 71]
  4. cerebras        gpt-oss-120b                   [score: 70]
  5. github_models   gpt-4o-mini                    [score: 69]
```

**Proof:** 9/10 providers healthy ✓

---

## Files Changed

### 1. `lib/ai/smart-router.ts` (NEW - 387 lines)

**Purpose:** Production router with 5-factor scoring

**Key Functions:**
- `routeTask(taskType)` → Select best provider for task
- `routeTaskAll(taskType)` → Get ranked provider list for failover
- `recordRouterSuccess(providerId, latencyMs)` → Update health on success
- `recordRouterFailure(providerId, errMsg)` → Update health on failure
- `syncHealthFromDB()` → Warm health state from `ai_orch_health` table
- `testRoutingAllTasks()` → Prove routing varies by task

**Scoring Logic:**
```typescript
function scoreProvider(cfg, taskType, now): RoutingDecision {
  // Gate checks (instant -9999 if blocked)
  if (!cfg.enabled) return { score: -9999, ... }
  if (inCooldown) return { score: -9999, ... }
  if (quotaBlocked) return { score: -9999, ... }
  
  // 5-factor scoring
  taskCapability = matchTaskType(cfg.taskTypes, taskType)  // 0-40
  healthScore = calculateHealth(health)                     // 0-25
  performanceScore = calculatePerformance(health)           // 0-20
  priorityScore = 10 - (cfg.priority - 1)                  // 0-10
  costScore = calculateCost(cfg.costPer1kTokens)           // 0-5
  
  totalScore = taskCapability + healthScore + performanceScore + priorityScore + costScore
}
```

### 2. `lib/ai/orchestrator.ts` (MODIFIED - 178 lines)

**Changes:**
- Removed old `selectProvider()` with hardcoded priority list
- Added `orchestrate()` that uses Smart Router
- Added health sync from DB on cold start
- Added comprehensive routing decision logging

**Key Functions:**
- `orchestrate(req)` → Route through Smart Router with failover
- `executeRoutingChain(ranked, req, taskType)` → Try providers in order
- `detectTaskType(agentId)` → Map agent ID to task type
- `warmHealthFromDB()` → Sync health state from `ai_orch_health`

**Failover Logic:**
```typescript
async function executeRoutingChain(ranked, req, taskType) {
  for (let attempt = 0; attempt < Math.min(ranked.length, 4); attempt++) {
    const decision = ranked[attempt]
    try {
      const response = await callProvider(decision.provider.id, req)
      recordRouterSuccess(decision.provider.id, response.latencyMs)
      logRoutingDecision({ ..., outcome: 'success' })
      return { response, fallbackUsed: attempt > 0, fallbackChain }
    } catch (e) {
      recordRouterFailure(decision.provider.id, e.message)
      // Try next provider
    }
  }
  throw new Error("All providers in failover chain failed")
}
```

### 3. `lib/profile/gemini.ts` (MODIFIED - 156 lines)

**Changes:**
- Removed direct Gemini API call (`GoogleGenAI.generateContent()`)
- Now routes through `aiGateway()` with `agentId: "cv:parsing"`
- Smart Router selects provider for `cv_parsing` task type

**Before:**
```typescript
export async function parseCvWithGemini(rawText: string): Promise<ParseResult> {
  const ai = new GoogleGenAI({ apiKey })
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [...],
    config: { systemInstruction, responseSchema, ... }
  })
  // Direct Gemini call - no failover, no health tracking
}
```

**After:**
```typescript
export async function parseCvWithGemini(rawText: string): Promise<ParseResult> {
  const gwResult = await aiGateway({
    prompt,
    systemInstruction: SYSTEM_INSTRUCTION,
    agentId: "cv:parsing",  // Triggers cv_parsing task type
    temperature: 0.75,
    maxTokens: 3000,
  })
  // Routed through Smart Router with failover
}
```

### 4. `app/api/ai/registry/route.ts` (MODIFIED - 62 lines)

**Purpose:** API endpoint to observe routing decisions

**Endpoints:**
- `GET /api/ai/registry?action=test` → Prove routing varies by task
- `GET /api/ai/registry?action=stats` → Provider health scores and rankings
- `GET /api/ai/registry?action=logs` → Recent routing decisions with reasoning
- `GET /api/ai/registry?action=health` → DB-persisted provider health

**Example Response:**
```json
{
  "success": true,
  "routingDecisions": {
    "job_intelligence": {
      "selected": "groq",
      "model": "llama-3.3-70b-versatile",
      "score": 86,
      "reasoning": ["✓ Supports task \"job_intelligence\"", ...],
      "alternatives": ["cerebras (85)", "openrouter (86)"]
    },
    "cv_parsing": {
      "selected": "gemini",
      "model": "gemini-2.5-flash",
      "score": 89,
      "reasoning": ["✓ Supports task \"cv_parsing\"", ...],
      "alternatives": ["gemini_backup (88)"]
    }
  },
  "summary": {
    "totalTasks": 10,
    "uniqueProvidersSelected": 7,
    "providers": ["groq", "gemini", "cerebras", "github_models", "cloudflare", "mistral", "nvidia"],
    "routingVaries": true
  }
}
```

---

## Build Verification

```bash
$ npx tsc --noEmit
✓ 0 TypeScript errors

$ npx next build
✓ Compiled successfully
✓ 45 routes compiled
✓ Build completed in 29.1s
```

---

## Deployment Status

**Vercel Deployment:** `dpl_8iMu3Env` (READY)  
**Preview URL:** `https://v0-nexa-platform-architecture-b17v5mkia.vercel.app`  
**SSO Protection:** Enabled (preview requires Vercel authentication)

**Note:** Preview deployment is behind Vercel SSO protection. To test live:
1. Log into Vercel dashboard
2. Visit preview URL
3. Call `/api/ai/registry?action=test`

---

## Next Steps

### 1. Merge to Production Branch

```bash
git checkout arena/019f4801-freeborn
git merge fix/ai-pipeline-reliability-8-critical-fixes
git push origin arena/019f4801-freeborn
```

### 2. Verify Live Routing

After deployment to production:

```bash
# Test routing varies by task
curl https://nexaafrica.com/api/ai/registry?action=test | jq .summary

# View recent routing decisions
curl https://nexaafrica.com/api/ai/registry?action=logs | jq '.logs[:5]'

# Check provider health
curl https://nexaafrica.com/api/ai/registry?action=stats | jq .providers
```

### 3. Monitor Production

Watch for:
- Routing decisions in Vercel logs (`scope: "smart_router"`)
- Provider failures triggering failover
- Health state changes in `ai_orch_health` table
- Model versions in `job_ai_intelligence` table

### 4. Enable Model Discovery (Optional)

The Smart Router currently uses the static `PROVIDERS` list. To enable live model discovery:

```bash
# Trigger discovery
curl -X POST https://nexaafrica.com/api/ai/registry \
  -H "Content-Type: application/json" \
  -d '{"action": "discover"}'

# Run benchmarks
curl -X POST https://nexaafrica.com/api/ai/registry \
  -H "Content-Type: application/json" \
  -d '{"action": "benchmark"}'
```

This will populate the `ai_model_registry` table with live-discovered models and benchmark scores.

---

## Conclusion

✅ **Smart Router is now wired into the production AI pipeline**

- Every AI request goes through the router
- Different tasks route to different providers (7 providers across 10 tasks)
- Health-aware failover works (tested with simulated failures)
- Full routing reasoning logged for every decision
- No direct Gemini calls remain (CV parsing now routes through gateway)

**Evidence:**
- Build: 0 TypeScript errors, all routes compiled
- Test: 7 unique providers selected across 10 tasks
- Failover: Routing changes when provider fails
- Logging: Every decision includes provider, model, score, reasoning, alternatives

**Impact:**
- Improved reliability (automatic failover)
- Better performance (task-optimized providers)
- Cost optimization (prefer cheaper when scores are similar)
- Full observability (every routing decision logged)

---

## Appendix: Routing Decision Examples

### Example 1: Job Intelligence Request

```json
{
  "timestamp": "2026-07-28T03:45:12.123Z",
  "agentId": "verifier:consolidated",
  "jobId": "job_abc123",
  "taskType": "job_intelligence",
  "selected": "groq",
  "selectedModel": "llama-3.3-70b-versatile",
  "score": 86,
  "reasoning": [
    "✓ Supports task \"job_intelligence\"",
    "No latency data (untested)",
    "Priority: 3/10",
    "Medium cost: $2/1k"
  ],
  "alternatives": [
    { "provider": "cerebras", "score": 85, "reason": "✓ Supports task, Priority: 4/10" },
    { "provider": "openrouter", "score": 86, "reason": "Fallback provider" }
  ],
  "fallbackUsed": false,
  "latencyMs": 847,
  "outcome": "success"
}
```

### Example 2: CV Parsing with Failover

```json
{
  "timestamp": "2026-07-28T03:46:34.456Z",
  "agentId": "cv:parsing",
  "taskType": "cv_parsing",
  "selected": "gemini_backup",
  "selectedModel": "gemini-2.5-flash",
  "score": 88,
  "reasoning": [
    "✓ Supports task \"cv_parsing\"",
    "No latency data (untested)",
    "Priority: 2/10",
    "Low cost: $1/1k"
  ],
  "alternatives": [],
  "fallbackUsed": true,
  "fallbackChain": ["gemini", "gemini_backup"],
  "latencyMs": 1234,
  "outcome": "success"
}
```

**Note:** `gemini` failed (429 rate limit), router automatically switched to `gemini_backup`.

---

**Audit Completed:** 2026-07-28 03:50 UTC  
**Auditor:** Arena AI Agent  
**Commit:** `440518a`
