import {
  categorizeTitle,
  classifyEligibility,
  detectEmploymentType,
  extractSalary,
  htmlToMarkdown,
  isOpenToAfrica,
  parsePostedDate,
  resolveCountry,
  type NormalizedJob,
} from '@/lib/ingest/normalize'

interface RemoteOKJob {
  id: string
  slug: string
  epoch: number
  date: string
  company: string
  company_logo: string
  position: string
  tags: string[]
  location: string
  description: string
  salary_min: number
  salary_max: number
  apply_url: string
  url: string
}

export async function fetchRemoteOK(): Promise<NormalizedJob[]> {
  const url = 'https://remoteok.com/api?limit=100'
  const res = await fetch(url, {
    headers: { 
      'Accept': 'application/json',
      'User-Agent': 'Nexa Africa Job Aggregator (contact: hello@nexa.africa)'
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`RemoteOK → ${res.status} ${res.statusText}`)
  
  const data = (await res.json()) as any[]
  // First element is legal notice, skip it
  const jobs = Array.isArray(data) ? data.slice(1) : []
  
  const out: NormalizedJob[] = []
  
  for (const j of jobs as RemoteOKJob[]) {
    if (!j.position || !j.company) continue
    
    // RemoteOK is 100% remote
    const description_md = htmlToMarkdown(j.description)
    if (description_md.length < 60) continue
    
    const applyUrl = j.apply_url || j.url
    if (!applyUrl) continue
    
    const eligibility = classifyEligibility(j.location || 'Worldwide', j.position, description_md)
    const salaryRange = j.salary_min && j.salary_max 
      ? `$${j.salary_min/1000}k - $${j.salary_max/1000}k`
      : extractSalary(description_md)
    
    // Africa friendliness: RemoteOK is global, many worldwide
    const location = j.location || 'Worldwide'
    
    out.push({
      title: j.position.trim(),
      company: j.company.trim(),
      company_logo: j.company_logo || null,
      description_md,
      apply_url: applyUrl,
      category: categorizeTitle(j.position, j.tags?.join(' ')),
      location,
      country: resolveCountry(location),
      salary_range: salaryRange,
      employment_type: detectEmploymentType(j.tags?.join(' ') || '', j.position, description_md),
      tags: (j.tags || []).slice(0, 10),
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      posted_at: parsePostedDate(j.date) || new Date(j.epoch * 1000).toISOString(),
      source: 'remoteok',
      source_id: `remoteok:${j.id}`,
      expires_at: null,
    })
  }
  
  return out
}
