import { NextResponse } from 'next/server'
import { probeAllProviders } from '@/lib/ai/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN
  if (!token) return false
  return req.headers.get('authorization') === `Bearer ${token}`
}

async function testInference(provider: string, model: string, opts?: any) {
  const apiKey = process.env[provider === "cerebras" ? "CEREBRAS_API_KEY" : "OPENROUTER_API_KEY"]
  if (!apiKey) return { error: "No API key" }
  const url = provider === "cerebras"
    ? "https://api.cerebras.ai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions"
  const start = Date.now()
  try {
    const body: any = { model, messages: [{ role: "user", content: "Say exactly: ok" }], temperature: 0, max_tokens: 10 }
    if (opts) Object.assign(body, opts)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    const latency = Date.now() - start
    if (!res.ok) return { provider, model, ok: false, status: res.status, latencyMs: latency, body: text.slice(0, 500) }
    const j = JSON.parse(text)
    return { provider, model, ok: true, status: res.status, latencyMs: latency, response: j.choices?.[0]?.message?.content || "", modelUsed: j.model || model, tokens: j.usage || null }
  } catch (e: any) {
    return { provider, model, ok: false, error: e?.message || String(e), latencyMs: Date.now() - start }
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') || 'all'

  if (mode === 'infer') {
    const provider = new URL(req.url).searchParams.get('provider') || 'cerebras'
    const model = new URL(req.url).searchParams.get('model') || ''
    if (!model) return NextResponse.json({ error: 'model param required' }, { status: 400 })
    const result = await testInference(provider, model)
    return NextResponse.json({ ok: true, result })
  }

  // OpenRouter diagnostic: test multiple models and provider routing variants
  if (mode === 'ordiag') {
    const results: any[] = []
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY not set" })

    // Test various models, provider routing combinations
    const tests = [
      // Variant 1: no provider hint
      { model: "google/gemini-3.6-flash" },
      // Variant 2: provider routes in body
      { model: "google/gemini-3.6-flash", provider: { order: ["google-ai-studio", "google-vertex"], allow_fallbacks: true } },
      // Variant 3: different model
      { model: "google/gemini-3.5-flash-lite", provider: { order: ["google-ai-studio", "google-vertex"], allow_fallbacks: true } },
      // Variant 4: try a non-Google model from the model list
      { model: "moonshotai/kimi-k3" },
    ]

    for (const t of tests) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
          body: JSON.stringify({
            ...t,
            messages: [{ role: "user", content: "Hi" }],
            temperature: 0, max_tokens: 5,
          }),
        })
        const text = await res.text()
        results.push({ model: t.model, status: res.status, ok: res.ok, body: text.slice(0, 400), hasProviderRouting: !!t.provider })
      } catch (e: any) {
        results.push({ model: t.model, error: e?.message || String(e) })
      }
    }
    return NextResponse.json({ ok: true, results })
  }

  const started = Date.now()
  const pr = await probeAllProviders()
  return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...pr })
}

export const GET = POST
