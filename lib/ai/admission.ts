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
const RESTRICTION_RE = /must be (?:based|located|residing|licensed|registered) in|work authorization for|authorized to work in the (?:us|uk|eu|canada)|citizens? of|residents? of (?:the )?(?:us|uk|eu|canada) only|(?:us|uk|eu) (?:only|residents only|citizens only|based only)|(?:based|located|residing|licensed|registered) in (?:the )?(?:us|usa|united states|uk|u\.?k\.?|united kingdom|canada|eu|europe|germany|france|spain|italy|netherlands|poland|sweden|norway|denmark|finland|belgium|austria|switzerland|ireland|portugal|australia|new zealand|india|singapore|japan|israel|uae|dubai|qatar|saudi arabia|turkey|brazil|mexico|argentina|colombia|chile|philippines|indonesia|vietnam|thailand|malaysia|south korea|taiwan|hong kong|latam|apac)|(?:based|located|residing|licensed|registered|board[- ]certified) in (?:the )?(?:state of )?(?:connecticut|california|texas|new york|florida|illinois|pennsylvania|ohio|georgia|north carolina|south carolina|michigan|new jersey|virginia|washington|arizona|massachusetts|tennessee|indiana|missouri|maryland|wisconsin|colorado|minnesota|alabama|louisiana|kentucky|oregon|oklahoma|utah|iowa|nevada|arkansas|mississippi|kansas|new mexico|nebraska|west virginia|idaho|hawaii|maine|new hampshire|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming)|(?:us|united states) (?:work )?(?:authorization|eligibility|citizenship|resident|remote|only)|(?:must )?(?:be|hold|have) (?:a )?(?:valid )?(?:us|state|medical|nursing|law|attorney|teaching) licen[cs]e|licensed to (?:work|practice) in (?:the )?(?:us|usa|united states|uk|canada)|(?:within|inside) the (?:us|united states|uk|united kingdom|eu|canada)|(?:candidates?|applicants?) (?:must be|need to be|should be|will be) (?:based|located|residing|in)|no (?:visa )?(?:sponsorship|sponsoring)|(?:cannot|cannot|can'?t|do not|don'?t) (?:provide )?(?:visa )?sponsorship|(?:work|employment) authorization (?:is )?required|(?:location|locations?)\s*[:—-]\s*(?:us|usa|united states|uk|u\.?k\.?|canada|eu)/i

// Dead/placeholder apply URLs
const DEAD_URL_RE = /^(about:blank|javascript:|#)/i

const LOCATION_RESTRICTED_RE = /^(?:us|usa|u\.?s\.?|united\s+states|uk|u\.?k\.?|united\s+kingdom|canada|eu|europe|germany|france|spain|italy|netherlands|poland|sweden|norway|denmark|finland|belgium|austria|switzerland|ireland|portugal|australia|new\s+zealand|india|singapore|japan|israel|uae|dubai|qatar|saudi\s+arabia|turkey|brazil|mexico|argentina|colombia|chile|philippines|indonesia|vietnam|thailand|malaysia|south\s+korea|taiwan|hong\s+kong|latam|apac)$/i

interface AdmissionJob {
  eligibility: string
  is_open_to_africa: boolean
  is_remote: boolean | null
  apply_url: string
  country: string
  location: string | null
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

  // 2b. Location-field lock: the posting is located in a restricted region
  // and contains NO global-outreach language anywhere => reject pre-AI.
  // Catches "based in Connecticut" style postings that evade text regexes.
  const LOCAL_QUALIFIER = /\b(?:anywhere|worldwide|remote|global(?:ly)?)\b[^.!?\n]{0,50}\b(?:in|within|across|throughout|based)\s+(?:the\s+)?(?:us|usa|united\s+states|uk|u\.?k\.?|united\s+kingdom|canada|europe|eu|germany|france|spain|italy|netherlands|poland|sweden|norway|denmark|finland|belgium|austria|switzerland|ireland|portugal|australia|new\s+zealand|india|singapore|japan|israel|uae|dubai|qatar|saudi\s+arabia|turkey|brazil|mexico|argentina|colombia|chile|philippines|indonesia|vietnam|thailand|malaysia|south\s+korea|taiwan|hong\s+kong|latam|apac)\b/i
  const FALSE_TOKEN = /\banywhere\s+compan(y|ies)\b/i
  const globalOutreach = /\b(worldwide|anywhere|emea|africa\b|any\s+(time\s*zone|location|country)|remote\s*[-—,]?\s*(global|worldwide|anywhere|international))\b/i.test(job.description_md) && !LOCAL_QUALIFIER.test(job.description_md) && !FALSE_TOKEN.test(job.description_md)
  const locText = `${job.country || ''} ${job.location || ''}`.trim()
  const locParts = locText.split(/[,;]/).map((p: string) => p.trim()).filter(Boolean)
  const anyRestrictedPart = locParts.some((p: string) => LOCATION_RESTRICTED_RE.test(p))
  const anyGlobalPart = locParts.some((p: string) => /\b(worldwide|anywhere|remote|africa|emea|global)\b/i.test(p))
  if (locText && anyRestrictedPart && !anyGlobalPart && !globalOutreach) {
    return { admitted: false, reason: 'Located in a region restricted for African applicants', gate: 'work_authorization' }
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
    // [STABILIZATION] Persist RPC results — the RPC is the source of truth
    // for company learning; without this upsert the learning never lands.
    const rows = (data as any[]).map((c: any) => ({
      company: c.company,
      total_jobs: c.total_jobs ?? 0,
      africa_eligible_jobs: c.africa_eligible_jobs ?? 0,
      remote_jobs: c.remote_jobs ?? 0,
      rejected_jobs: c.rejected_jobs ?? 0,
      dead_page_count: c.dead_page_count ?? 0,
      verified_count: c.verified_count ?? 0,
      africa_rate: c.africa_rate ?? 0,
      rejection_rate: c.rejection_rate ?? 0,
      verification_rate: c.verification_rate ?? 0,
      trust_avg: c.trust_avg ?? null,
      priority: (c.total_jobs ?? 0) > 5 && ((c.rejection_rate ?? 0) >= 0.4 || (c.africa_rate ?? 1) < 0.2) ? 0 : 1,
      last_updated: new Date().toISOString(),
    }))
    const { error: upErr } = await sb.from('company_intelligence').upsert(rows, { onConflict: 'company' })
    if (upErr) console.error('[company_intel] RPC upsert error:', upErr.message?.slice(0, 150))
    return { updated: rows.length }
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
      if (q?.status === 'failed' || (q?.status === 'completed' && (q?.error?.startsWith('Skipped') || q?.error?.startsWith('Rejected')))) s.rejected++
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
      priority: s.total > 5 && (s.rejected / s.total >= 0.4 || s.africa / s.total < 0.2) ? 0 : 1, // reduce priority if <20% Africa-eligible or >=40% rejected
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
      const isRejected = q?.status === 'failed' || (q?.status === 'completed' && (q?.error?.startsWith('Skipped') || q?.error?.startsWith('Rejected')))
      if (q?.status === 'completed' && !isRejected) s.verified++
      if (isRejected) s.dup++ // gate-rejected
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
      crawl_priority: s.total > 10 && (s.africa / s.total < 0.25 || s.dup / s.total >= 0.3) ? 0 : 1,
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
 * Queue recovery (stabilization): the destructive 72h TTL expiry is REMOVED.
 * Nothing is ever silently dropped. Retries are scheduled with exponential
 * backoff inside processAIQueue (next_retry_at). Every job eventually becomes
 * Verified (completed + AI row) or Rejected (failed with reason).
 */
export async function healQueue(): Promise<{ expired: number }> {
  return { expired: 0 }
}