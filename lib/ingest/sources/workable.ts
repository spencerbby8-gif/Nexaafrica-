import {
  categorizeTitle,
  classifyEligibility,
  detectEmploymentType,
  detectRemote,
  extractSalary,
  htmlToMarkdown,
  isOpenToAfrica,
  resolveCountry,
  type NormalizedJob,
} from '@/lib/ingest/normalize'

/**
 * Workable public widget feed. No auth.
 *   https://apply.workable.com/api/v1/widget/accounts/{subdomain}
 * Each job's full description requires a per-job fetch. We keep it light:
 * fetch list, then inline-resolve description from the listing's "summary"
 * + "description" if present, otherwise fall back to title-only summary.
 */
interface WorkableListJob {
  shortcode: string
  title: string
  url: string
  application_url?: string
  full_title?: string
  description?: string
  location: { country?: string; city?: string; region?: string; workplace?: string }
  department?: string
  employment_type?: string
  remote?: boolean
}

export async function fetchWorkable(
  subdomain: string,
  companyName: string,
  companyLogo: string | null = null,
): Promise<NormalizedJob[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(
    subdomain,
  )}?details=true`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Workable ${subdomain} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { jobs?: WorkableListJob[] }
  const out: NormalizedJob[] = []

  for (const j of data.jobs ?? []) {
    const locationParts = [j.location?.city, j.location?.region, j.location?.country].filter(
      Boolean,
    ) as string[]
    const locationStr = locationParts.join(', ') || (j.location?.workplace ?? null)
    const description_md = htmlToMarkdown(j.description ?? '')
    const applyUrl = j.application_url ?? j.url
    if (!applyUrl || !j.title) continue
    const isRemoteFlag =
      j.remote === true ||
      (j.location?.workplace ?? '').toLowerCase().includes('remote') ||
      detectRemote(locationStr, j.title, description_md)
    if (!isRemoteFlag) continue

    const eligibility = classifyEligibility(locationStr, j.title, description_md)

    out.push({
      title: j.title.trim(),
      company: companyName,
      company_logo: companyLogo,
      description_md,
      apply_url: applyUrl,
      category: categorizeTitle(j.title, j.department),
      location: locationStr,
      country: resolveCountry(locationStr ?? j.location?.country),
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(j.employment_type, j.title, description_md),
      tags: j.department ? [j.department] : [],
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      // Workable's widget feed exposes no posting date; fall back to created_at.
      posted_at: null,
      source: 'workable',
      source_id: `workable:${subdomain}:${j.shortcode}`,
      expires_at: null,
    })
  }
  return out
}
