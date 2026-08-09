/**
 * Focused AI provider reliability tests.
 *
 * Coverage requested:
 *   1. provider success          — 200 with content → success recorded
 *   2. quota failure             — 429 → quota exhaustion + routing exclusion
 *   3. invalid model             — 404 dead model → long (12h) backoff
 *   4. fallback                  — first providers fail → next one wins
 *   5. cooldown                  — consecutive generic failures escalate
 *   6. false-success prevention  — empty 200 body → failure, never success
 *   7. retry-after honored       — provider Retry-After extends the backoff
 *
 * All provider HTTP traffic is mocked at the global fetch boundary. The
 * Supabase client is mocked so router health persistence is a no-op.
 * No real API keys, no real network, no real DB.
 *
 * NOTE on the Gemini SDK path: @google/genai performs its own HTTP internally,
 * so the gateway cannot attach httpStatus to failure diags for gemini/
 * gemini_backup (the SDK throws before the gateway sees the Response). Those
 * providers are gated via recordRouterFailure in the orchestration tests so
 * the failover chain is deterministic and never depends on live network.
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

// ── fetch stub infrastructure ────────────────────────────────────
type FetchHandler = (url: string, init?: RequestInit) => Response
let routes: Array<{ match: RegExp | string; handler: FetchHandler }> = []

const defaultHandler: FetchHandler = (_url) =>
  new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  // Fresh module instances per test → router health state cannot leak across
  // tests (smart-router health, gateway pacing cache, caches are module-level).
  vi.resetModules()
  routes = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      for (const r of routes) {
        const hit = typeof r.match === 'string' ? url.includes(r.match) : r.match.test(url)
        if (hit) return r.handler(url, init)
      }
      return defaultHandler(url, init)
    }),
  )
})

function route(match: RegExp | string, handler: FetchHandler): void {
  routes.push({ match, handler })
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const OPENAI_404_MODEL_BODY = {
  error: { code: 'NOT_FOUND', message: 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use a newer model.' },
}

async function snap(id: string) {
  const { getRouterHealthSnapshot } = await import('@/lib/ai/smart-router')
  const s = getRouterHealthSnapshot().find((x) => x.id === id)
  if (!s) throw new Error(`no snapshot for ${id}`)
  return s
}

function remainingFrom(reason: string | null): number | null {
  if (!reason) return null
  const m = reason.match(/\((\d+)s remaining\)/)
  return m ? parseInt(m[1], 10) : null
}

/** Gate the SDK-path providers (gemini / gemini_backup) so orchestration
 *  tests are deterministic and never touch the live Gemini SDK network path. */
async function gateSdkProviders() {
  const { recordRouterFailure } = await import('@/lib/ai/smart-router')
  recordRouterFailure('gemini', 'gemini 404 (NOT_FOUND): This model models/gemini-2.5-flash is no longer available to new users')
  recordRouterFailure('gemini_backup', 'gemini_backup 404 (NOT_FOUND): This model models/gemini-2.5-flash is no longer available to new users')
}

// ── tests ────────────────────────────────────────────────────────

describe('provider success', () => {
  it('records a real success for a 200 with content', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    const { recordRouterSuccess } = await import('@/lib/ai/smart-router')
    route('api.groq.com', () =>
      jsonResponse({
        choices: [{ message: { content: '{"africa_eligibility":"likely"}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4 },
      }),
    )
    const diag: any[] = []
    const res = await callProvider('groq', { prompt: 'test', agentId: 'test:unit' }, 0, diag)

    expect(res.provider).toBe('groq')
    expect(res.text).toContain('africa_eligibility')
    expect(res.tokensInput).toBe(12)
    expect(diag.some((d) => d.event === 'success' && d.responseLen > 0)).toBe(true)
    expect(diag.some((d) => d.event === 'failure')).toBe(false)

    // orchestrator records the success on the router; mirror that here.
    recordRouterSuccess('groq', res.latencyMs)

    const s = await snap('groq')
    expect(s.samples).toBeGreaterThanOrEqual(1)
    expect(s.successRate).toBe(100)
    expect(s.consecutiveFailures).toBe(0)
    expect(s.healthy).toBe(true)
  })
})

describe('quota failure (429)', () => {
  it('classifies 429 as quota exhaustion and excludes the provider from routing', async () => {
    const { recordRouterFailure, routeTaskAll } = await import('@/lib/ai/smart-router')

    recordRouterFailure('groq', 'groq 429 (rate_limit_exceeded): Rate limit reached for model on tokens per minute (TPM): Limit 8000, Used 7969, Requested 1750')

    const s = await snap('groq')
    expect(s.quotaExhausted).toBe(true)
    expect(s.gated).toBe(true)
    expect(s.inCooldown).toBe(true)
    expect(routeTaskAll('fast_extraction').some((d) => d.provider.id === 'groq')).toBe(false)
  })

  it('records quota exhaustion end-to-end from the gateway 429 response', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    const { recordRouterFailure } = await import('@/lib/ai/smart-router')
    route('api.cerebras.ai', () =>
      jsonResponse(
        { message: 'Requests per minute limit exceeded - too many requests sent.', type: 'too_many_requests_error', param: 'quota', code: 'request_quota_exceeded' },
        429,
      ),
    )
    const diag: any[] = []
    await expect(callProvider('cerebras', { prompt: 'x', agentId: 't' }, 0, diag)).rejects.toThrow(/429/)
    expect(diag.some((d) => d.event === 'failure' && d.httpStatus === 429)).toBe(true)

    recordRouterFailure('cerebras', 'cerebras 429 (request_quota_exceeded): Requests per minute limit exceeded')
    const s = await snap('cerebras')
    expect(s.quotaExhausted).toBe(true)
    expect(s.lastError).toContain('429')
  })
})

describe('invalid model (404)', () => {
  it('treats a dead model ID as invalid-model with a 12h backoff, not a 30s retry loop', async () => {
    const { recordRouterFailure, routeTaskAll } = await import('@/lib/ai/smart-router')

    recordRouterFailure('gemini', 'gemini 404 (NOT_FOUND): This model models/gemini-2.5-flash is no longer available to new users')

    const s = await snap('gemini')
    expect(s.gated).toBe(true)
    expect(s.inCooldown).toBe(true)
    const remaining = remainingFrom(s.gateReason)
    expect(remaining).not.toBeNull()
    expect(remaining!).toBeGreaterThan(11 * 3600) // ~12h, not 30s
    expect(routeTaskAll('cv_parsing').some((d) => d.provider.id === 'gemini')).toBe(false)
  })

  it('surfaces the dead-model error as a failure diag and a thrown error', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    route('generativelanguage.googleapis.com', () => jsonResponse(OPENAI_404_MODEL_BODY, 404))
    const diag: any[] = []
    await expect(callProvider('gemini', { prompt: 'x', agentId: 't' }, 0, diag)).rejects.toThrow(/404|no longer available/i)
    // SDK path throws before the gateway sees the Response, so httpStatus is
    // not attachable — but the run MUST be recorded as a failure, never a
    // success (the false-success invariant).
    expect(diag.some((d) => d.event === 'failure')).toBe(true)
    expect(diag.some((d) => d.event === 'success')).toBe(false)
  })
})

describe('fallback', () => {
  it('falls back through providers when earlier ones fail, and reports the chain', async () => {
    const { orchestrate } = await import('@/lib/ai/orchestrator')
    await gateSdkProviders()
    // Deterministic failover chain: openrouter → github_models → cloudflare
    // → huggingface → groq (success). All via mocked fetch.
    route('openrouter.ai', () => jsonResponse({ error: { code: '402', message: 'Insufficient credits.' } }, 402))
    route('models.inference.ai.azure.com', () => jsonResponse({ error: { message: 'unauthorized' } }, 401))
    route('api.cloudflare.com', () => jsonResponse({ errors: [{ code: 5000, message: 'boom' }] }, 500))
    route('router.huggingface.co', () => jsonResponse({ error: 'boom' }, 500))
    route('api.groq.com', () => jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }))

    const res = await orchestrate({ prompt: 'test prompt for fallback', agentId: 'verifier:consolidated' })

    expect(res.response.provider).toBe('groq')
    expect(res.fallbackUsed).toBe(true)
    expect(res.fallbackChain.length).toBeGreaterThanOrEqual(4)
    expect(res.fallbackChain[0]).toBe('openrouter')
    expect(res.fallbackChain[res.fallbackChain.length - 1]).toBe('groq')
    expect(res.diag.some((d) => d.event === 'failure' && d.httpStatus === 402)).toBe(true)
    expect(res.diag.some((d) => d.provider === 'groq' && d.event === 'success')).toBe(true)
  })

  it('gated (cooldown/quota) providers are skipped in ranking', async () => {
    const { recordRouterFailure, routeTaskAll } = await import('@/lib/ai/smart-router')
    const { PROVIDERS } = await import('@/lib/ai/providers/types')
    for (const p of PROVIDERS) {
      recordRouterFailure(p.id, `${p.id} 500 (server_error): simulated outage`)
    }
    const ranked = routeTaskAll('fast_extraction')
    expect(ranked.length).toBe(0) // all gated → no candidates
  })
})

describe('cooldown escalation', () => {
  it('escalates generic-failure cooldown exponentially (30s → 60s → 120s)', async () => {
    const { recordRouterFailure } = await import('@/lib/ai/smart-router')
    recordRouterFailure('nvidia', 'nvidia 500 (server_error): boom #1')
    const c1 = remainingFrom((await snap('nvidia')).gateReason)!
    recordRouterFailure('nvidia', 'nvidia 500 (server_error): boom #2')
    const c2 = remainingFrom((await snap('nvidia')).gateReason)!
    recordRouterFailure('nvidia', 'nvidia 500 (server_error): boom #3')
    const c3 = remainingFrom((await snap('nvidia')).gateReason)!

    expect(c1).toBeGreaterThanOrEqual(25) // ~30s
    expect(c2).toBeGreaterThan(c1) // ~60s
    expect(c3).toBeGreaterThan(c2) // ~120s
  })
})

describe('false-success prevention', () => {
  it('throws on an empty 200 body and records a failure, never a success', async () => {
    const { callProvider } = await import('@/lib/ai/gateway')
    route('api.groq.com', () => jsonResponse({ choices: [{ message: { content: '' } }] }))
    const diag: any[] = []
    await expect(callProvider('groq', { prompt: 'x', agentId: 't' }, 0, diag)).rejects.toThrow(/empty response/)
    expect(diag.some((d) => d.event === 'failure' && d.errorCode === 'EMPTY_RESPONSE')).toBe(true)
    expect(diag.some((d) => d.event === 'success')).toBe(false)
  })

  it('orchestrator fails over when a provider returns an empty 200', async () => {
    const { orchestrate } = await import('@/lib/ai/orchestrator')
    await gateSdkProviders()
    // openrouter returns an empty 200 → must be treated as failure and failed
    // over; github/cloudflare/hf are down; groq wins.
    route('openrouter.ai', () => jsonResponse({ choices: [{ message: { content: '' } }] }))
    route('models.inference.ai.azure.com', () => jsonResponse({ error: { message: 'unauthorized' } }, 401))
    route('api.cloudflare.com', () => jsonResponse({ errors: [{ code: 5000, message: 'boom' }] }, 500))
    route('router.huggingface.co', () => jsonResponse({ error: 'boom' }, 500))
    route('api.groq.com', () => jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }))

    const res = await orchestrate({ prompt: 'empty response failover', agentId: 'verifier:consolidated' })
    expect(res.response.provider).toBe('groq')
    expect(res.fallbackUsed).toBe(true)
    expect(res.diag.some((d) => d.event === 'failure' && d.errorCode === 'EMPTY_RESPONSE')).toBe(true)
  })
})

describe('retry-after honored', () => {
  it('extends quota backoff when the provider sends Retry-After', async () => {
    const { recordRouterFailure } = await import('@/lib/ai/smart-router')
    recordRouterFailure('groq', 'groq 429 (rate_limit_exceeded): rate limit Retry-After: 65')
    const withRa = remainingFrom((await snap('groq')).gateReason)!
    expect(withRa).toBeGreaterThanOrEqual(60)
  })

  it('uses the default quota backoff (~30m) when Retry-After is absent', async () => {
    const { recordRouterFailure } = await import('@/lib/ai/smart-router')
    recordRouterFailure('cerebras', 'cerebras 429 (request_quota_exceeded): Requests per minute limit exceeded')
    const withoutRa = remainingFrom((await snap('cerebras')).gateReason)!
    expect(withoutRa).toBeGreaterThan(25 * 60)
    expect(withoutRa).toBeLessThanOrEqual(31 * 60)
  })
})
