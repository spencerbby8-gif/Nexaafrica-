import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../model-discovery', () => ({ getModelCatalog: vi.fn() }))

import { getModelCatalog } from '../model-discovery'
import { forceRefresh } from '../providers/dynamic-registry'

/**
 * Dynamic registry model selection — JSON-capability guard.
 * Fixture mirrors the real ai_model_registry rows (2026-08-11):
 * cloudflare usable = gemma-2b-it-lora (367ms) + llama-3.3-70b (505ms);
 * no benchmarks exist for any model (benchmarks={} in every row).
 * DATABASE VERIFIED inputs; TEST VERIFIED behavior.
 */
const cfGemma = {
  modelId: '@cf/google/gemma-2b-it-lora',
  capabilities: { chat: true },
  health: { usable: true, avgLatencyMs: 367, lastVerifiedAt: '2026-08-11T04:23:38.577Z' },
  benchmarks: {},
}
const cfLlama = {
  modelId: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  capabilities: { chat: true },
  health: { usable: true, avgLatencyMs: 505, lastVerifiedAt: '2026-08-11T04:23:37.921Z' },
  benchmarks: {},
}
const cfGptOss = {
  modelId: '@cf/openai/gpt-oss-120b',
  capabilities: { chat: true },
  health: { usable: false, avgLatencyMs: 288, lastVerifiedAt: '2026-08-11T04:23:38.210Z' },
  benchmarks: {},
}

describe('dynamic registry — model selection prefers JSON-capable models', () => {
  beforeEach(() => vi.clearAllMocks())

  it('selects llama-3.3-70b over the faster gemma-2b (banned) — production fix', async () => {
    vi.mocked(getModelCatalog).mockResolvedValue([
      { provider: 'cloudflare', models: [cfGemma, cfLlama, cfGptOss] },
    ] as any)
    const provs = await forceRefresh()
    const cf = provs.find(p => p.id === 'cloudflare')!
    expect(cf.model).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast')
    expect(cf.enabled).toBe(true)
  })

  it('falls back to the banned model when it is the ONLY usable option (availability preserved)', async () => {
    vi.mocked(getModelCatalog).mockResolvedValue([
      { provider: 'cloudflare', models: [cfGemma] },
    ] as any)
    const provs = await forceRefresh()
    const cf = provs.find(p => p.id === 'cloudflare')!
    expect(cf.model).toBe('@cf/google/gemma-2b-it-lora')
    expect(cf.enabled).toBe(true)
  })

  it('prefers benchmarked models (existing accuracy behavior) over latency order', async () => {
    const gemmaWithBenchmark = {
      ...cfGemma,
      benchmarks: { overallScore: 92, lastBenchmarkAt: '2026-07-30T00:00:00Z' },
    }
    vi.mocked(getModelCatalog).mockResolvedValue([
      { provider: 'cloudflare', models: [gemmaWithBenchmark, cfLlama] },
    ] as any)
    const provs = await forceRefresh()
    const cf = provs.find(p => p.id === 'cloudflare')!
    // benchmarked model wins the pool even though llama is not banned —
    // accuracy-first ordering is preserved (only a BANNED+benchmarked model
    // would lose to a non-banned one).
    expect(cf.model).toBe('@cf/google/gemma-2b-it-lora')
  })
})
