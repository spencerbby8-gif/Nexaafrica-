import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { extractIntelligence as deterministicExtract } from "@/lib/intelligence"
import { aiGateway, type GatewayResult, type ProviderCallDiag } from "../gateway"

// The single structured output we expect from one AI call.
interface ConsolidatedAIResponse {
  africa_eligibility: "explicit" | "likely" | "restricted" | "unknown"
  africa_confidence: number
  africa_evidence: string | null
  country_restrictions: string[]
  visa_sponsorship: "available" | "not_available" | "unknown" | "conditional"

  remote_eligibility: "fully_remote" | "hybrid" | "onsite" | "unknown"
  remote_confidence: number
  remote_evidence: string | null
  timezone_requirements: string | null

  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_period: string | null
  salary_is_estimated: boolean
  salary_transparency: "disclosed" | "estimated" | "undisclosed" | "unknown"
  salary_confidence: number
  salary_evidence: string | null

  company_legitimacy: "verified" | "likely_legit" | "unknown" | "suspicious"
  company_confidence: number
  company_evidence: string | null

  job_quality: "high" | "medium" | "low" | "unknown"
  job_quality_confidence: number
  job_quality_evidence: string | null

  experience_level: "entry" | "mid" | "senior" | "executive" | "unknown"
  experience_confidence: number

  required_skills: string[]
  transferable_skills: string[]
  missing_skills: string[]

  hiring_urgency: "high" | "medium" | "low" | "unknown"
  hiring_urgency_confidence: number
}

// Fallback values for every dimension when AI fails entirely
const AI_FALLBACK: ConsolidatedAIResponse = {
  africa_eligibility: "unknown", africa_confidence: 0, africa_evidence: null,
  country_restrictions: [], visa_sponsorship: "unknown",
  remote_eligibility: "unknown", remote_confidence: 0, remote_evidence: null,
  timezone_requirements: null,
  salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
  salary_is_estimated: false, salary_transparency: "unknown", salary_confidence: 0,
  salary_evidence: null,
  company_legitimacy: "unknown", company_confidence: 0, company_evidence: null,
  job_quality: "unknown", job_quality_confidence: 0, job_quality_evidence: null,
  experience_level: "unknown", experience_confidence: 0,
  required_skills: [], transferable_skills: [], missing_skills: [],
  hiring_urgency: "unknown", hiring_urgency_confidence: 0,
}

// Fetch job page once and share across all dimensions
async function fetchJobPage(url: string): Promise<string> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      headers: { "User-Agent": "Nexa Consolidated Verifier" },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.ok) {
      return cleanDescription(await res.text())
    }
  } catch {}
  return ""
}

// Regex fallbacks for dimensions that had strong deterministic patterns
function regexAfrica(text: string): Partial<ConsolidatedAIResponse> {
  const t = text.toLowerCase()
  if (/africa|nigeria|kenya|south africa|ghana|egypt/i.test(t))
    return { africa_eligibility: "explicit", africa_confidence: 75, africa_evidence: extractContext(text, /africa|nigeria|kenya|south africa|ghana|egypt/i) }
  if (/us only|uk only|eu only|must reside|residents only|no visa sponsorship/i.test(t))
    return { africa_eligibility: "restricted", africa_confidence: 70, africa_evidence: extractContext(text, /us only|uk only|eu only/i) }
  return {}
}

function regexRemote(text: string, isRemote: boolean): Partial<ConsolidatedAIResponse> {
  const t = text.toLowerCase()
  if (/fully remote|work from anywhere|remote.*worldwide/i.test(t) || isRemote)
    return { remote_eligibility: "fully_remote", remote_confidence: 40, remote_evidence: extractContext(text, /fully remote|work from anywhere|remote/i) }
  if (/hybrid|2 days in office/i.test(t))
    return { remote_eligibility: "hybrid", remote_confidence: 65, remote_evidence: extractContext(text, /hybrid|2 days in office/i) }
  if (/on-site only|must be in office/i.test(t))
    return { remote_eligibility: "onsite", remote_confidence: 65, remote_evidence: extractContext(text, /on-site only|must be in office/i) }
  return {}
}

function regexSalary(text: string, job: Job): Partial<ConsolidatedAIResponse> {
  const intel = deterministicExtract({ title: job.title, description: text, location: job.location, tags: job.tags })
  const s = intel.salary
  if (s) {
    return {
      salary_min: s.min, salary_max: s.max, salary_currency: s.currency, salary_period: s.period,
      salary_is_estimated: false, salary_transparency: "disclosed", salary_confidence: 90,
      salary_evidence: s.raw,
    }
  }
  if (job.salary_min != null || job.salary_max != null || job.salary_range) {
    return {
      salary_min: job.salary_min, salary_max: job.salary_max, salary_currency: job.salary_currency,
      salary_period: job.salary_period, salary_is_estimated: false, salary_transparency: "disclosed",
      salary_confidence: 70, salary_evidence: job.salary_range || null,
    }
  }
  return {}
}

function extractContext(text: string, regex: RegExp): string | null {
  const m = text.match(regex)
  if (!m) return null
  const idx = m.index || 0
  const start = Math.max(0, idx - 120)
  const end = Math.min(text.length, idx + (m[0]?.length || 0) + 120)
  return text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 200) || null
}

// Merge AI result with regex fallbacks: AI wins when it has evidence, regex fills gaps
function mergeWithFallbacks(ai: Partial<ConsolidatedAIResponse>, regex: Partial<ConsolidatedAIResponse>, job: Job, pageText: string): ConsolidatedAIResponse {
  const merged = { ...AI_FALLBACK, ...regex, ...ai }

  // AI overrides regex only when it actually produced non-unknown values
  if (ai.africa_eligibility && ai.africa_eligibility !== "unknown") merged.africa_eligibility = ai.africa_eligibility
  if (ai.remote_eligibility && ai.remote_eligibility !== "unknown") merged.remote_eligibility = ai.remote_eligibility
  if (ai.salary_transparency && ai.salary_transparency !== "unknown") {
    merged.salary_transparency = ai.salary_transparency
    if (ai.salary_min != null) merged.salary_min = ai.salary_min
    if (ai.salary_max != null) merged.salary_max = ai.salary_max
    if (ai.salary_currency) merged.salary_currency = ai.salary_currency
    if (ai.salary_period) merged.salary_period = ai.salary_period
  }
  if (ai.company_legitimacy && ai.company_legitimacy !== "unknown") merged.company_legitimacy = ai.company_legitimacy
  if (ai.job_quality && ai.job_quality !== "unknown") merged.job_quality = ai.job_quality
  return merged
}

export interface ConsolidatedResult {
  ai: ConsolidatedAIResponse
  diags: ProviderCallDiag[]
  modelVersion: string
  pageFetched: boolean
  pageLen: number
  aiUsed: boolean
}

export async function extractWithSingleAI(job: Job): Promise<ConsolidatedResult> {
  const diags: ProviderCallDiag[] = []
  const now = new Date().toISOString()

  // Step 1: fetch job page once
  const pageText = await fetchJobPage(job.apply_url)
  const pageFetched = pageText.length > 0
  const combined = `${job.description_md}\n\n${pageText}`.slice(0, 8000)

  // Step 2: build a single prompt requesting all dimensions
  const prompt = `Analyze this remote job posting and return structured JSON with every dimension below. Be evidence-based — every value must be backed by a verbatim quote from the description. Never guess. Return "unknown" when evidence is missing.

Job Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "unknown"}
Country: ${job.country}
Posted: ${job.posted_at}
Has logo: ${!!job.company_logo}
ATS source: ${job.source || "unknown"}
Employment type: ${job.employment_type}
Tags: ${(job.tags || []).join(", ")}
Stored salary: ${job.salary_range || "none"} min=${job.salary_min || ""} max=${job.salary_max || ""} cur=${job.salary_currency || ""}

Description (first 6000 chars):
${combined.slice(0, 6000)}

Return JSON:
{
  "africa_eligibility": "explicit"|"likely"|"restricted"|"unknown",
  "africa_confidence": 0-100,
  "africa_evidence": "verbatim quote from description where Africa/region eligibility is mentioned, or null",
  "country_restrictions": ["US only", "EU only", ...],
  "visa_sponsorship": "available"|"not_available"|"unknown"|"conditional",
  "remote_eligibility": "fully_remote"|"hybrid"|"onsite"|"unknown",
  "remote_confidence": 0-100,
  "remote_evidence": "verbatim quote about remote policy or null",
  "timezone_requirements": "UTC±N or timezone name or null",
  "salary_min": number|null,
  "salary_max": number|null,
  "salary_currency": "USD"|"EUR"|"GBP"|null,
  "salary_period": "year"|"month"|"hour"|null,
  "salary_is_estimated": boolean,
  "salary_transparency": "disclosed"|"estimated"|"undisclosed"|"unknown",
  "salary_confidence": 0-100,
  "salary_evidence": "verbatim salary quote or null",
  "company_legitimacy": "verified"|"likely_legit"|"unknown"|"suspicious",
  "company_confidence": 0-100,
  "company_evidence": "why this verdict (quote or null)",
  "job_quality": "high"|"medium"|"low"|"unknown",
  "job_quality_confidence": 0-100,
  "job_quality_evidence": "description quality indicator or null",
  "experience_level": "entry"|"mid"|"senior"|"executive"|"unknown",
  "experience_confidence": 0-100,
  "required_skills": ["skill1", "skill2"],
  "transferable_skills": ["soft skill"],
  "missing_skills": ["gap"],
  "hiring_urgency": "high"|"medium"|"low"|"unknown",
  "hiring_urgency_confidence": 0-100
}`

  // Step 3: single AI call through the gateway
  let aiResponse: ConsolidatedAIResponse = AI_FALLBACK
  let modelVersion = "no-ai-providers"
  let aiUsed = false

  try {
    const gwResult: GatewayResult = await aiGateway({
      prompt,
      systemInstruction: "You are a job intelligence extractor. Be evidence-based, never guess. Return verbatim quotes as evidence. Use UNKNOWN when evidence is absent. Output only valid JSON — no commentary.",
      agentId: "verifier:consolidated",
      jobId: job.id,
      temperature: 0.2,
      maxTokens: 2000,
    })

    // Collect diags
    if (gwResult.diag) for (const d of gwResult.diag) diags.push(d)

    // Parse JSON from response
    const text = gwResult.response.text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        aiResponse = { ...AI_FALLBACK, ...parsed }
        modelVersion = `${gwResult.response.provider}:${gwResult.response.model}`
        aiUsed = true
      } catch {}
    }
  } catch (e: any) {
    if (e?.diag && Array.isArray(e.diag)) for (const d of e.diag) diags.push(d)
  }

  // Step 4: merge AI with regex fallbacks
  const regexParts = {
    ...regexAfrica(combined),
    ...regexRemote(combined, job.is_remote),
    ...regexSalary(combined, job),
  }

  const final = mergeWithFallbacks(aiResponse, regexParts, job, pageText)

  // If AI didn't produce real results, tag accordingly
  if (!aiUsed) {
    const hasRegex = Object.keys(regexParts).length > 0
    modelVersion = hasRegex ? `regex-extracted-${pageText.length}bytes` : "no-ai-providers"
  }

  return { ai: final, diags, modelVersion, pageFetched, pageLen: pageText.length, aiUsed }
}
