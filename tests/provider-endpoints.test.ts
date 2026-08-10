/**
 * Focused tests for the provider diagnostic classifier + the proven
 * endpoint/model fixes:
 *   - GitHub Models: endpoint migrated from the DEAD Azure endpoint
 *     (models.inference.ai.azure.com — deprecated, support removed
 *     2026-10-17) to models.github.ai/inference/chat/completions.
 *   - OpenRouter: configured model is a verified :free variant (account has
 *     no credits; paid models 402).
 *   - classifyProviderError maps status/body → failure class without leaking
 *     raw bodies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifyProviderError } from '@/lib/ai/diag'

vi.mock('@supabase/supabase-js', () => {
  const client = () => ({
    from: () => ({ upsert: async () => ({ error: null }), select: async () => ({ data: [] }) }),
  })
  return { createClient: client }
})

describe('classifyProviderError', () => {
  it('classifies auth (401/403)', () => {
    expect(classifyProviderError(401, 'unauthorized')).toBe('auth')
    expect(classifyProviderError(403, 'forbidden')).toBe('auth')
  })

  it('classifies billing (402 / insufficient credits)', () => {
    expect(classifyProviderError(402, 'Insufficient credits. This account never purchased credits.')).toBe('billing')
    expect(classifyProviderError(402, 'payment required')).toBe('billing')
  })

  it('classifies quota (429 / rate limit)', () => {
    expect(classifyProviderError(429, 'rate limit exceeded')).toBe('quota')
    expect(classifyProviderError(429, 'RESOURCE_EXHAUSTED')).toBe('quota')
  })

  it('classifies model errors (404 / dead model)', () => {
    expect(classifyProviderError(404, 'This model models/gemini-2.5-flash is no longer available')).toBe('model')
    expect(classifyProviderError(404, 'model does not exist')).toBe('model')
  })

  it('classifies server (5xx) and network failures', () => {
    expect(classifyProviderError(503, 'overloaded')).toBe('server')
    expect(classifyProviderError(null, 'fetch failed')).toBe('network')
    expect(classifyProviderError(null, 'ECONNRESET')).toBe('network')
  })

  it('classifies ok on 2xx', () => {
    expect(classifyProviderError(200, 'ok')).toBe('ok')
  })
})

describe('GitHub Models endpoint migration', () => {
  it('gateway calls models.github.ai (not the dead Azure endpoint)', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    await callProvider('github_models', { prompt: 'x', agentId: 't' }, 0, [])
    expect(calls[0]).toContain('models.github.ai/inference/chat/completions')
    expect(calls[0]).not.toContain('models.inference.ai.azure.com')
  })

  it('no api-version header is sent to models.github.ai', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    let sentHeaders: Record<string, string> = {}
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      sentHeaders = (init?.headers as Record<string, string>) || {}
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    await callProvider('github_models', { prompt: 'x', agentId: 't' }, 0, [])
    expect(Object.keys(sentHeaders).some((k) => k.toLowerCase() === 'api-version')).toBe(false)
  })
})

describe('OpenRouter free-model configuration', () => {
  it('configured openrouter model is a :free variant (account has no credits)', async () => {
    const { PROVIDERS } = await import('@/lib/ai/providers/types')
    const p = PROVIDERS.find((x) => x.id === 'openrouter')
    expect(p).toBeDefined()
    expect(p!.model).toMatch(/:free$/)
  })
})
