import {
  categorizeTitle,
  classifyEligibility,
  detectEmploymentType,
  detectRemote,
  extractSalary,
  htmlToMarkdown,
  isOpenToAfrica,
  parsePostedDate,
  resolveCountry,
  type NormalizedJob,
} from '@/lib/ingest/normalize'

/**
 * Ashby public job board API. No auth.
 *   https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
 */
interface AshbyJob {
  id: string
  title: string
  jobUrl: string
  applyUrl?: string
  descriptionHtml?: string
  description?: string
  location: string
  locationName?: string
  team: string
  department?: string
  employmentType: string
  isRemote: boolean
  publishedAt: string
}

export async function fetchAshby(
  orgSlug: string,
  companyName: string,
  companyLogo: string | null = null,
): Promise<NormalizedJob[]> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    orgSlug,
  )}?includeCompensation=true`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Ashby ${orgSlug} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { jobs?: AshbyJob[] }
  const out: NormalizedJob[] = []

  for (const j of data.jobs ?? []) {
    const description_md = j.descriptionHtml
      ? htmlToMarkdown(j.descriptionHtml)
      : (j.description ?? '')
    const applyUrl = j.applyUrl ?? j.jobUrl
    const location = j.locationName ?? j.location ?? null
    if (!applyUrl || !j.title) continue
    if (!j.isRemote && !detectRemote(location, j.title, description_md)) continue

    const eligibility = classifyEligibility(location, j.title, description_md)

    out.push({
      title: j.title.trim(),
      company: companyName,
      company_logo: companyLogo,
      description_md,
      apply_url: applyUrl,
      category: categorizeTitle(j.title, j.team ?? j.department),
      location,
      country: resolveCountry(location),
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(j.employmentType, j.title, description_md),
      tags: [j.team, j.department].filter(Boolean) as string[],
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      posted_at: parsePostedDate(j.publishedAt),
      source: 'ashby',
      source_id: `ashby:${orgSlug}:${j.id}`,
      expires_at: null,
    })
  }
  return out
}
