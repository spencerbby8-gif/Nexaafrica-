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
 * Comeet public positions feed. No auth.
 *   https://www.comeet.co/careers-api/2.0/company/{uid}/positions
 * The Comeet UID is found on the company's careers page, not the slug.
 */
interface ComeetJob {
  uid: string
  name: string
  url_active?: string
  details?: { description?: string; requirements?: string }
  description?: string
  requirements?: string
  location: { city?: string; country?: string; name?: string }
  department?: string
  category?: string
  job_type_code?: string
  time_updated?: string
}

export async function fetchComeet(
  companyUid: string,
  companyName: string,
  companyLogo: string | null = null,
): Promise<NormalizedJob[]> {
  const url = `https://www.comeet.co/careers-api/2.0/company/${encodeURIComponent(
    companyUid,
  )}/positions`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Comeet ${companyUid} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as ComeetJob[]
  const out: NormalizedJob[] = []

  for (const j of data ?? []) {
    const description_md = htmlToMarkdown(
      `${j.details?.description ?? j.description ?? ''}\n\n${j.details?.requirements ?? j.requirements ?? ''}`,
    )
    const locationStr =
      j.location?.name ??
      [j.location?.city, j.location?.country].filter(Boolean).join(', ') ??
      null
    const applyUrl = j.url_active
    if (!applyUrl || !j.name) continue
    if (!detectRemote(locationStr, j.name, description_md)) continue

    const eligibility = classifyEligibility(locationStr, j.name, description_md)

    out.push({
      title: j.name.trim(),
      company: companyName,
      company_logo: companyLogo,
      description_md,
      apply_url: applyUrl,
      category: categorizeTitle(j.name, j.department ?? j.category),
      location: locationStr,
      country: resolveCountry(locationStr),
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(j.job_type_code, j.name, description_md),
      tags: [j.department, j.category].filter(Boolean) as string[],
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      posted_at: parsePostedDate(j.time_updated),
      source: 'comeet',
      source_id: `comeet:${companyUid}:${j.uid}`,
      expires_at: null,
    })
  }
  return out
}
