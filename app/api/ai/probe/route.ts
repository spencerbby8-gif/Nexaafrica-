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

async function openRouterProbe() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return { error: "OPENROUTER_API_KEY not set in process.env" }

  const start = Date.now()
  const reqBody = {
    model: "openrouter/free",
    messages: [{ role: "user", content: "Say exactly: ok" }],
    temperature: 0, max_tokens: 10,
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": "https://v0-nexaafrica.vercel.app",
        "X-Title": "Nexa",
      },
      body: JSON.stringify(reqBody),
    })
    const text = await res.text()
    const latency = Date.now() - start

    let parsed: any = null
    try { parsed = JSON.parse(text) } catch {}

    return {
      ok: res.ok,
      status: res.status,
      latencyMs: latency,
      requestBody: reqBody,
      responseBody: text.slice(0, 1000),
      parsed: parsed ? {
        modelUsed: parsed.model || null,
        provider: parsed.provider || null,
        content: parsed.choices?.[0]?.message?.content || null,
        finishReason: parsed.choices?.[0]?.finish_reason || null,
        usage: parsed.usage || null,
      } : null,
      keyPresent: !!apiKey,
      keyLength: apiKey.length,
      keyPrefix: apiKey.slice(0, 8) + "...",
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e), latencyMs: Date.now() - start, keyPresent: !!apiKey, keyLength: apiKey?.length || 0 }
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') || 'all'

  if (mode === 'orprobe') {
    const result = await openRouterProbe()
    return NextResponse.json({ ok: true, result })
  }

  const started = Date.now()
  const pr = await probeAllProviders()
  return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...pr })
}

export const GET = POST
