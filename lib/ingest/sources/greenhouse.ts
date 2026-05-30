import { htmlToMarkdown, type NormalizedJob } from '@/lib/ingest/normalize'
import {
  categorizeTitle,
  classifyEligibility,
  detectEmploymentType,
  detectRemote,
  extractSalary,
  isOpenToAfrica,
  parsePostedDate,
  resolveCountry,
} from '@/lib/ingest/normalize'

/**
 * Greenhouse public job board API. No auth. Stable for years.
 *   https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
 */
interface GreenhouseJob {
  id: number
  title: string
  absolute_url: string
  content: string // HTML
  updated_at: string
  location: { name: string } | null
  departments?: Array<{ name: string }>
  metadata?: Array<{ name: string; value: string | null }> | null
}

export async function fetchGreenhouse(
  boardSlug: string,
  companyName: string,
  companyLogo: string | null = null,
): Promise<NormalizedJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    boardSlug,
  )}/jobs?content=true`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    // ATS feeds are big; we never want stale fetch caching.
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Greenhouse ${boardSlug} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { jobs: GreenhouseJob[] }
  const out: NormalizedJob[] = []

  for (const j of data.jobs ?? []) {
    const locationName = j.location?.name ?? null
    const departmentHint = j.departments?.[0]?.name ?? null
    const description_md = htmlToMarkdown(j.content)

    if (!j.absolute_url || !j.title) continue
    if (!detectRemote(locationName, j.title, description_md)) continue

    const eligibility = classifyEligibility(locationName, j.title, description_md)

    out.push({
      title: j.title.trim(),
      company: companyName,
      company_logo: companyLogo,
      description_md,
      apply_url: j.absolute_url,
      category: categorizeTitle(j.title, departmentHint),
      location: locationName,
      country: resolveCountry(locationName),
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(j.title, description_md),
      tags: departmentHint ? [departmentHint] : [],
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      posted_at: parsePostedDate(j.updated_at),
      source: 'greenhouse',
      source_id: `greenhouse:${boardSlug}:${j.id}`,
      expires_at: null,
    })
  }
  return out
}
