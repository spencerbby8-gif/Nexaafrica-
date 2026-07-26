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

async function orProbe(model: string, extraFields?: Record<string, any>) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return { error: "OPENROUTER_API_KEY not set" }
  const start = Date.now()
  const body: any = { model, messages: [{ role: "user", content: "Say: ok" }], temperature: 0, max_tokens: 10 }
  if (extraFields) Object.assign(body, extraFields)
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, "HTTP-Referer": "https://v0-nexaafrica.vercel.app" },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    const lat = Date.now() - start
    let p: any = null; try { p = JSON.parse(text) } catch {}
    return { ok: res.ok, status: res.status, latencyMs: lat, model, extraFields, body: text.slice(0, 600), parsed: p ? { modelUsed: p.model, content: p.choices?.[0]?.message?.content, usage: p.usage } : null }
  } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') || 'all'

  if (mode === 'orprobe') {
    // Test multiple routing strategies
    const results = await Promise.all([
      orProbe("openrouter/free"),
      orProbe("openrouter/free", { provider: { order: ["google-ai-studio"], allow_fallbacks: false } }),
      orProbe("openrouter/free", { provider: { order: ["google-ai-studio", "nvidia", "cohere"], allow_fallbacks: true } }),
      orProbe("google/gemini-2.5-flash", { provider: { order: ["google-ai-studio"], allow_fallbacks: false } }),
      // Try providers field (some docs use this)
      orProbe("openrouter/free", { providers: ["google-ai-studio"] }),
    ])
    return NextResponse.json({ ok: true, keyPrefix: (process.env.OPENROUTER_API_KEY||"").slice(0,10)+"...", results })
  }

  const started = Date.now()
  const pr = await probeAllProviders()
  return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...pr })
}

export const GET = POST
