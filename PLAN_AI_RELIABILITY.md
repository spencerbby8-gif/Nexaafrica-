# PLAN — Nexa AI Provider Reliability Fix

**Date:** 2026-08-09 · **Branch:** arena/019f4801-freeborn (HEAD 3d2dc90, clean tree) · **Scope:** provider/reliability path only
**Constraints honored:** read-only verification done; no production writes, no merges, no backfills, no deploys.

---

## 0. Verified state (evidence, not guesses)

### Live access — all verified working from this session
| System | Check | Result |
|---|---|---|
| Supabase | psql via transaction pooler (aws-1-us-east-1.pooler.supabase.com:6543, postgres.ydjnobnddcevbwytdvyw) | ✅ CONNECTED — 21 AI/jobs tables present |
| Vercel | API token → project `v0-nexa-platform-architecture` (prj_FDp22Mo7UJIxEUABRVCKXeX6MBXD) | ✅ token works; 32 env vars incl. all 10 provider keys + CRON_SECRET + INGEST_TOKEN |
| GitHub | PAT → repo `spencerbby8-gif/Nexaafrica-` | ✅ admin perms; default branch = arena/019f4801-freeborn |

### Live production evidence (Supabase, read-only)
- `ai_orch_health` (router's persisted state):
  - **gemini**: `429 "You exceeded your current quota..."` — in cooldown since 2026-07-31, never recovered
  - **gemini_backup**: `404 "This model models/gemini-2.5-flash is no longer available to new users"` — **configured model ID is dead for this key**
  - openrouter: 402 Insufficient credits · github_models: 401 unauthorized · cerebras: 429 RPM · groq: 429 TPM
  - healthy: mistral, cloudflare, huggingface, nvidia (mistral dominates production)
- `ai_provider_log` (last 7d): **162 cloudflare + 108 mistral "success" rows with response_len = 0/null** → empty HTTP-200 bodies are sealed as provider success
- `ai_processing_queue`: **6,891 / 6,891 rows = completed** (nothing ever ends failed)
- `job_ai_intelligence.model_version`: mistral:mistral-medium-2505 (1508) · **regex-extracted-0bytes (352)** · cloudflare (247) — regex rows with 0-byte page = AI failed + page fetch failed, still sealed completed
- `ai_model_catalog` (refreshed today 04:23): gemini & gemini_backup: **3 models, 0 usable, failureRate 100%** — router therefore disables Gemini entirely (no gemini attempts in 7d)
- Gemini catalog contains live models (gemini-3.5-flash, gemini-3.6-flash, gemini-3.1-flash-lite, gemini-3.5-flash-lite) but **verification only tests the configured model (dead 2.5-flash) + first 2 discovered (gemini-2.5-pro trial-only, gemini-2.0-flash shutdown)** → never tests the live ones
- `regex-extracted-*` success rows in ai_provider_log come from the **second-opinion** flow (agent_id=second-opinion) logging success when the primary AI never ran

### Official docs (web-verified 2026-08-09)
- **gemini-2.5-flash**: pulled early for new users (404) despite official deprecation 2026-10-16 — Google dev forum + Firebase models doc
- **Stable free-tier replacements**: `gemini-3.5-flash` (GA 2026-05-19, "billing not required"), `gemini-3.6-flash` (GA 2026-07-21), `gemini-3.5-flash-lite` (GA 2026-07-21), `gemini-3.1-flash-lite` (GA 2026-05-07)
- **Free tier limits**: Flash class ≈ 10–15 RPM / 1,500 RPD / 1M TPM (per Google docs + third-party 2026 tables)
- **429 handling per Google**: exponential backoff + jitter, honor Retry-After; never retry 400/403
- Supabase pooler: port 6543, user `postgres.<ref>`, sslmode=require (verified working)
- Vercel API: /v9/projects, /v6/deployments, /v9/projects/{id}/env (verified working)

---

## 1. Root causes (ranked)

1. **Dead Gemini model ID** (`gemini-2.5-flash`) in `lib/ai/providers/types.ts` for BOTH gemini and gemini_backup → 404 NOT_FOUND for this key since ~7/29 (live ai_orch_health row).
2. **Model verification never tests live models** — `model-sync.ts` shortlists "configured + first 2 discovered"; discovery returns models in API order with dead 2.x first → all Gemini marked unusable → router excludes Gemini entirely.
3. **No per-provider rate limiting** — `rateLimitPerSec` is declared but **never read anywhere** (grep-verified). Global pacing (1.5s × 3 workers) allows >15 RPM bursts to one provider → 429 quota storms.
4. **Empty responses sealed as success** — `gateway.ts` logs `event:"success"` + `recordRouterSuccess` even when the provider returns HTTP 200 with `""`/empty content (verified: 162+108 such rows in 7d).
5. **Failure classification gaps** — `smart-router.ts` treats 404/not-found as generic 30s→30m cooldown (dead model re-hammered forever); quota backoff fixed at 30min (too short for daily-quota (RPD) exhaustion); `Retry-After` never honored; `last_error_code` always persisted as NULL (bug in persistHealth).
6. **Failed runs sealed in the queue** — `consolidated.ts` returns `modelVersion="regex-extracted-0bytes"` when AI failed AND page fetch returned 0 bytes; engine's `allProvidersFailed` check doesn't catch it → upsert + `completed`.
7. **Second-opinion logs false success** — logs `provider=regex-extracted-*`, `event=success` when no AI ran (agent_id=second-opinion rows verified in DB).

---

## 2. Exact files to change + exact changes

| # | File | Change |
|---|---|---|
| 1 | `lib/ai/providers/types.ts` | gemini: model `gemini-2.5-flash` → **`gemini-3.5-flash`**, name "Gemini 3.5 Flash"; gemini_backup: model → **`gemini-3.1-flash-lite`** (different quota bucket), name update; rateLimitPerSec gemini 2→**0.25**, gemini_backup 2→**0.25** (≈15 RPM ceiling) |
| 2 | `lib/ai/gateway.ts` | (a) per-provider min-interval pacing keyed on `cfg.rateLimitPerSec` (min interval = 1000/rate, floor 200ms) covering ALL provider branches incl. Gemini SDK path; (b) **empty-response guard**: `text.trim().length===0` → push failure diag + throw `Provider ${id} empty response` (kills false success); (c) throw errors carrying `status/code/retryAfter` in message: `${providerId} ${status} (${code}): ${msg} Retry-After: ${n}` when header present |
| 3 | `lib/ai/smart-router.ts` | `recordRouterFailure`: (a) new **invalid-model class** — msg matches `404|no longer available|not found|does not exist|invalid model` → cooldown 12h (dead model must not be re-hammered); (b) **parse `Retry-After: N`** → quotaResetAt/cooldownUntil = now + max(default, N·1000); (c) **RPD-class** (msg has `per day|tokens per day|daily`) → 6h backoff instead of 30min; (d) `persistHealth` gains `errorCode` param — extract code from errMsg (`/^[a-z_]+ (\d{3})/`) and persist `last_error_code` (was always null) |
| 4 | `lib/ai/verifiers/consolidated.ts` | when `!aiUsed` AND page fetch failed (`pageText.length===0`) → modelVersion = **`no-ai-providers`** (retryable) instead of `regex-extracted-0bytes`; regex fallback still honored when page text exists (existing design, honest) |
| 5 | `lib/ai/secondOpinion.ts` | don't write `event:"success"` rows when the source verification used no AI provider (regex/no-ai) — write honest `event:"skipped_no_ai"` or skip logging; never present a failed AI run as success in the audit trail |
| 6 | `lib/ai/model-discovery.ts` | Gemini candidates: stable-order filter — exclude non-text families (`image|tts|lyria|robotics|nano-banana|antigravity|deep-research|computer-use`) and **prefer current stable text models first** (`gemini-3.5-flash, gemini-3.6-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-2.5-flash-lite, …rest`) so model-sync's shortlist verifies live models |
| 7 | `package.json` | add `vitest` devDependency + `"test": "vitest run"` script |
| 8 | `vitest.config.ts` (NEW) | alias `@` → repo root; `setupFiles: tests/setup.ts` |
| 9 | `tests/setup.ts` (NEW) | dummy env (NEXT_PUBLIC_SUPABASE_URL etc.), global fetch stub helper, reset router health between tests |
| 10 | `tests/provider-reliability.test.ts` (NEW) | focused tests (below) |

**NOT changing** (out of scope / next phase): openrouter 402 + github_models 401 (credential problems, not code), Vercel cron topology, queue backfill, anything UI, migrations. No writes to production DB.

## 3. Focused tests (tests/provider-reliability.test.ts)
1. **provider success** — mocked 200 with content → `callProvider` returns text/provider/latency; diag has `success` with `responseLen>0`; router `totalSuccesses` increments.
2. **quota failure** — mocked 429 → throws; `recordRouterFailure` sets `isQuotaExhausted` + future `quotaResetAt`; `routeTaskAll` excludes provider while backoff active.
3. **invalid model** — mocked 404 "no longer available" → classified invalid-model: cooldown ≥ 1h (not generic 30s).
4. **fallback** — first provider 429, second 200 → `orchestrate()` returns `fallbackUsed=true`, `fallbackChain=[a,b]`, response from second.
5. **cooldown escalation** — consecutive generic failures escalate 30s→60s→120s; provider gated during cooldown.
6. **false-success prevention** — mocked 200 with `""` → `callProvider` THROWS empty-response; no success recorded; orchestrator falls through to next provider.
7. **retry-after honored** — 429 + `Retry-After: 65` → backoff ≥ 60s.

## 4. Execution order
1. npm install (restore node_modules) → add vitest
2. Apply code changes (#1–#6)
3. Write tests (#7–#10)
4. `npx tsc --noEmit` → `npx vitest run`
5. Fix failures until green
6. End-to-end sanity: run the router simulation against mocked provider responses (test suite covers); verify no production touch
7. Report: broken / fixed / next phase

## 5. Risks & guards
- Tests must not hit real provider APIs (all fetch mocked; no API keys in test env).
- No DB writes anywhere in this phase — verification stays read-only.
- Pacing change could slow single-provider throughput (mitigated: failover across 10 providers).
- Empty-response guard may cause more visible provider "failures" — that is the intended honesty fix (they were already failing, just hidden).
