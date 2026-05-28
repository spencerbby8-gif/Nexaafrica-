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
 * Personio public XML feed → we use the JSON-friendly variant exposed
 * via /xml.json on the careers page when available; otherwise the raw XML.
 * Most Personio customers expose:
 *   https://{company}.jobs.personio.de/xml
 * which is RSS/Atom-flavoured XML. We only consume the JSON endpoint here
 * to keep the parser dependency-free; companies without a JSON feed will
 * simply error and be reported in the run summary (operationally visible).
 */
interface PersonioJobJson {
  id: string | number
  name: string
  url?: string
  jobDescriptions?: { jobDescription?: Array<{ value?: string }> }
  office?: string
  department?: string
  employmentType?: string
  schedule?: string
}

export async function fetchPersonio(
  companySlug: string,
  companyName: string,
  companyLogo: string | null = null,
): Promise<NormalizedJob[]> {
  const url = `https://${encodeURIComponent(companySlug)}.jobs.personio.de/json`
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Personio ${companySlug} → ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { positions?: PersonioJobJson[] }
  const out: NormalizedJob[] = []

  for (const j of data.positions ?? []) {
    const description_md = htmlToMarkdown(
      (j.jobDescriptions?.jobDescription ?? []).map((s) => s.value).filter(Boolean).join('\n\n'),
    )
    const applyUrl = j.url
    if (!applyUrl || !j.name) continue
    if (!detectRemote(j.office, j.name, description_md)) continue

    out.push({
      title: j.name.trim(),
      company: companyName,
      company_logo: companyLogo,
      description_md,
      apply_url: applyUrl,
      category: categorizeTitle(j.name, j.department),
      location: j.office ?? null,
      country: resolveCountry(j.office ?? null),
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(j.employmentType, j.schedule, j.name, description_md),
      tags: j.department ? [j.department] : [],
      is_remote: true,
      is_open_to_africa: detectOpenToAfrica(j.office, description_md),
      source: 'personio',
      source_id: `personio:${companySlug}:${j.id}`,
      expires_at: null,
    })
  }
  return out
}
