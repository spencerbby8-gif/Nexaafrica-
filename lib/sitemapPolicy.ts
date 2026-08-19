/**
 * [PHASE-3] What may enter the job sitemap — ONE indexability contract.
 *
 * A job URL is submitted to crawlers only when it is a legitimate, active,
 * publicly accessible listing:
 *   - active
 *   - eligible tier explicit|likely (restricted AND unknown are never indexed:
 *     unknown is never promoted, restricted must stay invisible)
 *   - flagged open to Africa (public-list contract)
 *   - not evidence-marked non-remote (Phase 2 hybrid/onsite write-back)
 *   - not a duplicate (duplicate_of unset)
 *   - fresh: posted within SITEMAP_JOB_MAX_AGE_DAYS and not expired
 *     (stale URLs waste crawl budget and hurt Google Jobs trust)
 *
 * The AI-restricted exclusion (job_ai_intelligence.africa_eligibility) is
 * applied on top at generation time in app/sitemap.ts.
 */

export const JOBS_PER_SITEMAP_CHUNK = 5000
export const SITEMAP_JOB_MAX_AGE_DAYS = 90

export interface SitemapJobCandidate {
  slug: string | null
  posted_at: string | null
  created_at: string | null
  expires_at: string | null
}

/** Freshness/staleness gate for sitemap inclusion (dates only). */
export function isFreshJobForSitemap(
  job: SitemapJobCandidate,
  nowMs: number = Date.now(),
): boolean {
  if (!job.slug) return false
  if (job.expires_at) {
    const exp = new Date(job.expires_at).getTime()
    if (!Number.isNaN(exp) && exp < nowMs) return false
  }
  const postedRaw = job.posted_at ?? job.created_at
  const posted = postedRaw ? new Date(postedRaw).getTime() : NaN
  if (Number.isNaN(posted)) return true // no date at all -> keep, lastModified falls back
  return posted >= nowMs - SITEMAP_JOB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
}

/** How many job chunks the sitemap index needs (>=1 chunk always). */
export function jobChunkCount(totalIndexableJobs: number): number {
  return Math.max(1, Math.ceil(Math.max(0, totalIndexableJobs) / JOBS_PER_SITEMAP_CHUNK))
}
