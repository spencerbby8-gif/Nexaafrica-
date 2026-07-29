import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic'

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN; if (!token) return false
  return req.headers.get('authorization') === `Bearer ${token}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()

  const [prov, recent, health, quality, hourly] = await Promise.all([
    supabase.from("ai_provider_analytics").select("*").order("total_calls", { ascending: false }),
    supabase.from("ai_provider_log").select("provider, event, error_code, error_message, duration_ms, created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("ai_orch_health").select("*"),
    supabase.from("ai_quality_daily").select("*").order("day", { ascending: false }).limit(14),
    supabase.from("ai_provider_log").select("provider, date_trunc('hour', created_at)::text as hour, count(*)::int as calls, count(*) filter (where event='success')::int as successes, round(avg(duration_ms) filter (where event='success'))::int as avg_ms").order("hour", { ascending: false }).limit(72),
  ])

  let tc = 0, ts = 0, tf = 0
  for (const p of (prov.data || []) as any[]) { tc += p.total_calls; ts += p.successes; tf += p.failures }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    summary: { totalCalls: tc, totalSuccess: ts, totalFail: tf, successRate: tc ? Math.round(ts / tc * 100) : 0 },
    providers: prov.data || [],
    recent: recent.data || [],
    health: health.data || [],
    quality: quality.data || [],
    hourlyTrends: hourly.data || [],
  })
}
