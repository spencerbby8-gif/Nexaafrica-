import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildJobSlug } from '@/lib/slug'
import type { EmploymentType } from '@/lib/types'
import { extractIntelligence, formatSalary } from '@/lib/intelligence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface IncomingJob {
  title: string
  company: string
  company_logo?: string | null
  description_md: string
  apply_url: string
  category: string
  location?: string | null
  country: string
  salary_range?: string | null
  employment_type?: EmploymentType
  tags?: string[]
  is_remote?: boolean
  is_open_to_africa?: boolean
  source?: string
  source_id?: string
  expires_at?: string | null
}

const REQUIRED: (keyof IncomingJob)[] = [
  'title',
  'company',
  'description_md',
  'apply_url',
  'category',
  'country',
]

function validate(job: IncomingJob): string | null {
  for (const key of REQUIRED) {
    if (!job[key] || typeof job[key] !== 'string') return `Missing or invalid field: ${key}`
  }
  if (
    job.employment_type &&
    ![
      'full_time',
      'part_time',
      'contract',
      'freelance',
      'consultant',
      'temporary',
      'internship',
      'unknown',
    ].includes(job.employment_type)
  ) {
    return `Invalid employment_type: ${job.employment_type}`
  }
  return null
}

/**
 * Validate that an apply URL points to an actual job listing, not a generic
 * homepage or "/careers" index. We accept:
 *   - Known ATS hosts (greenhouse, lever, workable, ashby, etc.) when they
 *     include a job-id-style path segment.
 *   - Any URL whose path includes a numeric or slug-style id (>= 2 path
 *     segments and at least one segment that looks like an id).
 * We reject:
 *   - Bare hosts ("acme.com", "acme.com/")
 *   - Single-segment paths like "/careers", "/jobs", "/work-with-us"
 */
const ATS_HOSTS = new Set([
  'boards.greenhouse.io',
  'jobs.lever.co',
  'apply.workable.com',
  'jobs.ashbyhq.com',
  'job-boards.greenhouse.io',
  'jobs.smartrecruiters.com',
  'careers.smartrecruiters.com',
  'apply.workable.com',
  'jobs.workable.com',
  'jobs.eu.lever.co',
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
  // Numeric id, UUID, or slug containing digits or >= 3 hyphens
  if (/^\d{3,}$/.test(seg)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(seg)) return true
  if (/\d/.test(seg) && seg.length >= 4) return true
  if ((seg.match(/-/g) ?? []).length >= 2 && seg.length >= 8) return true
  return false
}

function validateApplyUrl(raw: string): string | null {
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
    return 'apply_url points to a homepage, not a specific role'
  }
  // Generic single-segment landing page like /careers
  if (segments.length === 1 && GENERIC_LANDING_SEGMENTS.has(segments[0].toLowerCase())) {
    return `apply_url points to a generic "${segments[0]}" landing page, not a specific role`
  }
  // Trusted ATS hosts: require >= 2 segments OR an id-shaped segment
  if (ATS_HOSTS.has(u.hostname)) {
    const hasIdSegment = segments.some(looksLikeJobId)
    if (segments.length < 2 && !hasIdSegment) {
      return 'apply_url is on a known ATS host but lacks a job-id segment'
    }
    return null
  }
  // Other hosts: require an id-shaped segment somewhere in the path
  if (!segments.some(looksLikeJobId)) {
    return 'apply_url does not include a job-id-style path segment'
  }
  return null
}

export async function POST(req: Request) {
  const token = process.env.INGEST_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'INGEST_TOKEN not configured' }, { status: 500 })
  }

  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: { jobs?: IncomingJob[] } | IncomingJob
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const incoming: IncomingJob[] = Array.isArray((payload as { jobs?: IncomingJob[] }).jobs)
    ? (payload as { jobs: IncomingJob[] }).jobs
    : [payload as IncomingJob]

  const supabase = createServiceClient()
  const results = { inserted: 0, skipped: 0, errors: [] as string[] }

  for (const job of incoming) {
    const err = validate(job)
    if (err) {
      results.errors.push(err)
      continue
    }

    const urlErr = validateApplyUrl(job.apply_url)
    if (urlErr) {
      results.errors.push(`${job.title} @ ${job.company}: ${urlErr}`)
      continue
    }

    const slug = buildJobSlug(job.title, job.company, job.country)

    // Phase 16: run the deterministic Intelligence Engine on the payload.
    const intelligence = extractIntelligence(
      {
        title: job.title,
        description: job.description_md,
        location: job.location,
        tags: job.tags,
      },
      job.employment_type ?? null,
    )
    const sal = intelligence.salary

    const row = {
      slug,
      title: job.title,
      company: job.company,
      company_logo: job.company_logo ?? null,
      description_md: job.description_md,
      apply_url: job.apply_url,
      category: job.category,
      location: job.location ?? null,
      country: job.country,
      salary_range: job.salary_range ?? formatSalary(sal),
      salary_min: sal?.min ?? null,
      salary_max: sal?.max ?? null,
      salary_currency: sal?.currency ?? null,
      salary_period: sal?.period ?? null,
      // No silent full_time default — trust the engine's explicit verdict.
      employment_type: job.employment_type ?? intelligence.employment_type,
      intelligence,
      tags: job.tags ?? [],
      is_remote: job.is_remote ?? true,
      is_open_to_africa: job.is_open_to_africa ?? true,
      source: job.source ?? null,
      source_id: job.source_id ?? null,
      expires_at: job.expires_at ?? null,
    }

    // Dedup by slug; also unique (source, source_id) at DB level.
    const { error, data } = await supabase
      .from('jobs')
      .upsert(row, { onConflict: 'slug', ignoreDuplicates: true })
      .select('id')

    if (error) {
      results.errors.push(`${slug}: ${error.message}`)
      continue
    }
    if (data && data.length > 0) results.inserted += 1
    else results.skipped += 1
  }

  return NextResponse.json(results, { status: 200 })
}
