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
import { validateNormalizedJob } from '@/lib/ingest/validate'

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
      const slug = buildJobSlug(job.title, job.company, job.country)
      const row = {
        slug,
        title: job.title,
        company: job.company,
        company_logo: job.company_logo,
        description_md: job.description_md,
        apply_url: job.apply_url,
        category: job.category,
        location: job.location,
        country: job.country,
        salary_range: job.salary_range,
        employment_type: job.employment_type,
        tags: job.tags,
        is_remote: job.is_remote,
        is_open_to_africa: job.is_open_to_africa,
        source: job.source,
        source_id: job.source_id,
        expires_at: job.expires_at,
        is_active: true,
      }
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
