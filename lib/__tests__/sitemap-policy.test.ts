import { describe, expect, it } from 'vitest'
import {
  JOBS_PER_SITEMAP_CHUNK,
  SITEMAP_JOB_MAX_AGE_DAYS,
  isFreshJobForSitemap,
  jobChunkCount,
} from '@/lib/sitemapPolicy'

/** [PHASE-3] Sitemap indexability policy — freshness + chunking contract. */

const NOW = Date.UTC(2026, 7, 19, 12, 0, 0) // 2026-08-19T12:00:00Z
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

describe('sitemap freshness gate', () => {
  it('includes fresh jobs', () => {
    expect(isFreshJobForSitemap({ slug: 'a', posted_at: daysAgo(1), created_at: daysAgo(1), expires_at: null }, NOW)).toBe(true)
    expect(isFreshJobForSitemap({ slug: 'a', posted_at: daysAgo(SITEMAP_JOB_MAX_AGE_DAYS - 1), created_at: null, expires_at: null }, NOW)).toBe(true)
  })

  it('drops jobs older than the window', () => {
    expect(isFreshJobForSitemap({ slug: 'a', posted_at: daysAgo(SITEMAP_JOB_MAX_AGE_DAYS + 1), created_at: null, expires_at: null }, NOW)).toBe(false)
  })

  it('drops expired jobs even when fresh', () => {
    expect(isFreshJobForSitemap({ slug: 'a', posted_at: daysAgo(1), created_at: null, expires_at: daysAgo(0.5) }, NOW)).toBe(false)
  })

  it('keeps jobs with future expiry', () => {
    expect(isFreshJobForSitemap({ slug: 'a', posted_at: daysAgo(1), created_at: null, expires_at: new Date(NOW + 86_400_000).toISOString() }, NOW)).toBe(true)
  })

  it('drops rows without a slug (never emit empty URLs)', () => {
    expect(isFreshJobForSitemap({ slug: '', posted_at: daysAgo(1), created_at: null, expires_at: null }, NOW)).toBe(false)
    expect(isFreshJobForSitemap({ slug: null, posted_at: daysAgo(1), created_at: null, expires_at: null }, NOW)).toBe(false)
  })

  it('falls back to created_at when posted_at is missing', () => {
    expect(isFreshJobForSitemap({ slug: 'a', posted_at: null, created_at: daysAgo(2), expires_at: null }, NOW)).toBe(true)
    expect(isFreshJobForSitemap({ slug: 'a', posted_at: null, created_at: daysAgo(200), expires_at: null }, NOW)).toBe(false)
  })
})

describe('sitemap chunking', () => {
  it('chunk size stays safely under the 50k URL protocol limit', () => {
    expect(JOBS_PER_SITEMAP_CHUNK).toBeGreaterThan(0)
    expect(JOBS_PER_SITEMAP_CHUNK).toBeLessThanOrEqual(50_000)
  })

  it('always emits at least one job chunk and scales with inventory', () => {
    expect(jobChunkCount(0)).toBe(1)
    expect(jobChunkCount(1)).toBe(1)
    expect(jobChunkCount(JOBS_PER_SITEMAP_CHUNK)).toBe(1)
    expect(jobChunkCount(JOBS_PER_SITEMAP_CHUNK + 1)).toBe(2)
    expect(jobChunkCount(JOBS_PER_SITEMAP_CHUNK * 3 + 5)).toBe(4)
  })
})
