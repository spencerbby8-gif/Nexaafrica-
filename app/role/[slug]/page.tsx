import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobDetailLayout } from '@/components/job-detail-layout'
import { getJobBySlug, getRelatedJobs } from '@/lib/queries'
import { isJobSaved } from '@/lib/saved-jobs'
import { createClient } from '@/lib/supabase/server'

// Per-user apply state needs request cookies, so this route renders dynamically.
// Job data is short-lived enough that this is fine for SEO; metadata stays cacheable.
export const dynamic = 'force-dynamic'

type Params = { slug: string }

const employmentSchemaMap: Record<string, string> = {
  full_time: 'FULL_TIME',
  part_time: 'PART_TIME',
  contract: 'CONTRACTOR',
  internship: 'INTERN',
}

// Major African markets we list. Used for applicantLocationRequirements when
// a role is flagged is_open_to_africa, so Google Jobs surfaces it for
// candidates in those countries. Kept tight on purpose — adding every African
// country would dilute the signal.
const AFRICA_COUNTRIES = [
  'Nigeria',
  'Kenya',
  'South Africa',
  'Ghana',
  'Egypt',
  'Morocco',
  'Rwanda',
  'Uganda',
  'Ethiopia',
  'Tanzania',
]

/**
 * Parse a free-form salary range string into a schema.org MonetaryAmount.
 * Conservative: only emits a baseSalary block when we can confidently
 * detect a numeric range and currency. Garbage in -> nothing out, which
 * is what Google prefers over a guessed value.
 */
function parseSalaryToSchema(
  raw: string | null,
): Record<string, unknown> | null {
  if (!raw) return null
  const text = raw.trim()
  if (!text) return null

  let currency: string | null = null
  if (/\$|usd/i.test(text)) currency = 'USD'
  else if (/€|eur/i.test(text)) currency = 'EUR'
  else if (/£|gbp/i.test(text)) currency = 'GBP'
  if (!currency) return null

  // Find numbers, allowing K (thousands) shorthand: "$60k - $90k"
  const matches = Array.from(text.matchAll(/(\d{1,3}(?:[,\s]\d{3})*|\d+)(\s*[kK])?/g))
  if (matches.length === 0) return null
  const nums = matches
    .map((m) => {
      const n = Number(m[1].replace(/[,\s]/g, ''))
      return m[2] ? n * 1000 : n
    })
    .filter((n) => Number.isFinite(n) && n > 0)
  if (nums.length === 0) return null

  // Filter out noise like single low numbers (e.g. "level 3"). Salaries
  // we publish are typically >= 10k for annual or >= 20 for hourly.
  const meaningful = nums.filter((n) => n >= 10)
  if (meaningful.length === 0) return null

  const min = Math.min(...meaningful)
  const max = Math.max(...meaningful)
  const isHourly = /\/\s*hr|hour|hourly/i.test(text)

  return {
    '@type': 'MonetaryAmount',
    currency,
    value: {
      '@type': 'QuantitativeValue',
      minValue: min,
      maxValue: max,
      unitText: isHourly ? 'HOUR' : 'YEAR',
    },
  }
}

function firstParagraph(md: string): string {
  const block = md
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith('#') && !b.startsWith('-'))
  return block ?? ''
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const job = await getJobBySlug(slug)
  if (!job) return {}
  const description = firstParagraph(job.description_md).slice(0, 200)
  const title = `${job.title} at ${job.company}`
  return {
    title,
    description,
    alternates: { canonical: `/role/${job.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      url: `/role/${job.slug}`,
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function RolePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const job = await getJobBySlug(slug)
  if (!job) notFound()

  const related = await getRelatedJobs(job, 4)
  const description = firstParagraph(job.description_md)

  const baseSalary = parseSalaryToSchema(job.salary_range)
  // Africa-friendly roles get a richer applicantLocationRequirements list
  // so Google Jobs can surface them for African geo-aware searches.
  const applicantLocations = job.is_open_to_africa
    ? AFRICA_COUNTRIES.map((name) => ({ '@type': 'Country', name }))
    : [{ '@type': 'Country', name: job.country || 'Worldwide' }]

  // Determine apply gate state.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let applyState: 'anon' | 'authed-incomplete' | 'authed-complete' = 'anon'
  if (user) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .maybeSingle()
    applyState = prof?.status === 'ready' ? 'authed-complete' : 'authed-incomplete'
  }

  const initialSaved = user ? await isJobSaved(job.id) : false

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: description || job.title,
    datePosted: job.created_at,
    ...(job.expires_at
      ? { validThrough: job.expires_at }
      : // Google Jobs needs a validThrough — fall back to 60 days from posting
        // so freshness signals stay healthy without overstating.
        {
          validThrough: new Date(
            new Date(job.created_at).getTime() + 60 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
    employmentType: employmentSchemaMap[job.employment_type] ?? 'FULL_TIME',
    identifier: {
      '@type': 'PropertyValue',
      name: 'Nexa job id',
      value: job.id,
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: job.company,
      ...(job.company_logo ? { logo: job.company_logo } : {}),
    },
    ...(job.is_remote ? { jobLocationType: 'TELECOMMUTE' } : {}),
    applicantLocationRequirements: applicantLocations,
    ...(baseSalary ? { baseSalary } : {}),
    directApply: false,
    url: `https://nexa.africa/role/${job.slug}`,
  }

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <JobDetailLayout
        job={job}
        related={related}
        applyState={applyState}
        isAuthed={Boolean(user)}
        initialSaved={initialSaved}
      />
    </SiteShell>
  )
}
