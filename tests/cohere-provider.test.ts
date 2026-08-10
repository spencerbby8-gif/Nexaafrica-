/**
 * Focused tests for the Cohere provider wiring + dead-model label check.
 *
 * COHERE_API_KEY exists in Vercel (type=sensitive, targets preview+production)
 * but its VALUE is write-only (Vercel API returns empty for sensitive vars),
 * so live key validation must happen inside the deployed environment (the
 * auth-gated /api/providers/audit route). These tests lock in the CODE path:
 * registration, gateway routing, failure handling — all with mocked fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@supabase/supabase-js', () => {
  const client = () => ({
    from: () => ({
      upsert: async () => ({ error: null }),
      select: async () => ({ data: [] }),
      insert: async () => ({ error: null }),
      update: async () => ({ error: null }),
    }),
  })
  return { createClient: client }
})

const COHERE_COMPAT_URL = 'api.cohere.ai'

let routes: Array<{ match: RegExp | string; handler: (url: string, init?: RequestInit) => Response }> = []

beforeEach(() => {
  vi.resetModules()
  routes = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    for (const r of routes) {
      const hit = typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url)
      if (hit) return r.handler(url, init)
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})

function route(match: RegExp | string, handler: (url: string, init?: RequestInit) => Response): void {
  routes.push({ match, handler })
}

describe('Cohere provider registration', () => {
  it('cohere is registered in PROVIDERS with COHERE_API_KEY and a live model', async () => {
    const { PROVIDERS } = await import('@/lib/ai/providers/types')
    const p = PROVIDERS.find((x) => x.id === 'cohere')
    expect(p).toBeDefined()
    expect(p!.envKey).toBe('COHERE_API_KEY')
    expect(p!.enabled).toBe(true)
    expect(p!.model).toMatch(/^command/)
    expect(p!.rateLimitPerSec).toBeGreaterThan(0)
  })

  it('AI_MODEL_VERSION fallback is no longer a dead Gemini model ID', async () => {
    const { AI_MODEL_VERSION } = await import('@/lib/ai/types')
    expect(AI_MODEL_VERSION).not.toMatch(/gemini/)
    expect(AI_MODEL_VERSION).toBe('no-ai-providers')
  })
})

describe('Cohere gateway path (OpenAI-compatible endpoint)', () => {
  it('returns content on a 200 from the compat endpoint and records success', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    route(COHERE_COMPAT_URL, () =>
      new Response(JSON.stringify({
        choices: [{ message: { content: '{"africa_eligibility":"likely"}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 3 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const diag: any[] = []
    const res = await callProvider('cohere', { prompt: 'test', agentId: 't' }, 0, diag)
    expect(res.provider).toBe('cohere')
    expect(res.text).toContain('africa_eligibility')
    expect(diag.some((d) => d.event === 'success' && d.responseLen > 0)).toBe(true)
    expect(diag.some((d) => d.event === 'failure')).toBe(false)
  })

  it('throws on 429 and records a failure diag (trial key = 20 req/min)', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    const { recordRouterFailure } = await import('@/lib/ai/smart-router')
    route(COHERE_COMPAT_URL, () =>
      new Response(JSON.stringify({ message: 'rate limited' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '5' } }),
    )
    const diag: any[] = []
    await expect(callProvider('cohere', { prompt: 'x', agentId: 't' }, 0, diag)).rejects.toThrow(/429/)
    expect(diag.some((d) => d.event === 'failure' && d.httpStatus === 429)).toBe(true)
    recordRouterFailure('cohere', 'cohere 429 (rate_limit_exceeded): rate limit Retry-After: 5')
    const { getRouterHealthSnapshot } = await import('@/lib/ai/smart-router')
    const s = getRouterHealthSnapshot().find((x) => x.id === 'cohere')
    expect(s).toBeDefined()
    expect(s!.quotaExhausted).toBe(true)
    expect(s!.gated).toBe(true)
  })

  it('throws on empty 200 (false-success prevention applies to cohere too)', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    route(COHERE_COMPAT_URL, () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const diag: any[] = []
    await expect(callProvider('cohere', { prompt: 'x', agentId: 't' }, 0, diag)).rejects.toThrow(/empty response/)
    expect(diag.some((d) => d.event === 'failure' && d.errorCode === 'EMPTY_RESPONSE')).toBe(true)
    expect(diag.some((d) => d.event === 'success')).toBe(false)
  })
})

describe('Cohere model discovery', () => {
  it('parses the compat /models endpoint and keeps only command-family models', async () => {
    const { discoverAllModels } = await import('@/lib/ai/model-discovery')
    route(COHERE_COMPAT_URL, () =>
      new Response(JSON.stringify({ data: [
        { id: 'command-r-plus-08-2024' },
        { id: 'command-r-08-2024' },
        { id: 'command-a-03-2025' },
        { id: 'embed-english-v3.0' },
        { id: 'rerank-english-v3.0' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    // discoverAllModels writes to Supabase (mocked no-op) — safe in tests.
    const catalogs = await discoverAllModels()
    const cohere = catalogs.find((c) => c.provider === 'cohere')
    expect(cohere).toBeDefined()
    const ids = cohere!.models.map((m) => m.modelId)
    expect(ids).toContain('command-r-plus-08-2024')
    expect(ids).not.toContain('embed-english-v3.0')
    expect(ids).not.toContain('rerank-english-v3.0')
  })
})
