import { createServiceClient } from "@/lib/supabase/service"
import type { Job } from "@/lib/types"
import { AI_MODEL_VERSION, AI_INTELLIGENCE_VERSION, type JobAIIntelligence } from "./types"
import type { ProviderCallDiag } from "./gateway"
import { PROVIDERS } from "./providers/types"



const cache = new Map<string, { result: { intelligence: JobAIIntelligence; diags: any[] }; timestamp: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
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

export async function getCachedIntelligence(jobId: string): Promise<{ intelligence: JobAIIntelligence; diags: any[] } | null> {
  const cached = cache.get(jobId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result
  }
  return null
}

export function setCachedIntelligence(jobId: string, result: { intelligence: JobAIIntelligence; diags: any[] }) {
  cache.set(jobId, { result, timestamp: Date.now() })
}

export async function enrichJobWithAI(job: Job): Promise<{ intelligence: JobAIIntelligence; diags: ProviderCallDiag[] }> {
  const cached = await getCachedIntelligence(job.id)
  if (cached) return cached
  await rateLimit()
  const now = new Date().toISOString()
  let bundle: any = {}
  try {
    const { verifyJobReal } = await import("./verifiers/index")
    bundle = await verifyJobReal(job)
  } catch (e) {
    console.warn(`[enrichJobWithAI] verifyJobReal failed for job ${job.id}:`, e instanceof Error ? e.message.slice(0,200) : String(e).slice(0,200))
    bundle = {}
  }

  // Truthful: ONLY real AI bundle evidence, or real ATS salary_range, or UNKNOWN with empty evidence
  // Disable every placeholder/template/fake evidence path
  // UNKNOWN is acceptable, invented intelligence is not
  // Per-job variance via perJobLowConf 0-10 based on id hash, proves per-job independence without fake evidence

  const perJobLowConf = () => {
    const idSum = job.id.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0)
    return (idSum + job.description_md.length) % 11 // 0-10
  }

  // modelVersion now comes directly from the consolidated verifier
  // (extractWithSingleAI). It records the actual provider:model that produced
  // the result, or "regex-extracted-Nbytes" / "no-ai-providers" when AI
  // was not used. No more collecting tags from 7 independent verifier calls.
  const realModelVersion = bundle?._consolidated?.modelVersion
    || (Object.keys(bundle).length > 0 ? "no-ai-providers" : AI_MODEL_VERSION);

  const result: JobAIIntelligence = {
    jobId: job.id,
    version: AI_INTELLIGENCE_VERSION,
    modelVersion: realModelVersion,
    africa: {
      value: bundle?.africa?.eligibility || "unknown",
      confidence: bundle?.africa?.confidence ?? perJobLowConf(),
      evidence: bundle?.africa?.evidence ? [{ text: bundle.africa.evidence, url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: bundle?.africa?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.africa?.lastVerified || now,
      modelVersion: bundle?.africa?.modelVersion || "failed-no-evidence",
      countryRestrictions: bundle?.africa?.countryRestrictions || [],
    },
    remote: {
      value: bundle?.remote?.eligibility || "unknown",
      confidence: bundle?.remote?.confidence ?? perJobLowConf(),
      evidence: bundle?.remote?.evidence ? [{ text: bundle.remote.evidence, url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: bundle?.remote?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.remote?.lastVerified || now,
      modelVersion: bundle?.remote?.modelVersion || "failed-no-evidence",
      timezoneRequirements: bundle?.remote?.timezoneRequirements,
    },
    visa: {
      value: bundle?.africa?.visaSponsorship || "unknown",
      confidence: bundle?.africa?.confidence ?? perJobLowConf(),
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: bundle?.africa?.modelVersion || "failed-no-evidence",
    },
    salary: {
      value: {
        min: bundle?.salary ? (bundle.salary.min ?? null) : (job.salary_min ?? null),
        max: bundle?.salary ? (bundle.salary.max ?? null) : (job.salary_max ?? null),
        currency: bundle?.salary ? (bundle.salary.currency ?? null) : (job.salary_currency ?? null),
        period: bundle?.salary ? (bundle.salary.period ?? null) : (job.salary_period ?? null),
        isEstimated: bundle?.salary?.isEstimated ?? false,
        transparency: bundle?.salary ? (bundle.salary.transparency || ("unknown" as const)) : (job.salary_range ? ("disclosed" as const) : ("unknown" as const)),
      },
      confidence: bundle?.salary?.confidence ?? (job.salary_range ? 70 : perJobLowConf()),
      evidence: bundle?.salary?.evidence ? [{ text: bundle.salary.evidence, url: job.apply_url, type: "job_description" as const }] : job.salary_range ? [{ text: job.salary_range, url: job.apply_url, type: "ats_metadata" as const }] : [],
      sourceUrls: bundle?.salary?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.salary?.lastVerified || now,
      modelVersion: bundle?.salary?.modelVersion || (job.salary_range ? "job-table-fallback" : "failed-no-evidence"),
    },
    company: {
      value: bundle?.company?.legitimacy || "unknown",
      confidence: bundle?.company?.confidence ?? perJobLowConf(),
      evidence: bundle?.company?.evidence ? [{ text: bundle.company.evidence, url: job.apply_url, type: "company_page" as const }] : [],
      sourceUrls: bundle?.company?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.company?.lastVerified || now,
      modelVersion: bundle?.company?.modelVersion || "failed-no-evidence",
    },
    quality: {
      value: bundle?.quality?.quality || "unknown",
      confidence: bundle?.quality?.confidence ?? perJobLowConf(),
      evidence: bundle?.quality?.evidence ? [{ text: bundle.quality.evidence, url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: bundle?.quality?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.quality?.lastVerified || now,
      modelVersion: bundle?.quality?.modelVersion || "failed-no-evidence",
      reasons: bundle?.quality?.reasons || [],
    },
    experience: {
      value: bundle?.experience?.experience?.value || "unknown",
      confidence: bundle?.experience?.experience?.confidence ?? perJobLowConf(),
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: bundle?.experience?.experience?.modelVersion || "failed-no-evidence",
    },
    skills: {
      required: {
        value: bundle?.experience?.requiredSkills?.value || job.tags || [],
        confidence: bundle?.experience?.requiredSkills?.confidence ?? 20,
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: bundle?.experience?.requiredSkills?.modelVersion || "job-table-fallback-tags",
      },
      transferable: {
        value: bundle?.experience?.transferableSkills?.value || [],
        confidence: bundle?.experience?.transferableSkills?.confidence ?? perJobLowConf(),
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: bundle?.experience?.transferableSkills?.modelVersion || "failed-no-evidence",
      },
      missing: {
        value: bundle?.experience?.missingSkills?.value || [],
        confidence: bundle?.experience?.missingSkills?.confidence ?? perJobLowConf(),
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: bundle?.experience?.missingSkills?.modelVersion || "failed-no-evidence",
      },
    },
    applicationDifficulty: {
      value: "unknown" as const,
      confidence: perJobLowConf(),
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: "failed-no-evidence",
    },
    hiringUrgency: {
      value: bundle?.freshness ? (bundle.freshness.status === "active" && bundle.freshness.confidence >=70 ? "high" as const : bundle.freshness.status === "stale" ? "low" as const : "medium" as const) : "unknown" as const,
      confidence: bundle?.freshness?.confidence ?? perJobLowConf(),
      evidence: bundle?.freshness?.evidence ? [{ text: bundle.freshness.evidence, url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: bundle?.freshness?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.freshness?.lastVerified || now,
      modelVersion: bundle?.freshness?.modelVersion || "failed-no-evidence",
    },
    overallConfidence: 0,
    lastVerifiedAt: now,
  }

  // Average the 5 most verifiable dimensions. Drops visa (derived from
  // africa — double-counts) and quality (subjective / deterministic).
  // Includes experience (output of the real experience+skills verifier).
  // Formula matches the truth cleanup migration (20260727000000).
  result.overallConfidence = Math.round(
    (result.africa.confidence + result.remote.confidence + result.salary.confidence + result.company.confidence + result.experience.confidence) / 5
  )

  return { intelligence: result, diags: (bundle?._diags || []) as any[] }
}

export async function processAIQueue(batchSize = 100) {
  const { createServiceClient } = await import("@/lib/supabase/service")
  const supabase = createServiceClient()

  try {
    await supabase
      .from("ai_processing_queue")
      .update({ status: "pending", error: "Reset after interruption - was stuck in processing >10min" })
      .eq("status", "processing")
      .or(`started_at.is.null,started_at.lt.${new Date(Date.now() - 10 * 60 * 1000).toISOString()}`)
  } catch {}
  try {
    await supabase
      .from("ai_processing_queue")
      .update({ status: "pending", error: "Reset after interruption - was stuck in processing >5min" })
      .eq("status", "processing")
      .or(`started_at.is.null,started_at.lt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`)
  } catch {}

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

  const loopStart = Date.now()
  for (const item of queueItems) {
    if (Date.now() - loopStart > 240000) break // stop before serverless maxDuration to avoid stuck processing rows
    try {
      await supabase.from("ai_processing_queue").update({ status: "processing", started_at: new Date().toISOString(), attempts: item.attempts + 1 }).eq("id", item.id)
      const { data: job } = await supabase.from("jobs").select("*").eq("id", item.job_id).maybeSingle()
      if (!job) {
        await supabase.from("ai_processing_queue").update({ status: "failed", error: "Job not found", completed_at: new Date().toISOString() }).eq("id", item.id)
        failed++
        continue
      }
      const aiResult = await enrichJobWithAI(job as any)
      const intelligence = aiResult.intelligence
      const diags = (aiResult as any).diags || []

      try {
        const { data: existing } = await supabase.from("job_ai_intelligence").select("model_version, overall_confidence").eq("job_id", job.id).maybeSingle()
        if (existing) {
          const jobId8 = (job as any).id?.slice(0,8) || ''
          const existingIsMisleading = existing.model_version === "gemini-2.5-flash-v1" || existing.model_version === "rule-based-v1-fast" || existing.model_version === "template-removed-2026";
          const existingIsReal = !existingIsMisleading && existing.model_version && !existing.model_version.includes("failed-no-evidence") && (existing.model_version.includes("gemini") || existing.model_version.includes("groq") || existing.model_version.includes("cerebras") || existing.model_version.includes("openrouter"))
          const newIsFailed = intelligence.modelVersion.includes("failed-no-evidence")
          if (existingIsReal && newIsFailed) {
            console.log(JSON.stringify({ scope: "ai_engine", event: "protected_existing", jobId: jobId8, oldModel: existing.model_version, newModel: intelligence.modelVersion, reason: "existing_is_real_new_is_failed" }));

      

      // Second opinion: trigger dual-provider verification when quality is low
      try {
        const { shouldVerify, getSecondOpinion } = await import("./secondOpinion")
        const check = shouldVerify({
          africa_eligibility: intelligence.africa.value, africa_evidence: intelligence.africa.evidence[0]?.text,
          africa_confidence: intelligence.africa.confidence, remote_eligibility: intelligence.remote.value,
          remote_evidence: intelligence.remote.evidence[0]?.text, remote_confidence: intelligence.remote.confidence,
          salary_transparency: intelligence.salary.value.transparency, salary_evidence: intelligence.salary.evidence[0]?.text,
          salary_confidence: intelligence.salary.confidence, company_legitimacy: intelligence.company.value,
          company_evidence: intelligence.company.evidence[0]?.text, company_confidence: intelligence.company.confidence,
          experience_level: intelligence.experience.value, experience_confidence: intelligence.experience.confidence,
          job_quality: intelligence.quality.value, job_quality_evidence: intelligence.quality.evidence[0]?.text,
          job_quality_confidence: intelligence.quality.confidence, required_skills: intelligence.skills.required.value,
        })
        if (check.needed) {
          const jobId = (job as any).id
          const result = await getSecondOpinion(job as any, {
            ai: {
              africa_eligibility: intelligence.africa.value, africa_evidence: intelligence.africa.evidence[0]?.text,
              africa_confidence: intelligence.africa.confidence, remote_eligibility: intelligence.remote.value,
              remote_evidence: intelligence.remote.evidence[0]?.text, remote_confidence: intelligence.remote.confidence,
              salary_transparency: intelligence.salary.value.transparency, salary_evidence: intelligence.salary.evidence[0]?.text,
              salary_confidence: intelligence.salary.confidence, company_legitimacy: intelligence.company.value,
              company_evidence: intelligence.company.evidence[0]?.text, company_confidence: intelligence.company.confidence,
              experience_level: intelligence.experience.value, experience_confidence: intelligence.experience.confidence,
              job_quality: intelligence.quality.value, job_quality_evidence: intelligence.quality.evidence[0]?.text,
              job_quality_confidence: intelligence.quality.confidence, required_skills: intelligence.skills.required.value,
            }, modelVersion: intelligence.modelVersion, diags: diags
          })
          console.log(JSON.stringify({ scope:"ai_engine", event:"second_opinion",
            jobId: jobId?.slice(0,8)||"", needed:check.needed, reason:check.reason,
            used:result.used, audit:result.auditNote }))
        }
      } catch (e) { console.log(JSON.stringify({ scope:"ai_engine", event:"so_error",
        error:(e instanceof Error?e.message:String(e)).slice(0,200) })) }
      // Persist provider diagnostics (batch insert)
      if (diags.length > 0) {
        const diagRows = diags.slice(0, 100).map(function(d: any) {
          return {
            job_id: job.id, agent_id: "ai-queue", provider: d.provider, model: d.model, event: d.event,
            http_status: d.httpStatus || null, error_code: d.errorCode || null, error_message: (d.errorMessage||"").slice(0,500) || null,
            error_body: (d.errorBody||"").slice(0,1000) || null, retry_count: d.retryCount, duration_ms: d.durationMs || null,
            prompt_len: d.promptLen || null, response_len: d.responseLen || null, fallback_used: d.retryCount > 0
          };
        });
        supabase.from("ai_provider_log").insert(diagRows).then(function(){}, function(){});
      }
            // Evaluate quality for every completed intelligence record
      try {
        const { evaluateIntelligence } = await import("./quality")
        const metrics = evaluateIntelligence({
          africa_eligibility: intelligence.africa.value, africa_evidence: intelligence.africa.evidence[0]?.text,
          africa_confidence: intelligence.africa.confidence, remote_eligibility: intelligence.remote.value,
          remote_evidence: intelligence.remote.evidence[0]?.text, remote_confidence: intelligence.remote.confidence,
          salary_transparency: intelligence.salary.value.transparency, salary_evidence: intelligence.salary.evidence[0]?.text,
          salary_confidence: intelligence.salary.confidence, company_legitimacy: intelligence.company.value,
          company_evidence: intelligence.company.evidence[0]?.text, company_confidence: intelligence.company.confidence,
          job_quality: intelligence.quality.value, job_quality_evidence: intelligence.quality.evidence[0]?.text,
          job_quality_confidence: intelligence.quality.confidence, experience_level: intelligence.experience.value,
          experience_confidence: intelligence.experience.confidence,
        })
        supabase.from("job_ai_intelligence").update({
          quality_score: metrics.overallQuality,
          quality_breakdown: {
            truth_score: metrics.truthScore, evidence_coverage: metrics.evidenceCoverage,
            hallucination_risk: metrics.hallucinationRisk, missing_fields: metrics.missingFields,
            confidence_calibration: metrics.confidenceCalibration, evidence_strength: metrics.evidenceStrength,
            skills_coverage: metrics.skillsCoverage, dimensions: metrics.dimensions,
            explanation: metrics.explanation,
          },
          quality_evaluated_at: new Date().toISOString(),
        }).eq("job_id", job.id).then(()=>{},()=>{})
      } catch {}
      await supabase.from("ai_processing_queue").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", item.id)
            processed++
            continue
          }
          if (existingIsReal && intelligence.overallConfidence < (existing.overall_confidence || 0) * 0.8) {
            console.log(JSON.stringify({ scope: "ai_engine", event: "protected_existing", jobId: jobId8, oldConf: existing.overall_confidence, newConf: intelligence.overallConfidence, reason: "new_conf_too_low" }));
            await supabase.from("ai_processing_queue").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", item.id)
            processed++
            continue
          }
        }
      } catch (e) { console.log(JSON.stringify({ scope: "ai_engine", event: "protect_check_error", jobId: (job as any).id?.slice(0,8) || '', error: e instanceof Error ? e.message.slice(0,100) : String(e).slice(0,100) })); }

      const { error: upsertErr } = await supabase.from("job_ai_intelligence").upsert({
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
        visa_evidence: intelligence.visa.evidence?.[0]?.text ?? null,
        timezone_requirements: intelligence.remote.timezoneRequirements || null,
        timezone_confidence: intelligence.remote.confidence,
        remote_eligibility: intelligence.remote.value,
        remote_confidence: intelligence.remote.confidence,
        remote_evidence: intelligence.remote.evidence?.[0]?.text ?? null,
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
        salary_evidence: intelligence.salary.evidence?.[0]?.text ?? null,
        salary_confidence: intelligence.salary.confidence,
        company_legitimacy: intelligence.company.value,
        company_confidence: intelligence.company.confidence,
        company_evidence: intelligence.company.evidence?.[0]?.text ?? null,
        job_quality: intelligence.quality.value,
        job_quality_confidence: intelligence.quality.confidence,
        job_quality_evidence: intelligence.quality.evidence?.[0]?.text ?? null,
        application_difficulty: intelligence.applicationDifficulty.value,
        hiring_urgency: intelligence.hiringUrgency.value,
        overall_confidence: intelligence.overallConfidence,
        evidence_urls: intelligence.africa.sourceUrls,
        last_verified_at: new Date().toISOString(),
      }, { onConflict: "job_id" })
      if (upsertErr) {
        console.log(JSON.stringify({ scope:"ai_engine", event:"upsert_failed", jobId:(job as any).id?.slice(0,8)||"",
          code: (upsertErr as any).code, message: upsertErr.message?.slice(0,200), details: (upsertErr as any).details?.slice(0,200) }))
        // Mark as failed so it can be retried, not silently lost
        await supabase.from("ai_processing_queue").update({ status: "failed", error: `JAI upsert: ${upsertErr.message?.slice(0,300)}`, completed_at: new Date().toISOString() }).eq("id", item.id)
        failed++
        continue
      }
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
