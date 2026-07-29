import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { extractIntelligence as deterministicExtract } from "@/lib/intelligence"
import { aiGateway, type ProviderCallDiag } from "../gateway"

interface AIResp {
  africa_eligibility: "explicit"|"likely"|"restricted"|"unknown"; africa_confidence: number; africa_evidence: string|null
  country_restrictions: string[]; visa_sponsorship: "available"|"not_available"|"unknown"|"conditional"; visa_confidence: number
  remote_eligibility: "fully_remote"|"hybrid"|"onsite"|"unknown"; remote_confidence: number; remote_evidence: string|null; timezone_requirements: string|null
  salary_min: number|null; salary_max: number|null; salary_currency: string|null; salary_period: string|null; salary_is_estimated: boolean
  salary_transparency: "disclosed"|"estimated"|"undisclosed"|"unknown"; salary_confidence: number; salary_evidence: string|null
  company_legitimacy: "verified"|"likely_legit"|"unknown"|"suspicious"; company_confidence: number; company_evidence: string|null
  job_quality: "high"|"medium"|"low"|"unknown"; job_quality_confidence: number; job_quality_evidence: string|null
  experience_level: "entry"|"mid"|"senior"|"executive"|"unknown"; experience_confidence: number
  required_skills: string[]; transferable_skills: string[]; missing_skills: string[]
  hiring_urgency: "high"|"medium"|"low"|"unknown"; hiring_urgency_confidence: number
}

const AF: AIResp = { africa_eligibility:"unknown",africa_confidence:0,africa_evidence:null,country_restrictions:[],visa_sponsorship:"unknown",visa_confidence:0,remote_eligibility:"unknown",remote_confidence:0,remote_evidence:null,timezone_requirements:null,salary_min:null,salary_max:null,salary_currency:null,salary_period:null,salary_is_estimated:false,salary_transparency:"unknown",salary_confidence:0,salary_evidence:null,company_legitimacy:"unknown",company_confidence:0,company_evidence:null,job_quality:"unknown",job_quality_confidence:0,job_quality_evidence:null,experience_level:"unknown",experience_confidence:0,required_skills:[],transferable_skills:[],missing_skills:[],hiring_urgency:"unknown",hiring_urgency_confidence:0 }

/**
 * Fetch the job page from its apply URL.
 * For ATS pages (Greenhouse, Ashby, etc.), returns stored description_md.
 */
async function fetchJobPage(url: string, job: Job): Promise<string> {
  const atsHosts = ['boards.greenhouse.io','jobs.ashbyhq.com','jobs.lever.co','apply.workable.com','jobs.smartrecruiters.com','recruitee.com','comeet.com','personio.com']
  const urlHost = (() => { try { return new URL(url).hostname } catch { return '' } })()
  const isAtsPage = atsHosts.some(h => urlHost.includes(h))
  
  if (isAtsPage) {
    const desc = job.description_md || ''
    return desc.length >= 100 ? desc : ''
  }

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), 8000 + attempt * 4000)
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NexaBot/2.0; +https://nexaafrica.vercel.app)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        signal: c.signal,
        redirect: "follow",
      })
      clearTimeout(t)
      if (res.ok) {
        const html = await res.text()
        const { cleanDescription } = await import("@/lib/cleanDescription")
        const text = cleanDescription(html)
        if (text.length >= 100) return text
        if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue }
        return text
      }
      if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue }
    } catch { if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue } }
  }
  return ""
}

/**
 * [FIX #4] Fetch company website for legitimacy verification.
 * Extracts domain from apply_url and fetches the company homepage.
 */
async function fetchCompanyPage(job: Job): Promise<string> {
  try {
    // Try to get company website from the job description or apply URL domain
    const applyUrl = new URL(job.apply_url)
    const domain = applyUrl.hostname
    
    // Skip ATS domains - they're not the company website
    const atsDomains = ['greenhouse.io','ashbyhq.com','lever.co','workable.com','smartrecruiters.com','recruitee.com','comeet.com','personio.com','linkedin.com','indeed.com','glassdoor.com']
    if (atsDomains.some(d => domain.includes(d))) return ""
    
    // Fetch company homepage
    const companyUrl = `https://${domain}`
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 6000)
    const res = await fetch(companyUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NexaBot/2.0; +https://nexaafrica.vercel.app)",
        "Accept": "text/html",
      },
      signal: c.signal,
      redirect: "follow",
    })
    clearTimeout(t)
    if (res.ok) {
      const html = await res.text()
      const { cleanDescription } = await import("@/lib/cleanDescription")
      const text = cleanDescription(html)
      // Only return if we got meaningful content
      if (text.length >= 200) return text.slice(0, 2000)
    }
  } catch {}
  return ""
}

function extractCtx(text: string, re: RegExp): string|null {
  const m=text.match(re); if(!m)return null
  const i=m.index||0; return text.slice(Math.max(0,i-120),Math.min(text.length,i+(m[0]?.length||0)+120)).replace(/\s+/g,' ').trim().slice(0,200)||null
}

function regexAfrica(text: string): Partial<AIResp> {
  const t=text.toLowerCase()
  if(/africa|nigeria|kenya|south africa|ghana|egypt/i.test(t)) return {africa_eligibility:"explicit",africa_confidence:75,africa_evidence:extractCtx(text,/africa|nigeria|kenya|south africa|ghana|egypt/i)}
  if(/us only|uk only|eu only|must reside|residents only|no visa sponsorship/i.test(t)) return {africa_eligibility:"restricted",africa_confidence:70,africa_evidence:extractCtx(text,/us only|uk only|eu only|must reside|residents only|no visa sponsorship/i)}
  return {}
}

function regexRemote(text: string, isRemote: boolean): Partial<AIResp> {
  const t=text.toLowerCase()
  if(/fully remote|work from anywhere|remote.*worldwide/i.test(t)||isRemote) return {remote_eligibility:"fully_remote",remote_confidence:40,remote_evidence:extractCtx(text,/fully remote|work from anywhere|remote/i)}
  if(/hybrid|2 days in office/i.test(t)) return {remote_eligibility:"hybrid",remote_confidence:65,remote_evidence:extractCtx(text,/hybrid|2 days in office/i)}
  return {}
}

function regexSalary(text: string, job: Job): Partial<AIResp> {
  const i=deterministicExtract({title:job.title,description:text,location:job.location,tags:job.tags})
  if(i.salary) return {salary_min:i.salary.min,salary_max:i.salary.max,salary_currency:i.salary.currency,salary_period:i.salary.period,salary_is_estimated:false,salary_transparency:"disclosed",salary_confidence:90,salary_evidence:i.salary.raw}
  if(job.salary_min!=null||job.salary_max!=null||job.salary_range) return {salary_min:job.salary_min,salary_max:job.salary_max,salary_currency:job.salary_currency,salary_period:job.salary_period,salary_is_estimated:false,salary_transparency:"disclosed",salary_confidence:70,salary_evidence:job.salary_range||null}
  return {}
}

/**
 * [FIX #4] Regex-based company legitimacy check from company page text.
 */
function regexCompany(text: string, job: Job): Partial<AIResp> {
  if (!text || text.length < 100) return {}
  const t = text.toLowerCase()
  // Positive signals
  const hasAbout = /about us|our mission|our team|founded in/i.test(t)
  const hasContact = /contact|email|phone|address/i.test(t)
  const hasPrivacy = /privacy policy|terms of service/i.test(t)
  const hasCareers = /careers|jobs|join us/i.test(t)
  
  let legitimacy: "verified"|"likely_legit"|"unknown"|"suspicious" = "unknown"
  let confidence = 0
  let evidence = ""
  
  const positiveSignals = [hasAbout, hasContact, hasPrivacy, hasCareers].filter(Boolean).length
  if (positiveSignals >= 3) {
    legitimacy = "likely_legit"
    confidence = 40 + positiveSignals * 10
    evidence = `Company website has ${positiveSignals}/4 legitimacy signals (about, contact, privacy, careers)`
  } else if (positiveSignals >= 2) {
    legitimacy = "likely_legit"
    confidence = 30
    evidence = `Company website has ${positiveSignals}/4 legitimacy signals`
  }
  
  return { company_legitimacy: legitimacy, company_confidence: confidence, company_evidence: evidence || null }
}

export interface ConsolidatedResult { ai: AIResp; diags: ProviderCallDiag[]; modelVersion: string; pageFetched: boolean; pageLen: number; aiUsed: boolean; companyPageFetched: boolean; companyPageLen: number }

export async function extractWithSingleAI(job: Job): Promise<ConsolidatedResult> {
  const diags: ProviderCallDiag[] = []
  
  // Fetch job page and company page in parallel
  const [pageText, companyText] = await Promise.all([
    fetchJobPage(job.apply_url, job),
    fetchCompanyPage(job),
  ])
  
  // [FIX #8] Increase description limit to 6000 chars to capture more salary/requirements info
  const combined = (job.description_md + "\n\n" + pageText).slice(0, 6000)

  // Build prompt with company context if available
  const companyContext = companyText.length > 100 
    ? `\n\nCompany website excerpt:\n${companyText.slice(0, 1000)}`
    : ""

  const prompt = `Extract all intelligence from this job as JSON. Quote evidence verbatim. Use "unknown" if evidence missing. Never guess.\n\n` +
    `${job.title} @ ${job.company} | ${job.location||""} | ${job.country} | src=${job.source||""} | emp=${job.employment_type}\n` +
    `Salary: ${job.salary_range||""} ${job.salary_min||""}-${job.salary_max||""} ${job.salary_currency||""} | Tags: ${(job.tags||[]).join(",")}\n\n` +
    `Description:\n${combined.slice(0,5000)}${companyContext}\n\n` +
    `Return: {"africa_eligibility":"explicit|likely|restricted|unknown","africa_confidence":0,"africa_evidence":"..."|null,` +
    `"country_restrictions":[],"visa_sponsorship":"available|not_available|unknown","visa_confidence":0,` +
    `"remote_eligibility":"fully_remote|hybrid|onsite|unknown",` +
    `"remote_confidence":0,"remote_evidence":"..."|null,"timezone_requirements":"..."|null,` +
    `"salary_min":null,"salary_max":null,"salary_currency":"USD"|null,"salary_period":"year"|null,"salary_is_estimated":false,` +
    `"salary_transparency":"disclosed|estimated|undisclosed|unknown","salary_confidence":0,"salary_evidence":"..."|null,` +
    `"company_legitimacy":"verified|likely_legit|unknown|suspicious","company_confidence":0,"company_evidence":"..."|null,` +
    `"job_quality":"high|medium|low|unknown","job_quality_confidence":0,"job_quality_evidence":"..."|null,` +
    `"experience_level":"entry|mid|senior|executive|unknown","experience_confidence":0,` +
    `"required_skills":[],"transferable_skills":[],"missing_skills":[],` +
    `"hiring_urgency":"high|medium|low|unknown","hiring_urgency_confidence":0}`

  let aiResp: AIResp = AF; let modelVersion = "no-ai-providers"; let aiUsed = false
  try {
    const gw = await aiGateway({ prompt, systemInstruction: "Extract job intelligence as JSON. Evidence-based. Never guess. Output only JSON.", agentId: "verifier:consolidated", jobId: job.id, temperature: 0.2, maxTokens: 1400 })
    if (gw.diag) for (const d of gw.diag) diags.push(d)
    const m = gw.response.text.match(/\{[\s\S]*\}/)
    if (m) { try { aiResp = { ...AF, ...JSON.parse(m[0]) }; modelVersion = gw.response.provider + ":" + gw.response.model; aiUsed = true } catch {} }
  } catch (e: any) { if (e?.diag && Array.isArray(e.diag)) for (const d of e.diag) diags.push(d) }

  // Normalize confidence values: AI models return either 0-1 (fractional)
  // or 0-100 scale.  If all confidence fields are ≤ 1.0 and at least one
  // is > 0, assume 0-1 scale and multiply by 100.
  const confFields = ["africa_confidence","visa_confidence","remote_confidence","salary_confidence","company_confidence","job_quality_confidence","experience_confidence","hiring_urgency_confidence"] as const
  const allLeOne = confFields.every(f => (aiResp as any)[f] <= 1.0)
  const anyGtZero = confFields.some(f => (aiResp as any)[f] > 0)
  if (allLeOne && anyGtZero) {
    for (const f of confFields) {
      (aiResp as any)[f] = Math.round((aiResp as any)[f] * 100)
    }
  }

  // ── Regex extraction (ground truth from page text) ──
  const rxAfrica = regexAfrica(combined)
  const rxRemote = regexRemote(combined, job.is_remote)
  const rxSalary = regexSalary(combined, job)
  const rxCompany = regexCompany(companyText, job)

  // [FIX #2] Smart merge: regex is ground truth, AI supplements
  // Start with defaults
  const merged: AIResp = { ...AF }
  
  // Apply regex first (ground truth from page)
  Object.assign(merged, rxAfrica, rxRemote, rxSalary, rxCompany)
  
  // AI overrides ONLY when AI returns non-unknown/non-null values
  // This ensures regex-extracted salary is preserved when AI returns null
  if (aiUsed) {
    // Africa: AI overrides only if not "unknown"
    if (aiResp.africa_eligibility !== "unknown") {
      merged.africa_eligibility = aiResp.africa_eligibility
      merged.africa_confidence = aiResp.africa_confidence
      merged.africa_evidence = aiResp.africa_evidence
      merged.country_restrictions = aiResp.country_restrictions
    }
    
    // Visa: always use AI value (regex doesn't extract visa)
    merged.visa_sponsorship = aiResp.visa_sponsorship
    merged.visa_confidence = aiResp.visa_confidence
    
    // Remote: AI overrides only if not "unknown"
    if (aiResp.remote_eligibility !== "unknown") {
      merged.remote_eligibility = aiResp.remote_eligibility
      merged.remote_confidence = aiResp.remote_confidence
      merged.remote_evidence = aiResp.remote_evidence
      merged.timezone_requirements = aiResp.timezone_requirements
    }
    
    // Salary: AI overrides ONLY if AI returned actual numbers
    // If AI returned null for both min/max but regex found salary, KEEP regex
    if (aiResp.salary_min != null || aiResp.salary_max != null) {
      merged.salary_min = aiResp.salary_min
      merged.salary_max = aiResp.salary_max
      merged.salary_currency = aiResp.salary_currency
      merged.salary_period = aiResp.salary_period
      merged.salary_is_estimated = aiResp.salary_is_estimated
      merged.salary_transparency = aiResp.salary_transparency
      merged.salary_confidence = aiResp.salary_confidence
      merged.salary_evidence = aiResp.salary_evidence
    }
    // If AI returned salary_transparency but no numbers, still use transparency
    if (aiResp.salary_transparency !== "unknown" && merged.salary_min == null && merged.salary_max == null) {
      merged.salary_transparency = aiResp.salary_transparency
    }
    
    // Company: AI overrides only if not "unknown"
    if (aiResp.company_legitimacy !== "unknown") {
      merged.company_legitimacy = aiResp.company_legitimacy
      merged.company_confidence = aiResp.company_confidence
      merged.company_evidence = aiResp.company_evidence
    }
    
    // Quality: always use AI (no regex for quality)
    merged.job_quality = aiResp.job_quality
    merged.job_quality_confidence = aiResp.job_quality_confidence
    merged.job_quality_evidence = aiResp.job_quality_evidence
    
    // Experience: AI overrides only if not "unknown"
    if (aiResp.experience_level !== "unknown") {
      merged.experience_level = aiResp.experience_level
      merged.experience_confidence = aiResp.experience_confidence
    }
    
    // Skills: use AI if non-empty arrays
    if (aiResp.required_skills && aiResp.required_skills.length > 0) merged.required_skills = aiResp.required_skills
    if (aiResp.transferable_skills && aiResp.transferable_skills.length > 0) merged.transferable_skills = aiResp.transferable_skills
    if (aiResp.missing_skills && aiResp.missing_skills.length > 0) merged.missing_skills = aiResp.missing_skills
    
    // Hiring urgency: AI overrides only if not "unknown"
    if (aiResp.hiring_urgency !== "unknown") {
      merged.hiring_urgency = aiResp.hiring_urgency
      merged.hiring_urgency_confidence = aiResp.hiring_urgency_confidence
    }
  }

  if (!aiUsed) modelVersion = Object.keys({ ...rxAfrica, ...rxRemote, ...rxSalary }).length > 0 ? "regex-extracted-" + pageText.length + "bytes" : "no-ai-providers"
  return { ai: merged, diags, modelVersion, pageFetched: pageText.length > 0, pageLen: pageText.length, aiUsed, companyPageFetched: companyText.length > 0, companyPageLen: companyText.length }
}
