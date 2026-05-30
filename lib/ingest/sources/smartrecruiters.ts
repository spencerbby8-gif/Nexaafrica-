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
 * SmartRecruiters public posting API. No auth.
 *   https://api.smartrecruiters.com/v1/companies/{company}/postings
 */
interface SmartRecruitersJob {
  id: string
  name: string
  jobAd?: { sections?: { jobDescription?: { text?: string }; qualifications?: { text?: string } } }
  ref?: string
  applyUrl?: string
  releasedDate?: string
  location?: { city?: string; region?: string; country?: string; remote?: boolean }
  department?: { label?: string }
  function?: { label?: string }
  industry?: { label?: string }
  typeOfEmployment?: { label?: string }
}

export async function fetchSmartRecruiters(
  companySlug: string,
  companyName: string,
  companyLogo: string | null = null,
): Promise<NormalizedJob[]> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
    companySlug,
  )}/postings?limit=100`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`SmartRecruiters ${companySlug} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { content?: SmartRecruitersJob[] }
  const out: NormalizedJob[] = []

  for (const j of data.content ?? []) {
    const desc = [j.jobAd?.sections?.jobDescription?.text, j.jobAd?.sections?.qualifications?.text]
      .filter(Boolean)
      .join('\n\n')
    const description_md = htmlToMarkdown(desc)
    const locParts = [j.location?.city, j.location?.region, j.location?.country].filter(
      Boolean,
    ) as string[]
    const locationStr = locParts.join(', ') || null
    // SmartRecruiters has no canonical absolute apply URL field; build from ref.
    const applyUrl =
      j.applyUrl ??
      `https://jobs.smartrecruiters.com/${encodeURIComponent(companySlug)}/${j.id}`
    if (!applyUrl || !j.name) continue
    const isRemoteFlag =
      j.location?.remote === true || detectRemote(locationStr, j.name, description_md)
    if (!isRemoteFlag) continue

    const eligibility = classifyEligibility(locationStr, j.name, description_md)

    out.push({
      title: j.name.trim(),
      company: companyName,
      company_logo: companyLogo,
      description_md,
      apply_url: applyUrl,
      category: categorizeTitle(j.name, j.department?.label ?? j.function?.label),
      location: locationStr,
      country: resolveCountry(locationStr ?? j.location?.country),
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(j.typeOfEmployment?.label, j.name, description_md),
      tags: [j.department?.label, j.function?.label].filter(Boolean) as string[],
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      posted_at: parsePostedDate(j.releasedDate),
      source: 'smartrecruiters',
      source_id: `smartrecruiters:${companySlug}:${j.id}`,
      expires_at: null,
    })
  }
  return out
}
