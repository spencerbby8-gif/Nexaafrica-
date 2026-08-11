import { describe, it, expect, beforeEach } from 'vitest'
import {
  routeTaskAll,
  resetRouterHealthForTesting,
  setRouterHealthForTesting,
  recordRouterFailure,
} from '../smart-router'
import { setProvidersForTesting } from '../providers/dynamic-registry'
import { PROVIDERS, type ProviderConfig, type ProviderId } from '../providers/types'

/**
 * REAL PRODUCTION SCENARIO — Mistral vs Cloudflare Gemma 2B (2026-08-11).
 *
 * Inputs are the actual live rows captured during the production truth audit:
 *  - ai_orch_health: per-provider totals, EWMA latency, per-task stats
 *  - ai_model_registry: cloudflare's selected model was gemma-2b-it-lora
 *    (lowest-latency usable, 367ms vs llama-3.3-70b 505ms)
 *  - ai_provider_log + job_ai_intelligence: gemma-2b returned unparseable
 *    JSON for 37/40 calls that day.
 *
 * DATABASE VERIFIED inputs; TEST VERIFIED behavior.
 */

const mk = (id: ProviderId, over: Partial<ProviderConfig>): ProviderConfig => ({
  ...PROVIDERS.find(p => p.id === id)!,
  ...over,
  id,
})

const PROVIDER_CFGS: ProviderConfig[] = [
  mk('mistral', { priority: 9, costPer1kTokens: 3, model: 'mistral-medium-2505' }),
  // registry had selected gemma-2b (fastest usable) — the production bug state
  mk('cloudflare', { priority: 8, costPer1kTokens: 0, model: '@cf/google/gemma-2b-it-lora', capabilities: { chat: true } }),
  mk('huggingface', { priority: 6, costPer1kTokens: 1, model: 'meta-llama/Llama-3.1-8B-Instruct' }),
  mk('nvidia', { priority: 10, costPer1kTokens: 2, model: 'meta/llama-3.1-70b-instruct' }),
]

const NOW = Date.now()
const HEALTH: Record<string, Record<string, unknown>> = {
  mistral: {
    totalSuccesses: 2869, totalFailures: 128, avgLatencyMs: 10703,
    lastSuccessAt: NOW - 26 * 3_600_000,
    taskStats: { fast_extraction: { ok: 2219, fail: 90, totalMs: 20_629_914 } },
  },
  cloudflare: {
    totalSuccesses: 735, totalFailures: 34, avgLatencyMs: 4580,
    lastSuccessAt: NOW - 72 * 3_600_000,
    taskStats: { fast_extraction: { ok: 559, fail: 25, totalMs: 2_616_557 } },
  },
  huggingface: {
    totalSuccesses: 161, totalFailures: 68, avgLatencyMs: 8771,
    lastSuccessAt: NOW - 96 * 3_600_000,
    taskStats: { fast_extraction: { ok: 94, fail: 56, totalMs: 977_969 } },
  },
  nvidia: {
    totalSuccesses: 19, totalFailures: 31, avgLatencyMs: 16570,
    lastSuccessAt: NOW - 240 * 3_600_000,
    taskStats: { fast_extraction: { ok: 13, fail: 10, totalMs: 149_465 } },
  },
}

function seed() {
  resetRouterHealthForTesting()
  setProvidersForTesting(PROVIDER_CFGS)
  for (const [id, h] of Object.entries(HEALTH)) {
    setRouterHealthForTesting(id as ProviderId, h as any)
  }
}

describe('smart router — JSON-capable ranking (production scenario 2026-08-11)', () => {
  beforeEach(seed)

  it('REPRODUCES the measured bias: gemma-2b cloudflare raw score beats mistral (70 > 59)', () => {
    const ranked = routeTaskAll('fast_extraction')
    const cf = ranked.find(d => d.provider.id === 'cloudflare')!
    const mi = ranked.find(d => d.provider.id === 'mistral')!
    // This is the bug that shipped 40 jobs to gemma-2b on 2026-08-11:
    // latency band (+5) and free-tier cost (+6) outweighed everything else.
    expect(cf.score).toBeGreaterThan(mi.score)
  })

  it('FIX: for structured tasks, JSON-capable providers rank above gemma-2b cloudflare', () => {
    const ranked = routeTaskAll('fast_extraction')
    const order = ranked.map(d => d.provider.id)
    expect(order[0]).toBe('mistral')
    // capable tier sorted by measured score
    expect(order.slice(0, 3)).toEqual(['mistral', 'huggingface', 'nvidia'])
    // gemma-2b cloudflare: last, but still eligible (never gated away)
    expect(order[order.length - 1]).toBe('cloudflare')
    const cf = ranked.find(d => d.provider.id === 'cloudflare')!
    expect(cf.score).toBeGreaterThan(0)
    // demotion must be visible in reasoning
    expect(cf.reasoning.join(' ')).toContain('not JSON-capable')
  })

  it('latency bands are flattened: 10.7s mistral (4) vs 4.6s cloudflare (7) — 3-pt spread, not 5', () => {
    const ranked = routeTaskAll('fast_extraction')
    const mi = ranked.find(d => d.provider.id === 'mistral')!
    const cf = ranked.find(d => d.provider.id === 'cloudflare')!
    expect(mi.factors.latencyScore).toBe(4)
    expect(cf.factors.latencyScore).toBe(7)
  })

  it('non-structured tasks are NOT JSON-tiered — fast free provider may lead (availability)', () => {
    const ranked = routeTaskAll('edge_processing')
    const order = ranked.map(d => d.provider.id)
    // no per-task stats for edge_processing → neutral fit; cloudflare (fast,
    // free, recency) can rank first — the JSON tier only applies to tasks
    // whose output must be structured.
    expect(order[0]).toBe('cloudflare')
  })

  it('deterministic: identical inputs produce identical ranking', () => {
    const a = routeTaskAll('fast_extraction').map(d => d.provider.id)
    const b = routeTaskAll('fast_extraction').map(d => d.provider.id)
    expect(a).toEqual(b)
  })

  it('failover intact: a failed provider is skipped, then re-enters after cooldown', () => {
    recordRouterFailure('mistral', '500 internal error')
    let ranked = routeTaskAll('fast_extraction')
    expect(ranked.find(d => d.provider.id === 'mistral')).toBeUndefined()
    expect(ranked[0].provider.id).toBe('huggingface')
    // cooldown expires → mistral re-enters candidacy (bounded, self-healing)
    setRouterHealthForTesting('mistral', { cooldownUntil: 0 })
    ranked = routeTaskAll('fast_extraction')
    expect(ranked.find(d => d.provider.id === 'mistral')).toBeDefined()
  })
})
