import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteShell } from '@/components/site-shell'
import { JobDetailLayout } from '@/components/job-detail-layout'
import { getJobBySlug, getJobBySlugWithAI, getRelatedJobsWithAI, getRelatedJobs, getCompanyIntel, getSourceIntel } from '@/lib/queries'
import { CompanyIntelPanel } from '@/components/company-intel-panel'
import { isJobSaved } from '@/lib/saved-jobs'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { ogImage } from '@/lib/og'
import { siteUrl } from '@/lib/site'
import { cleanDescription, generateExcerpt } from '@/lib/cleanDescription'

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
  // Use shared cleaned excerpt pipeline: remove HTML entities, raw HTML, raw markdown
  const excerpt = generateExcerpt(md, 120, 200)
  if (excerpt) return excerpt
  const cleaned = cleanDescription(md)
  const block = cleaned
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith('#') && !b.startsWith('-'))
  return (block ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const job = await getJobBySlug(slug)
  if (!job) return {}
  // [STABILIZATION] Restricted jobs are not indexed and carry no claims.
  if (job.eligibility === 'restricted') {
    return { title: job.title, robots: { index: false, follow: false } }
  }
  // Description: prepend a calm trust prefix that compounds CTR by giving the
  // SERP snippet a recognisable Nexa shape. Falls back to body text when the
  // description is rich enough to stand on its own (>140 chars of real prose).
  const body = firstParagraph(job.description_md)
  // Only the confident 'explicit' tier earns the definitive SERP claim. 'likely'
  // roles stay neutral so we never over-promise eligibility in search results.
  const trustPrefix = job.eligibility === 'explicit'
    ? 'Open to African applicants. '
    : ''
  const description = (trustPrefix + (body || `${job.title} at ${job.company}.`)).slice(0, 200)
  // SERP-grade title: lead with role, anchor in Remote, append the strongest
  // trust modifier we can. Order: Open to Africa > USD > country. Each modifier
  // is shown at most once and trimmed to keep the title under ~60 chars where
  // possible (Google truncates around there for mobile SERPs).
  const trustModifier = job.eligibility === 'explicit'
    ? 'Open to Africa'
    : /\$|usd/i.test(job.salary_range ?? '')
      ? 'USD'
      : job.country || null
  const titleSuffix = trustModifier ? ` (Remote, ${trustModifier})` : ' (Remote)'
  const title = `${job.title} at ${job.company}${titleSuffix}`
  // Stale jobs hurt Google Jobs trust + waste crawl budget. If the role is
  // past its validThrough (or older than 90 days when none is set), noindex
  // it but keep the page reachable for any inbound link with deep equity.
  // Staleness is judged against the real posting date, not ingestion time.
  const ageMs = Date.now() - new Date(job.posted_at).getTime()
  const stale = job.expires_at
    ? Date.now() > new Date(job.expires_at).getTime()
    : ageMs > 90 * 24 * 60 * 60 * 1000
  const metaParts: string[] = []
  if (job.is_remote) metaParts.push('Remote')
  if (job.country) metaParts.push(job.country)
  if (job.salary_range) metaParts.push(job.salary_range)
  const ogUrl = ogImage({
    kind: 'role',
    title: `${job.title}`,
    subtitle: `at ${job.company}`,
    meta: metaParts.join(' \u00b7 ') || 'Remote',
    badge: job.eligibility === 'explicit' ? 'Open to Africa' : undefined,
  })
  return {
    title,
    description,
    alternates: { canonical: `/role/${job.slug}` },
    // Stale jobs: keep crawlable but excluded from index; Google still
    // follows outbound links to fresher inventory.
    ...(stale ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      type: 'article',
      url: `/role/${job.slug}`,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogUrl],
    },
  }
}

export default async function RolePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const jobWithAI = await getJobBySlugWithAI(slug)
  if (!jobWithAI) notFound()
  const job = jobWithAI
  const aiIntelligence = (jobWithAI as any).aiIntelligence || null
  // [STABILIZATION] Ineligible jobs never render anywhere in the UI —
  // deterministic OR AI-restricted verdict both 404 the page.
  if (job.eligibility === 'restricted' || (aiIntelligence as any)?.africa_eligibility === 'restricted') {
    notFound()
  }

  const related = await getRelatedJobsWithAI(job, 4)

  // Company hiring activity count
  let companyJobCount: number | null = null
  try {
    const svc = createServiceClient()
    const { count } = await svc.from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('company', job.company)
      .eq('is_active', true)
    companyJobCount = count ?? 0
  } catch {}
  const description = firstParagraph(job.description_md)

  const baseSalary = parseSalaryToSchema(job.salary_range)
  // applicantLocationRequirements must reflect real confidence, not optimism.
  // Only 'explicit' (Africa named) publishes the broad African-country list to
  // Google Jobs. 'likely' is global-remote with no restriction, so we claim
  // only the conservative job country/Worldwide rather than asserting Africa
  // eligibility we can't confirm. 'restricted'/'unknown' never claim Africa.
  // [STABILIZATION] Google Jobs eligibility claims cross-checked against the
  // AI verdict: 'restricted'/'unknown' AI never asserts Africa; the broad
  // African-country list requires deterministic explicit OR AI explicit/likely.
  const aiElig = (aiIntelligence as any)?.africa_eligibility
  const eligibleForAfrica = job.eligibility === 'explicit' || aiElig === 'explicit' || aiElig === 'likely'
  const applicantLocations =
    eligibleForAfrica && job.eligibility === 'explicit'
      ? AFRICA_COUNTRIES.map((name) => ({ '@type': 'Country', name }))
      : [{ '@type': 'Country', name: job.country || 'Worldwide' }]

  // [V2.1] Learning-layer data for the Company Intelligence panel.
  const [companyIntel, sourceIntel] = await Promise.all([
    getCompanyIntel(job.company),
    getSourceIntel(job.source),
  ])

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
    // Real provider posting date (posted_at), never the ingestion timestamp.
    datePosted: job.posted_at,
    ...(job.expires_at
      ? { validThrough: job.expires_at }
      : // Google Jobs needs a validThrough — fall back to 60 days from the real
        // posting date so freshness signals stay healthy without overstating.
        {
          validThrough: new Date(
            new Date(job.posted_at).getTime() + 60 * 24 * 60 * 60 * 1000,
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
    // Canonical must match the page canonical exactly (resolved via the
    // shared siteUrl resolver) so Google Jobs attributes the posting to the
    // right URL across preview/prod/custom domains.
    url: siteUrl(`/role/${job.slug}`),
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
        aiIntelligence={aiIntelligence}
        companyJobCount={companyJobCount}
      />

      <div className="mx-auto mt-6 max-w-6xl px-4 sm:px-6">
        <CompanyIntelPanel companyIntel={companyIntel} sourceIntel={sourceIntel} company={job.company} />
      </div>
    </SiteShell>
  )
}
