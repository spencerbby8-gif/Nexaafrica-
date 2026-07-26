import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
import { extractIntelligence as deterministicExtract } from "@/lib/intelligence"
import { aiGateway, type ProviderCallDiag } from "../gateway"

interface AIResp {
  africa_eligibility: "explicit"|"likely"|"restricted"|"unknown"; africa_confidence: number; africa_evidence: string|null
  country_restrictions: string[]; visa_sponsorship: "available"|"not_available"|"unknown"|"conditional"
  remote_eligibility: "fully_remote"|"hybrid"|"onsite"|"unknown"; remote_confidence: number; remote_evidence: string|null; timezone_requirements: string|null
  salary_min: number|null; salary_max: number|null; salary_currency: string|null; salary_period: string|null; salary_is_estimated: boolean
  salary_transparency: "disclosed"|"estimated"|"undisclosed"|"unknown"; salary_confidence: number; salary_evidence: string|null
  company_legitimacy: "verified"|"likely_legit"|"unknown"|"suspicious"; company_confidence: number; company_evidence: string|null
  job_quality: "high"|"medium"|"low"|"unknown"; job_quality_confidence: number; job_quality_evidence: string|null
  experience_level: "entry"|"mid"|"senior"|"executive"|"unknown"; experience_confidence: number
  required_skills: string[]; transferable_skills: string[]; missing_skills: string[]
  hiring_urgency: "high"|"medium"|"low"|"unknown"; hiring_urgency_confidence: number
}

const AF: AIResp = { africa_eligibility:"unknown",africa_confidence:0,africa_evidence:null,country_restrictions:[],visa_sponsorship:"unknown",remote_eligibility:"unknown",remote_confidence:0,remote_evidence:null,timezone_requirements:null,salary_min:null,salary_max:null,salary_currency:null,salary_period:null,salary_is_estimated:false,salary_transparency:"unknown",salary_confidence:0,salary_evidence:null,company_legitimacy:"unknown",company_confidence:0,company_evidence:null,job_quality:"unknown",job_quality_confidence:0,job_quality_evidence:null,experience_level:"unknown",experience_confidence:0,required_skills:[],transferable_skills:[],missing_skills:[],hiring_urgency:"unknown",hiring_urgency_confidence:0 }

// Page fetch with 2 retries and delayed backoff
async function fetchJobPage(url: string): Promise<string> {
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), 8000 + attempt * 4000)
      const res = await fetch(url, { headers: { "User-Agent": "Nexa Verifier" }, signal: c.signal })
      clearTimeout(t)
      if (res.ok) {
        const html = await res.text()
        const text = cleanDescription(html)
        if (text.length >= 100) return text // success
        if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue }
        return text // last attempt, return what we have
      }
      if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue }
    } catch { if (attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue } }
  }
  return ""
}

function extractCtx(text: string, re: RegExp): string|null {
  const m=text.match(re); if(!m)return null
  const i=m.index||0; return text.slice(Math.max(0,i-120),Math.min(text.length,i+(m[0]?.length||0)+120)).replace(/\s+/g,' ').trim().slice(0,200)||null
}

function regexAfrica(text: string): Partial<AIResp> {
  const t=text.toLowerCase()
  if(/africa|nigeria|kenya|south africa|ghana|egypt/i.test(t)) return {africa_eligibility:"explicit",africa_confidence:75,africa_evidence:extractCtx(text,/africa|nigeria|kenya|south africa|ghana|egypt/i)}
  if(/us only|uk only|eu only|must reside|residents only|no visa sponsorship/i.test(t)) return {africa_eligibility:"restricted",africa_confidence:70,africa_evidence:extractCtx(text,/us only|uk only|eu only/i)}
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

export interface ConsolidatedResult { ai: AIResp; diags: ProviderCallDiag[]; modelVersion: string; pageFetched: boolean; pageLen: number; aiUsed: boolean }

export async function extractWithSingleAI(job: Job): Promise<ConsolidatedResult> {
  const diags: ProviderCallDiag[] = []
  const pageText = await fetchJobPage(job.apply_url)
  const combined = (job.description_md + "\n\n" + pageText).slice(0, 4500)

  // Compact prompt: ~700 tokens with description. Groq 100K TPD → ~140 jobs/day.
  const prompt = `Extract all intelligence from this job as JSON. Quote evidence verbatim. Use \"unknown\" if evidence missing. Never guess.\n\n` +
    `${job.title} @ ${job.company} | ${job.location||""} | ${job.country} | src=${job.source||""} | emp=${job.employment_type}\n` +
    `Salary: ${job.salary_range||""} ${job.salary_min||""}-${job.salary_max||""} ${job.salary_currency||""} | Tags: ${(job.tags||[]).join(",")}\n\n` +
    `Description:\n${combined.slice(0,3500)}\n\n` +
    `Return: {"africa_eligibility":"explicit|likely|restricted|unknown","africa_confidence":0,"africa_evidence":"..."|null,` +
    `"country_restrictions":[],"visa_sponsorship":"available|not_available|unknown","remote_eligibility":"fully_remote|hybrid|onsite|unknown",` +
    `"remote_confidence":0,"remote_evidence":"..."|null,"timezone_requirements":"..."|null,` +
    `"salary_min":null,"salary_max":null,"salary_currency":"USD"|null,"salary_period":"year"|null,"salary_is_estimated":false,` +
    `"salary_transparency":"disclosed|estimated|undisclosed|unknown","salary_confidence":0,"salary_evidence":"..."|null,` +
    `"company_legitimacy":"verified|likely_legit|unknown","company_confidence":0,"company_evidence":"..."|null,` +
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

  const rx = { ...regexAfrica(combined), ...regexRemote(combined, job.is_remote), ...regexSalary(combined, job) }
  const merged = { ...AF, ...rx, ...aiResp }
  if (aiResp.africa_eligibility && aiResp.africa_eligibility !== "unknown") merged.africa_eligibility = aiResp.africa_eligibility
  if (aiResp.remote_eligibility && aiResp.remote_eligibility !== "unknown") merged.remote_eligibility = aiResp.remote_eligibility
  if (aiResp.company_legitimacy && aiResp.company_legitimacy !== "unknown") merged.company_legitimacy = aiResp.company_legitimacy
  if (!aiUsed) modelVersion = Object.keys(rx).length > 0 ? "regex-extracted-" + pageText.length + "bytes" : "no-ai-providers"
  return { ai: merged, diags, modelVersion, pageFetched: pageText.length > 0, pageLen: pageText.length, aiUsed }
}
