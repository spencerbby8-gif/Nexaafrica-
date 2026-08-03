import { NextResponse } from 'next/server'
import { getRegistryStatus, forceRefresh } from '@/lib/ai/providers/dynamic-registry'
import { isPipelineAuthorized } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Get provider registry status
 * 
 * GET /api/providers/status - Current status, sourced from the DATABASE
 *   (ai_orch_health + ai_model_catalog). The in-memory registry is cold on
 *   every instance and lied on cold starts (lastRefresh 1970, everything
 *   "healthy") — the DB is the measured truth.
 * POST /api/providers/status - Force refresh
 * Internal diagnostic: requires the pipeline bearer token.
 */
export async function GET(req: Request) {
  if (!isPipelineAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = createServiceClient()
    const [healthRes, catalogRes] = await Promise.all([
      supabase.from('ai_orch_health').select('*').order('provider'),
      supabase.from('ai_model_catalog').select('provider, total_models, verified_models, usable_models, last_refreshed, discovery_error').order('provider'),
    ])
    const health = healthRes.data || []
    const catalog = catalogRes.data || []
    const lastRefreshMs = catalog.length > 0
      ? Math.max(...catalog.map((r: any) => new Date(r.last_refreshed).getTime()).filter((t: number) => !isNaN(t)))
      : null

    return NextResponse.json({
      ok: true,
      source: 'ai_orch_health + ai_model_catalog (database)',
      totalProviders: health.length,
      enabledProviders: health.length,
      lastRefresh: lastRefreshMs ? new Date(lastRefreshMs).toISOString() : null,
      providers: health.map((h: any) => ({
        id: h.provider,
        healthy: (h.consecutive_failures ?? 0) < 3 && !h.cooldown_until,
        consecutiveFailures: h.consecutive_failures ?? 0,
        cooldownUntil: h.cooldown_until ?? null,
        quotaExhausted: h.is_quota_exhausted ?? false,
        rateLimited: h.is_rate_limited ?? false,
        lastSuccessAt: h.last_success_at ?? null,
        lastErrorCode: h.last_error_code ?? null,
        lastError: h.last_error_message ? String(h.last_error_message).slice(0, 300) : null,
        totalSuccesses: h.total_successes ?? 0,
        totalFailures: h.total_failures ?? 0,
      })),
      catalog,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  if (!isPipelineAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    await forceRefresh()
    const status = getRegistryStatus()
    return NextResponse.json({
      success: true,
      message: 'Provider registry refreshed',
      status
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
