import { isProviderResult, shouldDeferReverification, retryOutcome } from './queue-policy'
import { createServiceClient } from "@/lib/supabase/service"
import type { Job } from "@/lib/types"
import { AI_MODEL_VERSION, AI_INTELLIGENCE_VERSION, type JobAIIntelligence } from "./types"
import type { ProviderCallDiag } from "./gateway"
import { PROVIDERS } from "./providers/types"
import { REMOTE_WRITEBACK_MIN_CONFIDENCE } from "./verified"

// [PHASE-4] Stale-first re-verification. Before Phase 4 completed queue
// rows never cycled, so verified intelligence aged out permanently (3,699 of
// 3,980 active rows were >7d old; re-verification horizon was infinite).
// Each drain invocation may re-queue at most REVERIFY_BATCH of the oldest
// verified rows — a hard budget that keeps API usage controlled.
export const REVERIFY_BATCH = Math.max(0, Math.min(500, Number(process.env.REVERIFY_BATCH ?? '150')))
export const REVERIFY_MAX_AGE_DAYS = Math.max(1, Math.min(90, Number(process.env.REVERIFY_MAX_AGE_DAYS) || 10))

/**
 * Pure selection: oldest-first, never touch jobs already queued
 * (pending/processing), bounded by budget. Deterministic for tests.
 */
export function planReverification(
  candidates: Array<{ job_id: string; last_verified_at: string | null }>,
  inFlightJobIds: Set<string>,
  budget: number,
): Array<{ job_id: string }> {
  if (budget <= 0) return []
  return candidates
    .filter((c) => c.job_id && !inFlightJobIds.has(c.job_id))
    .sort((a, b) => (a.last_verified_at || "").localeCompare(b.last_verified_at || ""))
    .slice(0, budget)
    .map((c) => ({ job_id: c.job_id }))
}



const cache = new Map<string, { result: { intelligence: JobAIIntelligence; diags: any[] }; timestamp: number }>()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
let lastCallTime = 0
// P5: queue pacing — prevents free-tier collapse into regex-only output.
// One AI call per 1.5s per instance (was 100ms, which hammered quotas).
const MIN_INTERVAL_MS = Math.max(200, Number(process.env.AI_PACING_MS) || 1500)

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

  // P6: carry liveness + provenance to persist layer
  const raw_diags = bundle?._diags || []
  const _pageStatus = raw_diags._pageStatus ?? bundle?._consolidated?.pageStatus ?? null
  const _evidenceProvenance = bundle?._consolidated ? (
    bundle._consolidated.pageFetched ? 'page' : bundle._consolidated.aiUsed ? 'stored_description' : 'regex'
  ) : 'ats_metadata'
  // [PHASE-4C] Per-dimension model reasoning captured from the consolidated
  // AI response (already truth-guarded: nulled for abstained dimensions).
  const _reasoning = (() => {
    const ai = bundle?._consolidated?.ai
    if (!ai) return null
    const r = {
      africa: ai.africa_reasoning ?? null,
      remote: ai.remote_reasoning ?? null,
      salary: ai.salary_reasoning ?? null,
      company: ai.company_reasoning ?? null,
      experience: ai.experience_reasoning ?? null,
      quality: ai.quality_reasoning ?? null,
    }
    return Object.values(r).some(Boolean) ? r : null
  })()
  return { intelligence: result, diags: Object.assign(raw_diags as any[], { _pageStatus, _evidenceProvenance, _reasoning }) }
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
      throw new Error("Quality evaluation could not be persisted")
    }
  } catch (e) {
    throw e
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
      request_id:d.requestId || null, job_id: jobId, agent_id: "ai-queue", provider: d.provider, model: d.model, event: d.event,
      http_status: d.httpStatus || null, error_code: d.errorCode || null, error_message: (d.errorMessage||"").slice(0,500) || null,
      error_body: (d.errorBody||"").slice(0,1000) || null, retry_count: d.retryCount, duration_ms: d.durationMs || null,
      prompt_len: d.promptLen || null, response_len: d.responseLen || null, fallback_used: d.retryCount > 0
    };
  });
  const { error } = await supabase.from("ai_provider_log").upsert(diagRows,{onConflict:"request_id,event",ignoreDuplicates:true})
  if (error) {
    console.log(JSON.stringify({ scope: "ai_engine", event: "diag_insert_failed", jobId: jobId.slice(0,8), error: error.message?.slice(0,200) }))
  }
}

/**
 * Helper: trigger second opinion and persist reconciled result.
 * [FIX #18] Previously the reconciled result was computed but never persisted.
 */
// ── [UPLOAD SAFETY] Normalization at the upsert boundary ─────────────
// Verified production failures (ai_processing_queue.error):
//   1) invalid input syntax for type integer: "30.97"  (float from AI)
//   2) check-constraint violation on job_ai_intelligence (out-of-range
//      confidence / invalid enum emitted by a model)
// AI output is untrusted input: round, clamp, whitelist, or drop — never
// pass through, never invent replacements.
const asInt = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? Math.round(n) : null
}
const clamp100 = (v: unknown): number | null => {
  const n = asInt(v)
  if (n === null) return null
  return Math.max(0, Math.min(100, n))
}
const asEnum = <T extends string>(v: unknown, allowed: readonly T[]): T =>
  (allowed as readonly unknown[]).includes(v) ? (v as T) : ("unknown" as T)
const asStringOrNull = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []

const AFRICA_ENUM = ["explicit", "likely", "restricted", "unknown"] as const
const REMOTE_ENUM = ["fully_remote", "hybrid", "onsite", "unknown"] as const
const VISA_ENUM = ["available", "not_available", "unknown", "conditional"] as const
const TRANSPARENCY_ENUM = ["disclosed", "estimated", "undisclosed", "unknown"] as const
const LEGITIMACY_ENUM = ["verified", "likely_legit", "unknown", "suspicious"] as const
const QUALITY_ENUM = ["high", "medium", "low", "unknown"] as const
const EXPERIENCE_ENUM = ["entry", "mid", "senior", "executive", "unknown"] as const
const DIFFICULTY_ENUM = ["easy", "medium", "hard", "unknown"] as const
const URGENCY_ENUM = ["high", "medium", "low", "unknown"] as const

// [STABILIZATION] Exponential backoff for failed AI attempts.
// 15m -> 30m -> 1h -> 2h -> 4h -> 8h -> 12h cap. Every failure schedules a
// retry; only max_attempts exhausted attempts become Rejected (failed).
function backoffMs(attempt: number): number {
  return Math.min(15 * 60 * 1000 * Math.pow(2, attempt - 1), 12 * 60 * 60 * 1000)
}

// [V3] Durable pipeline trace — fire-and-forget (never blocks the drain).
async function traceEvent(
  sb: any,
  jobId: string,
  event: string,
  opts: { gate?: string; reason?: string; detail?: Record<string, unknown>; provider?: string; model?: string; durationMs?: number | null; attempt?: number } = {},
): Promise<void> {
  try {
    await sb.from("ai_pipeline_trace").insert({
      job_id: jobId,
      event,
      gate: opts.gate ?? null,
      reason: opts.reason ?? null,
      detail: opts.detail ?? null,
      provider: opts.provider ?? null,
      model: opts.model ?? null,
      duration_ms: opts.durationMs ?? null,
      attempt: opts.attempt ?? 1,
    })
  } catch (e) {
    console.log(JSON.stringify({ scope: "ai_engine", event: "trace_failed", jobId: String(jobId).slice(0, 8), error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }))
  }
}

export async function processAIQueue(batchSize = 100, options: {jobIds?:string[]; maintenance?:boolean} = {}) {
  const { createServiceClient } = await import("@/lib/supabase/service")
  const supabase = createServiceClient()

  if (options.maintenance !== false) {
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

  // [STABILIZATION] No TTL expiry. Retries are scheduled with exponential
  // backoff via next_retry_at; nothing is ever silently dropped.

  // Log queue depth for observability
  try {
    const { count: pendingCount } = await supabase.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", "pending")
    console.log(JSON.stringify({ scope: "ai_engine", event: "queue_start", pending: pendingCount, batchSize }))
  } catch {}

  const {error:orphanError}=await supabase.rpc('requeue_orphan_ai',{p_limit:200})
  if(orphanError)throw new Error('Orphan maintenance unavailable')
  if(REVERIFY_BATCH>0) {
    const {count,error}=await supabase.from('ai_processing_queue').select('id',{count:'exact',head:true}).eq('status','pending')
    if(error)throw new Error('Queue depth unavailable')
    if((count ?? 0)<=500) {
      const {error:reverifyError}=await supabase.rpc('requeue_stale_ai',{p_limit:REVERIFY_BATCH,p_age_days:REVERIFY_MAX_AGE_DAYS})
      if(reverifyError)throw new Error('Reverification maintenance unavailable')
    }
  }
  } // end automatic maintenance; isolated pilots do not heal or requeue unrelated jobs
  const nowIso = new Date().toISOString()
  let queueQuery = supabase
    .from("ai_processing_queue")
    .select("id, job_id, attempts, max_attempts, next_retry_at")
    .eq("status", "pending")
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(batchSize)
  if(options.jobIds) queueQuery=queueQuery.in("job_id",options.jobIds)
  const {data:queueItems,error:queueError}=await queueQuery
  if(queueError)throw new Error("Queue selection failed")

  if (!queueItems || queueItems.length === 0) return { processed: 0, failed: 0 }

  let processed = 0
  let failed = 0

  const loopStart = Date.now()

  // ── [THROUGHPUT] Bounded worker pool ────────────────────────────────
  // Root cause of the 94% backlog: jobs were processed strictly
  // sequentially (~15-25 jobs per 300s invocation, ~36 jobs/day).
  // Each job is I/O-bound (page fetch + one provider call), so bounded
  // concurrency multiplies throughput. Provider pressure stays governed
  // by the Smart Router's quota/cooldown gates.
  const concurrency = Math.max(1, Math.min(10, Number(process.env.AI_QUEUE_CONCURRENCY) || 3))
  let cursor = 0
  let skippedClaim = 0

  async function processOne(item: { id: string; job_id: string; attempts: number; max_attempts: number; next_retry_at: string | null }): Promise<void> {
    // Atomic claim: the conditional UPDATE only succeeds while the row is
    // still pending, so chained invocations or an overlapping cron can
    // never double-process the same job.
    const { data: claimed } = await supabase
      .from("ai_processing_queue")
      .update({ status: "processing", started_at: new Date().toISOString(), last_attempt_at:new Date().toISOString(), outcome:"processing", attempts: item.attempts + 1 })
      .eq("id", item.id)
      .eq("status", "pending")
      .select("id")
    if (!claimed || claimed.length === 0) { skippedClaim++; return }
    await traceEvent(supabase, item.job_id, "claimed", { attempt: item.attempts + 1 })

    try {
      const { data: job } = await supabase.from("jobs").select("*").eq("id", item.job_id).maybeSingle()
      if (!job) {
        await supabase.from("ai_processing_queue").update({ status: "failed", error: "Job not found", completed_at: new Date().toISOString() }).eq("id", item.id)
        await traceEvent(supabase, item.job_id, "failed", { reason: "Job not found", attempt: item.attempts + 1 })
        failed++
        return
      }
      // ── Intelligent admission filter (deterministic, pre-AI) ──────────
      // Lightweight screening before any expensive model call. Rejects
      // jobs that clearly don't belong in the pipeline.
      try {
        const { admit } = await import("./admission")
        const decision = admit(job as any)
        if (!decision.admitted) {
          await supabase.from("ai_processing_queue").update({
            status: "completed", outcome:"rejected", next_retry_at:null,
            completed_at: new Date().toISOString(),
            error: `Rejected: ${decision.reason} [${decision.gate}]`
          }).eq("id", item.id)
          // [M3] Write the admission verdict back to the jobs row so rejected
          // jobs stop looking eligible in public lists: Africa/work-auth
          // rejections become restricted (mirrors the region-lock gate and
          // role-page 404 convention); dead/onsite/placeholder rejections
          // deactivate the listing. Queue status then matches listing truth.
          try {
            if (decision.gate === "africa_eligibility" || decision.gate === "work_authorization") {
              await supabase.from("jobs").update({ eligibility: "restricted", is_open_to_africa: false }).eq("id", job.id)
            } else if (decision.gate === "onsite_only" || decision.gate === "expired" || decision.gate === "dead_url" || decision.gate === "placeholder_company") {
              await supabase.from("jobs").update({ is_active: false }).eq("id", job.id)
            }
          } catch (e) {
            console.log(JSON.stringify({ scope: "ai_engine", event: "admission_writeback_error", jobId: (job as any).id?.slice(0,8) || "", error: (e instanceof Error ? e.message : String(e)).slice(0,150) }))
          }
          await traceEvent(supabase, item.job_id, "rejected", { gate: (decision as any).gate, reason: decision.reason, attempt: item.attempts + 1 })
          processed++
          consecutiveItemFailures = 0
          return
        }
      } catch (e) { throw e }

      await traceEvent(supabase, item.job_id, "accepted", { attempt: item.attempts + 1 })

      // [V1] Collect page evidence BEFORE the AI call: every decision links
      // back to real page evidence; blocked pages are recorded truthfully
      // (the verifier then abstains rather than guessing).
      try {
        const { collectPageEvidence } = await import("./evidence")
        await collectPageEvidence(supabase, job as any)
      } catch (e) {
        console.log(JSON.stringify({ scope: "ai_engine", event: "evidence_collect_error", jobId: (job as any).id?.slice(0,8) || "", error: (e instanceof Error ? e.message : String(e)).slice(0,120) }))
      }

      const aiResult = await enrichJobWithAI(job as any)
      const intelligence = aiResult.intelligence
      const diags = (aiResult as any).diags || []

      // A transport failure never counts as new verification, even if old AI exists.
      // Keep the old row intact; history captures every successful replacement.
      await persistProviderDiags(supabase,job.id,diags)
      const skipUpsert=false
      if (!isProviderResult(intelligence.modelVersion)) {
        const attempts=item.attempts+1
        const outcome=retryOutcome(attempts,item.max_attempts)
        const {error}=await supabase.from('ai_processing_queue').update({...outcome,error:'AI verification failed; prior intelligence retained'}).eq('id',item.id)
        if(error)throw new Error('Could not persist retry outcome')
        await traceEvent(supabase,item.job_id,outcome.status==='failed'?'failed':'retried',{reason:'No successful provider result; existing row retained',attempt:attempts})
        failed++;consecutiveItemFailures++;return
      }

      // ── Main upsert (skipped if protection fired) ─────────────────────
      if (!skipUpsert) {
        const salaryMinRaw = asInt(intelligence.salary.value.min)
        let salaryMin = salaryMinRaw
        let salaryMax = asInt(intelligence.salary.value.max)
        if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) {
          const tmp = salaryMin; salaryMin = salaryMax; salaryMax = tmp
        }
        const { error: upsertErr } = await supabase.from("job_ai_intelligence").upsert({
          job_id: job.id,
          quality_score:null, quality_breakdown:null, quality_evaluated_at:null,
          version: intelligence.version,
          model_version: intelligence.modelVersion,
          africa_eligibility: asEnum(intelligence.africa.value, AFRICA_ENUM),
          africa_confidence: clamp100(intelligence.africa.confidence),
          africa_evidence: intelligence.africa.evidence[0]?.text || null,
          africa_source_urls: asStringArray(intelligence.africa.sourceUrls),
          country_restrictions: asStringArray(intelligence.africa.countryRestrictions),
          visa_sponsorship: asEnum(intelligence.visa.value, VISA_ENUM),
          visa_confidence: clamp100(intelligence.visa.confidence),
          visa_evidence: intelligence.visa.evidence?.[0]?.text ?? null,
          timezone_requirements: intelligence.remote.timezoneRequirements || null,
          timezone_confidence: clamp100(intelligence.remote.confidence),
          remote_eligibility: asEnum(intelligence.remote.value, REMOTE_ENUM),
          remote_confidence: clamp100(intelligence.remote.confidence),
          remote_evidence: intelligence.remote.evidence?.[0]?.text ?? null,
          required_skills: asStringArray(intelligence.skills.required.value),
          transferable_skills: asStringArray(intelligence.skills.transferable.value),
          missing_skills: asStringArray(intelligence.skills.missing.value),
          experience_level: asEnum(intelligence.experience.value, EXPERIENCE_ENUM),
          experience_confidence: clamp100(intelligence.experience.confidence),
          salary_min: salaryMin,
          salary_max: salaryMax,
          salary_currency: asStringOrNull(intelligence.salary.value.currency),
          salary_period: asStringOrNull(intelligence.salary.value.period),
          salary_is_estimated: intelligence.salary.value.isEstimated === true,
          salary_transparency: asEnum(intelligence.salary.value.transparency, TRANSPARENCY_ENUM),
          salary_evidence: intelligence.salary.evidence?.[0]?.text ?? null,
          salary_confidence: clamp100(intelligence.salary.confidence),
          company_legitimacy: asEnum(intelligence.company.value, LEGITIMACY_ENUM),
          company_confidence: clamp100(intelligence.company.confidence),
          company_evidence: intelligence.company.evidence?.[0]?.text ?? null,
          job_quality: asEnum(intelligence.quality.value, QUALITY_ENUM),
          job_quality_confidence: clamp100(intelligence.quality.confidence),
          job_quality_evidence: intelligence.quality.evidence?.[0]?.text ?? null,
          application_difficulty: asEnum(intelligence.applicationDifficulty.value, DIFFICULTY_ENUM),
          hiring_urgency: asEnum(intelligence.hiringUrgency.value, URGENCY_ENUM),
          overall_confidence: clamp100(intelligence.overallConfidence),
          evidence_urls: Array.from(new Set<string>([
            ...(intelligence.africa.sourceUrls || []),
            ...(intelligence.company.sourceUrls || []),
            ...(intelligence.salary.sourceUrls || []),
            ...(intelligence.remote.sourceUrls || []),
            job.apply_url,
          ])).slice(0, 20),
          // [V1] Per-dimension evidence provenance — what each verdict used.
          evidence_refs: {
            provenance: (aiResult as any).diags?._evidenceProvenance ?? null,
            pageStatus: (aiResult as any).diags?._pageStatus ?? null,
            // [PHASE-4C] grounded per-dimension reasoning from the model.
            reasoning: (aiResult as any).diags?._reasoning ?? null,
            // [PHASE-4D] evidence basis per dimension (quote|regex|metadata|null)
            // so the UI separates source data from AI analysis.
            basis: (aiResult as any).diags?._evidenceBasis ?? null,
            sources: Array.from(new Set<string>([
              job.apply_url,
              ...(intelligence.africa.sourceUrls || []),
              ...(intelligence.company.sourceUrls || []),
            ])).slice(0, 8),
            dimensionCount: Object.values(intelligence).filter((v: any) => v && Array.isArray(v.evidence) && v.evidence.length > 0).length,
          },
          last_verified_at: new Date().toISOString(),
          // P6: liveness + provenance
          page_status: (aiResult as any).diags?._pageStatus ?? ((aiResult as any).intelligence as any)?._pageStatus ?? null,
          page_checked_at: new Date().toISOString(),
          evidence_provenance: (aiResult as any).diags?._evidenceProvenance ?? null,
        }, { onConflict: "job_id" })
        if (upsertErr) {
          console.log(JSON.stringify({ scope:"ai_engine", event:"upsert_failed", jobId:(job as any).id?.slice(0,8)||"",
            code: (upsertErr as any).code, message: upsertErr.message?.slice(0,200), details: (upsertErr as any).details?.slice(0,200) }))
          const attempts = item.attempts + 1
          const exhausted = attempts >= item.max_attempts
          const retryAt = new Date(Date.now() + backoffMs(attempts)).toISOString()
          await supabase.from("ai_processing_queue").update({
            status: exhausted ? "failed" : "pending",
            error: exhausted ? `Rejected: JAI upsert failed after ${attempts} attempts (${upsertErr.message?.slice(0,200)})` : `JAI upsert failed (${upsertErr.message?.slice(0,200)}). Retry #${attempts} scheduled.`,
            completed_at: exhausted ? new Date().toISOString() : null,
            next_retry_at: exhausted ? null : retryAt,
          }).eq("id", item.id)
          await traceEvent(supabase, item.job_id, exhausted ? "failed" : "retried", {
            reason: `JAI upsert failed (${upsertErr.message?.slice(0,120)})`,
            attempt: attempts,
          })
          failed++
          return
        }
      }

      // ── [PHASE-2] Remote truth write-back ─────────────────────────────
      // When a REAL AI verdict with evidence says hybrid/onsite, the public
      // jobs.is_remote flag must stop claiming "fully remote". The listing
      // then drops out of remote-board lists (queries filter is_remote=false)
      // instead of being publicly represented as fully remote against
      // stronger evidence. Unknown remote verdicts never write back.
      try {
        const rv = intelligence.remote.value
        const rc = intelligence.remote.confidence
        const realModel = intelligence.modelVersion.includes(":") &&
          !intelligence.modelVersion.includes("failed-no-evidence") &&
          !intelligence.modelVersion.includes("no-ai-providers")
        if ((rv === "hybrid" || rv === "onsite") && rc >= REMOTE_WRITEBACK_MIN_CONFIDENCE && realModel && intelligence.remote.evidence.length > 0) {
          const { data: flipped } = await supabase
            .from("jobs")
            .update({ is_remote: false })
            .eq("id", job.id)
            .eq("is_remote", true)
            .select("id")
          if (flipped && flipped.length > 0) {
            console.log(JSON.stringify({ scope: "ai_engine", event: "remote_writeback", jobId: String(job.id).slice(0, 8), verdict: rv, confidence: rc }))
          }
        }
      } catch (e) {
        console.log(JSON.stringify({ scope: "ai_engine", event: "remote_writeback_error", error: (e instanceof Error ? e.message : String(e)).slice(0, 150) }))
      }

      // ── Post-upsert: always run these for every processed item ────────

      // [FIX #7] Persist provider diagnostics (awaited, not fire-and-forget)

      // [FIX #2] Evaluate quality AFTER upsert (row now exists)
      await evaluateAndPersistQuality(supabase, job.id, intelligence)

      // [FIX #18] Second opinion with persistence (runs for all items, not just protection path)
      // Ungrounded second-opinion overwrites are disabled. A source-backed review must be separately audited.

      // ── Mark queue item as completed ──────────────────────────────────
      const {error:completeError}=await supabase.from("ai_processing_queue").update({ status: "completed", outcome:"persisted", error:null, next_retry_at:null, completed_at: new Date().toISOString() }).eq("id", item.id)
      if(completeError)throw new Error("Could not persist completion")
      await traceEvent(supabase, item.job_id, "completed", {
        provider: (intelligence as any).modelVersion?.split(":")[0] || null,
        model: (intelligence as any).modelVersion || null,
        durationMs: (diags as any[]).find((d: any) => d.event === "success")?.durationMs ?? null,
        attempt: item.attempts + 1,
      })
      processed++
      consecutiveItemFailures = 0
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      const attempts = (item as any).attempts + 1
      const exhausted = attempts >= (item as any).max_attempts
      const retryAt = new Date(Date.now() + backoffMs(attempts)).toISOString()
      await supabase.from("ai_processing_queue").update({
        status: exhausted ? "failed" : "pending",
        error: exhausted ? `Rejected: ${error.slice(0, 250)} (after ${attempts} attempts)` : `Retry #${attempts} scheduled: ${error.slice(0, 200)}`,
        attempts,
        completed_at: exhausted ? new Date().toISOString() : null,
        next_retry_at: exhausted ? null : retryAt,
      }).eq("id", item.id)
      await traceEvent(supabase, item.job_id, exhausted ? "failed" : "retried", { reason: error.slice(0, 200), attempt: attempts })
      failed++
      consecutiveItemFailures++
    }
  }

  // Circuit breaker: when providers are quota-collapsed (item failures in a
  // row), stop the link instead of burning attempts into a dead pool. The
  // chain sees processed===0 and stops draining until the next window.
  let consecutiveItemFailures = 0

  const workers = Array.from({ length: Math.min(concurrency, queueItems.length) }, async (_, workerIdx) => {
    // Stagger worker starts to avoid synchronized provider bursts
    if (workerIdx > 0) await new Promise(r => setTimeout(r, workerIdx * 900))
    while (Date.now() - loopStart < 240000) {
      if (consecutiveItemFailures >= 12) break
      const item = queueItems[cursor++]
      if (!item) break
      await processOne(item)
    }
  })
  await Promise.all(workers)

  // Log final stats
  console.log(JSON.stringify({ scope: "ai_engine", event: "queue_done", processed, failed, skippedClaim, circuitTripped: consecutiveItemFailures >= 12, concurrency, elapsedMs: Date.now() - loopStart }))

  return { processed, failed, skippedClaim }
}
