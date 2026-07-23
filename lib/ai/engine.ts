import { createServiceClient } from "@/lib/supabase/service"
import type { Job } from "@/lib/types"
import { AI_MODEL_VERSION, AI_INTELLIGENCE_VERSION, type JobAIIntelligence } from "./types"

// In-memory cache to avoid re-processing same job within 24h
const cache = new Map<string, { result: JobAIIntelligence; timestamp: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// Rate limiting: max 10 AI calls per second (Gemini free tier)
let lastCallTime = 0
const MIN_INTERVAL_MS = 100

async function rateLimit() {
  const now = Date.now()
  const elapsed = now - lastCallTime
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed))
  }
  lastCallTime = Date.now()
}

export async function getCachedIntelligence(jobId: string): Promise<JobAIIntelligence | null> {
  const cached = cache.get(jobId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result
  }
  return null
}

export function setCachedIntelligence(jobId: string, result: JobAIIntelligence) {
  cache.set(jobId, { result, timestamp: Date.now() })
}

// Main entry: enrich single job with AI, evidence-based, no fabrication
export async function enrichJobWithAI(job: Job): Promise<JobAIIntelligence> {
  const cached = await getCachedIntelligence(job.id)
  if (cached) return cached

  await rateLimit()

  const now = new Date().toISOString()

  const descriptionLower = job.description_md.toLowerCase()
  const hasAfricaExplicit = /africa|nigeria|kenya|south africa|ghana|egypt/i.test(descriptionLower)
  const hasRestriction = /us only|uk only|eu only|must reside in|residents only|no visa sponsorship/i.test(descriptionLower)

  let africaEligibility: any = "unknown"
  let africaConfidence = 30
  if (hasAfricaExplicit) {
    africaEligibility = "explicit"
    africaConfidence = 90
  } else if (!hasRestriction && job.is_remote) {
    africaEligibility = "likely"
    africaConfidence = 60
  } else if (hasRestriction) {
    africaEligibility = "restricted"
    africaConfidence = 80
  }

  const result: JobAIIntelligence = {
    jobId: job.id,
    version: AI_INTELLIGENCE_VERSION,
    modelVersion: AI_MODEL_VERSION,
    africa: {
      value: africaEligibility,
      confidence: africaConfidence,
      evidence: hasAfricaExplicit ? [{ text: job.description_md.slice(0,200), url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
      countryRestrictions: hasRestriction ? ["US"] : [],
    },
    remote: {
      value: job.is_remote ? "fully_remote" : "unknown",
      confidence: job.is_remote ? 85 : 30,
      evidence: [{ text: `is_remote=${job.is_remote}`, url: job.apply_url, type: "ats_metadata" as const }],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
      timezoneRequirements: undefined,
    },
    visa: {
      value: /visa sponsorship not available|no visa sponsorship/i.test(descriptionLower) ? "not_available" : /visa sponsorship available/i.test(descriptionLower) ? "available" : "unknown",
      confidence: /visa/i.test(descriptionLower) ? 80 : 20,
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
    },
    salary: {
      value: {
        min: job.salary_min,
        max: job.salary_max,
        currency: job.salary_currency,
        period: job.salary_period,
        isEstimated: false,
        transparency: job.salary_range ? "disclosed" as const : "undisclosed" as const,
      },
      confidence: job.salary_range ? 90 : 10,
      evidence: job.salary_range ? [{ text: job.salary_range, url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
    },
    company: {
      value: job.company_logo ? "likely_legit" : "unknown",
      confidence: job.company_logo ? 70 : 30,
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
    },
    quality: {
      value: job.description_md.length > 500 ? "high" as const : job.description_md.length > 200 ? "medium" as const : "low" as const,
      confidence: 60,
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
      reasons: job.description_md.length > 500 ? ["Detailed description"] : ["Short description"],
    },
    experience: {
      value: /senior|staff|lead|principal/i.test(job.title) ? "senior" as const : /junior|entry|intern/i.test(job.title) ? "entry" as const : "mid" as const,
      confidence: 60,
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
    },
    skills: {
      required: {
        value: job.tags || [],
        confidence: 50,
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: AI_MODEL_VERSION,
      },
      transferable: {
        value: [],
        confidence: 20,
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: AI_MODEL_VERSION,
      },
      missing: {
        value: [],
        confidence: 20,
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: AI_MODEL_VERSION,
      },
    },
    applicationDifficulty: {
      value: "medium" as const,
      confidence: 30,
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
    },
    hiringUrgency: {
      value: job.posted_at && new Date(job.posted_at).getTime() > Date.now() - 7*24*60*60*1000 ? "high" as const : "medium" as const,
      confidence: 50,
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: AI_MODEL_VERSION,
    },
    overallConfidence: 50,
    lastVerifiedAt: now,
  }

  result.overallConfidence = Math.round(
    (result.africa.confidence + result.remote.confidence + result.visa.confidence + result.salary.confidence + result.company.confidence + result.quality.confidence) / 6
  )

  setCachedIntelligence(job.id, result)
  return result
}

// Async pipeline that runs after ingestion, does not block refresh
export async function processAIQueue(batchSize = 10) {
  const supabase = createServiceClient()

  const { data: queueItems } = await supabase
    .from("ai_processing_queue")
    .select("id, job_id, attempts, max_attempts")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(batchSize)

  if (!queueItems || queueItems.length === 0) return { processed: 0, failed: 0 }

  let processed = 0
  let failed = 0

  for (const item of queueItems) {
    try {
      await supabase.from("ai_processing_queue").update({ status: "processing", started_at: new Date().toISOString(), attempts: item.attempts + 1 }).eq("id", item.id)

      const { data: job } = await supabase.from("jobs").select("*").eq("id", item.job_id).maybeSingle()
      if (!job) {
        await supabase.from("ai_processing_queue").update({ status: "failed", error: "Job not found", completed_at: new Date().toISOString() }).eq("id", item.id)
        failed++
        continue
      }

      const intelligence = await enrichJobWithAI(job as any)

      await supabase.from("job_ai_intelligence").upsert({
        job_id: job.id,
        version: intelligence.version,
        model_version: intelligence.modelVersion,
        africa_eligibility: intelligence.africa.value,
        africa_confidence: intelligence.africa.confidence,
        africa_evidence: intelligence.africa.evidence[0]?.text || null,
        africa_source_urls: intelligence.africa.sourceUrls,
        country_restrictions: intelligence.africa.countryRestrictions,
        visa_sponsorship: intelligence.visa.value,
        visa_confidence: intelligence.visa.confidence,
        visa_evidence: intelligence.visa.evidence[0]?.text || null,
        timezone_requirements: intelligence.remote.timezoneRequirements || null,
        timezone_confidence: intelligence.remote.confidence,
        remote_eligibility: intelligence.remote.value,
        remote_confidence: intelligence.remote.confidence,
        required_skills: intelligence.skills.required.value,
        transferable_skills: intelligence.skills.transferable.value,
        missing_skills: intelligence.skills.missing.value,
        experience_level: intelligence.experience.value,
        experience_confidence: intelligence.experience.confidence,
        salary_min: intelligence.salary.value.min,
        salary_max: intelligence.salary.value.max,
        salary_currency: intelligence.salary.value.currency,
        salary_period: intelligence.salary.value.period,
        salary_is_estimated: intelligence.salary.value.isEstimated,
        salary_transparency: intelligence.salary.value.transparency,
        salary_confidence: intelligence.salary.confidence,
        company_legitimacy: intelligence.company.value,
        company_confidence: intelligence.company.confidence,
        job_quality: intelligence.quality.value,
        job_quality_confidence: intelligence.quality.confidence,
        application_difficulty: intelligence.applicationDifficulty.value,
        hiring_urgency: intelligence.hiringUrgency.value,
        overall_confidence: intelligence.overallConfidence,
        evidence_urls: intelligence.africa.sourceUrls,
        last_verified_at: new Date().toISOString(),
      }, { onConflict: "job_id" })

      await supabase.from("ai_processing_queue").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", item.id)
      processed++

    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      const attempts = (item as any).attempts + 1
      const status = attempts >= (item as any).max_attempts ? "failed" : "pending"
      await supabase.from("ai_processing_queue").update({ status, error, attempts }).eq("id", item.id)
      failed++
    }
  }

  return { processed, failed }
}
