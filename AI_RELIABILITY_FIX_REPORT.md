# AI Provider Reliability Fix — Verification Report

**Date:** 2026-08-09 · **Branch:** arena/019f4801-freeborn (no commit, no merge, no push)
**Status:** ✅ Implemented, typechecked, tested (12/12). Production untouched.

---

## 1. Verified access (evidence)

| System | Result |
|---|---|
| Supabase (pooler 6543, `postgres.ydjnobnddcevbwytdvyw`) | ✅ Connected — **read-only SELECTs only** |
| Vercel API (project `v0-nexa-platform-architecture`) | ✅ 32 env vars present incl. all 10 provider keys + CRON_SECRET + INGEST_TOKEN |
| GitHub PAT | ✅ admin on repo; default branch = arena/019f4801-freeborn |

## 2. What was broken (root causes, all evidence-backed)

1. **Dead Gemini model ID** — `gemini-2.5-flash` called by both gemini keys → live `ai_orch_health`: `404 "This model models/gemini-2.5-flash is no longer available to new users"` (7/29) + `429 "You exceeded your current quota"` (7/31, in cooldown since). Official docs: pulled early for new users; stable free-tier replacements = `gemini-3.5-flash` (GA 5/19/26), `gemini-3.6-flash`, `gemini-3.1-flash-lite`.
2. **Model verification never tested live models** — `ai_model_catalog` (refreshed 8/9 04:23): gemini/gemini_backup **0 usable**, because verification shortlisted the dead configured model + first 2 discovered (both shutdown: 2.5-pro trial-only, 2.0-flash shut down 6/1/26) while live 3.x sat at the bottom of the list.
3. **No per-provider rate limiting** — `rateLimitPerSec` declared in config but **never read anywhere** (grep-verified). Global 1.5s pacing × 3 workers = bursts far above Gemini free tier (~15 RPM / 1,500 RPD).
4. **Empty responses sealed as success** — 7-day `ai_provider_log`: **162 cloudflare + 108 mistral "success" rows with 0/null response_len**. Gateway logged success on any HTTP 200, even `""`.
5. **Failure classification gaps** — 404/dead-model fell into generic 30s→30m cooldown (re-hammered forever); quota backoff fixed 30min (too short for daily RPD); `Retry-After` ignored; `last_error_code` always persisted NULL.
6. **Failed runs sealed in queue** — 352 JAI rows `regex-extracted-0bytes` (page fetch failed + AI failed → still `completed` in queue; queue is 6,891/6,891 completed).
7. **Second-opinion false success** — audit rows `agent_id=second-opinion`, `provider=regex-extracted-*`, `event=success` when no AI ever ran.

## 3. What was fixed (8 files, provider/reliability path only)

| File | Change |
|---|---|
| `lib/ai/providers/types.ts` | gemini → **gemini-3.5-flash**; gemini_backup → **gemini-3.1-flash-lite** (separate quota bucket); `rateLimitPerSec` 2 → **0.25** (≈15 RPM, now enforced) |
| `lib/ai/gateway.ts` | **Per-provider pacing** (min interval = 1000/rate, floor 200ms) across all branches incl. Gemini SDK; **empty-response guard** → throws `empty response (0 bytes)` + failure diag `EMPTY_RESPONSE`; **Retry-After** carried into thrown errors (3 fetch branches) |
| `lib/ai/smart-router.ts` | Failure classes: **invalid-model (404/no longer available/not found) → 12h backoff**; **Retry-After parsed** and honored; **daily-quota (RPD) class → 6h backoff**; `last_error_code` now actually persisted (was always NULL) |
| `lib/ai/verifiers/consolidated.ts` | `!aiUsed && pageText.length===0` → modelVersion **`no-ai-providers`** (retryable) instead of `regex-extracted-0bytes` (fixes the sealed-failure path) |
| `lib/ai/secondOpinion.ts` | First analysis logged `event=success` **only when a real AI provider ran**; regex/no-ai fallbacks → `event=fallback` |
| `lib/ai/model-discovery.ts` | Gemini candidates: non-text families filtered; **stable 3.x ordered first** so verification tests live models (shortlist = configured + top 2 discovered) |
| `lib/ai/council/index.ts` · `lib/ai/registry/registry.ts` | Legacy `gemini-2.5-flash` labels → `gemini` (declarative metadata; council is a placeholder) |
| `package.json` + `vitest.config.ts` + `tests/` | Test harness (vitest) + `npm test` |

## 4. Focused tests — 12/12 PASS

`tests/provider-reliability.test.ts` (all provider HTTP mocked; no real keys/network/DB):
1. ✅ provider success (200 with content → success recorded, responseLen>0)
2. ✅ quota failure (429 → quotaExhausted, gated, excluded from routing)
3. ✅ quota end-to-end (gateway 429 → failure diag with httpStatus)
4. ✅ invalid model (404 dead model → 12h backoff, not 30s; excluded)
5. ✅ dead-model error surfaced (failure diag, no success)
6. ✅ fallback chain (openrouter→github→cloudflare→hf fail → groq wins; fallbackChain reported)
7. ✅ gated providers skipped in ranking (all 10 gated → 0 candidates)
8. ✅ cooldown escalation (30s → 60s → 120s)
9. ✅ empty 200 → throws EMPTY_RESPONSE, never success
10. ✅ orchestrator failover on empty 200 (logs prove EMPTY_RESPONSE → next provider)
11. ✅ Retry-After: 65 honored (≥60s backoff)
12. ✅ default 30min quota backoff when no Retry-After

**Typecheck:** `tsc --noEmit` → exit 0 (0 errors). `npm test` → 12/12 pass.

## 5. End-to-end verification summary

The empty-response failover test exercises the real production path (orchestrator → smart router → gateway → failover chain → routing log) and its stdout shows exactly the intended behavior:
```
provider_empty_response openrouter → provider_failed openrouter (attempt 1)
→ github 401 → cloudflare 500 → huggingface 500
→ provider_success groq → smart_router selected=groq outcome=success fallback=true
```

## 6. Not done (deliberately, per instructions)
- ❌ No commit / no push / no merge / no deploy
- ❌ No production writes — all DB verification was SELECT-only
- ❌ No backfills / no queue drain / no reprocessing
- ❌ No UI, migrations, or non-provider code changed

## 7. Still needs the next phase
1. **Credential problems (config, not code):** openrouter key = 402 insufficient credits; github_models = 401 unauthorized; groq/cerebras hit rate limits. Rotate/upgrade these keys or drop the dead providers.
2. **Deploy + verify live:** after merge, watch `/api/ai/health`, `ai_orch_health` (gemini should reappear usable after the next model-sync at the 05:00 cron with the new model IDs), and `ai_provider_log` (EMPTY_RESPONSE failures replacing fake successes).
3. **Data remediation (later, with explicit approval):** the 352 `regex-extracted-0bytes` rows and the 162+108 fake-success log rows are historical artifacts; decide whether to re-queue those jobs for real verification (queue currently all `completed`).
4. **Longer-term:** per-provider token budgets (TPM), Retry-After on the Gemini SDK path, and automatic model-migration when a configured model 404s (instead of waiting for the 12h backoff + sync).
