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

  // Allow Greenhouse and other ATS that encode job ID in query param (e.g. ?gh_jid=7954688)
  // This is critical: many companies (Stripe, Airbnb) use company domain /jobs/search?gh_jid=...
  const jobIdQueryParams = ['gh_jid', 'ghjid', 'id', 'job_id', 'posting', 'p', 'jobId', 'job']
  for (const key of jobIdQueryParams) {
    const val = u.searchParams.get(key)
    if (val && /^\d{3,}$/.test(val.trim())) {
      return null
    }
  }
  // Also accept if query string contains gh_jid pattern anywhere (defensive)
  if (/(?:^|&|\?)gh_jid=\d{3,}/i.test(u.search) || /gh_jid=\d{3,}/i.test(raw)) {
    return null
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

const VALID_ELIGIBILITY = new Set(['explicit', 'likely', 'restricted', 'unknown'])

// Placeholder company names seen in the wild (e.g. Himalayas feed emits
// companyName "name" for 48 live rows). A job with a placeholder employer is
// a trust hazard: reject at the final gate, before any upsert.
const PLACEHOLDER_COMPANIES = new Set([
  'name', 'company', 'companyname', 'company_name', 'title', 'unknown',
  'n/a', 'na', 'none', 'test', 'example', 'employer', 'organization', 'organisation',
])

/**
 * Final gate before upsert. We're strict on purpose: bad rows damage trust.
 */
export function validateNormalizedJob(j: NormalizedJob): string | null {
  if (!j.title || j.title.length < 2) return 'title missing or too short'
  if (!j.company || j.company.length < 2) return 'company missing'
  if (PLACEHOLDER_COMPANIES.has(j.company.trim().toLowerCase())) {
    return `placeholder company name "${j.company}"`
  }
  if (!j.description_md || j.description_md.length < 60) return 'description too short'
  if (!j.apply_url) return 'apply_url missing'
  const urlErr = validateApplyUrl(j.apply_url)
  if (urlErr) return urlErr
  if (!j.is_remote) return 'not remote'
  if (!j.source_id) return 'source_id missing'

  // --- Trust safeguards (Phase 14) ---
  if (!VALID_ELIGIBILITY.has(j.eligibility)) return `invalid eligibility "${j.eligibility}"`
  // is_open_to_africa must agree with the tier — guards against a regression
  // where the derived flag drifts away from the classifier.
  const derivedOpen = j.eligibility === 'explicit' || j.eligibility === 'likely'
  if (j.is_open_to_africa !== derivedOpen) {
    return `is_open_to_africa (${j.is_open_to_africa}) disagrees with eligibility "${j.eligibility}"`
  }
  // posted_at, when present, must be a valid non-future date. parsePostedDate
  // should already guarantee this; this is the belt-and-braces gate.
  if (j.posted_at != null) {
    const t = new Date(j.posted_at).getTime()
    if (Number.isNaN(t)) return 'posted_at is not a valid date'
    if (t > Date.now() + 24 * 60 * 60 * 1000) return 'posted_at is in the future'
  }
  return null
}

/**
 * Non-fatal data-quality audit. Returns a list of human-readable warnings for
 * classifications that pass validation but look suspicious and deserve eyes.
 * The ingest layer logs these (it does NOT reject the row) so we can monitor
 * classifier drift over time without silently dropping jobs.
 */
const SUSPICIOUS_RESTRICTION = [
  /\bauthoriz(?:ed|ation)\s+to\s+work\s+in\s+the\s+(us|uk|eu)\b/i,
  /\b(us|uk|eu|canada|united\s+states)\s+(?:based\s+)?only\b/i,
  /\bvisa\s+sponsorship\s+(?:not\s+available|unavailable)\b/i,
  /\bmust\s+(?:reside|be\s+based|be\s+located)\b/i,
]

export function auditClassification(j: NormalizedJob): string[] {
  const warnings: string[] = []
  const text = `${j.location ?? ''} ${j.description_md}`.toLowerCase()

  // A positive Africa signal that co-occurs with hard restriction language is
  // the classic false-positive pattern the audit flagged.
  if (j.is_open_to_africa && SUSPICIOUS_RESTRICTION.some((re) => re.test(text))) {
    warnings.push(
      `open-to-africa=${j.eligibility} but restriction language detected for "${j.title}" @ ${j.company}`,
    )
  }
  return warnings
}
