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
    const jobs = await fetchOne(s)
    result.fetched = jobs.length

    for (const job of jobs) {
      const err = validateNormalizedJob(job)
      if (err) {
        result.rejected += 1
        continue
      }
      // Non-fatal: surface suspicious classifications for monitoring without
      // dropping the row. Visible in serverless logs as [v0][ingest-audit].
      for (const warning of auditClassification(job)) {
        console.log(`[v0][ingest-audit] ${warning}`)
      }
      // Phase 16: deterministic intelligence extraction (persisted, evidence-backed).
      const intel = enrichIntelligence(job)
      const slug = buildJobSlug(job.title, job.company, job.country)
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
      }
      // Only write posted_at when the provider gave a real, trustworthy date.
      // Omitting it means: on INSERT it stays NULL (display falls back to
      // created_at); on conflict UPDATE the existing real date is preserved
      // rather than being clobbered with a fake "fresh" timestamp.
      if (job.posted_at) row.posted_at = job.posted_at
      // (source, source_id) is unique at the DB level — upsert on that key
      // so refreshes overwrite stale data and revive previously-deactivated
      // roles when they reappear in the feed.
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

  // Best-effort log; don't let logging failure mask the run result.
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
