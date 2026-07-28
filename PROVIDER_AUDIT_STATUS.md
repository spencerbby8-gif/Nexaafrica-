# Provider Audit - Live Testing Instructions

**Commit**: `bdadf43`  
**Branch**: `fix/ai-pipeline-reliability-8-critical-fixes`  
**Status**: ✅ DEPLOYED, AWAITING LIVE TEST

---

## What Was Built

I've created a comprehensive provider audit endpoint that tests all 10 providers live:

**Endpoint**: `GET /api/providers/audit`

**Tests**:
1. **Gemini** (primary + backup) - 5 models each
2. **Groq** - 5 models
3. **Cerebras** - 3 models
4. **OpenRouter** - 5 models
5. **GitHub Models** - 5 models
6. **Cloudflare Workers AI** - 3 models
7. **Mistral** - 5 models
8. **NVIDIA NIM** - 4 models
9. **Hugging Face** - (skipped if env not set)
10. **Cohere** - (skipped if env not set)

**For each provider, the endpoint**:
- Queries the provider's model catalog API
- Identifies all available free tier models
- Tests 5 models (or all if fewer)
- Records: success, latency, error, quota behavior
- Verifies each model is in the catalog
- Returns comprehensive JSON results

---

## How to Test Live

### Step 1: Get the Deployment URL

The deployment should be available at:
```
https://v0-nexa-platform-architecture-git-fix-ai-pipeline-reliability-8-critical-fixes.vercel.app
```

Or check the Vercel dashboard for the latest preview deployment URL.

### Step 2: Call the Audit Endpoint

```bash
curl "https://[DEPLOYMENT_URL]/api/providers/audit" | python3 -m json.tool
```

Or in a browser:
```
https://[DEPLOYMENT_URL]/api/providers/audit
```

### Step 3: Analyze Results

The endpoint returns JSON like this:

```json
{
  "gemini": {
    "catalog": 45,
    "tested": 5,
    "successful": 5,
    "results": [
      {
        "model": "gemini-2.5-flash",
        "success": true,
        "latency": 1234,
        "response": "test",
        "inCatalog": true
      },
      // ... more models
    ]
  },
  "gemini_backup": { ... },
  "groq": { ... },
  "cerebras": { ... },
  "openrouter": { ... },
  "github_models": { ... },
  "cloudflare": { ... },
  "mistral": { ... },
  "nvidia": { ... }
}
```

**Key metrics to check**:
- `catalog`: Number of models available from provider
- `tested`: Number of models tested
- `successful`: Number of successful tests
- `results[].latency`: Response time in milliseconds
- `results[].inCatalog`: Whether model is in provider's catalog

---

## Expected Results

### Gemini (Primary + Backup)
- **Catalog**: ~45 models
- **Free tier models**: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro
- **Expected latency**: 1000-3000ms
- **Success rate**: Should be 100% if API key is valid

### Groq
- **Catalog**: ~10 models
- **Free tier models**: llama-3.3-70b-versatile, llama-3.1-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768, gemma2-9b-it
- **Expected latency**: 500-1500ms (very fast)
- **Success rate**: Should be 100% if API key is valid

### Cerebras
- **Catalog**: ~5 models
- **Free tier models**: llama3.1-70b, llama3.1-8b, gpt-oss-120b
- **Expected latency**: 800-2000ms
- **Success rate**: Should be 100% if API key is valid

### OpenRouter
- **Catalog**: ~200 models
- **Free tier models**: meta-llama/llama-3.3-70b-instruct, google/gemini-2.0-flash-exp:free, anthropic/claude-3.5-sonnet, openai/gpt-4o-mini, mistralai/mixtral-8x7b-instruct
- **Expected latency**: 1500-4000ms
- **Success rate**: May have some failures due to rate limits

### GitHub Models
- **Catalog**: ~20 models
- **Free tier models**: gpt-4o-mini, llama-3.1-70b-instruct, phi-3-medium-128k-instruct, mistral-large, cohere-command-r-plus
- **Expected latency**: 1500-3000ms
- **Success rate**: Should be 100% during preview period

### Cloudflare Workers AI
- **Catalog**: ~50 models
- **Free tier models**: @cf/meta/llama-3.3-70b-instruct-fp8-fast, @cf/meta/llama-3.1-8b-instruct, @cf/mistral/mistral-7b-instruct-v0.1
- **Expected latency**: 500-1500ms (edge-deployed, very fast)
- **Success rate**: Should be 100% if API token is valid

### Mistral
- **Catalog**: ~10 models
- **Free tier models**: mistral-large-latest, mistral-small-latest, open-mistral-7b, open-mixtral-8x7b, codestral-latest
- **Expected latency**: 1500-3500ms
- **Success rate**: May have some failures due to rate limits

### NVIDIA NIM
- **Catalog**: ~30 models
- **Free tier models**: meta/llama-3.1-70b-instruct, meta/llama-3.1-8b-instruct, mistralai/mixtral-8x7b-instruct-v0.1, nvidia/nemotron-4-340b-instruct
- **Expected latency**: 1500-3000ms
- **Success rate**: Should be 100% if API key is valid

---

## What to Look For

### ✅ Success Indicators
- All providers return `successful > 0`
- Latencies are within expected ranges
- Models are marked `inCatalog: true`
- No 401/403 errors (indicates invalid API keys)

### ⚠️ Warning Signs
- `successful: 0` for any provider (API key issue or quota exhausted)
- Very high latencies (>5000ms) indicating network issues
- `inCatalog: false` indicating model name mismatch
- 429 errors indicating rate limits

### ❌ Failure Indicators
- 401/403 errors: Invalid API keys
- 404 errors: Model not found or endpoint changed
- 429 errors: Rate limit or quota exceeded
- Timeout errors: Network or provider issues

---

## Next Steps After Audit

### 1. Update Provider Registry

Based on audit results, update `lib/ai/providers/types.ts` to include ALL working free tier models:

```typescript
export const PROVIDERS: ProviderConfig[] = [
  // Gemini: Multiple models
  { id: "gemini", name: "Gemini 2.5 Flash", envKey: "GEMINI_API_KEY", model: "gemini-2.5-flash", enabled: true, priority: 1, ... },
  { id: "gemini_pro", name: "Gemini 2.5 Pro", envKey: "GEMINI_API_KEY", model: "gemini-2.5-pro", enabled: true, priority: 2, ... },
  { id: "gemini_backup", name: "Gemini Backup", envKey: "GEMINI_API_KEY_BACKUP", model: "gemini-2.5-flash", enabled: true, priority: 3, ... },
  
  // Groq: Multiple models
  { id: "groq_70b", name: "Groq Llama 3.3 70B", envKey: "GROQ_API_KEY", model: "llama-3.3-70b-versatile", enabled: true, priority: 4, ... },
  { id: "groq_8b", name: "Groq Llama 3.1 8B", envKey: "GROQ_API_KEY", model: "llama-3.1-8b-instant", enabled: true, priority: 5, ... },
  
  // ... add all working models
]
```

### 2. Implement Model-Level Fallback

Update orchestrator to fall back to different models within the same provider:

```typescript
async function selectProvider(taskType?: string): Promise<ProviderConfig | null> {
  // ... existing logic
  
  // If selected provider fails, try different model from same provider
  const sameProviderModels = PROVIDERS.filter(p => 
    p.envKey === selectedProvider.envKey && p.id !== selectedProvider.id
  )
  
  for (const model of sameProviderModels) {
    const state = getState(model.id)
    if (!state.isQuotaExhausted && !state.isRateLimited) {
      return model
    }
  }
  
  // ... continue with existing fallback logic
}
```

### 3. Test Full Pipeline

After updating the registry:

1. **Health checks**: Call `/api/ai/health` to verify all models are healthy
2. **Queue processing**: Trigger intelligence on 10 jobs
3. **Provider selection**: Check which models are being used
4. **Fallback behavior**: Intentionally fail one model, verify fallback works
5. **Confidence scores**: Verify scores are reasonable
6. **Africa eligibility**: Verify eligibility is being detected
7. **Persistence**: Check results are saved to database
8. **UI rendering**: Verify UI displays intelligence correctly

---

## Files Changed

- `app/api/providers/audit/route.ts` - New audit endpoint (682 lines)
- `lib/ai/providers/types.ts` - Provider registry (needs update based on audit)
- `lib/ai/orchestrator.ts` - Orchestrator (needs model-level fallback)

---

## Summary

✅ **Audit endpoint created** - Tests all 10 providers live  
✅ **Comprehensive testing** - Queries catalogs, tests models, records metrics  
✅ **Ready for deployment** - Committed and pushed  
⏳ **Awaiting live test** - Need to call endpoint and analyze results  
⏳ **Registry update needed** - Add all working models based on audit  
⏳ **Full pipeline test** - Verify end-to-end behavior  

**Next**: Call `/api/providers/audit` on the deployed preview, analyze results, update provider registry with all working models, test full pipeline.
