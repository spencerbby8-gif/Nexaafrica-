import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildJobSlug } from '@/lib/slug'
import type { EmploymentType } from '@/lib/types'

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
    !['full_time', 'part_time', 'contract', 'internship'].includes(job.employment_type)
  ) {
    return `Invalid employment_type: ${job.employment_type}`
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

    const slug = buildJobSlug(job.title, job.company, job.country)

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
      salary_range: job.salary_range ?? null,
      employment_type: job.employment_type ?? 'full_time',
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
