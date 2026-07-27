import {
  categorizeTitle,
  classifyEligibility,
  detectEmploymentType,
  extractSalary,
  htmlToMarkdown,
  isOpenToAfrica,
  parsePostedDate,
  resolveCountry,
  validateJobData,
  type NormalizedJob,
} from '@/lib/ingest/normalize'

interface HimalayasJob {
  guid: string
  title: string
  companyName: string
  companyLogo: string
  excerpt: string
  description: string
  applicationLink: string
  categories: string[]
  parentCategories: string[]
  locationRestrictions: string[]
  minSalary: number | null
  maxSalary: number | null
  currency: string | null
  employmentType: string
  seniority: string
  pubDate: string
  expiryDate: string | null
}

export async function fetchHimalayas(limit = 100): Promise<NormalizedJob[]> {
  // Himalayas API: browse endpoint with offset/limit, max 20 per request, cached 24h, rate limited
  const allJobs: HimalayasJob[] = []
  let offset = 0
  const pageSize = 20
  const maxPages = Math.ceil(limit / pageSize)
  
  for (let page = 0; page < maxPages; page++) {
    const url = `https://himalayas.app/jobs/api?limit=${pageSize}&offset=${offset}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Nexa Africa' },
      cache: 'no-store',
    })
    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited, wait and retry
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      throw new Error(`Himalayas offset ${offset} → ${res.status}`)
    }
    const data = (await res.json()) as { jobs: HimalayasJob[], totalCount: number }
    const jobs = data.jobs || []
    if (jobs.length === 0) break
    allJobs.push(...jobs)
    offset += pageSize
    if (allJobs.length >= limit) break
    // Respect rate limit: data cached 24h, no need to hammer
    await new Promise(r => setTimeout(r, 500))
  }
  
  const out: NormalizedJob[] = []
  
  for (const j of allJobs.slice(0, limit)) {
    if (!j.title || !j.companyName) continue
    
    // Validate company and title to reject placeholder/bad data
    if (!validateJobData(j.companyName, j.title)) {
      console.log(`[himalayas] Skipping job with invalid data: company="${j.companyName}", title="${j.title}"`)
      continue
    }
    
    const description_md = htmlToMarkdown(j.description || j.excerpt)
    if (description_md.length < 60) continue
    
    const location = j.locationRestrictions?.length ? j.locationRestrictions.join(', ') : 'Worldwide'
    const eligibility = classifyEligibility(location, j.title, description_md)
    
    const salaryRange = j.minSalary && j.maxSalary 
      ? `${j.currency || '$'}${j.minSalary/1000}k - ${j.currency || '$'}${j.maxSalary/1000}k`
      : extractSalary(description_md)
    
    out.push({
      title: j.title.trim(),
      company: j.companyName.trim(),
      company_logo: j.companyLogo || null,
      description_md,
      apply_url: j.applicationLink,
      category: categorizeTitle(j.title, [...(j.categories||[]), ...(j.parentCategories||[])].join(' ')),
      location,
      country: resolveCountry(location),
      salary_range: salaryRange,
      employment_type: detectEmploymentType(j.employmentType, j.title, description_md),
      tags: [...(j.categories||[]), ...(j.parentCategories||[])].slice(0,10),
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      posted_at: parsePostedDate(j.pubDate),
      source: 'himalayas',
      source_id: `himalayas:${j.guid}`,
      expires_at: j.expiryDate ? parsePostedDate(j.expiryDate) : null,
    })
  }
  
  return out
}
