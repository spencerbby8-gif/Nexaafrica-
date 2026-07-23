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

interface WWRJob {
  title: string
  company: string
  location: string
  description: string
  link: string
  pubDate: string
  category: string
}

export async function fetchWeWorkRemotely(category: string = 'remote-jobs'): Promise<NormalizedJob[]> {
  // WWR has RSS feeds per category: https://weworkremotely.com/categories/{category}/feed or /remote-jobs.rss
  const url = category === 'remote-jobs' 
    ? 'https://weworkremotely.com/remote-jobs.rss'
    : `https://weworkremotely.com/categories/remote-${category}-jobs.rss`
  
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Nexa Africa Job Aggregator', 'Accept': 'application/rss+xml, application/xml' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`WWR ${category} → ${res.status} ${res.statusText}`)
  
  const xml = await res.text()
  const out: NormalizedJob[] = []
  
  // Simple RSS parsing without heavy library - extract items
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null
  
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1]
    
    const titleMatch = /<title><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(itemXml) || /<title>(.*?)<\/title>/i.exec(itemXml)
    const linkMatch = /<link>(.*?)<\/link>/i.exec(itemXml)
    const descMatch = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i.exec(itemXml) || /<description>([\s\S]*?)<\/description>/i.exec(itemXml)
    const pubDateMatch = /<pubDate>(.*?)<\/pubDate>/i.exec(itemXml)
    
    if (!titleMatch || !linkMatch) continue
    
    let title = titleMatch[1].trim()
    // WWR titles often include "Company: Title" format - split
    let company = 'Unknown'
    if (title.includes(':')) {
      const parts = title.split(':')
      if (parts.length >= 2) {
        company = parts[0].trim()
        title = parts.slice(1).join(':').trim()
      }
    }
    
    const link = linkMatch[1].trim()
    const descriptionRaw = descMatch ? descMatch[1] : ''
    const description_md = htmlToMarkdown(descriptionRaw)
    if (description_md.length < 60) continue
    
    const pubDate = pubDateMatch ? pubDateMatch[1] : null
    const eligibility = classifyEligibility('Worldwide', title, description_md)
    
    // Extract category from URL or use passed category
    const cat = category.replace('remote-', '').replace('-jobs','') || 'other'
    
    out.push({
      title,
      company,
      company_logo: null,
      description_md,
      apply_url: link,
      category: categorizeTitle(title, cat),
      location: 'Worldwide',
      country: 'Worldwide',
      salary_range: extractSalary(description_md),
      employment_type: detectEmploymentType(title, description_md),
      tags: [cat],
      is_remote: true,
      is_open_to_africa: isOpenToAfrica(eligibility),
      eligibility,
      posted_at: parsePostedDate(pubDate),
      source: 'weworkremotely',
      source_id: `weworkremotely:${Buffer.from(link).toString('base64').slice(0,32)}`,
      expires_at: null,
    })
  }
  
  return out
}

export async function fetchWeWorkRemotelyAll(): Promise<NormalizedJob[]> {
  // Fetch multiple categories for broader coverage
  const categories = ['programming', 'design', 'devops', 'product', 'customer-support', 'sales-and-marketing']
  const allJobs: NormalizedJob[] = []
  
  for (const cat of categories) {
    try {
      const jobs = await fetchWeWorkRemotely(cat)
      allJobs.push(...jobs)
      await new Promise(r => setTimeout(r, 800)) // Rate limit: be nice
    } catch (e) {
      console.log(`[WWR] ${cat} failed:`, e instanceof Error ? e.message : String(e))
    }
  }
  
  // Deduplicate by apply_url within this batch
  const seen = new Set<string>()
  return allJobs.filter(j => {
    if (seen.has(j.apply_url)) return false
    seen.add(j.apply_url)
    return true
  })
}
