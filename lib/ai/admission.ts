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

import { evaluateLocationPolicy } from '@/lib/locationPolicy'

// Work-authorization restrictions that exclude African applicants
const RESTRICTION_RE = /must be (?:based|located|residing|licensed|registered) in|work authorization for|authorized to work in the (?:us|uk|eu|canada)|citizens? of|residents? of (?:the )?(?:us|uk|eu|canada) only|(?:us|uk|eu) (?:only|residents only|citizens only|based only)|(?:based|located|residing|licensed|registered) in (?:the )?(?:us|usa|united states|uk|u\.?k\.?|united kingdom|canada|eu|europe|germany|france|spain|italy|netherlands|poland|sweden|norway|denmark|finland|belgium|austria|switzerland|ireland|portugal|australia|new zealand|india|singapore|japan|israel|uae|dubai|qatar|saudi arabia|turkey|brazil|mexico|argentina|colombia|chile|philippines|indonesia|vietnam|thailand|malaysia|south korea|taiwan|hong kong|latam|apac)|(?:based|located|residing|licensed|registered|board[- ]certified) in (?:the )?(?:state of )?(?:connecticut|california|texas|new york|florida|illinois|pennsylvania|ohio|georgia|north carolina|south carolina|michigan|new jersey|virginia|washington|arizona|massachusetts|tennessee|indiana|missouri|maryland|wisconsin|colorado|minnesota|alabama|louisiana|kentucky|oregon|oklahoma|utah|iowa|nevada|arkansas|mississippi|kansas|new mexico|nebraska|west virginia|idaho|hawaii|maine|new hampshire|montana|rhode island|delaware|south dakota|north dakota|alaska|vermont|wyoming)|(?:us|united states) (?:work )?(?:authorization|eligibility|citizenship|resident|remote|only)|(?:must )?(?:be|hold|have) (?:a )?(?:valid )?(?:us|state|medical|nursing|law|attorney|teaching) licen[cs]e|licensed to (?:work|practice) in (?:the )?(?:us|usa|united states|uk|canada)|(?:within|inside) the (?:us|united states|uk|united kingdom|eu|canada)|(?:candidates?|applicants?) (?:must be|need to be|should be|will be) (?:based|located|residing|in)|no (?:visa )?(?:sponsorship|sponsoring)|(?:cannot|cannot|can'?t|do not|don'?t) (?:provide )?(?:visa )?sponsorship|(?:work|employment) authorization (?:is )?required|(?:location|locations?)\s*[:—-]\s*(?:us|usa|united states|uk|u\.?k\.?|canada|eu)/i

// Dead/placeholder apply URLs
const DEAD_URL_RE = /^(about:blank|javascript:|#)/i


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

  // 2b. Location policy — ONE shared rule with the ingest classifier
  // (lib/locationPolicy.ts). Covers the legacy Western restriction lock AND
  // the generic specific-location rule (Phase 2): a posting bound to ANY
  // specific place without strong global outreach is not Africa-compatible,
  // whatever the source feed claims about is_remote.
  const locVerdict = evaluateLocationPolicy(job.location, job.country, job.description_md)
  if (locVerdict.bound) {
    return {
      admitted: false,
      reason: locVerdict.kind === 'restricted_region'
        ? 'Located in a region restricted for African applicants'
        : 'Location-bound role without global outreach evidence',
      gate: 'work_authorization',
    }
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
 *
 * [V1-HONESTY] Fixes from the 2026-08-12 live audit:
 *  - PRIMARY path: server-side refresh_company_intelligence() — the whole
 *    upsert runs inside Postgres, bypassing PostgREST's 1,000-row mutation
 *    cap that silently left ~306 companies (everything after "Quizzly.ai",
 *    incl. Stripe/Ramp/Reddit/Spotify/Supabase/Zapier) permanently stale.
 *  - Metrics are AI-truth: africa_rate = AI-confirmed open / all postings;
 *    remote_friendliness = AI fully-remote share; verified = quality>=40.
 *  - The legacy deterministic share is preserved as flag_africa_rate and is
 *    what the ingest gate + crawl priority read (behavior-preserving).
 *  - Fallbacks below are CHUNKED (250 rows/request) so they can never hit
 *    the same cap.
 */
export async function refreshCompanyIntelligence(): Promise<{ updated: number }> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const sb = createServiceClient()

  // Primary: atomic server-side upsert + prune. No row cap, no partial writes.
  try {
    const { data, error } = await sb.rpc('refresh_company_intelligence' as any)
    if (!error && typeof data === 'number' && data > 0) {
      console.log(JSON.stringify({ scope: 'company_intel', event: 'refresh_ok', updated: data }))
      return { updated: data }
    }
  } catch (e) {
    console.warn('[company_intel] server-side refresh unavailable:', e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120))
  }

  // Fallback 1: aggregate RPC + chunked upsert (never >250 rows/request)
  try {
    const { data } = await sb.rpc('aggregate_company_intelligence' as any)
    if (data && Array.isArray(data) && data.length > 0) {
      const rows = (data as any[]).map((c: any) => mapCompanyRow(c))
      for (let i = 0; i < rows.length; i += 250) {
        const { error: upErr } = await sb.from('company_intelligence').upsert(rows.slice(i, i + 250), { onConflict: 'company' })
        if (upErr) console.error('[company_intel] chunked upsert error:', upErr.message?.slice(0, 150))
      }
      return { updated: rows.length }
    }
  } catch (e) {
    console.warn('[company_intel] aggregate RPC unavailable:', e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120))
  }

  // Fallback 2: manual aggregation (legacy) — honest metrics + chunked upsert
  try {
    const jobs = await fetchAllActiveJobs(sb, 'id, company, is_open_to_africa, is_remote, is_active, source, posted_at, salary_range, duplicate_of')
    const intel = await fetchAllRows<any>(sb, 'job_ai_intelligence', 'job_id, model_version, africa_eligibility, remote_eligibility, page_status, quality_score, overall_confidence')
    const queue = await fetchAllRows<any>(sb, 'ai_processing_queue', 'job_id, status, error')

    const intelMap = new Map<string, any>()
    for (const r of (intel || [])) intelMap.set(r.job_id, r)
    const queueMap = new Map<string, any>()
    for (const r of (queue || [])) queueMap.set(r.job_id, r)

    const stats = new Map<string, any>()
    const nowMs = Date.now()
    for (const job of (jobs || [])) {
      const key = job.company
      if (!key) continue
      const s = stats.get(key) || { company: key, total: 0, open: 0, restricted: 0, unknown: 0, decided: 0, flagOpen: 0, remoteFull: 0, remoteOther: 0, remoteUnknown: 0, rejected: 0, dead: 0, verified: 0, velocity: 0, salary: 0, dup: 0, confSum: 0, confN: 0 }
      s.total++
      const i = intelMap.get((job as any).id)
      const afr = i?.africa_eligibility as string | undefined
      if (afr === 'explicit' || afr === 'likely') { s.open++; s.decided++ }
      else if (afr === 'restricted') { s.restricted++; s.decided++ }
      else s.unknown++
      if (job.is_open_to_africa && afr !== 'restricted') s.flagOpen++
      const rem = i?.remote_eligibility as string | undefined
      if (rem === 'fully_remote') s.remoteFull++
      else if (rem === 'onsite' || rem === 'hybrid') s.remoteOther++
      else s.remoteUnknown++
      if (job.posted_at && nowMs - new Date(job.posted_at).getTime() < 30 * 86400000) s.velocity++
      if ((job as any).salary_range) s.salary++
      if ((job as any).duplicate_of) s.dup++
      if (i) {
        if (i.model_version?.includes(':') && !i.model_version.startsWith('regex') && (i.quality_score ?? 0) >= 40) s.verified++
        if (i.page_status != null && i.page_status >= 400) s.dead++
        if (typeof i.overall_confidence === 'number') { s.confSum += i.overall_confidence; s.confN++ }
      }
      const q = queueMap.get((job as any).id)
      if (q?.status === 'failed' || (q?.status === 'completed' && (q?.error?.startsWith('Skipped') || q?.error?.startsWith('Rejected')))) s.rejected++
      stats.set(key, s)
    }

    const rows = Array.from(stats.values()).map(s => mapCompanyRow({
      company: s.company,
      total_jobs: s.total,
      africa_eligible_jobs: s.open,
      remote_jobs: s.remoteFull,
      rejected_jobs: s.rejected,
      dead_page_count: s.dead,
      verified_count: s.verified,
      africa_rate: s.total > 0 ? s.open / s.total : 0,
      rejection_rate: s.total > 0 ? s.rejected / s.total : 0,
      verification_rate: s.total > 0 ? s.verified / s.total : 0,
      trust_avg: null,
      hiring_velocity_30d: s.velocity,
      salary_consistency: s.total > 0 ? s.salary / s.total : 0,
      duplicate_count: s.dup,
      scam_reports: 0,
      avg_ai_confidence: s.confN > 0 ? Math.round(s.confSum / s.confN) : null,
      first_posted_at: null,
      last_posted_at: null,
      active_months: 0,
      distinct_months: 0,
      remote_friendliness: s.remoteFull + s.remoteOther > 0 ? s.remoteFull / (s.remoteFull + s.remoteOther) : 0,
      africa_open_jobs: s.open,
      africa_restricted_jobs: s.restricted,
      africa_unknown_jobs: s.unknown,
      africa_decided_jobs: s.decided,
      africa_open_of_decided: s.decided > 0 ? s.open / s.decided : 0,
      africa_unknown_share: s.total > 0 ? s.unknown / s.total : 0,
      flag_africa_rate: s.total > 0 ? s.flagOpen / s.total : 0,
      remote_fully_jobs: s.remoteFull,
      remote_onsite_hybrid_jobs: s.remoteOther,
      remote_unknown_jobs: s.remoteUnknown,
      remote_unknown_share: s.total > 0 ? s.remoteUnknown / s.total : 0,
    }))

    for (let i = 0; i < rows.length; i += 250) {
      const { error: upErr } = await sb.from('company_intelligence').upsert(rows.slice(i, i + 250), { onConflict: 'company' })
      if (upErr) console.error('[company_intel] fallback upsert error:', upErr.message?.slice(0, 150))
    }
    return { updated: rows.length }
  } catch (e) {
    console.error('[company_intel] error:', e instanceof Error ? e.message.slice(0, 150) : String(e).slice(0, 150))
    return { updated: 0 }
  }
}

/**
 * Map an aggregate_company_intelligence() row into a company_intelligence
 * insert. Priority reads the PRESERVED flag_africa_rate so crawl ordering is
 * unchanged by the honesty switch.
 */
function mapCompanyRow(c: any): Record<string, unknown> {
  return {
    company: c.company,
    total_jobs: c.total_jobs ?? 0,
    africa_eligible_jobs: c.africa_eligible_jobs ?? c.africa_open_jobs ?? 0,
    remote_jobs: c.remote_jobs ?? c.remote_fully_jobs ?? 0,
    rejected_jobs: c.rejected_jobs ?? 0,
    dead_page_count: c.dead_page_count ?? 0,
    verified_count: c.verified_count ?? 0,
    africa_rate: c.africa_rate ?? 0,
    rejection_rate: c.rejection_rate ?? 0,
    verification_rate: c.verification_rate ?? 0,
    trust_avg: c.trust_avg ?? null,
    hiring_velocity_30d: c.hiring_velocity_30d ?? 0,
    salary_consistency: c.salary_consistency ?? 0,
    duplicate_count: c.duplicate_count ?? 0,
    scam_reports: c.scam_reports ?? 0,
    avg_ai_confidence: c.avg_ai_confidence ?? null,
    first_posted_at: c.first_posted_at ?? null,
    last_posted_at: c.last_posted_at ?? null,
    active_months: c.active_months ?? 0,
    distinct_months: c.distinct_months ?? 0,
    remote_friendliness: c.remote_friendliness ?? 0,
    africa_open_jobs: c.africa_open_jobs ?? 0,
    africa_restricted_jobs: c.africa_restricted_jobs ?? 0,
    africa_unknown_jobs: c.africa_unknown_jobs ?? 0,
    africa_decided_jobs: c.africa_decided_jobs ?? 0,
    africa_open_of_decided: c.africa_open_of_decided ?? 0,
    africa_unknown_share: c.africa_unknown_share ?? 0,
    flag_africa_rate: c.flag_africa_rate ?? 0,
    remote_fully_jobs: c.remote_fully_jobs ?? 0,
    remote_onsite_hybrid_jobs: c.remote_onsite_hybrid_jobs ?? 0,
    remote_unknown_jobs: c.remote_unknown_jobs ?? 0,
    remote_unknown_share: c.remote_unknown_share ?? 0,
    priority: (c.total_jobs ?? 0) > 5 && ((c.rejection_rate ?? 0) >= 0.4 || (c.flag_africa_rate ?? 1) < 0.2) ? 0 : 1,
    last_updated: new Date().toISOString(),
  }
}

/**
 * Fetch ALL active jobs in pages of 1,000.
 *
 * PostgREST caps a single request at 1,000 rows, which silently truncated the
 * learning layer (source_intelligence totals summed to exactly 1,000 while the
 * real counts were 5x higher). Paginating keeps the learning gates computed on
 * the full dataset.
 */
async function fetchAllActiveJobs<T = any>(sb: any, select: string): Promise<T[]> {
  const PAGE = 1000
  const rows: T[] = []
  try {
    for (let from = 0; from < 50000; from += PAGE) {
      const { data, error } = await sb
        .from('jobs')
        .select(select)
        .eq('is_active', true)
        .range(from, from + PAGE - 1)
      if (error) {
        console.error('[learning] paginated fetch error:', error.message?.slice(0, 150))
        break
      }
      if (!data || data.length === 0) break
      rows.push(...(data as T[]))
      if (data.length < PAGE) break
    }
  } catch (e) {
    console.error('[learning] paginated fetch exception:', (e instanceof Error ? e.message : String(e)).slice(0, 150))
  }
  return rows
}

/**
 * [V2] Generic paginated fetch for ANY table (PostgREST caps at 1,000 rows).
 */
async function fetchAllRows<T = any>(sb: any, table: string, select: string, extra?: (q: any) => any): Promise<T[]> {
  const PAGE = 1000
  const rows: T[] = []
  try {
    for (let from = 0; from < 50000; from += PAGE) {
      let q = sb.from(table).select(select)
      if (extra) q = extra(q)
      const { data, error } = await q.range(from, from + PAGE - 1)
      if (error) {
        console.error(`[learning] paginated fetch error (${table}):`, error.message?.slice(0, 150))
        break
      }
      if (!data || data.length === 0) break
      rows.push(...(data as T[]))
      if (data.length < PAGE) break
    }
  } catch (e) {
    console.error(`[learning] paginated fetch exception (${table}):`, (e instanceof Error ? e.message : String(e)).slice(0, 150))
  }
  return rows
}

/**
 * Populate source_intelligence from live production data (V2).
 */
export async function refreshSourceIntelligence(): Promise<{ updated: number }> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const sb = createServiceClient()

  try {
    // [CAP-FIX] Paginated fetch — a single capped request computed learning
    // stats on only the first 1,000 active jobs (~22% of the dataset).
    const jobs = await fetchAllActiveJobs(sb, 'id, source, is_open_to_africa, is_active, posted_at, expires_at')

    const queue = await fetchAllRows<any>(sb, 'ai_processing_queue', 'job_id, status, error')
    const logs = await fetchAllRows<any>(sb, 'ai_provider_log', 'job_id')
    const jai = await fetchAllRows<any>(sb, 'job_ai_intelligence', 'job_id, quality_score, africa_eligibility, page_status')

    // Ingest-run history for reliability: source column is like
    // "greenhouse:stripe" or "remoteok:api" — key by the prefix.
    // [V1-HONESTY] Paginate — a .limit(1000) silently caps history as runs grow.
    let runsBySource = new Map<string, { total: number; ok: number; failures: number; consecutive: number }>()
    try {
      const allRuns: Array<{ source: string; ok: boolean }> = []
      for (let from = 0; from < 50000; from += 1000) {
        const { data: page, error } = await sb
          .from('ingest_runs')
          .select('source, ok')
          .order('created_at', { ascending: false })
          .range(from, from + 999)
        if (error || !page || page.length === 0) break
        allRuns.push(...(page as any[]))
        if (page.length < 1000) break
      }
      const groups = new Map<string, any[]>()
      for (const r of allRuns) {
        const key = String(r.source).split(':')[0]
        if (!key) continue
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(r)
      }
      for (const [key, list] of groups) {
        let consecutive = 0
        for (const r of list) {
          if (!r.ok) consecutive++
          else break
        }
        runsBySource.set(key, {
          total: list.length,
          ok: list.filter((r: any) => r.ok).length,
          failures: list.filter((r: any) => !r.ok).length,
          consecutive,
        })
      }
    } catch {}

    // AI quota per source
    const jobSourceMap = new Map<string, string>()
    for (const j of (jobs || [])) jobSourceMap.set((j as any).id, (j as any).source)
    const quotaBySource = new Map<string, number>()
    for (const l of (logs || [])) {
      const src = jobSourceMap.get(l.job_id)
      if (src) quotaBySource.set(src, (quotaBySource.get(src) || 0) + 1)
    }

    const queueMap = new Map<string, any>()
    for (const r of (queue || [])) queueMap.set(r.job_id, r)
    const jaiQuality = new Map<string, number | null>()
    const jaiElig = new Map<string, string | null>()
    const jaiPageStatus = new Map<string, number | null>()
    for (const r of (jai || [])) {
      jaiQuality.set(r.job_id, r.quality_score ?? null)
      jaiElig.set(r.job_id, r.africa_eligibility ?? null)
      jaiPageStatus.set(r.job_id, r.page_status ?? null)
    }

    const stats = new Map<string, any>()
    const now = Date.now()
    for (const job of (jobs || [])) {
      const src = job.source || 'unknown'
      const s = stats.get(src) || { source: src, total: 0, accepted: 0, africa: 0, verified: 0, dead: 0, dup: 0, quota: 0, expired: 0, freshDays: 0, qualitySum: 0, qualityN: 0, rejected: 0, agree: 0, agreeN: 0 }
      s.total++
      // [V4] AI agreement: AI eligibility verdict vs deterministic flag
      const aiElig = jaiElig.get((job as any).id)
      if (aiElig && (aiElig === 'explicit' || aiElig === 'likely' || aiElig === 'restricted')) {
        const aiOpen = aiElig !== 'restricted'
        if (aiOpen === Boolean((job as any).is_open_to_africa)) s.agree++
        s.agreeN++
      }
      if (job.is_open_to_africa) { s.africa++; s.accepted++ }
      const q = queueMap.get((job as any).id)
      const isRejected = q?.status === 'failed' || (q?.status === 'completed' && (q?.error?.startsWith('Skipped') || q?.error?.startsWith('Rejected')))
      // [V1-HONESTY] "verified" = the AI actually produced a quality row
      // (quality_score >= 40), NOT merely a completed queue item — a regex
      // fallback row must not count as verified.
      const qScore = jaiQuality.get((job as any).id)
      if (qScore != null && qScore >= 40) s.verified++
      if (isRejected) s.rejected++ // gate-rejected
      // [V1-HONESTY] dead links = AI-verified page status >= 400 (was never
      // populated — dead_link_count stayed 0, deep audit F5).
      const pageStatus = jaiPageStatus.get((job as any).id)
      if (pageStatus != null && pageStatus >= 400) s.dead++
      if (q?.error?.toLowerCase().includes('duplicate')) s.dup++
      if (job.expires_at && new Date(job.expires_at).getTime() < now) s.expired++
      if (job.posted_at) {
        const ageDays = (now - new Date(job.posted_at).getTime()) / 86400000
        s.freshDays += ageDays
      }
      if (qScore != null) { s.qualitySum += qScore; s.qualityN++ }
      s.quota = quotaBySource.get(src) || 0
      stats.set(src, s)
    }

    const rows = Array.from(stats.values()).map(s => {
      const runs = runsBySource.get(s.source)
      const reliability = runs && runs.total > 0 ? runs.ok / runs.total : 0
      const duplicateShare = s.total > 0 ? s.dup / s.total : 0
      const trustScore = Math.max(0, Math.min(100, Math.round(
        100 * (0.35 * reliability + 0.25 * (s.total > 0 ? s.verified / s.total : 0) + 0.2 * (s.total > 0 ? s.africa / s.total : 0) + 0.2 * (1 - duplicateShare))
      )))
      return {
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
        // [V4] share of AI verdicts that agree with the deterministic tier
        ai_agreement: s.agreeN > 0 ? s.agree / s.agreeN : 0,
        // [V2] reliability / freshness / expired / quality / composite trust
        reliability_score: reliability,
        runs_count: runs?.total ?? 0,
        consecutive_failures: runs?.consecutive ?? 0,
        expired_count: s.expired,
        avg_quality_score: s.qualityN > 0 ? Math.round(s.qualitySum / s.qualityN) : 0,
        avg_freshness_days: s.total > 0 ? Math.round(s.freshDays / s.total) : 0,
        trust_score: trustScore,
        // [V3] Adaptive: a measured low composite trust (with enough runs to
        // be meaningful) disables crawling, in addition to the existing
        // Africa/duplicate heuristic.
        crawl_priority: (s.total > 10 && (s.africa / s.total < 0.25 || s.dup / s.total >= 0.3)) || ((runs?.total ?? 0) >= 5 && trustScore < 35) || (s.agreeN >= 8 && s.agree / s.agreeN < 0.5) ? 0 : 1,
        last_updated: new Date().toISOString(),
      }
    })

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

export async function healQueue(): Promise<{ expired: number }> {
  return { expired: 0 }
}

/**
 * [PHASE-3 FIX] Re-apply Phase 2 remote-truth write-backs after ingestion.
 *
 * Root cause (proven 2026-08-19): the ingest upsert writes the FEED value of
 * is_remote onto existing rows, silently reverting the engine's evidenced
 * hybrid/onsite write-backs (329 flips reverted to 158 in one Tier-1 cycle —
 * exactly the 171 re-sighted jobs whose verdicts met the flip criteria).
 * Re-sighted jobs keep their completed queue rows, so the engine never
 * reprocesses them — the revert would persist indefinitely without this guard.
 * Idempotent: flips only rows still claiming is_remote=true despite a
 * qualifying verdict.
 */
export async function reapplyRemoteTruthWrites(): Promise<{ flipped: number }> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const { REMOTE_WRITEBACK_MIN_CONFIDENCE } = await import('@/lib/ai/verified')
    const sb = createServiceClient()
    const { data: rows, error } = await sb
      .from('job_ai_intelligence')
      .select('job_id')
      .in('remote_eligibility', ['hybrid', 'onsite'])
      .gte('remote_confidence', REMOTE_WRITEBACK_MIN_CONFIDENCE)
      .not('remote_evidence', 'is', null)
      .like('model_version', '%:%')
      .not('model_version', 'like', 'regex%')
      .not('model_version', 'like', 'no-ai%')
      .limit(5000)
    if (error || !rows || rows.length === 0) return { flipped: 0 }
    const ids = (rows as Array<{ job_id: string }>).map((r) => r.job_id)
    const { data: upd, error: upErr } = await sb
      .from('jobs')
      .update({ is_remote: false })
      .eq('is_remote', true)
      .in('id', ids)
      .select('id')
    if (upErr) {
      console.log(JSON.stringify({ scope: 'remote_truth', event: 'reapply_error', error: upErr.message.slice(0, 150) }))
      return { flipped: 0 }
    }
    const flipped = upd?.length ?? 0
    if (flipped > 0) {
      console.log(JSON.stringify({ scope: 'remote_truth', event: 'reapplied', flipped }))
    }
    return { flipped }
  } catch (e) {
    console.log(JSON.stringify({ scope: 'remote_truth', event: 'reapply_failed', error: (e instanceof Error ? e.message : String(e)).slice(0, 150) }))
    return { flipped: 0 }
  }
}
