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

  // ── TRUTHFUL INTELLIGENCE ASSEMBLY ──────────────────────────────
  // [FIX] Removed perJobLowConf — was a fake confidence derived from job ID hash.
  // Now: confidence = 0 when no evidence. UNKNOWN is honest, fake confidence is not.
  // Every field must be job-specific. No template values. No repeated defaults.

  const realModelVersion = bundle?._consolidated?.modelVersion
    || (Object.keys(bundle).length > 0 ? "no-ai-providers" : AI_MODEL_VERSION);

  // Collect all evidence URLs from all dimensions
  const allEvidenceUrls = new Set<string>([job.apply_url])
  if (bundle?.africa?.sourceUrls) bundle.africa.sourceUrls.forEach((u: string) => allEvidenceUrls.add(u))
  if (bundle?.company?.sourceUrls) bundle.company.sourceUrls.forEach((u: string) => allEvidenceUrls.add(u))
  if (bundle?._consolidated?.companyPageFetched) {
    try { allEvidenceUrls.add(new URL(job.apply_url).origin) } catch {}
  }

  const result: JobAIIntelligence = {
    jobId: job.id,
    version: AI_INTELLIGENCE_VERSION,
    modelVersion: realModelVersion,
    africa: {
      value: bundle?.africa?.eligibility || "unknown",
      confidence: bundle?.africa?.confidence ?? 0,  // [FIX] Was perJobLowConf()
      evidence: bundle?.africa?.evidence ? [{ text: bundle.africa.evidence, url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: bundle?.africa?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.africa?.lastVerified || now,
      modelVersion: bundle?.africa?.modelVersion || "failed-no-evidence",
      countryRestrictions: bundle?.africa?.countryRestrictions || [],
    },
    remote: {
      value: bundle?.remote?.eligibility || "unknown",
      confidence: bundle?.remote?.confidence ?? 0,  // [FIX] Was perJobLowConf()
      evidence: bundle?.remote?.evidence ? [{ text: bundle.remote.evidence, url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: bundle?.remote?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.remote?.lastVerified || now,
      modelVersion: bundle?.remote?.modelVersion || "failed-no-evidence",
      timezoneRequirements: bundle?.remote?.timezoneRequirements,
    },
    visa: {
      value: bundle?.africa?.visaSponsorship || "unknown",
      confidence: bundle?.africa?.visaConfidence ?? 0,  // [FIX #6] Use visa-specific confidence, not africa's
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
      confidence: bundle?.salary?.confidence ?? (job.salary_range ? 70 : 0),  // [FIX] Was perJobLowConf()
      evidence: bundle?.salary?.evidence ? [{ text: bundle.salary.evidence, url: job.apply_url, type: "job_description" as const }] : job.salary_range ? [{ text: job.salary_range, url: job.apply_url, type: "ats_metadata" as const }] : [],
      sourceUrls: bundle?.salary?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.salary?.lastVerified || now,
      modelVersion: bundle?.salary?.modelVersion || (job.salary_range ? "job-table-fallback" : "failed-no-evidence"),
    },
    company: {
      value: bundle?.company?.legitimacy || "unknown",
      confidence: bundle?.company?.confidence ?? 0,  // [FIX] Was perJobLowConf()
      evidence: bundle?.company?.evidence ? [{ text: bundle.company.evidence, url: job.apply_url, type: "company_page" as const }] : [],
      sourceUrls: bundle?.company?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.company?.lastVerified || now,
      modelVersion: bundle?.company?.modelVersion || "failed-no-evidence",
    },
    quality: {
      value: bundle?.quality?.quality || "unknown",
      confidence: bundle?.quality?.confidence ?? 0,  // [FIX] Was perJobLowConf()
      evidence: bundle?.quality?.evidence ? [{ text: bundle.quality.evidence, url: job.apply_url, type: "job_description" as const }] : [],
      sourceUrls: bundle?.quality?.sourceUrls || [job.apply_url],
      lastVerified: bundle?.quality?.lastVerified || now,
      modelVersion: bundle?.quality?.modelVersion || "failed-no-evidence",
      reasons: bundle?.quality?.reasons || [],
    },
    experience: {
      value: bundle?.experience?.experience?.value || "unknown",
      confidence: bundle?.experience?.experience?.confidence ?? 0,  // [FIX] Was perJobLowConf()
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: bundle?.experience?.experience?.modelVersion || "failed-no-evidence",
    },
    skills: {
      required: {
        value: bundle?.experience?.requiredSkills?.value || job.tags || [],
        confidence: bundle?.experience?.requiredSkills?.confidence ?? (job.tags?.length ? 30 : 0),  // [FIX #5] Was 20 always
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: bundle?.experience?.requiredSkills?.modelVersion || (job.tags?.length ? "job-table-fallback-tags" : "failed-no-evidence"),
      },
      transferable: {
        value: bundle?.experience?.transferableSkills?.value || [],
        confidence: bundle?.experience?.transferableSkills?.confidence ?? 0,  // [FIX] Was perJobLowConf()
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: bundle?.experience?.transferableSkills?.modelVersion || "failed-no-evidence",
      },
      missing: {
        value: bundle?.experience?.missingSkills?.value || [],
        confidence: bundle?.experience?.missingSkills?.confidence ?? 0,  // [FIX] Was perJobLowConf()
        evidence: [],
        sourceUrls: [job.apply_url],
        lastVerified: now,
        modelVersion: bundle?.experience?.missingSkills?.modelVersion || "failed-no-evidence",
      },
    },
    applicationDifficulty: {
      value: "unknown" as const,
      confidence: 0,  // [FIX #3] Was perJobLowConf() — always unknown, confidence must be 0
      evidence: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: "failed-no-evidence",
    },
    hiringUrgency: {
      value: bundle?.freshness ? (bundle.freshness.status === "active" && bundle.freshness.confidence >=70 ? "high" as const : bundle.freshness.status === "stale" ? "low" as const : "medium" as const) : "unknown" as const,
      confidence: bundle?.freshness?.confidence ?? 0,  // [FIX] Was perJobLowConf()
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

/**
 * Helper: evaluate and persist quality score for an intelligence record.
 * Runs AFTER the upsert so the row is guaranteed to exist.
 * [FIX #2] Previously ran before upsert (matched 0 rows) or only in protection path.
 */
async function evaluateAndPersistQuality(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  intelligence: JobAIIntelligence,
): Promise<void> {
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
    const { error } = await supabase.from("job_ai_intelligence").update({
      quality_score: Math.max(0, metrics.overallQuality),
      quality_breakdown: {
        truth_score: metrics.truthScore, evidence_coverage: metrics.evidenceCoverage,
        hallucination_risk: metrics.hallucinationRisk, missing_fields: metrics.missingFields,
        confidence_calibration: metrics.confidenceCalibration, evidence_strength: metrics.evidenceStrength,
        skills_coverage: metrics.skillsCoverage, dimensions: metrics.dimensions,
        explanation: metrics.explanation,
      },
      quality_evaluated_at: new Date().toISOString(),
    }).eq("job_id", jobId)
    if (error) {
      console.log(JSON.stringify({ scope: "ai_engine", event: "quality_eval_failed", jobId: jobId.slice(0,8), error: error.message?.slice(0,200) }))
    }
  } catch (e) {
    console.log(JSON.stringify({ scope: "ai_engine", event: "quality_eval_error", jobId: jobId.slice(0,8), error: (e instanceof Error ? e.message : String(e)).slice(0,200) }))
  }
}

/**
 * Helper: persist provider diagnostics.
 * [FIX #7] Previously fire-and-forget with empty error handlers.
 */
async function persistProviderDiags(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  diags: ProviderCallDiag[],
): Promise<void> {
  if (diags.length === 0) return
  const diagRows = diags.slice(0, 100).map(function(d: any) {
    return {
      job_id: jobId, agent_id: "ai-queue", provider: d.provider, model: d.model, event: d.event,
      http_status: d.httpStatus || null, error_code: d.errorCode || null, error_message: (d.errorMessage||"").slice(0,500) || null,
      error_body: (d.errorBody||"").slice(0,1000) || null, retry_count: d.retryCount, duration_ms: d.durationMs || null,
      prompt_len: d.promptLen || null, response_len: d.responseLen || null, fallback_used: d.retryCount > 0
    };
  });
  const { error } = await supabase.from("ai_provider_log").insert(diagRows)
  if (error) {
    console.log(JSON.stringify({ scope: "ai_engine", event: "diag_insert_failed", jobId: jobId.slice(0,8), error: error.message?.slice(0,200) }))
  }
}

/**
 * Helper: trigger second opinion and persist reconciled result.
 * [FIX #18] Previously the reconciled result was computed but never persisted.
 */
async function triggerSecondOpinionIfNeeded(
  supabase: ReturnType<typeof createServiceClient>,
  job: Job,
  intelligence: JobAIIntelligence,
  diags: ProviderCallDiag[],
): Promise<void> {
  try {
    console.log(`[SecondOpinion] Checking job ${job.id.slice(0,8)}, quality_score will be calculated by evaluateAndPersistQuality`)
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
    console.log(`[SecondOpinion] shouldVerify returned: needed=${check.needed}, reason=${check.reason}`)
    if (!check.needed) return

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
      jobId: job.id.slice(0,8), needed: check.needed, reason: check.reason,
      used: result.used, audit: result.auditNote }))

    // [FIX #18] Persist the reconciled result if the second opinion produced improvements
    if (result.used && result.reconciled) {
      const r = result.reconciled
      const updateRow: Record<string, unknown> = {}
      if (r.africa_eligibility && r.africa_eligibility !== "unknown") updateRow.africa_eligibility = r.africa_eligibility
      if (r.africa_confidence && r.africa_confidence > 0) updateRow.africa_confidence = Math.round(r.africa_confidence)
      if (r.africa_evidence) updateRow.africa_evidence = r.africa_evidence
      if (r.remote_eligibility && r.remote_eligibility !== "unknown") updateRow.remote_eligibility = r.remote_eligibility
      if (r.remote_confidence && r.remote_confidence > 0) updateRow.remote_confidence = Math.round(r.remote_confidence)
      if (r.remote_evidence) updateRow.remote_evidence = r.remote_evidence
      if (r.salary_transparency && r.salary_transparency !== "unknown") updateRow.salary_transparency = r.salary_transparency
      if (r.salary_confidence && r.salary_confidence > 0) updateRow.salary_confidence = Math.round(r.salary_confidence)
      if (r.salary_evidence) updateRow.salary_evidence = r.salary_evidence
      if (r.company_legitimacy && r.company_legitimacy !== "unknown") updateRow.company_legitimacy = r.company_legitimacy
      if (r.company_confidence && r.company_confidence > 0) updateRow.company_confidence = Math.round(r.company_confidence)
      if (r.company_evidence) updateRow.company_evidence = r.company_evidence
      if (r.experience_level && r.experience_level !== "unknown") updateRow.experience_level = r.experience_level
      if (r.experience_confidence && r.experience_confidence > 0) updateRow.experience_confidence = Math.round(r.experience_confidence)
      if (r.job_quality && r.job_quality !== "unknown") updateRow.job_quality = r.job_quality
      if (r.job_quality_confidence && r.job_quality_confidence > 0) updateRow.job_quality_confidence = Math.round(r.job_quality_confidence)
      if (r.job_quality_evidence) updateRow.job_quality_evidence = r.job_quality_evidence
      if (Array.isArray(r.required_skills) && r.required_skills.length > 0) updateRow.required_skills = r.required_skills
      if (Array.isArray(r.transferable_skills) && r.transferable_skills.length > 0) updateRow.transferable_skills = r.transferable_skills
      if (Array.isArray(r.missing_skills)) updateRow.missing_skills = r.missing_skills

      if (Object.keys(updateRow).length > 0) {
        updateRow.last_verified_at = new Date().toISOString()
        const { error } = await supabase.from("job_ai_intelligence").update(updateRow).eq("job_id", job.id)
        if (error) {
          console.log(JSON.stringify({ scope: "ai_engine", event: "second_opinion_upsert_failed", jobId: job.id.slice(0,8), error: error.message?.slice(0,200) }))
        } else {
          console.log(JSON.stringify({ scope: "ai_engine", event: "second_opinion_persisted", jobId: job.id.slice(0,8), fields: Object.keys(updateRow).length, provider: result.provider }))
        }
      }
    }
  } catch (e) {
    console.log(JSON.stringify({ scope:"ai_engine", event:"so_error",
      error:(e instanceof Error?e.message:String(e)).slice(0,200) }))
  }
}

export async function processAIQueue(batchSize = 100) {
  const { createServiceClient } = await import("@/lib/supabase/service")
  const supabase = createServiceClient()

  // [FIX #13] Single stuck-recovery query (was duplicated with overlapping windows).
  // Reset any items stuck in "processing" for >5 minutes or with NULL started_at.
  try {
    await supabase
      .from("ai_processing_queue")
      .update({ status: "pending", error: "Reset after interruption - was stuck in processing >5min" })
      .eq("status", "processing")
      .or(`started_at.is.null,started_at.lt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`)
  } catch (e) {
    console.log(JSON.stringify({ scope: "ai_engine", event: "stuck_recovery_error", error: (e instanceof Error ? e.message : String(e)).slice(0,200) }))
  }

  // Log queue depth for observability
  try {
    const { count: pendingCount } = await supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", "pending")
    console.log(JSON.stringify({ scope: "ai_engine", event: "queue_start", pending: pendingCount, batchSize }))
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

      // ── Protection check: should we skip the upsert? ──────────────────
      let skipUpsert = false
      try {
        const { data: existing } = await supabase.from("job_ai_intelligence").select("model_version, overall_confidence").eq("job_id", job.id).maybeSingle()
        if (existing) {
          const jobId8 = (job as any).id?.slice(0,8) || ''
          const existingIsMisleading = existing.model_version === "gemini-2.5-flash-v1" || existing.model_version === "rule-based-v1-fast" || existing.model_version === "template-removed-2026";
          const existingIsReal = !existingIsMisleading && existing.model_version && !existing.model_version.includes("failed-no-evidence") && (existing.model_version.includes("gemini") || existing.model_version.includes("groq") || existing.model_version.includes("cerebras") || existing.model_version.includes("openrouter"))
          const newIsFailed = intelligence.modelVersion.includes("failed-no-evidence") || intelligence.modelVersion.includes("no-ai-providers")

          if (existingIsReal && newIsFailed) {
            console.log(JSON.stringify({ scope: "ai_engine", event: "protected_existing", jobId: jobId8, oldModel: existing.model_version, newModel: intelligence.modelVersion, reason: "existing_is_real_new_is_failed" }));
            skipUpsert = true
          }
          if (existingIsReal && intelligence.overallConfidence < (existing.overall_confidence || 0) * 0.8) {
            console.log(JSON.stringify({ scope: "ai_engine", event: "protected_existing", jobId: jobId8, oldConf: existing.overall_confidence, newConf: intelligence.overallConfidence, reason: "new_conf_too_low" }));
            skipUpsert = true
          }
        }
      } catch (e) {
        console.log(JSON.stringify({ scope: "ai_engine", event: "protect_check_error", jobId: (job as any).id?.slice(0,8) || '', error: e instanceof Error ? e.message.slice(0,100) : String(e).slice(0,100) }));
      }

      // ── [FIX #1] If all providers failed and no existing record, retry instead of completing ──
      const allProvidersFailed = intelligence.modelVersion.includes("no-ai-providers") || intelligence.modelVersion.includes("failed-no-evidence")
      if (allProvidersFailed && !skipUpsert) {
        // Check if there's an existing record
        const { data: existingCheck } = await supabase.from("job_ai_intelligence").select("id").eq("job_id", job.id).maybeSingle()
        if (!existingCheck) {
          // No existing record and all providers failed — mark as pending for retry, not completed
          const attempts = item.attempts + 1
          const retryStatus = attempts >= item.max_attempts ? "failed" : "pending"
          await supabase.from("ai_processing_queue").update({
            status: retryStatus,
            error: `All AI providers failed (${intelligence.modelVersion}). Will retry.`,
            completed_at: retryStatus === "failed" ? new Date().toISOString() : null,
          }).eq("id", item.id)
          if (retryStatus === "failed") failed++
          else failed++ // count as failed for this batch but will retry next time
          continue
        }
      }

      // ── Main upsert (skipped if protection fired) ─────────────────────
      if (!skipUpsert) {
        const { error: upsertErr } = await supabase.from("job_ai_intelligence").upsert({
          job_id: job.id,
          version: intelligence.version,
          model_version: intelligence.modelVersion,
          africa_eligibility: intelligence.africa.value,
          africa_confidence: Math.round(intelligence.africa.confidence),
          africa_evidence: intelligence.africa.evidence[0]?.text || null,
          africa_source_urls: intelligence.africa.sourceUrls,
          country_restrictions: intelligence.africa.countryRestrictions,
          visa_sponsorship: intelligence.visa.value,
          visa_confidence: Math.round(intelligence.visa.confidence),
          visa_evidence: intelligence.visa.evidence?.[0]?.text ?? null,
          timezone_requirements: intelligence.remote.timezoneRequirements || null,
          timezone_confidence: Math.round(intelligence.remote.confidence),
          remote_eligibility: intelligence.remote.value,
          remote_confidence: Math.round(intelligence.remote.confidence),
          remote_evidence: intelligence.remote.evidence?.[0]?.text ?? null,
          required_skills: intelligence.skills.required.value,
          transferable_skills: intelligence.skills.transferable.value,
          missing_skills: intelligence.skills.missing.value,
          experience_level: intelligence.experience.value,
          experience_confidence: Math.round(intelligence.experience.confidence),
          salary_min: intelligence.salary.value.min,
          salary_max: intelligence.salary.value.max,
          salary_currency: intelligence.salary.value.currency,
          salary_period: intelligence.salary.value.period,
          salary_is_estimated: intelligence.salary.value.isEstimated,
          salary_transparency: intelligence.salary.value.transparency,
          salary_evidence: intelligence.salary.evidence?.[0]?.text ?? null,
          salary_confidence: Math.round(intelligence.salary.confidence),
          company_legitimacy: intelligence.company.value,
          company_confidence: Math.round(intelligence.company.confidence),
          company_evidence: intelligence.company.evidence?.[0]?.text ?? null,
          job_quality: intelligence.quality.value,
          job_quality_confidence: Math.round(intelligence.quality.confidence),
          job_quality_evidence: intelligence.quality.evidence?.[0]?.text ?? null,
          application_difficulty: intelligence.applicationDifficulty.value,
          hiring_urgency: intelligence.hiringUrgency.value,
          overall_confidence: Math.round(intelligence.overallConfidence),
          evidence_urls: Array.from(new Set<string>([
            ...(intelligence.africa.sourceUrls || []),
            ...(intelligence.company.sourceUrls || []),
            ...(intelligence.salary.sourceUrls || []),
            ...(intelligence.remote.sourceUrls || []),
            job.apply_url,
          ])).slice(0, 20),
          last_verified_at: new Date().toISOString(),
        }, { onConflict: "job_id" })
        if (upsertErr) {
          console.log(JSON.stringify({ scope:"ai_engine", event:"upsert_failed", jobId:(job as any).id?.slice(0,8)||"",
            code: (upsertErr as any).code, message: upsertErr.message?.slice(0,200), details: (upsertErr as any).details?.slice(0,200) }))
          await supabase.from("ai_processing_queue").update({ status: "failed", error: `JAI upsert: ${upsertErr.message?.slice(0,300)}`, completed_at: new Date().toISOString() }).eq("id", item.id)
          failed++
          continue
        }
      }

      // ── Post-upsert: always run these for every processed item ────────

      // [FIX #7] Persist provider diagnostics (awaited, not fire-and-forget)
      await persistProviderDiags(supabase, job.id, diags)

      // [FIX #2] Evaluate quality AFTER upsert (row now exists)
      await evaluateAndPersistQuality(supabase, job.id, intelligence)

      // [FIX #18] Second opinion with persistence (runs for all items, not just protection path)
      await triggerSecondOpinionIfNeeded(supabase, job as any, intelligence, diags)

      // ── Mark queue item as completed ──────────────────────────────────
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

  // Log final stats
  console.log(JSON.stringify({ scope: "ai_engine", event: "queue_done", processed, failed, elapsedMs: Date.now() - loopStart }))

  return { processed, failed }
}
