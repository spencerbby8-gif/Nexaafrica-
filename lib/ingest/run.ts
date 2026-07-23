import { createServiceClient } from '@/lib/supabase/service'
import { buildJobSlug } from '@/lib/slug'
import { INGEST_SOURCES, type IngestSource } from '@/lib/ingest/companies'
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

    // Batch fetch existing jobs for this source to avoid N+1
    const sourceIds = jobs.map(j => j.source_id).filter(Boolean) as string[]
    let existingMap = new Map<string, { id: string; first_seen_at: string | null; refresh_count: number | null }>()
    if (sourceIds.length > 0) {
      try {
        // Supabase IN filter has limit ~100, chunk it
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

    for (const job of jobs) {
      const err = validateNormalizedJob(job)
      if (err) {
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
      if (data && data.length > 0) result.inserted += 1
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
 */
export async function runAllSources(
  filter?: (s: IngestSource) => boolean,
  concurrency = 4,
): Promise<SourceResult[]> {
  const sources = filter ? INGEST_SOURCES.filter(filter) : INGEST_SOURCES
  const results: SourceResult[] = []
  for (let i = 0; i < sources.length; i += concurrency) {
    const chunk = sources.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map(runSource))
    results.push(...chunkResults)
  }
  return results
}
