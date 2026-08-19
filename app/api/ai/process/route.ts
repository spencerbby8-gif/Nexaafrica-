import { NextResponse } from 'next/server'
import { processAIQueue } from '@/lib/ai/engine'
import { runDeactivateStale } from '@/lib/jobs/deactivateStale'
import { isPipelineAuthorized, pipelineAuthConfigured } from '@/lib/server/auth'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * AI queue worker — drains the intelligence backlog.
 *
 * Root causes fixed here (verified in production):
 *  - A single 300s invocation/day could never drain ~5k pending jobs.
 *    This route now self-chains: when work remains and this invocation
 *    processed ≥1 job, it triggers the next invocation before exiting
 *    (bounded by chain depth). The daily Hobby cron (single allowed slot)
 *    therefore starts a drain that keeps running until the queue is empty.
 *  - Chain depth is capped via `chain` param + AI_DRAIN_CHAIN_MAX so a
 *    stuck queue (all providers down) can never loop forever: progress
 *    must be made in each link (result.processed > 0).
 */
export async function POST(req: Request) {
  if (!pipelineAuthConfigured()) {
    return NextResponse.json(
      { error: 'No auth secret configured (CRON_SECRET or INGEST_TOKEN)' },
      { status: 500 },
    )
  }
  if (!isPipelineAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const batch = Math.max(1, Math.min(150, Number(url.searchParams.get('batch')) || 50))
  const chain = Math.max(0, Math.min(60, Number(url.searchParams.get('chain')) || 0))
  const cooldowns = Math.max(0, Math.min(10, Number(url.searchParams.get('cooldowns')) || 0))
  const chainMax = Math.max(1, Math.min(60, Number(process.env.AI_DRAIN_CHAIN_MAX) || 40))
  const COOLDOWN_MAX = Math.max(0, Math.min(10, Number(process.env.AI_COOLDOWN_MAX) || 3))

  // ── Live model truth sync (chain head only, freshness-gated) ──────
  // Discovery + real-inference verification + persistence happens here so
  // the daily cron continuously refreshes which models actually work.
  let modelSync: unknown = null
  let companyIntel: unknown = null
  let sourceIntel: unknown = null
  if (chain === 0) {
    try {
      const { syncLiveModelRegistry } = await import('@/lib/ai/model-sync')
      modelSync = await syncLiveModelRegistry({
        force: url.searchParams.get('discover') === '1',
        budgetMs: 80_000,
      })
    } catch (e) {
      modelSync = { error: (e instanceof Error ? e.message : String(e)).slice(0, 300) }
    }
  }

  const started = Date.now()
  const result = await processAIQueue(batch)

  // Hobby plan allows only 2 cron entries, so the standalone
  // /api/jobs/deactivate-stale cron (06:00) never ran. It is folded in here:
  // the engine self-caps at ~240s, leaving budget for this quick DB sweep.
  let stale: unknown = null
  try {
    stale = await runDeactivateStale()
  } catch (e) {
    stale = { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) }
  }

  // [V1-HONESTY] Learning refresh runs AFTER the deactivation sweep (chain
  // head only) so company/source intelligence reflects the post-sweep state —
  // previously it ran before deactivation, leaving stored totals (e.g. ashby
  // 1,189 vs 708 active) stale for a whole day.
  if (chain === 0) {
    try {
      const { refreshCompanyIntelligence, refreshSourceIntelligence, reapplyRemoteTruthWrites } = await import('@/lib/ai/admission')
      const [ci, si] = await Promise.all([refreshCompanyIntelligence(), refreshSourceIntelligence(), reapplyRemoteTruthWrites()])
      companyIntel = ci
      sourceIntel = si
    } catch {}
  }

  // ── Drain chain: keep processing while there is real progress ──────
  let chained = false
  let pendingAfter: number | null = null
  try {
    const supabase = createServiceClient()
    const { count } = await supabase
      .from('ai_processing_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingAfter = count ?? 0
  } catch {}

  const elapsedMs = Date.now() - started
  const madeProgress = (result.processed ?? 0) > 0

  // ── Chain continuation with cooldown-retry ─────────────────────────
  // Root cause of stalls: when providers are quota-exhausted mid-chain,
  // a link gets processed=0 and the old condition permanently stopped
  // the chain. Now: when no progress is made, wait 60s for provider
  // rate-limit windows to reset, then retry (up to COOLDOWN_MAX times).
  const shouldChain =
    pendingAfter !== null &&
    pendingAfter > 0 &&
    chain < chainMax &&
    elapsedMs < 270_000 &&
    (madeProgress || (!madeProgress && cooldowns < COOLDOWN_MAX))

  let cooldownWaited = false
  if (shouldChain) {
    if (!madeProgress) {
      console.log(JSON.stringify({ scope: 'ai_process', event: 'cooldown_wait', chain, cooldowns, pendingAfter, elapsedMs }))
      const waitMs = Math.min(60_000, 270_000 - elapsedMs)
      if (waitMs > 5000) {
        await new Promise(r => setTimeout(r, waitMs))
        cooldownWaited = true
      }
    }
    try {
      const nextUrl = new URL(req.url)
      nextUrl.searchParams.set('batch', String(batch))
      nextUrl.searchParams.set('chain', String(chain + 1))
      nextUrl.searchParams.set('cooldowns', madeProgress ? '0' : String(cooldowns + 1))
      const auth = req.headers.get('authorization') ?? ''
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)
      await fetch(nextUrl.toString(), {
        method: 'POST',
        headers: { authorization: auth },
        signal: ctrl.signal,
      }).catch(() => {})
      clearTimeout(t)
      chained = true
    } catch {}
  }

  return NextResponse.json(
    { ok: true, elapsedMs, ...result, stale, chain, chained, cooldowns, cooldownWaited, pendingAfter, modelSync, companyIntel, sourceIntel },
    { status: 200 },
  )
}

export const GET = POST
