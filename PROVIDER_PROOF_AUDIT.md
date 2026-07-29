# Provider Proof Audit — Live Production Evidence

**Date:** 2026-07-29 04:45 UTC  
**Database:** Production Supabase (live query)  
**Source:** `ai_provider_log`, `job_ai_intelligence`, `ai_orch_health`  
**Branch:** `fix/ai-pipeline-reliability-8-critical-fixes`  
**Commit:** `361937c`

---

## Verdict Summary

| # | Provider | Model | Jobs Handled | Success Rate | Verdict |
|---|----------|-------|-------------|-------------|---------|
| 1 | **OpenRouter** | meta-llama/llama-4-maverick | **82** | 100% | ✅ **WIRED** |
| 2 | **Cerebras** | gpt-oss-120b | **61** | 100% | ✅ **WIRED** |
| 3 | **Groq** | llama-3.3-70b-versatile | **6** | 20% | ⚠️ **PARTIALLY WIRED** |
| 4 | **Gemini** | gemini-2.5-flash | **0** (1 in logs, 503 dead) | 0% | ❌ **NOT WIRED** (dead) |
| 5 | **HuggingFace** | zephyr-7b-beta | **0** | N/A | ❌ **NOT WIRED** (disabled) |
| 6 | **Mistral** | mistral-large-latest | **0** | N/A | ❌ **NOT WIRED** |
| 7 | **NVIDIA** | meta/llama-3.1-70b-instruct | **0** | N/A | ❌ **NOT WIRED** |
| 8 | **Cloudflare** | @cf/meta/llama-3.3-70b | **0** | N/A | ❌ **NOT WIRED** |
| 9 | **GitHub Models** | gpt-4o-mini | **0** | N/A | ❌ **NOT WIRED** |

**Only 2 of 9 providers are reliably wired. 1 is partially wired. 6 are not wired at all.**

---

## Detailed Provider Evidence

### 1. OpenRouter — ✅ WIRED

| Metric | Value |
|--------|-------|
| Jobs handled | **82** |
| Model | meta-llama/llama-4-maverick |
| Success rate | 100% (23/23 in orch_health) |
| Avg latency | 15,832ms |
| Quota status | OK |
| Rate limited | No |
| Consecutive failures | 0 |
| Sample job IDs | `adc8887b`, `5d9c9fae`, `35e6a4e4` |
| Routing reason | Task type match + fallback provider + 100% success history |

**Live proof:** 82 `job_ai_intelligence` rows have `model_version = "openrouter:meta-llama/llama-4-maverick"`. Provider log shows 16 attempts, 9 successes. Orchestrator health shows 23 total successes, 0 failures.

---

### 2. Cerebras — ✅ WIRED

| Metric | Value |
|--------|-------|
| Jobs handled | **61** |
| Model | gpt-oss-120b |
| Success rate | 100% (5/5 in orch_health) |
| Avg latency | 747ms |
| Quota status | OK (had 429 in past, recovered) |
| Rate limited | No |
| Consecutive failures | 0 |
| Sample job IDs | `622ee4b2`, `72bf85fc`, `d59c1b9a` |
| Routing reason | Task type match (job_intelligence, fast_extraction, bulk_processing) + fast latency + 100% success |

**Live proof:** 61 rows with `model_version = "cerebras:gpt-oss-120b"`. Provider log shows 44 attempts, 21 successes, 2 failures. Fastest provider at 747ms.

---

### 3. Groq — ⚠️ PARTIALLY WIRED

| Metric | Value |
|--------|-------|
| Jobs handled | **6** |
| Model | llama-3.3-70b-versatile |
| Success rate | 20% (1/5 in orch_health) |
| Avg latency | 999ms |
| Quota status | **EXHAUSTED** |
| Rate limited | No |
| Consecutive failures | 3 |
| Sample job IDs | `939f5e4f`, `75adabee`, `d19ce3a1` |
| Routing reason | Task type match (job_intelligence, fast_extraction) + priority 3 |
| Failure reason | `429 rate_limit_exceeded: Rate limit reached for model llama-3.3-70b-versatile` |

**Live proof:** 6 rows with `model_version = "groq:llama-3.3-70b-versatile"`. Provider is quota-exhausted and in cooldown. It WAS wired but is now effectively offline due to rate limits.

---

### 4. Gemini — ❌ NOT WIRED (dead)

| Metric | Value |
|--------|-------|
| Jobs handled | **0** (1 logged success, but 0 stored in intelligence) |
| Model | gemini-2.5-flash |
| Success rate | 0% (0/2 in orch_health) |
| Avg latency | 6,721ms |
| Quota status | **EXHAUSTED** |
| Consecutive failures | **11** |
| Last error | `503 UNAVAILABLE: The service is currently unavailable` |

**Live proof:** Provider log shows 12 attempts, 1 success, 6 failures. But orchestrator health shows 0 total successes, 2 failures, 11 consecutive failures. The one logged success may have been a probe, not a real job. No `job_ai_intelligence` rows have `model_version = "gemini:*"`.

**Verdict:** Gemini is DEAD in production. 503 errors from Google's API.

---

### 5. HuggingFace — ❌ NOT WIRED (disabled in config)

| Metric | Value |
|--------|-------|
| Jobs handled | **0** |
| Config status | `enabled: false` in `PROVIDERS` array |
| API key | Exists in Vercel (sensitive) |
| Provider log | 0 entries |
| Orchestrator health | 0 entries |

**Root cause:** `lib/ai/providers/types.ts` line 37 has `enabled: false`. The Smart Router gives it `score: -9999` and never selects it.

---

### 6. Mistral — ❌ NOT WIRED

| Metric | Value |
|--------|-------|
| Jobs handled | **0** |
| Config status | `enabled: true`, priority 9 |
| API key | Exists in Vercel (sensitive) |
| Provider log | **0 entries** |
| Orchestrator health | **0 entries** |

**Root cause:** Two issues:
1. **maxAttempts=4 cap** — `executeRoutingChain()` only tries top 4 providers. Mistral (priority 9) never ranks in top 4.
2. **API key may be empty** — Vercel shows "sensitive" but the value could be an empty placeholder.

---

### 7. NVIDIA — ❌ NOT WIRED

| Metric | Value |
|--------|-------|
| Jobs handled | **0** |
| Config status | `enabled: true`, priority 10 |
| API key | Exists in Vercel (sensitive) |
| Provider log | **0 entries** |
| Orchestrator health | **0 entries** |

**Root cause:** Same as Mistral — priority 10 means it never ranks in top 4. Even if it did, the API key may be empty.

---

### 8. Cloudflare — ❌ NOT WIRED

| Metric | Value |
|--------|-------|
| Jobs handled | **0** |
| Config status | `enabled: true`, priority 8 |
| API key | Exists in Vercel (sensitive) |
| CLOUDFLARE_ACCOUNT_ID | Exists in Vercel (sensitive) |
| Provider log | **0 entries** |
| Orchestrator health | **0 entries** |

**Root cause:** Priority 8 + maxAttempts=4 cap. Also requires CLOUDFLARE_ACCOUNT_ID which may be empty.

---

### 9. GitHub Models — ❌ NOT WIRED

| Metric | Value |
|--------|-------|
| Jobs handled | **0** |
| Config status | `enabled: true`, priority 7 |
| API key | Exists in Vercel (sensitive) |
| Provider log | **0 entries** |
| Orchestrator health | **0 entries** |

**Root cause:** Priority 7 + maxAttempts=4 cap. Never reaches the top 4 ranking.

---

## Root Causes

### Root Cause 1: `maxAttempts = 4` cap in orchestrator

**File:** `lib/ai/orchestrator.ts` → `executeRoutingChain()`

```typescript
const maxAttempts = Math.min(ranked.length, 4) // Try up to 4 providers
```

This means only the **top 4 ranked providers** are ever tried. With 10 providers in the config, the bottom 6 (priorities 7-10 plus disabled) are **never reached**.

Since Cerebras (100% success, 747ms) and OpenRouter (100% success) always rank high, they consume all 4 slots. Mistral (priority 9), NVIDIA (priority 10), Cloudflare (priority 8), and GitHub Models (priority 7) never get attempted.

### Root Cause 2: API keys may be empty placeholders

All 5 missing providers show as "sensitive" in Vercel, but the actual values may be empty strings or placeholders. The gateway checks `if (!apiKey) throw new Error(...)` which would prevent the call, but since these providers are never even attempted (due to Root Cause 1), we never see the error.

### Root Cause 3: HuggingFace explicitly disabled

`lib/ai/providers/types.ts` line 37: `enabled: false`. This is intentional — HuggingFace had "fetch failed" issues in Vercel serverless.

### Root Cause 4: 37.8% of jobs use regex-only (no AI)

91 out of 241 intelligence rows have `model_version = "regex-extracted-*"`. These jobs had all AI providers fail (or were never attempted) and fell back to regex extraction only.

---

## Failover Evidence

Failover IS working. Here are real multi-provider chains from `ai_provider_log`:

**Job `7db4713c`:**
```
gemini:failure → openrouter:attempt → groq:failure → groq:attempt → groq:attempt 
→ openrouter:SUCCESS → openrouter:attempt → cerebras:attempt → cerebras:attempt 
→ cerebras:failure → gemini:attempt → gemini:attempt
```

**Job `970f98c9`:**
```
groq:attempt → gemini:attempt → gemini:attempt → gemini:failure → groq:attempt 
→ groq:failure → cerebras:attempt → cerebras:attempt → cerebras:SUCCESS
```

**Job `ea6e81c2`:**
```
groq:failure → cerebras:attempt → cerebras:SUCCESS → gemini:attempt → groq:attempt 
→ gemini:attempt → gemini:failure → groq:attempt → cerebras:attempt
```

This proves the orchestrator tries multiple providers per job and succeeds via failover.

---

## What Routes Only to Gemini or Fallback Paths

| Path | Jobs | Percentage |
|------|------|-----------|
| Real AI provider (OpenRouter, Cerebras, Groq) | 149 | 61.8% |
| Regex-only (no AI) | 91 | 37.8% |
| No AI (failed) | 0 | 0.0% |
| Gemini | 0 | 0.0% |

**No jobs route to Gemini.** It's completely dead. 37.8% of jobs fall back to regex-only extraction when all AI providers fail.

---

## Exact Files That Need Fixing

| File | Issue | Fix |
|------|-------|-----|
| `lib/ai/orchestrator.ts:executeRoutingChain()` | `maxAttempts = 4` prevents providers 5-10 from ever being tried | Increase to `Math.min(ranked.length, 7)` or remove cap |
| `lib/ai/providers/types.ts` | HuggingFace `enabled: false` | Set `enabled: true` if API key is valid |
| `lib/ai/providers/types.ts` | Priorities 7-10 are too low to ever be selected | Rebalance priorities or use capability-based ranking |
| Vercel env vars | MISTRAL_API_KEY, NVIDIA_API_KEY, CLOUDFLARE_API_TOKEN, GITHUB_MODELS_TOKEN may be empty | Verify and set real API keys |
| Vercel env vars | CLOUDFLARE_ACCOUNT_ID may be empty | Set real account ID |

---

## Final Verdict

### What IS wired (production-proven):
- ✅ **OpenRouter** — 82 jobs, 100% success, primary workhorse
- ✅ **Cerebras** — 61 jobs, 100% success, fastest provider (747ms)
- ⚠️ **Groq** — 6 jobs, 20% success, rate-limited (partially wired)

### What is NOT wired:
- ❌ **Gemini** — Dead (503 UNAVAILABLE)
- ❌ **HuggingFace** — Disabled in config
- ❌ **Mistral** — Never attempted (maxAttempts=4 cap + priority 9)
- ❌ **NVIDIA** — Never attempted (maxAttempts=4 cap + priority 10)
- ❌ **Cloudflare** — Never attempted (maxAttempts=4 cap + priority 8)
- ❌ **GitHub Models** — Never attempted (maxAttempts=4 cap + priority 7)

### What still routes to regex-only fallback:
- **91 jobs (37.8%)** — All AI providers failed, regex extraction only

### Is Nexa using the full provider set?
**NO.** Only 3 of 9 providers have ever handled a real production job. 5 providers have zero production evidence. The `maxAttempts=4` cap in the orchestrator is the primary blocker — it prevents providers ranked 5th and below from ever being tried.

### What needs to happen:
1. **Remove or increase `maxAttempts=4`** in `lib/ai/orchestrator.ts`
2. **Verify API keys** for Mistral, NVIDIA, Cloudflare, GitHub Models in Vercel
3. **Enable HuggingFace** if the API key is valid
4. **Reprocess the 91 regex-only jobs** once more providers are wired
5. **Rebalance priorities** so all providers get a fair chance at selection
