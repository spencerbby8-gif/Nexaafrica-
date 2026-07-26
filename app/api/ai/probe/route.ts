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

async function queryModelsApi() {
  const results: any = {}
  const CK = process.env.CEREBRAS_API_KEY
  const OK = process.env.OPENROUTER_API_KEY

  if (CK) {
    try {
      const r = await fetch("https://api.cerebras.ai/v1/models", {
        headers: { "Authorization": "Bearer " + CK },
      })
      const text = await r.text()
      results.cerebras = { status: r.status, ok: r.ok }
      try {
        const j = JSON.parse(text)
        results.cerebras.models = Array.isArray(j.data)
          ? j.data.map((m: any) => ({ id: m.id }))
          : j
      } catch { results.cerebras.raw = text.slice(0, 2000) }
    } catch (e: any) {
      results.cerebras = { error: e?.message || String(e) }
    }
  } else {
    results.cerebras = { error: "CEREBRAS_API_KEY not configured" }
  }

  if (OK) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { "Authorization": "Bearer " + OK },
      })
      const text = await r.text()
      results.openrouter = { status: r.status, ok: r.ok }
      try {
        const j = JSON.parse(text)
        results.openrouter.models = Array.isArray(j.data)
          ? j.data.map((m: any) => ({ id: m.id })).slice(0, 50)
          : j
      } catch { results.openrouter.raw = text.slice(0, 2000) }
    } catch (e: any) {
      results.openrouter = { error: e?.message || String(e) }
    }
  } else {
    results.openrouter = { error: "OPENROUTER_API_KEY not configured" }
  }

  return results
}

async function testInference(provider: string, model: string) {
  const apiKey = process.env[provider === "cerebras" ? "CEREBRAS_API_KEY" : "OPENROUTER_API_KEY"]
  if (!apiKey) return { error: "No API key" }
  const url = provider === "cerebras"
    ? "https://api.cerebras.ai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions"
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Say exactly: ok" }],
        temperature: 0, max_tokens: 10,
      }),
    })
    const text = await res.text()
    const latency = Date.now() - start
    if (!res.ok) {
      return { provider, model, ok: false, status: res.status, latencyMs: latency, body: text.slice(0, 300) }
    }
    const j = JSON.parse(text)
    return {
      provider, model, ok: true, status: res.status, latencyMs: latency,
      response: j.choices?.[0]?.message?.content || "",
      modelUsed: j.model || model,
      tokens: j.usage || null,
    }
  } catch (e: any) {
    return { provider, model, ok: false, error: e?.message || String(e), latencyMs: Date.now() - start }
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') || 'all'

  if (mode === 'models') {
    const started = Date.now()
    const result = await queryModelsApi()
    return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...result })
  }

  if (mode === 'infer') {
    const provider = new URL(req.url).searchParams.get('provider') || 'cerebras'
    const model = new URL(req.url).searchParams.get('model') || ''
    if (!model) return NextResponse.json({ error: 'model param required' }, { status: 400 })
    const result = await testInference(provider, model)
    return NextResponse.json({ ok: true, result })
  }

  const started = Date.now()
  const pr = await probeAllProviders()
  return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...pr })
}

export const GET = POST
