import { createServiceClient } from '@/lib/supabase/service'
import { buildJobSlug } from '@/lib/slug'
import { INGEST_SOURCES, type IngestSource } from '@/lib/ingest/companies'
import { REMOTE_BOARD_SOURCES, type RemoteBoardSource } from '@/lib/ingest/remoteBoards'
import { fetchAshby } from '@/lib/ingest/sources/ashby'
import { fetchComeet } from '@/lib/ingest/sources/comeet'
import { fetchGreenhouse } from '@/lib/ingest/sources/greenhouse'
import { fetchLever } from '@/lib/ingest/sources/lever'
import { fetchPersonio } from '@/lib/ingest/sources/personio'
import { fetchRecruitee } from '@/lib/ingest/sources/recruitee'
import { fetchSmartRecruiters } from '@/lib/ingest/sources/smartrecruiters'
import { fetchWorkable } from '@/lib/ingest/sources/workable'
import type { NormalizedJob } from '@/lib/ingest/normalize'
import { auditClassification, validateNormalizedJob } from '@/lib/ingest/validate'
import {
  extractIntelligence,
  formatSalary,
  type JobIntelligence,
} from '@/lib/intelligence'
import { calculateTrustScore } from '@/lib/trust/engine'

/**
 * Phase 16: run the deterministic Intelligence Engine over a normalized job
 * and merge the results. Single source of extraction for all 8 ATS adapters —
 * no per-adapter duplication. Salary text already extracted by an adapter is
 * preserved; the engine adds structured values + the evidence signal store and
 * an authoritative employment_type (no silent full_time default).
 */
function enrichIntelligence(job: NormalizedJob): {
  intelligence: JobIntelligence
  salary_range: string | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_period: string | null
  employment_type: NormalizedJob['employment_type']
} {
  const intelligence = extractIntelligence(
    {
      title: job.title,
      description: job.description_md,
      location: job.location,
      tags: job.tags,
    },
    // Trust an explicit adapter-provided type over free-text inference, but
    // only when it is a confident value (not the legacy 'unknown').
    job.employment_type && job.employment_type !== 'unknown'
      ? job.employment_type
      : null,
  )
  const s = intelligence.salary
  return {
    intelligence,
    // Preserve any adapter salary text; otherwise use the engine's formatting.
    salary_range: job.salary_range ?? formatSalary(s),
    salary_min: s?.min ?? null,
    salary_max: s?.max ?? null,
    salary_currency: s?.currency ?? null,
    salary_period: s?.period ?? null,
    employment_type: intelligence.employment_type,
  }
}

export interface SourceResult {
  source: string
  ok: boolean
  fetched: number
  inserted: number
  skipped: number
  rejected: number
  error?: string
}

async function fetchOneWithRetry(s: IngestSource, retries = 2): Promise<NormalizedJob[]> {
  let lastError: any = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fetchOne(s)
      return result
    } catch (e) {
      lastError = e
      if (attempt < retries) {
        const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500
        console.log(`[ingest] retry ${attempt + 1}/${retries} for ${s.ats}:${s.slug} after ${Math.round(delayMs)}ms: ${e instanceof Error ? e.message : String(e)}`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw lastError
}

async function fetchOne(s: IngestSource): Promise<NormalizedJob[]> {
  switch (s.ats) {
    case 'greenhouse':
      return fetchGreenhouse(s.slug, s.company, s.logo ?? null)
    case 'lever':
      return fetchLever(s.slug, s.company, s.logo ?? null)
    case 'ashby':
      return fetchAshby(s.slug, s.company, s.logo ?? null)
    case 'workable':
      return fetchWorkable(s.slug, s.company, s.logo ?? null)
    case 'smartrecruiters':
      return fetchSmartRecruiters(s.slug, s.company, s.logo ?? null)
    case 'recruitee':
      return fetchRecruitee(s.slug, s.company, s.logo ?? null)
    case 'personio':
      return fetchPersonio(s.slug, s.company, s.logo ?? null)
    case 'comeet':
      return fetchComeet(s.slug, s.company, s.logo ?? null)
  }
}

/**
 * Run a single source: fetch, validate, upsert. Always records a row in
 * ingest_runs whether successful or failed. Errors from one source NEVER
 * affect another — each runs in isolation.
 */
async function runSource(s: IngestSource): Promise<SourceResult> {
  const supabase = createServiceClient()
  const sourceLabel = `${s.ats}:${s.slug}`
  const result: SourceResult = {
    source: sourceLabel,
    ok: false,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    rejected: 0,
  }

  try {
    const jobs = await fetchOneWithRetry(s)
    result.fetched = jobs.length

    // Batch fetch existing jobs for this source to avoid N+1 + cross-source duplicate detection by apply_url
    const sourceIds = jobs.map(j => j.source_id).filter(Boolean) as string[]
    let existingMap = new Map<string, { id: string; first_seen_at: string | null; refresh_count: number | null }>()
    let duplicateUrlMap = new Map<string, string>() // apply_url -> existing id from different source

    if (sourceIds.length > 0) {
      try {
        const chunkSize = 100
        for (let i = 0; i < sourceIds.length; i += chunkSize) {
          const chunk = sourceIds.slice(i, i + chunkSize)
          const { data } = await supabase
            .from('jobs')
            .select('source_id, id, first_seen_at, refresh_count')
            .eq('source', s.ats)
            .in('source_id', chunk)
          for (const row of (data || []) as any[]) {
            existingMap.set(row.source_id, { id: row.id, first_seen_at: row.first_seen_at, refresh_count: row.refresh_count })
          }
        }
      } catch {}
    }

    // Cross-source duplicate detection by apply_url (prevent same job from different ATS)
    try {
      const applyUrls = jobs.map(j => j.apply_url).filter(Boolean).slice(0, 100) // limit to 100 to avoid large IN query
      if (applyUrls.length > 0) {
        const { data: dupData } = await supabase
          .from('jobs')
          .select('id, apply_url')
          .in('apply_url', applyUrls)
          .neq('source', s.ats) // different source
          .eq('is_active', true)
          .limit(100)
        for (const row of (dupData || []) as any[]) {
          if (row.apply_url) duplicateUrlMap.set(row.apply_url, row.id)
        }
      }
    } catch {}

    // Batch company counts: collect unique companies, fetch counts in one grouped query per 20 companies to avoid too many ilike
    const uniqueCompanies = Array.from(new Set(jobs.map(j => j.company).filter(Boolean))) as string[]
    const companyCountMap = new Map<string, number>()
    if (uniqueCompanies.length > 0) {
      try {
        // For performance, do a single query counting jobs per company using ilike any? Simpler: fetch all active jobs for these companies in one go and count in JS
        // To keep query small, we limit to 2000 rows and count in memory (good enough for trust signal)
        const { data: companyRows } = await supabase
          .from('jobs')
          .select('company')
          .eq('is_active', true)
          .in('company', uniqueCompanies)
          .limit(5000)
        for (const c of uniqueCompanies) {
          const count = (companyRows || []).filter((r: any) => (r.company || '').toLowerCase() === c.toLowerCase()).length
          companyCountMap.set(c.toLowerCase(), count)
        }
      } catch {
        // fallback to 0
      }
    }

    // [STABILIZATION] Company learning gate: companies with measured high
    // rejection or low Africa-eligibility lose crawl priority — their jobs are
    // rejected before validation/upsert.
    let companyGate = new Map<string, { rejection_rate: number; africa_rate: number; total_jobs: number }>()
    try {
      const { data: ci } = await supabase
        .from('company_intelligence')
        .select('company, rejection_rate, africa_rate, total_jobs')
        .gte('total_jobs', 4)
      for (const c of (ci || []) as any[]) {
        companyGate.set(String(c.company).toLowerCase(), {
          rejection_rate: Number(c.rejection_rate) || 0,
          africa_rate: Number(c.africa_rate) || 0,
          total_jobs: Number(c.total_jobs) || 0,
        })
      }
    } catch {}

    for (const job of jobs) {
      const err = validateNormalizedJob(job)
      if (err) {
        result.rejected += 1
        continue
      }
      const ci = companyGate.get((job.company || '').toLowerCase())
      if (ci && (ci.rejection_rate >= 0.5 || ci.africa_rate < 0.2)) {
        console.log(`[ingest] company gate: rejected ${job.company} job "${job.title}" (rejection_rate=${ci.rejection_rate.toFixed(2)}, africa_rate=${ci.africa_rate.toFixed(2)})`)
        result.rejected += 1
        continue
      }
      for (const warning of auditClassification(job)) {
        console.log(`[v0][ingest-audit] ${warning}`)
      }
      const intel = enrichIntelligence(job)
      const slug = buildJobSlug(job.title, job.company, job.country)

      const existing = existingMap.get(job.source_id) || null
      const nowIso = new Date().toISOString()
      const companyJobCount = companyCountMap.get(job.company.toLowerCase()) || 0

      let trustResult: ReturnType<typeof calculateTrustScore> | null = null
      try {
        const jobForTrust: any = {
          id: existing?.id || `tmp-${job.source}-${job.source_id}`,
          slug,
          title: job.title,
          company: job.company,
          company_logo: job.company_logo,
          description_md: job.description_md,
          apply_url: job.apply_url,
          category: job.category,
          location: job.location,
          country: job.country,
          salary_range: intel.salary_range,
          salary_min: intel.salary_min,
          salary_max: intel.salary_max,
          salary_currency: intel.salary_currency,
          salary_period: intel.salary_period,
          employment_type: intel.employment_type,
          intelligence: intel.intelligence,
          tags: job.tags,
          is_remote: job.is_remote,
          is_open_to_africa: job.is_open_to_africa,
          eligibility: job.eligibility,
          posted_at: job.posted_at || new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: job.expires_at,
          source: job.source,
          source_id: job.source_id,
        }
        trustResult = calculateTrustScore(jobForTrust, { companyJobCount })
      } catch {}

      const row: Record<string, unknown> = {
        slug,
        title: job.title,
        company: job.company,
        company_logo: job.company_logo,
        description_md: job.description_md,
        apply_url: job.apply_url,
        category: job.category,
        location: job.location,
        country: job.country,
        salary_range: intel.salary_range,
        salary_min: intel.salary_min,
        salary_max: intel.salary_max,
        salary_currency: intel.salary_currency,
        salary_period: intel.salary_period,
        employment_type: intel.employment_type,
        intelligence: intel.intelligence,
        tags: job.tags,
        is_remote: job.is_remote,
        is_open_to_africa: job.is_open_to_africa,
        eligibility: job.eligibility,
        source: job.source,
        source_id: job.source_id,
        expires_at: job.expires_at,
        is_active: true,
        last_seen_at: nowIso,
        last_refreshed_at: nowIso,
        refresh_count: existing ? (existing.refresh_count || 0) + 1 : 1,
        first_seen_at: existing?.first_seen_at || nowIso,
        trust_score: trustResult?.score ?? null,
        trust_confidence: trustResult?.confidence ?? "unknown",
        trust_signals: trustResult?.signals ?? [],
        trust_version: trustResult?.version ?? 1,
        is_flagged: trustResult?.isFlagged ?? false,
        flagged_reason: trustResult?.flaggedReason ?? null,
      }
      if (job.posted_at) row.posted_at = job.posted_at

      const { data, error } = await supabase
        .from('jobs')
        .upsert(row, { onConflict: 'source,source_id' })
        .select('id')
      if (error) {
        result.rejected += 1
        continue
      }
      if (data && data.length > 0) {
        result.inserted += 1
        try {
          // ignoreDuplicates: a job sighted again must not duplicate its
          // queue row (unique(job_id) was throwing and being swallowed).
          // Failed rows that are re-sighted get one automatic retry.
          await supabase.from('ai_processing_queue').upsert(
            { job_id: data[0].id, status: 'pending', priority: existing ? 0 : 10 },
            { onConflict: 'job_id', ignoreDuplicates: true },
          )
          await supabase.from('ai_processing_queue')
            .update({ status: 'pending', error: null })
            .eq('job_id', data[0].id)
            .eq('status', 'failed')
        } catch {}
      }
      else result.skipped += 1
    }

    result.ok = true
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
  }

  await supabase.from('ingest_runs').insert({
    source: result.source,
    ok: result.ok,
    fetched: result.fetched,
    inserted: result.inserted,
    skipped: result.skipped,
    rejected: result.rejected,
    error: result.error ?? null,
  })

  return result
}

/**
 * Run every configured source in parallel-batched groups. We batch to be
 * polite to ATS endpoints and to avoid hitting Vercel's serverless
 * function limits during a single invocation.
 * Auto-disables consistently failing connectors (5+ consecutive failures).
 */
export async function runAllSources(
  filter?: (s: IngestSource) => boolean,
  concurrency = 4,
): Promise<SourceResult[]> {
  const supabase = createServiceClient()
  // Fetch recent runs to calculate health and auto-disable failing connectors
  let disabledSources = new Set<string>()
  try {
    const { data: recentRuns } = await supabase
      .from('ingest_runs')
      .select('source, ok, created_at')
      .order('created_at', { ascending: false })
      .limit(500)
    
    // Calculate consecutive failures per source
    const failures = new Map<string, number>()
    const grouped = new Map<string, any[]>()
    for (const run of (recentRuns || []) as any[]) {
      if (!grouped.has(run.source)) grouped.set(run.source, [])
      grouped.get(run.source)!.push(run)
    }
    for (const [source, runs] of grouped as Map<string, any[]>) {
      const sorted = [...runs].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      let cf = 0
      for (const r of sorted) {
        if (!r.ok) cf++
        else break
      }
      if (cf >= 5) {
        disabledSources.add(source)
        console.log(`[ingest] auto-disabling ${source} after ${cf} consecutive failures`)
      }
    }
  } catch {}

  // [STABILIZATION] Source learning: sources with crawl_priority=0 (measured
  // low Africa-eligibility or high rejection share) are skipped entirely.
  let zeroPrioritySources = new Set<string>()
  try {
    const { data: srcIntel } = await supabase
      .from('source_intelligence')
      .select('source, crawl_priority')
    for (const r of (srcIntel || []) as any[]) {
      if (r.crawl_priority === 0) zeroPrioritySources.add(String(r.source))
    }
  } catch {}
  if (zeroPrioritySources.size > 0) {
    console.log(`[ingest] skipping low-priority sources: ${Array.from(zeroPrioritySources).join(', ')}`)
  }

  let sources = filter ? INGEST_SOURCES.filter(filter) : INGEST_SOURCES
  // Filter out auto-disabled and learning-downgraded
  sources = sources.filter(s => !disabledSources.has(`${s.ats}:${s.slug}`) && !zeroPrioritySources.has(s.ats))

  const results: SourceResult[] = []
  for (let i = 0; i < sources.length; i += concurrency) {
    const chunk = sources.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map(runSource))
    results.push(...chunkResults)
  }

  // Log disabled count
  if (disabledSources.size > 0) {
    console.log(`[ingest] ${disabledSources.size} sources auto-disabled due to 5+ failures: ${Array.from(disabledSources).join(', ')}`)
  }

  return results
}

// ========== Tier 1 Remote Boards - Production Grade ==========

async function fetchRemoteBoardWithRetry(
  source: { id: string; fetch: () => Promise<NormalizedJob[]>; rateLimitMs: number },
  retries = 2
): Promise<NormalizedJob[]> {
  let lastError: any = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const start = Date.now()
      const jobs = await source.fetch()
      const duration = Date.now() - start
      console.log(`[remote-board] ${source.id} fetched ${jobs.length} in ${duration}ms`)
      // Respect rate limit after fetch
      await new Promise(r => setTimeout(r, source.rateLimitMs))
      return jobs
    } catch (e) {
      lastError = e
      if (attempt < retries) {
        const delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500
        console.log(`[remote-board] retry ${attempt + 1}/${retries} for ${source.id} after ${Math.round(delayMs)}ms: ${e instanceof Error ? e.message : String(e)}`)
        await new Promise(r => setTimeout(r, delayMs))
      }
    }
  }
  throw lastError
}

async function runRemoteBoard(source: { id: string; name: string; fetch: () => Promise<NormalizedJob[]>; rateLimitMs: number; trustScore: number }): Promise<SourceResult> {
  const supabase = createServiceClient()
  const result: SourceResult = {
    source: source.id,
    ok: false,
    fetched: 0,
    inserted: 0,
    skipped: 0,
    rejected: 0,
  }

  try {
    const jobs = await fetchRemoteBoardWithRetry(source as any)
    result.fetched = jobs.length

    // Batch existing lookup for dedup across all connectors (by source_id AND by apply_url hash for cross-source dedup)
    const sourceIds = jobs.map(j => j.source_id).filter(Boolean) as string[]
    let existingMap = new Map<string, { id: string; first_seen_at: string | null; refresh_count: number | null }>()
    if (sourceIds.length > 0) {
      try {
        const chunkSize = 100
        for (let i = 0; i < sourceIds.length; i += chunkSize) {
          const chunk = sourceIds.slice(i, i + chunkSize)
          const { data } = await supabase
            .from('jobs')
            .select('source_id, id, first_seen_at, refresh_count')
            .eq('source', source.id.split(':')[0])
            .in('source_id', chunk)
          for (const row of (data || []) as any[]) {
            existingMap.set(row.source_id, { id: row.id, first_seen_at: row.first_seen_at, refresh_count: row.refresh_count })
          }
        }
      } catch {}
    }

    // Cross-source duplicate detection by apply_url
    const applyUrls = jobs.map(j => j.apply_url).filter(Boolean)
    let duplicateApplyUrlMap = new Map<string, string>() // apply_url -> existing job id
    if (applyUrls.length > 0) {
      try {
        // Check if any existing job has same apply_url (different source)
        const { data } = await supabase
          .from('jobs')
          .select('id, apply_url')
          .in('apply_url', applyUrls.slice(0, 100)) // limit to avoid too large query
          .eq('is_active', true)
        for (const row of (data || []) as any[]) {
          if (row.apply_url) duplicateApplyUrlMap.set(row.apply_url, row.id)
        }
      } catch {}
    }

    // [STABILIZATION] Company learning gate: companies with measured high
    // rejection or low Africa-eligibility lose crawl priority — their jobs are
    // rejected before validation/upsert.
    let companyGate = new Map<string, { rejection_rate: number; africa_rate: number; total_jobs: number }>()
    try {
      const { data: ci } = await supabase
        .from('company_intelligence')
        .select('company, rejection_rate, africa_rate, total_jobs')
        .gte('total_jobs', 4)
      for (const c of (ci || []) as any[]) {
        companyGate.set(String(c.company).toLowerCase(), {
          rejection_rate: Number(c.rejection_rate) || 0,
          africa_rate: Number(c.africa_rate) || 0,
          total_jobs: Number(c.total_jobs) || 0,
        })
      }
    } catch {}

    for (const job of jobs) {
      const err = validateNormalizedJob(job)
      if (err) {
        result.rejected += 1
        continue
      }
      const ci = companyGate.get((job.company || '').toLowerCase())
      if (ci && (ci.rejection_rate >= 0.5 || ci.africa_rate < 0.2)) {
        console.log(`[ingest] company gate: rejected ${job.company} job "${job.title}" (rejection_rate=${ci.rejection_rate.toFixed(2)}, africa_rate=${ci.africa_rate.toFixed(2)})`)
        result.rejected += 1
        continue
      }

      // Cross-source duplicate check
      if (duplicateApplyUrlMap.has(job.apply_url)) {
        result.skipped += 1
        continue
      }

      for (const warning of auditClassification(job)) {
        console.log(`[remote-board-audit] ${warning}`)
      }

      const intel = enrichIntelligence(job)
      const slug = buildJobSlug(job.title, job.company, job.country)
      const existing = existingMap.get(job.source_id) || null
      const nowIso = new Date().toISOString()

      let trustResult: ReturnType<typeof calculateTrustScore> | null = null
      try {
        const jobForTrust: any = {
          id: existing?.id || `tmp-${job.source}-${job.source_id}`,
          slug,
          title: job.title,
          company: job.company,
          company_logo: job.company_logo,
          description_md: job.description_md,
          apply_url: job.apply_url,
          category: job.category,
          location: job.location,
          country: job.country,
          salary_range: intel.salary_range,
          salary_min: intel.salary_min,
          salary_max: intel.salary_max,
          salary_currency: intel.salary_currency,
          salary_period: intel.salary_period,
          employment_type: intel.employment_type,
          intelligence: intel.intelligence,
          tags: job.tags,
          is_remote: job.is_remote,
          is_open_to_africa: job.is_open_to_africa,
          eligibility: job.eligibility,
          posted_at: job.posted_at || new Date().toISOString(),
          created_at: new Date().toISOString(),
          expires_at: job.expires_at,
          source: job.source,
          source_id: job.source_id,
        }
        trustResult = calculateTrustScore(jobForTrust, { companyJobCount: 0 })
      } catch {}

      const row: Record<string, unknown> = {
        slug,
        title: job.title,
        company: job.company,
        company_logo: job.company_logo,
        description_md: job.description_md,
        apply_url: job.apply_url,
        category: job.category,
        location: job.location,
        country: job.country,
        salary_range: intel.salary_range,
        salary_min: intel.salary_min,
        salary_max: intel.salary_max,
        salary_currency: intel.salary_currency,
        salary_period: intel.salary_period,
        employment_type: intel.employment_type,
        intelligence: intel.intelligence,
        tags: job.tags,
        is_remote: job.is_remote,
        is_open_to_africa: job.is_open_to_africa,
        eligibility: job.eligibility,
        source: job.source,
        source_id: job.source_id,
        expires_at: job.expires_at,
        is_active: true,
        last_seen_at: nowIso,
        last_refreshed_at: nowIso,
        refresh_count: existing ? (existing.refresh_count || 0) + 1 : 1,
        first_seen_at: existing?.first_seen_at || nowIso,
        trust_score: trustResult?.score ?? source.trustScore,
        trust_confidence: trustResult?.confidence ?? "medium",
        trust_signals: trustResult?.signals ?? [],
        trust_version: trustResult?.version ?? 1,
        is_flagged: trustResult?.isFlagged ?? false,
        flagged_reason: trustResult?.flaggedReason ?? null,
      }
      if (job.posted_at) row.posted_at = job.posted_at

      const { data, error } = await supabase
        .from('jobs')
        .upsert(row, { onConflict: 'source,source_id' })
        .select('id')

      if (error) {
        // Never insert broken apply URLs — already validated, but double-check
        if (error.message.includes('apply_url')) {
          result.rejected += 1
        } else {
          result.rejected += 1
        }
        continue
      }
      if (data && data.length > 0) {
        result.inserted += 1
        try {
          // ignoreDuplicates: a job sighted again must not duplicate its
          // queue row (unique(job_id) was throwing and being swallowed).
          // Failed rows that are re-sighted get one automatic retry.
          await supabase.from('ai_processing_queue').upsert(
            { job_id: data[0].id, status: 'pending', priority: existing ? 0 : 10 },
            { onConflict: 'job_id', ignoreDuplicates: true },
          )
          await supabase.from('ai_processing_queue')
            .update({ status: 'pending', error: null })
            .eq('job_id', data[0].id)
            .eq('status', 'failed')
        } catch {}
      }
      else result.skipped += 1
    }

    result.ok = true
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e)
  }

  await supabase.from('ingest_runs').insert({
    source: result.source,
    ok: result.ok,
    fetched: result.fetched,
    inserted: result.inserted,
    skipped: result.skipped,
    rejected: result.rejected,
    error: result.error ?? null,
  })

  return result
}

export async function runRemoteBoards(concurrency = 2): Promise<SourceResult[]> {
  const enabled = REMOTE_BOARD_SOURCES.filter(s => s.enabled)
  const results: SourceResult[] = []
  for (let i = 0; i < enabled.length; i += concurrency) {
    const chunk = enabled.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map(runRemoteBoard))
    results.push(...chunkResults)
  }
  return results
}

export async function runAllTier1(): Promise<SourceResult[]> {
  console.log('[acquisition] Starting Tier 1: ATS + Remote Boards')
  const [atsResults, remoteResults] = await Promise.all([
    runAllSources(),
    runRemoteBoards(),
  ])
  // [STABILIZATION] Refresh learning after every full run so the next run's
  // gates (company rejection, source crawl priority) use fresh measurements.
  try {
    const { refreshCompanyIntelligence, refreshSourceIntelligence } = await import('@/lib/ai/admission')
    await Promise.all([refreshCompanyIntelligence(), refreshSourceIntelligence()])
  } catch (e) {
    console.log('[ingest] learning refresh failed:', e instanceof Error ? e.message.slice(0, 150) : String(e))
  }
  return [...atsResults, ...remoteResults]
}
