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
 * Lever public postings API. No auth.
 *   https://api.lever.co/v0/postings/{company}?mode=json
 */
interface LeverJob {
  id: string
  text: string
  hostedUrl: string
  applyUrl?: string
  descriptionPlain?: string
  description?: string
  categories: { team?: string; commitment?: string; location?: string; allLocations?: string[] }
  createdAt: number
}

export async function fetchLever(
  companySlug: string,
  companyName: string,
  companyLogo: string | null = null,
): Promise<NormalizedJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(companySlug)}?mode=json`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Lever ${companySlug} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as LeverJob[]
  const out: NormalizedJob[] = []

  for (const j of data ?? []) {
    const description_md =
      j.descriptionPlain && j.descriptionPlain.length > 80
        ? j.descriptionPlain
        : htmlToMarkdown(j.description ?? '')
    const location = j.categories?.location ?? null
    const team = j.categories?.team ?? null
    const commitment = j.categories?.commitment ?? null

    const applyUrl = j.applyUrl ?? j.hostedUrl
    if (!applyUrl || !j.text) continue
    if (!detectRemote(location, j.categories?.allLocations?.join(' '), j.text, description_md)) {
      continue
    }

    out.push({
      title: j.text.trim(),
      company: companyName,
      company_logo: companyLogo,
      description_md,
      apply_url: applyUrl,
      category: categorizeTitle(j.text, team),
      location,
      country: resolveCountry(location),
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(commitment, j.text, description_md),
      tags: team ? [team] : [],
      is_remote: true,
      is_open_to_africa: detectOpenToAfrica(location, description_md),
      source: 'lever',
      source_id: `lever:${companySlug}:${j.id}`,
      expires_at: null,
    })
  }
  return out
}
