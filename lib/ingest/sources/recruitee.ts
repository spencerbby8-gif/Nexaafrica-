import {
  categorizeTitle,
  detectEmploymentType,
  detectOpenToAfrica,
  detectRemote,
  extractSalary,
  htmlToMarkdown,
  resolveCountry,
  type NormalizedJob,
} from '@/lib/ingest/normalize'

/**
 * Recruitee public careers feed.
 *   https://{company}.recruitee.com/api/offers/
 */
interface RecruiteeJob {
  id: number
  title: string
  careers_url?: string
  careers_apply_url?: string
  description?: string
  requirements?: string
  location?: string
  country?: string
  city?: string
  department?: string
  employment_type_code?: string
  remote?: boolean
}

export async function fetchRecruitee(
  companySlug: string,
  companyName: string,
  companyLogo: string | null = null,
): Promise<NormalizedJob[]> {
  const url = `https://${encodeURIComponent(companySlug)}.recruitee.com/api/offers/`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Recruitee ${companySlug} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { offers?: RecruiteeJob[] }
  const out: NormalizedJob[] = []

  for (const j of data.offers ?? []) {
    const description_md = htmlToMarkdown(`${j.description ?? ''}\n\n${j.requirements ?? ''}`)
    const locParts = [j.city, j.country].filter(Boolean) as string[]
    const locationStr = j.location ?? (locParts.length > 0 ? locParts.join(', ') : null)
    const applyUrl = j.careers_apply_url ?? j.careers_url
    if (!applyUrl || !j.title) continue
    const isRemoteFlag = j.remote === true || detectRemote(locationStr, j.title, description_md)
    if (!isRemoteFlag) continue

    out.push({
      title: j.title.trim(),
      company: companyName,
      company_logo: companyLogo,
      description_md,
      apply_url: applyUrl,
      category: categorizeTitle(j.title, j.department),
      location: locationStr,
      country: resolveCountry(locationStr ?? j.country),
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(j.employment_type_code, j.title, description_md),
      tags: j.department ? [j.department] : [],
      is_remote: true,
      is_open_to_africa: detectOpenToAfrica(locationStr, description_md),
      source: 'recruitee',
      source_id: `recruitee:${companySlug}:${j.id}`,
      expires_at: null,
    })
  }
  return out
}
