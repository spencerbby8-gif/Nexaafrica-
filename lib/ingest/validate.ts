import type { NormalizedJob } from '@/lib/ingest/normalize'

const ATS_HOSTS = new Set([
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.lever.co',
  'jobs.eu.lever.co',
  'apply.workable.com',
  'jobs.workable.com',
  'jobs.ashbyhq.com',
  'jobs.smartrecruiters.com',
  'careers.smartrecruiters.com',
  'app.dover.com',
])

const GENERIC_LANDING_SEGMENTS = new Set([
  'careers',
  'career',
  'jobs',
  'job',
  'work-with-us',
  'join',
  'join-us',
  'hiring',
  'opportunities',
  'roles',
  'positions',
  'apply',
])

function looksLikeJobId(seg: string): boolean {
  if (/^\d{3,}$/.test(seg)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg)) return true
  if (/\d/.test(seg) && seg.length >= 4) return true
  if ((seg.match(/-/g) ?? []).length >= 2 && seg.length >= 8) return true
  return false
}

/**
 * Validate that an apply URL points to an actual job listing, not a generic
 * homepage or "/careers" index. Returns null if valid, otherwise a reason.
 */
export function validateApplyUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return 'apply_url is not a valid URL'
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return 'apply_url must be http(s)'
  }
  const segments = u.pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return 'apply_url points to a homepage'
  }
  if (segments.length === 1 && GENERIC_LANDING_SEGMENTS.has(segments[0].toLowerCase())) {
    return `apply_url is a generic "${segments[0]}" landing page`
  }
  if (ATS_HOSTS.has(u.hostname)) {
    const hasIdSegment = segments.some(looksLikeJobId)
    if (segments.length < 2 && !hasIdSegment) {
      return 'ATS host but no job-id segment'
    }
    return null
  }
  if (!segments.some(looksLikeJobId)) {
    return 'no job-id-style path segment'
  }
  return null
}

/**
 * Final gate before upsert. We're strict on purpose: bad rows damage trust.
 */
export function validateNormalizedJob(j: NormalizedJob): string | null {
  if (!j.title || j.title.length < 2) return 'title missing or too short'
  if (!j.company || j.company.length < 2) return 'company missing'
  if (!j.description_md || j.description_md.length < 60) return 'description too short'
  if (!j.apply_url) return 'apply_url missing'
  const urlErr = validateApplyUrl(j.apply_url)
  if (urlErr) return urlErr
  if (!j.is_remote) return 'not remote'
  if (!j.source_id) return 'source_id missing'
  return null
}
