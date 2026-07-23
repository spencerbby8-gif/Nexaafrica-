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

interface RemotiveJob {
  id: number
  url: string
  title: string
  company_name: string
  company_logo: string
  category: string
  tags: string[]
  job_type: string
  publication_date: string
  candidate_required_location: string
  salary: string
  description: string
}

export async function fetchRemotive(): Promise<NormalizedJob[]> {
  const url = 'https://remotive.com/api/remote-jobs'
  const res = await fetch(url, {
    headers: { 
      'Accept': 'application/json',
      'User-Agent': 'Nexa Africa Job Aggregator'
    },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Remotive → ${res.status} ${res.statusText}`)
  
  const data = (await res.json()) as { jobs: RemotiveJob[], 'job-count': number }
  const jobs = data.jobs || []
  
  const out: NormalizedJob[] = []
  
  for (const j of jobs) {
    if (!j.title || !j.company_name) continue
    
    const description_md = htmlToMarkdown(j.description)
    if (description_md.length < 60) continue
    
    // Skip US-only if candidate_required_location is USA only and not worldwide
    const location = j.candidate_required_location || 'Worldwide'
    
    const eligibility = classifyEligibility(location, j.title, description_md)
    
    out.push({
      title: j.title.trim(),
      company: j.company_name.trim(),
      company_logo: j.company_logo || null,
      description_md,
      apply_url: j.url,
      category: categorizeTitle(j.title, j.category + ' ' + (j.tags?.join(' ') || '')),
      location,
      country: resolveCountry(location),
      salary_range: j.salary || extractSalary(description_md),
      employment_type: detectEmploymentType(j.job_type, j.title, description_md),
      tags: (j.tags || []).slice(0, 10),
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      posted_at: parsePostedDate(j.publication_date),
      source: 'remotive',
      source_id: `remotive:${j.id}`,
      expires_at: null,
    })
  }
  
  return out
}
