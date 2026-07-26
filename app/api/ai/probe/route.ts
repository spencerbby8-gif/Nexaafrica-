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

async function orProbe(model: string) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return { error: "no key" }
  const start = Date.now()
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, "HTTP-Referer": "https://v0-nexaafrica.vercel.app" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Say: ok" }], temperature: 0, max_tokens: 10 }),
    })
    const text = await res.text()
    const lat = Date.now() - start
    let p: any = null; try { p = JSON.parse(text) } catch {}
    return { ok: res.ok, status: res.status, ms: lat, model,
      requestedProviders: p?.error?.metadata?.requested_providers || null,
      availableProviders: p?.error?.metadata?.available_providers || null,
      body: text.slice(0, 300), modelUsed: p?.model, content: p?.choices?.[0]?.message?.content }
  } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') || 'all'

  if (mode === 'orprobe') {
    // Available providers from error: nvidia, google-ai-studio, cohere, novita, darkbloom, poolside
    // Try models served by these providers
    const results = await Promise.all([
      orProbe("openrouter/free"),
      // Meta Llama via together/deepinfra (what the key is locked to)
      orProbe("meta-llama/llama-4-maverick:free"),
      // Free models that might route differently
      orProbe("google/gemini-2.5-flash-lite"),
      // Query models API for "free" tagged models
      // Check key info
      fetch("https://openrouter.ai/api/v1/key", {
        headers: { "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY },
      }).then(r => r.text()).then(t => ({ keyInfo: t.slice(0, 500) })),
    ])
    const keyInfo = (results.pop() as any)?.keyInfo || "no key info"
    return NextResponse.json({ ok: true, keyPrefix: (process.env.OPENROUTER_API_KEY||"").slice(0,12)+"...", keyInfo, results })
  }

  const started = Date.now()
  const pr = await probeAllProviders()
  return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...pr })
}

export const GET = POST
