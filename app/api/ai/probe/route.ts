import { NextResponse } from 'next/server'
import { probeProvider } from '@/lib/ai/orchestrator'
import { PROVIDERS } from '@/lib/ai/providers/types'

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'; export const maxDuration = 120

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN; if (!token) return false
  return req.headers.get('authorization') === `Bearer ${token}`
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let probed = 0, success = 0, failed = 0
  const results: any[] = []

  for (const cfg of PROVIDERS) {
    if (!cfg.enabled) continue
    probed++
    const start = Date.now()
    const result = await probeProvider(cfg)
    const latency = Date.now() - start
    if (result.ok) success++; else failed++
    results.push({ provider: cfg.id, model: cfg.model, ok: result.ok, latencyMs: latency, error: result.error?.slice(0, 200) || null })

    // Persist probe result to diagnostics table
    try {
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      if (base && key) {
        fetch(`${base}/rest/v1/ai_provider_log`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}`, "apikey": key },
          body: JSON.stringify({
            agent_id: "provider-probe", provider: cfg.id, model: cfg.model,
            event: result.ok ? "success" : "failure",
            retry_count: 0, fallback_used: false, duration_ms: latency,
            prompt_len: 2, response_len: result.ok ? 2 : null,
            error_code: result.error ? "probe_failed" : null,
            error_message: result.error?.slice(0, 500) || null,
          }),
        }).catch(() => {})
      }
    } catch {}
  }

  return NextResponse.json({ ok: true, probed, success, failed, results })
}

export const GET = POST
