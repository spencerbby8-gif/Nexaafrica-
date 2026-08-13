/**
 * Live Model Truth Sync (P2)
 *
 * Makes measured reality — not code assumptions — the source of truth for
 * which model each provider uses:
 *
 *   1. discoverAllModels()  — every provider's official model listing API
 *   2. shortlist candidates — the configured model + up to 2 discovered ones
 *   3. verify each with ONE real inference call (12s timeout) measuring
 *      latency, success, and quota state
 *   4. persist merged health into ai_model_catalog (what the dynamic
 *      provider registry actually reads) + per-model rows in ai_model_registry
 *   5. force-refresh the in-memory provider registry used by the Smart Router
 *
 * Honesty rules: a provider that cannot be verified stays with usableModels
 * = 0, gets discovery_error recorded, and the router excludes it for live
 * traffic. No model is assumed usable without a successful measured call.
 */

import { discoverAllModels, getModelCatalog, type DiscoveredModel, type ProviderCatalog } from './model-discovery'
import { PROVIDERS, type ProviderId } from './providers/types'
import { forceRefresh } from './providers/dynamic-registry'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const FRESHNESS_MS = 12 * 60 * 60 * 1000 // skip when catalog younger than 12h
const VERIFY_TIMEOUT_MS = 12_000
const MAX_DISCOVERED_CANDIDATES = 2

export interface ModelVerifyOutcome {
  modelId: string
  ok: boolean
  latencyMs: number
  quotaExhausted: boolean
  /** true when the failure is transient throttling (429 / rate limit),
   *  not evidence the model is broken */
  softFail?: boolean
  error?: string
  /** [V2.1] measured: did the model return parseable JSON for a JSON probe?
   *  Persisted as capabilities.structuredJSON — the router's structured-task
   *  ranking and the dynamic registry's model selection read it. */
  structuredJson?: boolean
}

/** Parse a minimal JSON probe response, tolerating code fences. */
function parseJsonProbe(text: string): boolean {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    const v = JSON.parse(t)
    return Boolean(v && typeof v === 'object' && v.ok === true)
  } catch {
    return false
  }
}

export interface ModelSyncSummary {
  ran: boolean
  skipped?: string
  durationMs?: number
  providers: Array<{
    provider: string
    discovered: number
    verified: number
    usable: number
    bestModel: string | null
    error?: string
  }>
  catalogEmpty: boolean
}

function keyFor(provider: string): string | undefined {
  const env: Record<string, string> = {
    gemini: 'GEMINI_API_KEY',
    gemini_backup: 'GEMINI_API_KEY_BACKUP',
    groq: 'GROQ_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    github_models: 'GITHUB_MODELS_TOKEN',
    cloudflare: 'CLOUDFLARE_API_TOKEN',
    mistral: 'MISTRAL_API_KEY',
    mistral_backup: 'MISTRAL_API_KEY_BACKUP',
    nvidia: 'NVIDIA_API_KEY',
    huggingface: 'HUGGINGFACE_API_KEY',
    cohere: 'COHERE_API_KEY',
  }
  const name = env[provider]
  return name ? process.env[name] : undefined
}

/** One real inference call against the provider's production endpoint.
 *  [V2.1] The probe now also measures structured-JSON capability: the model
 *  must return a parseable JSON object for a minimal JSON prompt. A model
 *  that answers with prose (e.g. gemma-2b-it-lora in production) is marked
 *  structuredJson=false so the router never prefers it for structured tasks. */
async function verifyCandidate(provider: string, modelId: string, apiKey: string): Promise<ModelVerifyOutcome> {
  const start = Date.now()
  const prompt = 'Reply with ONLY this JSON object and nothing else: {"ok":true}'
  try {
    let res: Response
    if (provider === 'gemini' || provider === 'gemini_backup') {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        // [V2.2] Gemini 3.x thinks by default: with a 16-token budget the
        // probe measured thinking noise instead of JSON capability
        // (gemini-3.5-flash → structuredJSON:false at 6.9s, 2026-08-12).
        // Disable thinking, raise the budget, and force JSON MIME so the
        // probe actually measures what the pipeline needs.
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 256,
            thinkingConfig: { thinkingBudget: 0 },
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      })
    } else if (provider === 'cloudflare') {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!
      res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${modelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 16 }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      })
    } else if (provider === 'cohere') {
      // Cohere v2 Chat API with JSON mode — response: message.content[0].text
      res = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      })
    } else {
      const endpoints: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1/chat/completions',
        cerebras: 'https://api.cerebras.ai/v1/chat/completions',
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        github_models: 'https://models.inference.ai.azure.com/chat/completions',
        mistral: 'https://api.mistral.ai/v1/chat/completions',
        mistral_backup: 'https://api.mistral.ai/v1/chat/completions',
        nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
        huggingface: 'https://router.huggingface.co/v1/chat/completions',
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
      if (provider === 'github_models') headers['api-version'] = '2024-05-01-preview'
      if (provider === 'openrouter') { headers['HTTP-Referer'] = 'https://v0-nexaafrica.vercel.app'; headers['X-Title'] = 'Nexa Africa' }
      res = await fetch(endpoints[provider], {
        method: 'POST', headers,
        body: JSON.stringify({ model: modelId, messages: [{ role: 'user', content: prompt }], max_tokens: 16 }),
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      })
    }
    const latencyMs = Date.now() - start
    if (!res.ok) {
      const text = await res.text()
      const quotaExhausted = res.status === 429 || /quota|insufficient/i.test(text)
      const rateLimited = res.status === 429 || /rate.?limit|too many/i.test(text)
      return { modelId, ok: false, latencyMs, quotaExhausted, softFail: quotaExhausted || rateLimited, structuredJson: false, error: `${res.status}: ${text.slice(0, 160)}` }
    }
    const data: any = await res.json().catch(() => ({}))
    const text: string =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      data?.choices?.[0]?.message?.content ??
      data?.result?.response ??
      data?.message?.content?.[0]?.text ??
      (typeof data?.message?.content === 'string' ? data.message.content : '') ?? ''
    const ok = typeof text === 'string' && text.trim().length > 0
    return {
      modelId, ok, latencyMs, quotaExhausted: false,
      structuredJson: ok ? parseJsonProbe(text) : false,
      error: ok ? undefined : 'empty response',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { modelId, ok: false, latencyMs: Date.now() - start, quotaExhausted: false, structuredJson: false, error: msg.slice(0, 160) }
  }
}

function shortlist(catalog: ProviderCatalog, configuredModel: string | undefined): string[] {
  const ids = catalog.models.map((m) => m.modelId).filter(Boolean)
  const chatLike = ids.filter((id) => !/embed|whisper|tts|rerank|guard|shield|vision|image|audio|moderation/i.test(id))
  const out: string[] = []
  if (configuredModel) out.push(configuredModel)
  for (const id of chatLike) {
    if (out.length >= 1 + MAX_DISCOVERED_CANDIDATES) break
    if (!out.includes(id)) out.push(id)
  }
  return out.slice(0, 1 + MAX_DISCOVERED_CANDIDATES)
}

function mergeHealth(existing: DiscoveredModel['health'] | undefined, outcome: ModelVerifyOutcome): DiscoveredModel['health'] {
  const now = new Date().toISOString()
  // TRUTH RULE: only a HARD failure (model missing / auth denied / bad
  // response) may mark a model unusable. Transient quota/rate limiting is
  // recorded as quota state + short cooldown while preserving prior
  // usability — otherwise a rate-limited provider would vanish from
  // routing whenever the queue happens to be busy.
  const hardFail = !outcome.ok && !outcome.softFail
  const usable = outcome.ok ? true : hardFail ? false : (existing?.usable ?? false)
    const baseScore = outcome.ok
    ? Math.min(100, 60 + Math.max(0, 40 - Math.round(outcome.latencyMs / 500)))
    : Math.max(0, Math.round((existing?.healthScore ?? 0) * 0.5))
  return {
    verified: true,
    usable,
    healthScore: baseScore,
    successRate: outcome.ok ? 100 : (existing?.successRate ?? 0),
    failureRate: outcome.ok ? 0 : 100,
    avgLatencyMs: outcome.latencyMs,
    lastVerifiedAt: now,
    lastSuccessfulAt: outcome.ok ? now : existing?.lastSuccessfulAt,
    quotaStatus: outcome.quotaExhausted ? 'exhausted' : 'ok',
    cooldownUntil: outcome.quotaExhausted ? new Date(Date.now() + CRON_MIN_MS).toISOString() : undefined,
  }
}

const CRON_MIN_MS = 10 * 60 * 1000

export async function syncLiveModelRegistry(opts: { force?: boolean; budgetMs?: number } = {}): Promise<ModelSyncSummary> {
  const budgetMs = opts.budgetMs ?? 80_000
  const deadline = Date.now() + budgetMs * 0.9
  const supabase = createClient(supabaseUrl, supabaseKey)

  if (!opts.force) {
    try {
      const { data } = await supabase
        .from('ai_model_catalog')
        .select('last_refreshed')
        .order('last_refreshed', { ascending: false })
        .limit(1)
      const newest = data?.[0]?.last_refreshed ? new Date(data[0].last_refreshed).getTime() : 0
      if (newest && Date.now() - newest < FRESHNESS_MS) {
        return { ran: false, skipped: 'fresh', providers: [], catalogEmpty: false }
      }
    } catch {}
  }

  const catalogs = await discoverAllModels()
  const summary: ModelSyncSummary = { ran: true, providers: [], catalogEmpty: catalogs.every((c) => c.totalModels === 0) }

  // Verify providers in parallel; candidates sequential within a provider.
  await Promise.all(
    catalogs.map(async (catalog) => {
      const provider = catalog.provider
      const apiKey = keyFor(provider)
      const configured = PROVIDERS.find((p) => p.id === (provider as ProviderId))?.model
      const entry: ModelSyncSummary['providers'][number] = {
        provider, discovered: catalog.totalModels, verified: 0, usable: 0, bestModel: null,
        error: catalog.discoveryError,
      }
      const existingById = new Map<string, DiscoveredModel>()
      for (const m of catalog.models) existingById.set(m.modelId, m)
      // Merge previously verified health back in (a fresh discovery resets it)
      try {
        const prev = await getModelCatalog(provider)
        const prevModels = prev[0]?.models ?? []
        for (const pm of prevModels) {
          const cur = existingById.get(pm.modelId)
          if (cur && pm.health?.lastVerifiedAt && !existingById.get(pm.modelId)?.health?.lastVerifiedAt) {
            cur.health = pm.health
          }
          // Preserve benchmark results (written by the production quality
          // audit) — a re-discovery cycle must not erase measured accuracy.
          if (cur && pm.benchmarks && !cur.benchmarks) {
            cur.benchmarks = pm.benchmarks
          }
        }
      } catch {}

      if (apiKey && Date.now() < deadline) {
        for (const modelId of shortlist(catalog, configured)) {
          if (Date.now() >= deadline) break
          const outcome = await verifyCandidate(provider, modelId, apiKey)
          entry.verified++
          if (outcome.ok) entry.usable++
          const model = existingById.get(modelId) ?? {
            provider, modelId, modelName: modelId,
            discoveredAt: new Date().toISOString(),
            discoveryEndpoint: catalog.discoveryEndpoint,
            rawResponse: null,
            capabilities: { chat: true },
            health: undefined as any,
            routingPriority: 0,
          }
          model.health = mergeHealth(model.health, outcome)
          // [V2.1] Persist the measured JSON capability — the smart router's
          // structured-task tiering and the dynamic registry's model
          // selection both read capabilities.structuredJSON.
          if (outcome.structuredJson !== undefined) {
            model.capabilities = {
              ...(model.capabilities ?? {}),
              chat: true,
              structuredJSON: outcome.structuredJson,
            }
          }
          existingById.set(modelId, model as DiscoveredModel)
        }
      }

      const models = Array.from(existingById.values())
      const usableModels = models.filter((m) => m.health?.usable)
      entry.bestModel = usableModels.sort((a, b) => (a.health.avgLatencyMs || 99999) - (b.health.avgLatencyMs || 99999))[0]?.modelId ?? null
      const verifiedModels = models.filter((m) => m.health?.verified)

      try {
        await supabase.from('ai_model_catalog').upsert({
          provider,
          discovery_endpoint: catalog.discoveryEndpoint,
          discovery_error: catalog.discoveryError ?? null,
          models,
          last_refreshed: new Date().toISOString(),
          total_models: models.length,
          verified_models: verifiedModels.length,
          usable_models: usableModels.length,
        }, { onConflict: 'provider' })

        for (const m of models.filter((x) => x.health?.lastVerifiedAt)) {
          await supabase.from('ai_model_registry').upsert({
            provider,
            model_id: m.modelId,
            model_name: m.modelName || m.modelId,
            discovered_at: m.discoveredAt,
            discovery_endpoint: catalog.discoveryEndpoint,
            capabilities: m.capabilities ?? {},
            health: m.health,
            benchmarks: m.benchmarks ?? {},
            enabled: m.health?.usable === true,
          }, { onConflict: 'provider,model_id' })
        }
      } catch (e) {
        entry.error = entry.error ?? (e instanceof Error ? e.message : String(e)).slice(0, 160)
      }
      summary.providers.push(entry)
    }),
  )

  try { await forceRefresh() } catch {}
  summary.durationMs = undefined
  return summary
}
