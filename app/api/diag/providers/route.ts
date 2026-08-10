import { NextRequest, NextResponse } from 'next/server'
import { PROVIDERS } from '@/lib/ai/providers/types'
import { classifyProviderError, type DiagClass } from '@/lib/ai/diag'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * TEMPORARY SAFE DIAGNOSTIC (PR #34 — provider reliability audit).
 *
 * Reports, per enabled provider, ONLY:
 *   - envPresent: whether process.env[envKey] is set (boolean — never the value)
 *   - model: the configured model ID being requested
 *   - ok / httpStatus / class / latencyMs from ONE minimal real API call
 *     ("Reply with exactly: ok", max 8 tokens) made with the runtime key.
 *
 * Never returns the key or raw error bodies. Gated by x-diag-token header
 * matching DIAG_TOKEN (preview-only env var). Remove before merge to main.
 */
export async function GET(req: NextRequest) {
  const tok = process.env.DIAG_TOKEN
  if (!tok || req.headers.get('x-diag-token') !== tok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional per-provider model override for diagnostics (e.g.
  // ?provider=openrouter&model=candidate:free) — lets us verify a candidate
  // model in the runtime path without touching config.
  const overProvider = req.nextUrl.searchParams.get('provider')
  const overModel = req.nextUrl.searchParams.get('model')

  const out: Record<string, unknown> = {}
  for (const p of PROVIDERS) {
    if (!p.enabled) { out[p.id] = { envPresent: !!process.env[p.envKey], enabled: false }; continue }
    if (overProvider && p.id !== overProvider) continue
    const key = process.env[p.envKey]
    if (!key) { out[p.id] = { envPresent: false, model: p.model, ok: false, class: 'other', note: 'missing env' }; continue }
    const model = overProvider === p.id && overModel ? overModel : p.model
    const r = await probeRuntime(p.id, model, key)
    out[p.id] = { envPresent: true, model, ...r }
  }
  return NextResponse.json({ generatedAt: new Date().toISOString(), providers: out })
}

interface ProbeResult {
  ok: boolean
  httpStatus: number | null
  class: DiagClass
  latencyMs: number
  note?: string
}

async function probeRuntime(providerId: string, model: string, apiKey: string): Promise<ProbeResult> {
  const start = Date.now()
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
  // 64 tokens, not 8: reasoning models (gemini-3.5-flash thinking, gpt-oss-120b)
  // burn the entire 8-token budget on reasoning and return EMPTY text — an
  // artifact that would (and did) misclassify healthy providers as dead.
  const body = {
    model,
    messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    max_tokens: 64,
  }
  const compat: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    cerebras: 'https://api.cerebras.ai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    github_models: 'https://models.github.ai/inference/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
    cohere: 'https://api.cohere.ai/compatibility/v1/chat/completions',
    huggingface: 'https://router.huggingface.co/v1/chat/completions',
  }
  try {
    let res: Response
    if (providerId === 'gemini' || providerId === 'gemini_backup') {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with exactly: ok' }] }], generationConfig: { maxOutputTokens: 64 } }),
        signal: AbortSignal.timeout(15000),
      })
    } else if (providerId === 'cloudflare') {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
      if (!accountId) return { ok: false, httpStatus: null, class: 'other', latencyMs: Date.now() - start, note: 'missing CLOUDFLARE_ACCOUNT_ID' }
      res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: body.messages, max_tokens: 64 }),
        signal: AbortSignal.timeout(15000),
      })
    } else if (compat[providerId]) {
      res = await fetch(compat[providerId], {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      })
    } else {
      return { ok: false, httpStatus: null, class: 'other', latencyMs: Date.now() - start, note: 'no probe path' }
    }
    const latencyMs = Date.now() - start
    if (res.ok) {
      const data: any = await res.json().catch(() => ({}))
      const text =
        data?.choices?.[0]?.message?.content ??
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        data?.result?.response ??
        ''
      const ok = typeof text === 'string' && text.trim().length > 0
      return { ok, httpStatus: res.status, class: ok ? 'ok' : 'other', latencyMs, note: ok ? undefined : 'empty response' }
    }
    // Classification only — never surface the raw body (could echo secrets).
    const errText = (await res.text().catch(() => '')).slice(0, 300)
    return { ok: false, httpStatus: res.status, class: classifyProviderError(res.status, errText), latencyMs }
  } catch (e: any) {
    return { ok: false, httpStatus: null, class: 'network', latencyMs: Date.now() - start, note: (e?.message || 'network error').slice(0, 80) }
  }
}
