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

async function orProbe(model: string, providerOrder?: string[]) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return { error: "no key" }
  const start = Date.now()
  const body: any = { model, messages: [{ role: "user", content: "Say: ok" }], temperature: 0, max_tokens: 10 }
  if (providerOrder) body.provider = { order: providerOrder, allow_fallbacks: false }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey, "HTTP-Referer": "https://v0-nexaafrica.vercel.app" },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    const lat = Date.now() - start
    let p: any = null; try { p = JSON.parse(text) } catch {}
    return { ok: res.ok, status: res.status, ms: lat, model, providerOrder: providerOrder || null,
      requested: p?.error?.metadata?.requested_providers || null,
      available: p?.error?.metadata?.available_providers || null,
      modelUsed: p?.model, content: p?.choices?.[0]?.message?.content,
      usage: p?.usage, body: text.slice(0, 300) }
  } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') || 'all'

  if (mode === 'orprobe') {
    // Available providers: darkbloom, nvidia, poolside, google-ai-studio, novita
    // Try free models that one of these providers serves.
    // nvidia hosts many free models; poolside has free tier; google-ai-studio serves gemini free.
    const results = await Promise.all([
      // Try routing through google-ai-studio with gemini model
      orProbe("google/gemini-2.5-flash", ["google-ai-studio"]),
      // Try routing through nvidia
      orProbe("openrouter/free", ["nvidia"]),
      // Try routing through poolside
      orProbe("openrouter/free", ["poolside"]),
      // Try darkbloom
      orProbe("openrouter/free", ["darkbloom"]),
      // Try novita
      orProbe("openrouter/free", ["novita"]),
      // Try the exact free model that works: deepinfra hosts meta-llama
      orProbe("meta-llama/llama-4-maverick", ["deepinfra"]),
      // Try together provider
      orProbe("meta-llama/llama-4-maverick", ["together"]),
      // Try Google Gemini flash-lite with google-ai-studio routing
      orProbe("google/gemini-2.5-flash-lite", ["google-ai-studio"]),
    ])
    return NextResponse.json({ ok: true, keyPrefix: (process.env.OPENROUTER_API_KEY||"").slice(0,12)+"...", isFreeTier: true, results })
  }

  const started = Date.now()
  const pr = await probeAllProviders()
  return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...pr })
}

export const GET = POST
