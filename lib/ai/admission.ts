/**
 * Intelligent Job Admission (Nexa Intelligence Phase 2)
 *
 * Lightweight deterministic screening BEFORE any expensive AI model call.
 * Rejects jobs that clearly don't belong in the pipeline, saving quota.
 *
 * Decision: 'accept' (proceed to AI) | 'reject' (skip with reason)
 */

export type AdmissionDecision =
  | { admitted: true }
  | { admitted: false; reason: string; gate: string }

// Work-authorization restrictions that exclude African applicants
const RESTRICTION_RE = /must be (?:based|located|residing) in|work authorization for|authorized to work in the (?:us|uk|eu|canada)|citizens? of|residents? of (?:the )?(?:us|uk|eu|canada) only|(?:us|uk|eu) (?:only|residents only)/i

// Dead/placeholder apply URLs
const DEAD_URL_RE = /^(about:blank|javascript:|#)/i

interface AdmissionJob {
  eligibility: string
  is_open_to_africa: boolean
  is_remote: boolean | null
  apply_url: string
  country: string
  description_md: string
  company: string
  source: string | null
  source_id: string | null
  expires_at: string | null
}

/**
 * Deterministic admission gate. Runs before enrichJobWithAI.
 * Each check is O(1) or O(text-scan) — no network, no AI.
 */
export function admit(job: AdmissionJob): AdmissionDecision {
  // 1. Africa eligibility (from ingest-time classifier)
  if (job.eligibility === 'restricted' || job.is_open_to_africa === false) {
    return { admitted: false, reason: 'Not open to African applicants', gate: 'africa_eligibility' }
  }

  // 2. Work authorization restrictions in description
  if (RESTRICTION_RE.test(job.description_md)) {
    return { admitted: false, reason: 'Requires work authorization unavailable to African applicants', gate: 'work_authorization' }
  }

  // 3. On-site only outside supported hiring regions
  // (we only serve remote/open-to-Africa roles)
  if (job.is_remote === false) {
    return { admitted: false, reason: 'On-site only — not remote', gate: 'onsite_only' }
  }

  // 4. Expired listing
  if (job.expires_at) {
    const exp = new Date(job.expires_at).getTime()
    if (!isNaN(exp) && exp < Date.now()) {
      return { admitted: false, reason: 'Job listing has expired', gate: 'expired' }
    }
  }

  // 5. Dead/invalid apply URL
  if (DEAD_URL_RE.test(job.apply_url) || job.apply_url.length < 10) {
    return { admitted: false, reason: 'Invalid or dead application URL', gate: 'dead_url' }
  }

  // 6. Placeholder company (already caught at ingest, but defense-in-depth)
  const placeholderCos = new Set(['name', 'company', 'company name', 'unknown', 'n/a', 'none', 'test', 'example'])
  if (placeholderCos.has(job.company.trim().toLowerCase())) {
    return { admitted: false, reason: 'Placeholder company name', gate: 'placeholder_company' }
  }

  return { admitted: true }
}

/**
 * Populate company_intelligence from live production data.
 * Called periodically (e.g. at chain head) to keep learning fresh.
 */
export async function refreshCompanyIntelligence(): Promise<{ updated: number }> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const sb = createServiceClient()

  // Aggregate per-company metrics from jobs + intelligence + queue
  let data: any = null
  try { const r = await sb.rpc('aggregate_company_intelligence' as any); data = r.data } catch {}
  if (data && Array.isArray(data) && data.length > 0) {
    return { updated: (data as any[]).length }
  }

  // Fallback: manual aggregation if RPC doesn't exist
  try {
    const { data: jobs } = await sb
      .from('jobs')
      .select('company, is_open_to_africa, is_remote, is_active, source')
      .eq('is_active', true)

    const { data: intel } = await sb
      .from('job_ai_intelligence')
      .select('job_id, model_version, africa_eligibility, page_status')

    const { data: queue } = await sb
      .from('ai_processing_queue')
      .select('job_id, status, error')

    const intelMap = new Map<string, any>()
    for (const r of (intel || [])) intelMap.set(r.job_id, r)

    const queueMap = new Map<string, any>()
    for (const r of (queue || [])) queueMap.set(r.job_id, r)

    const stats = new Map<string, any>()
    for (const job of (jobs || [])) {
      const key = job.company
      if (!key) continue
      const s = stats.get(key) || { company: key, total: 0, africa: 0, remote: 0, rejected: 0, dead: 0, verified: 0 }
      s.total++
      if (job.is_open_to_africa) s.africa++
      if (job.is_remote) s.remote++
      const i = intelMap.get((job as any).id)
      if (i) {
        if (i.model_version?.includes(':') && !i.model_version.startsWith('regex')) s.verified++
        if (i.page_status != null && i.page_status >= 400) s.dead++
      }
      const q = queueMap.get((job as any).id)
      if (q?.status === 'completed' && q?.error?.startsWith('Skipped')) s.rejected++
      stats.set(key, s)
    }

    const rows = Array.from(stats.values()).map(s => ({
      company: s.company,
      total_jobs: s.total,
      africa_eligible_jobs: s.africa,
      remote_jobs: s.remote,
      rejected_jobs: s.rejected,
      dead_page_count: s.dead,
      verified_count: s.verified,
      africa_rate: s.total > 0 ? s.africa / s.total : 0,
      rejection_rate: s.total > 0 ? s.rejected / s.total : 0,
      verification_rate: s.total > 0 ? s.verified / s.total : 0,
      priority: s.total > 5 && s.africa / s.total < 0.2 ? 0 : 1, // reduce priority if <20% Africa-eligible
      last_updated: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      const { error: upErr } = await sb.from('company_intelligence').upsert(rows, { onConflict: 'company' })
      if (upErr) console.error('[company_intel] upsert error:', upErr.message?.slice(0, 150))
    }
    return { updated: rows.length }
  } catch (e) {
    console.error('[company_intel] error:', e instanceof Error ? e.message.slice(0, 150) : String(e).slice(0, 150))
    return { updated: 0 }
  }
}

/**
 * Populate source_intelligence from live production data.
 */
export async function refreshSourceIntelligence(): Promise<{ updated: number }> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const sb = createServiceClient()

  try {
    const { data: jobs } = await sb
      .from('jobs')
      .select('source, is_open_to_africa, is_active')
      .eq('is_active', true)

    const { data: queue } = await sb
      .from('ai_processing_queue')
      .select('job_id, status, error')

    const { data: logs } = await sb
      .from('ai_provider_log')
      .select('job_id')
      .limit(10000)

    // Count AI quota per source
    const quotaBySource = new Map<string, number>()
    const jobSourceMap = new Map<string, string>()
    for (const j of (jobs || [])) jobSourceMap.set((j as any).id, j.source)
    for (const l of (logs || [])) {
      const src = jobSourceMap.get(l.job_id)
      if (src) quotaBySource.set(src, (quotaBySource.get(src) || 0) + 1)
    }

    const queueMap = new Map<string, any>()
    for (const r of (queue || [])) queueMap.set(r.job_id, r)

    const stats = new Map<string, any>()
    for (const job of (jobs || [])) {
      const src = job.source || 'unknown'
      const s = stats.get(src) || { source: src, total: 0, accepted: 0, africa: 0, verified: 0, dead: 0, dup: 0, quota: 0 }
      s.total++
      if (job.is_open_to_africa) { s.africa++; s.accepted++ }
      const q = queueMap.get((job as any).id)
      if (q?.status === 'completed' && !q?.error?.startsWith('Skipped')) s.verified++
      if (q?.status === 'completed' && q?.error?.startsWith('Skipped')) s.dup++ // gate-rejected
      s.quota = quotaBySource.get(src) || 0
      stats.set(src, s)
    }

    const rows = Array.from(stats.values()).map(s => ({
      source: s.source,
      total_jobs: s.total,
      accepted_jobs: s.accepted,
      africa_eligible_jobs: s.africa,
      verified_jobs: s.verified,
      dead_link_count: s.dead,
      duplicate_count: s.dup,
      ai_quota_used: s.quota,
      acceptance_rate: s.total > 0 ? s.accepted / s.total : 0,
      africa_rate: s.total > 0 ? s.africa / s.total : 0,
      verification_rate: s.total > 0 ? s.verified / s.total : 0,
      crawl_priority: s.total > 10 && s.africa / s.total < 0.1 ? 0 : 1,
      last_updated: new Date().toISOString(),
    }))

    if (rows.length > 0) {
      const { error: upErr } = await sb.from('source_intelligence').upsert(rows, { onConflict: 'source' })
      if (upErr) console.error('[source_intel] upsert error:', upErr.message?.slice(0, 150))
    }
    return { updated: rows.length }
  } catch (e) {
    console.error('[source_intel] error:', e instanceof Error ? e.message.slice(0, 150) : String(e).slice(0, 150))
    return { updated: 0 }
  }
}

/**
 * Self-healing queue TTL: mark items pending >72h as expired.
 * No job stays permanently queued.
 */
export async function healQueue(): Promise<{ expired: number }> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const sb = createServiceClient()

  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
  const { data, error } = await sb
    .from('ai_processing_queue')
    .update({
      status: 'completed',
      error: 'Expired: pending >72h without progress (self-healing TTL)',
      completed_at: new Date().toISOString(),
    })
    .eq('status', 'pending')
    .lt('created_at', cutoff)
    .select('id')

  if (error) {
    console.error('[heal_queue] error:', error.message?.slice(0, 150))
    return { expired: 0 }
  }
  return { expired: data?.length ?? 0 }
}
