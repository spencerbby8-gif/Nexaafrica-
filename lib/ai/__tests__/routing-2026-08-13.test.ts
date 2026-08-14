import { describe, it, expect, beforeEach } from 'vitest'
import {
  routeTaskAll,
  resetRouterHealthForTesting,
  setRouterHealthForTesting,
} from '../smart-router'
import { setProvidersForTesting } from '../providers/dynamic-registry'
import { PROVIDERS, type ProviderConfig, type ProviderId } from '../providers/types'

/**
 * REAL PRODUCTION SCENARIO — 2026-08-13 (post cohere + mistral_backup wiring).
 *
 * Inputs are the actual live rows captured 2026-08-13 09:11 UTC:
 *  - ai_model_registry: mistral + mistral_backup (3 models each, structuredJSON
 *    true), cohere command-a-03-2025 (structuredJSON true, healthScore 100),
 *    cloudflare gemma-2b-it-lora (structuredJSON FALSE — the only usable
 *    cloudflare model), groq llama-3.1-8b-instant.
 *  - ai_orch_health: mistral 3154 successes/96%, groq 120 calls/70%,
 *    cloudflare 770 calls/95% @ 4580ms, mistral_backup + cohere no history.
 *
 * DATABASE VERIFIED inputs; TEST VERIFIED behavior.
 */
const mk = (id: ProviderId, over: Partial<ProviderConfig>): ProviderConfig => ({
  ...PROVIDERS.find(p => p.id === id)!,
  ...over,
  id,
})

const PROVIDER_CFGS: ProviderConfig[] = [
  mk('mistral', { model: 'mistral-medium-2508', capabilities: { structuredJSON: true, chat: true } }),
  mk('mistral_backup', { model: 'mistral-medium-2508', capabilities: { structuredJSON: true, chat: true } }),
  mk('cohere', { model: 'command-a-03-2025', capabilities: { structuredJSON: true, chat: true } }),
  mk('groq', { model: 'llama-3.1-8b-instant', capabilities: { structuredJSON: true, chat: true } }),
  // cloudflare's only usable model is gemma-2b (measured structuredJSON:false)
  mk('cloudflare', { model: '@cf/google/gemma-2b-it-lora', capabilities: { chat: true, structuredJSON: false } }),
  mk('huggingface', { model: 'meta-llama/Llama-3.1-8B-Instruct', capabilities: { structuredJSON: true, chat: true } }),
]

const NOW = Date.now()
const HEALTH: Record<string, Record<string, unknown>> = {
  mistral: {
    totalSuccesses: 3154, totalFailures: 130, avgLatencyMs: 834,
    lastSuccessAt: NOW - 2 * 3_600_000,
    taskStats: { fast_extraction: { ok: 2310, fail: 92, totalMs: 1_900_000 }, cv_parsing: { ok: 7, fail: 0, totalMs: 8_000 } },
  },
  mistral_backup: { totalSuccesses: 0, totalFailures: 0, avgLatencyMs: 0, lastSuccessAt: 0, taskStats: {} },
  cohere: { totalSuccesses: 0, totalFailures: 0, avgLatencyMs: 0, lastSuccessAt: 0, taskStats: {} },
  groq: {
    totalSuccesses: 84, totalFailures: 36, avgLatencyMs: 1161,
    lastSuccessAt: NOW - 6 * 3_600_000,
    taskStats: { fast_extraction: { ok: 68, fail: 30, totalMs: 80_000 } },
  },
  cloudflare: {
    totalSuccesses: 735, totalFailures: 35, avgLatencyMs: 4580,
    lastSuccessAt: NOW - 48 * 3_600_000,
    taskStats: { fast_extraction: { ok: 559, fail: 25, totalMs: 2_600_000 } },
  },
  huggingface: {
    totalSuccesses: 175, totalFailures: 70, avgLatencyMs: 8771,
    lastSuccessAt: NOW - 72 * 3_600_000,
    taskStats: { fast_extraction: { ok: 102, fail: 58, totalMs: 1_000_000 } },
  },
}

function seed() {
  resetRouterHealthForTesting()
  setProvidersForTesting(PROVIDER_CFGS)
  for (const [id, h] of Object.entries(HEALTH)) {
    setRouterHealthForTesting(id as ProviderId, h as any)
  }
}

const isJsonCapable = (p: ProviderConfig): boolean =>
  !(p.capabilities?.structuredJSON === false)

describe('smart router — structured routing with cohere + mistral_backup (2026-08-13 live data)', () => {
  beforeEach(seed)

  it('structured tasks: mistral wins; gemma-2b (JSON-incapable) never beats a JSON-capable provider', () => {
    for (const task of ['job_intelligence', 'fast_extraction', 'cv_parsing'] as const) {
      const ranked = routeTaskAll(task)
      expect(ranked.length).toBeGreaterThan(0)
      expect(ranked[0].provider.id).toBe('mistral')
      expect(ranked[0].provider.model).toBe('mistral-medium-2508')
      expect(isJsonCapable(ranked[0].provider)).toBe(true)
      // Gemma-2b must be ranked BELOW every JSON-capable provider for structured tasks
      const cfIdx = ranked.findIndex(d => d.provider.id === 'cloudflare')
      expect(cfIdx).toBeGreaterThan(-1)
      for (let i = 0; i < cfIdx; i++) {
        expect(isJsonCapable(ranked[i].provider), `${ranked[i].provider.id} should be JSON-capable to outrank gemma-2b`).toBe(true)
      }
    }
  })

  it('new providers cohere + mistral_backup are eligible (neutral score, never gated)', () => {
    const ranked = routeTaskAll('job_intelligence')
    const cohere = ranked.find(d => d.provider.id === 'cohere')
    const backup = ranked.find(d => d.provider.id === 'mistral_backup')
    expect(cohere).toBeDefined()
    expect(backup).toBeDefined()
    expect(cohere!.score).toBeGreaterThan(0)
    expect(backup!.score).toBeGreaterThan(0)
    // both are JSON-capable so they sit in the JSON-capable tier (above gemma-2b)
    const cfIdx = ranked.findIndex(d => d.provider.id === 'cloudflare')
    expect(ranked.findIndex(d => d.provider.id === 'cohere')).toBeLessThan(cfIdx)
    expect(ranked.findIndex(d => d.provider.id === 'mistral_backup')).toBeLessThan(cfIdx)
  })

  it('non-structured tasks are NOT JSON-tiered — gemma-2b may rank high on availability', () => {
    const ranked = routeTaskAll(undefined)
    const cfIdx = ranked.findIndex(d => d.provider.id === 'cloudflare')
    // cloudflare must still be eligible (score > 0) — availability preserved
    expect(cfIdx).toBeGreaterThan(-1)
    expect(ranked[cfIdx].score).toBeGreaterThan(0)
    // NO JSON tiering here: at least one JSON-capable provider may rank below
    // gemma-2b (free tier / latency can win for non-structured work) — this is
    // the documented availability behavior, unlike structured tasks above.
    const jsonCapableBelow = ranked.slice(cfIdx + 1).filter(d => isJsonCapable(d.provider))
    expect(jsonCapableBelow.length).toBeGreaterThan(0)
  })

  it('deterministic: identical inputs produce identical ranking', () => {
    const a = routeTaskAll('job_intelligence').map(d => `${d.provider.id}:${d.score}`)
    const b = routeTaskAll('job_intelligence').map(d => `${d.provider.id}:${d.score}`)
    expect(a).toEqual(b)
  })
})
