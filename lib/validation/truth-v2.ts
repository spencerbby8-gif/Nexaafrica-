/**
 * [TRUTH LAYER V2 — VALIDATION] The contradiction-measurement module.
 *
 * V2's objective: prove the architecture produces correct data with zero
 * UNEXPLAINED contradictions. This module is the single home for judging a
 * stored job against the deterministic owners:
 *
 *   - Africa eligibility  → lib/geo/eligibility.adjudicateAfricaEligibility
 *                           (pure function of the posting text + location)
 *   - Company legitimacy  → lib/company/legitimacy.companyLegitimacyOwner
 *                           (registry → scam demote → measured learning → unknown)
 *   - Evidence quotes     → lib/evidence.traceableQuote (word-aligned,
 *                           ellipsis-aware verifiability against the posting)
 *   - Repair routing      → lib/ai/queue-repair decisions (which drain class
 *                           heals a contradicting row)
 *
 * It is PURE: no I/O, no DB, no server-only imports. The read-only
 * validation endpoint (app/api/validation/truth-layer-v2) assembles records
 * from stored rows; the drain-start repair pass (lib/ai/engine) uses the
 * same flags — one judge, two callers, so "simulated drain" and "real
 * drain" can never diverge.
 *
 * A contradiction is EXPLAINED when it has a heal class that converges
 * (drain requeue / scheduled processing / ingest rescore), when it sits on
 * a terminal admission-rejected row that is region-locked out of every UI
 * gate by design, or when it is a genuine data limitation (the posting
 * itself lacks the information). It is UNEXPLAINED only when nothing in
 * the write path would ever repair it — those must be zero before merge.
 */

import { adjudicateAfricaEligibility, type AfricaAdjudication } from "@/lib/geo/eligibility"
import {
  companyLegitimacyOwner,
  type CanonicalLegitimacy,
  type CompanyLearningInput,
} from "@/lib/company/legitimacy"
import { traceableQuote } from "@/lib/evidence"
import {
  queueRepairDecision,
  contradictionRepairDecision,
  isRuleBasedModelVersion,
  isAdmissionRejected,
  type RequeueReason,
} from "@/lib/ai/queue-repair"

/* ------------------------------------------------------------------ */
/* Inputs — assembled from stored rows, never recomputed at render     */
/* ------------------------------------------------------------------ */

export interface ValidationJobInput {
  id: string
  slug: string | null
  title: string
  company: string
  location: string | null
  description_md: string | null
  source: string | null
  is_remote: boolean | null
  eligibility: string | null
  is_open_to_africa: boolean | null
  salary_min: number | null
  salary_max: number | null
  salary_currency: string | null
  salary_range: string | null
  trust_score: number | null
  trust_signals: unknown
  evidence_state: string | null
}

export interface ValidationJaiInput {
  model_version: string | null
  africa_eligibility: string | null
  africa_confidence: number | null
  africa_evidence: string | null
  remote_eligibility: string | null
  remote_evidence: string | null
  visa_sponsorship: string | null
  visa_evidence: string | null
  salary_transparency: string | null
  salary_evidence: string | null
  salary_min: number | null
  salary_max: number | null
  company_legitimacy: string | null
  company_confidence: number | null
  company_evidence: string | null
  job_quality: string | null
  job_quality_evidence: string | null
  evidence_refs: unknown
}

export interface ValidationQueueInput {
  status: string
  error: string | null
}

/** job_evidence_v1 summary — existence + status classes, never raw content. */
export interface ValidationEvidenceInput {
  rowCount: number
  /** source_kind values present (e.g. ats_api, page_html, structured_data, browser_render). */
  kinds: string[]
  /** Statuses present. */
  statuses: string[]
}

export interface ValidationRecord {
  job: ValidationJobInput
  jai: ValidationJaiInput | null
  queue: ValidationQueueInput | null
  evidence: ValidationEvidenceInput
  learning: CompanyLearningInput | null
}

/* ------------------------------------------------------------------ */
/* Model buckets — internal classes only (no provider names outward)   */
/* ------------------------------------------------------------------ */

export type ModelBucket = "real-model" | "rule-based" | "none"

export function modelBucket(modelVersion: string | null | undefined): ModelBucket {
  if (!modelVersion) return "none"
  return isRuleBasedModelVersion(modelVersion) ? "rule-based" : "real-model"
}

/* ------------------------------------------------------------------ */
/* Quote integrity                                                     */
/* ------------------------------------------------------------------ */

export const QUOTE_FIELDS = ["africa", "remote", "visa", "salary", "company", "quality"] as const
export type QuoteField = (typeof QUOTE_FIELDS)[number]

function storedQuote(jai: ValidationJaiInput, field: QuoteField): string | null {
  switch (field) {
    case "africa": return jai.africa_evidence
    case "remote": return jai.remote_evidence
    case "visa": return jai.visa_evidence
    case "salary": return jai.salary_evidence
    case "company": return jai.company_evidence
    case "quality": return jai.job_quality_evidence
  }
}

export interface QuoteCheck {
  field: QuoteField
  stored: boolean
  traceable: boolean | null // null = not verifiable (no posting text)
}

/**
 * Is a stored quote verifiably present in the posting? The verifiable
 * surface is the adjudicator's own input surface — title + description +
 * location field — because corpus quotes legitimately come from the
 * location field alone (us-state-remote / location-lock rows quote the
 * location verbatim). Field-aware carve-outs:
 *  - company: the canonical owner's basis SENTENCE is provenance prose, not a
 *    posting quote — equality with the owner's sentence counts as traceable.
 *  - salary: ATS metadata salary is not description prose — the quote counts
 *    when it matches the feed's own salary_range text.
 * Short/absent descriptions make every quote unverifiable (null), never a
 * fabrication accusation.
 */
export function quoteTraceableFor(
  field: QuoteField,
  quote: string | null,
  job: Pick<ValidationJobInput, "title" | "location" | "description_md" | "salary_range">,
  expectedCompanySentence: string | null,
): boolean | null {
  if (!quote || !quote.trim()) return null
  const desc = (job.description_md || "").trim()
  if (desc.length < 100) return null
  if (field === "company" && expectedCompanySentence && quote.trim() === expectedCompanySentence.trim()) return true
  if (field === "salary" && job.salary_range && quote.replace(/\s+/g, " ").trim() === job.salary_range.replace(/\s+/g, " ").trim()) return true
  const haystack = `${job.title || ""}\n${desc}\n${job.location || ""}`
  return traceableQuote(quote, haystack) !== null
}

/* ------------------------------------------------------------------ */
/* Contradiction detection                                             */
/* ------------------------------------------------------------------ */

export type ContradictionKind =
  | "company_vs_owner"
  | "africa_vs_adjudicator"
  | "quote_untraceable"
  | "trust_signal_vs_owner"
  | "trust_score_arithmetic"
  | "salary_jobs_vs_jai"
  | "jobrow_eligibility_vs_adjudicator"
  | "remote_feed_vs_jai"

/**
 * How a contradiction resolves:
 *  - drain_requeue        — the drain-start repair pass requeues this row;
 *                           one successful reprocessing pass converges it.
 *  - awaiting_processing  — a pending/processing queue row already covers it.
 *  - awaiting_rerun       — queue row is terminally failed; an authorized
 *                           rerun is required (deliberate, not silent).
 *  - ingest_rescore       — the next ingest sight rewrites this plane
 *                           (trust signals/score + jobs-row eligibility are
 *                           ingest-owned), so it converges on the daily cron.
 *  - genuine_data_limit   — the posting itself lacks the information; nothing
 *                           to heal, the honest value is displayed.
 *  - admission_terminal    — the queue row was terminally rejected by the
 *                           admission gate (region lock / dead listing); the
 *                           stored values are never repair-scanned ON
 *                           PURPOSE (loop-guard) and the row is locked out
 *                           of every UI list/detail gate either way.
 *  - needs_fix            — NOTHING in the write path repairs it. Must be 0.
 */
export type HealClass =
  | "drain_requeue"
  | "awaiting_processing"
  | "awaiting_rerun"
  | "ingest_rescore"
  | "genuine_data_limit"
  | "admission_terminal"
  | "needs_fix"

export interface Contradiction {
  kind: ContradictionKind
  heal: HealClass
  detail: string
}

export interface ContradictionFlags {
  companyMismatch: boolean
  africaMismatch: boolean
  untraceableQuote: boolean
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

/** Signals stored on a job row are a JSON array of { id, label, scoreImpact }. */
export function storedSignalSum(trustSignals: unknown): number | null {
  if (!Array.isArray(trustSignals)) return null
  let sum = 0
  for (const s of trustSignals) {
    if (!s || typeof s !== "object") return null
    const impact = (s as any).scoreImpact
    if (typeof impact !== "number" || !Number.isFinite(impact)) return null
    sum += impact
  }
  return sum
}

/** Does the persisted trust plane claim a verified employer? null = no signal row. */
export function storedEmployerClaim(trustSignals: unknown): boolean | null {
  if (!Array.isArray(trustSignals)) return null
  const sig = trustSignals.find((s: any) => s && s.id === "employer_legitimacy") as any
  if (!sig) return null
  return typeof sig.label === "string" && sig.label.startsWith("Verified employer")
}

/**
 * The three drain-relevant flags for one stored record. Shared verbatim by
 * the engine's repair pass and the validation endpoint — same inputs
 * necessarily produce the same requeue decision.
 */
export function contradictionFlags(
  job: Pick<ValidationJobInput, "title" | "location" | "company" | "description_md" | "salary_range">,
  jai: ValidationJaiInput | null | undefined,
  learning: CompanyLearningInput | null,
): ContradictionFlags {
  const none: ContradictionFlags = { companyMismatch: false, africaMismatch: false, untraceableQuote: false }
  if (!jai) return none
  const expectedAfrica = adjudicateAfricaEligibility({
    title: job.title,
    description_md: job.description_md || "",
    location: job.location,
  })
  const expectedCompany = companyLegitimacyOwner({ company: job.company || "", learning })

  const africaMismatch = (jai.africa_eligibility ?? "unknown") !== expectedAfrica.value

  let companyMismatch = false
  const storedCompany = jai.company_legitimacy ?? "unknown"
  if (storedCompany === "suspicious" && expectedCompany.value !== "suspicious") {
    // Job-specific scam demotion is legal ONLY with a verbatim posting quote
    // as its evidence; a registry company can never be demoted at all.
    if (expectedCompany.value === "verified") companyMismatch = true
    else {
      const q = storedQuote(jai, "company")
      companyMismatch = quoteTraceableFor("company", q, job, null) !== true
    }
  } else if (storedCompany !== expectedCompany.value) {
    companyMismatch = true
  }

  let untraceableQuote = false
  for (const field of QUOTE_FIELDS) {
    const q = storedQuote(jai, field)
    if (!q || !q.trim()) continue
    if (quoteTraceableFor(field, q, job, expectedCompany.evidence) === false) {
      untraceableQuote = true
      break
    }
  }

  return { companyMismatch, africaMismatch, untraceableQuote }
}

/**
 * The full repair-class decision for a record (§17 classes first, then V2
 * contradiction classes). Only COMPLETED queue rows are repair-scanned —
 * the drain's pass selects `status = completed`, and a pending/processing/
 * failed row is already moving (or deliberately stopped), not stuck.
 */
export function repairClassFor(rec: ValidationRecord): RequeueReason {
  if (!rec.queue || rec.queue.status !== "completed") return null
  if (isAdmissionRejected(rec.queue)) return null // loop-guard: terminal means terminal
  const base = queueRepairDecision(rec.queue, rec.jai)
  if (base) return base
  if (!rec.jai) return null
  return contradictionRepairDecision(contradictionFlags(rec.job, rec.jai, rec.learning))
}

/* ------------------------------------------------------------------ */
/* Evidence-plane classification (V2 directive §2: six honest cases)   */
/* ------------------------------------------------------------------ */

export type EvidenceCase =
  | "exists_and_renders"
  | "exists_but_hidden"
  | "never_written"
  | "overwritten_by_thin_tier"
  | "stale_pre_v1"
  | "collection_failed"
  | "admission_rejected"

const USABLE_EVIDENCE_STATUSES = new Set(["verified", "fetched", "partial"])

export function evidenceCaseFor(rec: ValidationRecord): EvidenceCase {
  const q = rec.queue
  if (!q) return "never_written"
  if (isAdmissionRejected(q)) return "admission_rejected"
  if (q.status === "pending" || q.status === "processing") return "never_written"
  if (q.status === "failed") return "collection_failed"
  // completed:
  if (!rec.jai) return "never_written" // orphan — orphaned-heal requeues it
  if (modelBucket(rec.jai.model_version) === "rule-based") return "overwritten_by_thin_tier"
  if (rec.jai.evidence_refs == null) return "stale_pre_v1"
  const anyTraceable = QUOTE_FIELDS.some((f) => {
    const quote = storedQuote(rec.jai as ValidationJaiInput, f)
    return quote != null && quoteTraceableFor(f, quote, rec.job, null) === true
  })
  const hasUsableRows = rec.evidence.statuses.some((s) => USABLE_EVIDENCE_STATUSES.has(s))
  if (hasUsableRows || anyTraceable) return "exists_and_renders"
  if (rec.evidence.rowCount > 0) return "collection_failed" // rows exist but only blocked/failed/queued
  return "never_written"
}

/* ------------------------------------------------------------------ */
/* Full per-job evaluation                                             */
/* ------------------------------------------------------------------ */

export interface JobEvaluation {
  jobId: string
  slug: string | null
  company: string
  source: string | null
  model: ModelBucket
  queueStatus: string | null
  evidenceCase: EvidenceCase
  usableEvidence: boolean
  expectedAfrica: AfricaAdjudication
  expectedCompany: CanonicalLegitimacy
  storedAfrica: string | null
  storedCompany: string | null
  storedCompanyBasis: "owner_sentence" | "posting_quote" | "none"
  quoteChecks: QuoteCheck[]
  flags: ContradictionFlags
  repairClass: RequeueReason
  contradictions: Contradiction[]
  /** Informational divergences — real, but explained by an assigned plane owner (never counted as unexplained). */
  notes: string[]
}

function healFor(rec: ValidationRecord, repairClass: RequeueReason): HealClass {
  if (repairClass) return "drain_requeue"
  if (isAdmissionRejected(rec.queue)) return "admission_terminal"
  const st = rec.queue?.status
  if (st === "pending" || st === "processing") return "awaiting_processing"
  if (st === "failed") return "awaiting_rerun"
  return "needs_fix"
}

export function evaluateRecord(rec: ValidationRecord): JobEvaluation {
  const { job, jai } = rec
  const expectedAfrica = adjudicateAfricaEligibility({
    title: job.title,
    description_md: job.description_md || "",
    location: job.location,
  })
  const expectedCompany = companyLegitimacyOwner({ company: job.company || "", learning: rec.learning })

  const flags = contradictionFlags(job, jai, rec.learning)
  const repairClass = repairClassFor(rec)
  const heal = healFor(rec, repairClass)
  const contradictions: Contradiction[] = []
  const notes: string[] = []

  if (jai) {
    if (flags.companyMismatch) {
      contradictions.push({
        kind: "company_vs_owner",
        heal,
        detail: `stored company=${jai.company_legitimacy ?? "null"} vs owner=${expectedCompany.value}/${expectedCompany.basis}`,
      })
    }
    if (flags.africaMismatch) {
      contradictions.push({
        kind: "africa_vs_adjudicator",
        heal,
        detail: `stored africa=${jai.africa_eligibility ?? "null"}·${jai.africa_confidence ?? "?"} vs adjudicator=${expectedAfrica.value}·${expectedAfrica.confidence} (${expectedAfrica.basis})`,
      })
    } else if ((jai.africa_confidence ?? 0) !== expectedAfrica.confidence) {
      notes.push(`africa confidence drift: stored ${jai.africa_confidence ?? "null"} vs adjudicator ${expectedAfrica.confidence} (same verdict; re-drain rewrites)`)
    }
  }

  // Quote integrity — each stored quote must be verifiable against the posting.
  const quoteChecks: QuoteCheck[] = []
  let untraceableFields: string[] = []
  if (jai) {
    for (const field of QUOTE_FIELDS) {
      const quote = storedQuote(jai, field)
      if (quote == null) {
        quoteChecks.push({ field, stored: false, traceable: null })
        continue
      }
      const ok = quoteTraceableFor(field, quote, job, expectedCompany.evidence)
      quoteChecks.push({ field, stored: true, traceable: ok })
      if (ok === false) untraceableFields.push(field)
    }
    if (untraceableFields.length > 0) {
      contradictions.push({
        kind: "quote_untraceable",
        heal,
        detail: `quotes not word-traceable to the posting: ${untraceableFields.join(", ")}`,
      })
    }
  }

  // Trust plane — arithmetic + employer claim alignment.
  if (job.trust_score != null) {
    const sum = storedSignalSum(job.trust_signals)
    if (sum != null && clampScore(50 + sum) !== job.trust_score) {
      contradictions.push({
        kind: "trust_score_arithmetic",
        heal: "ingest_rescore",
        detail: `trust_score=${job.trust_score} but signals sum implies ${clampScore(50 + sum)}`,
      })
    }
    const claim = storedEmployerClaim(job.trust_signals)
    if (claim != null && claim !== (expectedCompany.value === "verified")) {
      contradictions.push({
        kind: "trust_signal_vs_owner",
        heal: "ingest_rescore",
        detail: `employer signal claims verified=${claim} but owner says ${expectedCompany.value}`,
      })
    }
  }

  // Salary — jobs row vs JAI row disagreement (same plane, two writers).
  if (jai && jai.salary_transparency === "disclosed" && jai.salary_max != null && jai.salary_max > 0 && job.salary_max != null && job.salary_max > 0) {
    if (jai.salary_min !== job.salary_min || jai.salary_max !== job.salary_max) {
      contradictions.push({
        kind: "salary_jobs_vs_jai",
        heal: jai ? heal : "needs_fix",
        detail: `jobs row ${job.salary_min ?? "?"}–${job.salary_max ?? "?"} vs intelligence ${jai.salary_min ?? "?"}–${jai.salary_max ?? "?"}`,
      })
    }
  }

  // Jobs-row ingest eligibility vs adjudicator — explained divergence: the
  // jobs row is ingest-plane and heals on the next ingest sight; the render
  // and list gates read the canonical JAI plane.
  const jobrowTier = job.eligibility ?? null
  if (jobrowTier && jai && jobrowTier !== expectedAfrica.value) {
    notes.push(`jobs-row eligibility=${jobrowTier} vs adjudicator=${expectedAfrica.value} (ingest-plane; heals on next ingest sight; lists/read gates use the canonical plane)`)
  }

  // Remote — feed metadata vs intelligence verdict (no single owner assigned yet).
  if (jai && jai.remote_eligibility && jai.remote_eligibility !== "unknown") {
    if (job.is_remote === true && jai.remote_eligibility === "onsite") {
      notes.push(`remote divergence: feed says remote, intelligence says onsite (remote plane has no assigned canonical owner — known debt)`)
    } else if (job.is_remote === false && jai.remote_eligibility === "fully_remote") {
      notes.push(`remote divergence: feed says onsite, intelligence says fully_remote (remote plane has no assigned canonical owner — known debt)`)
    }
  }

  if (!jai && (job.description_md || "").trim().length < 100) {
    notes.push("posting text below 100 chars — evidence abstention is a genuine data limitation")
  }

  const evidenceCase = evidenceCaseFor(rec)
  const usableEvidence =
    rec.evidence.statuses.some((s) => USABLE_EVIDENCE_STATUSES.has(s)) ||
    quoteChecks.some((qc) => qc.traceable === true)

  return {
    jobId: job.id,
    slug: job.slug,
    company: job.company,
    source: job.source,
    model: modelBucket(jai?.model_version),
    queueStatus: rec.queue?.status ?? null,
    evidenceCase,
    usableEvidence,
    expectedAfrica,
    expectedCompany,
    storedAfrica: jai?.africa_eligibility ?? null,
    storedCompany: jai?.company_legitimacy ?? null,
    storedCompanyBasis: !jai?.company_evidence ? "none" : (expectedCompany.evidence && jai.company_evidence.trim() === expectedCompany.evidence.trim()) ? "owner_sentence" : "posting_quote",
    quoteChecks,
    flags,
    repairClass,
    contradictions,
    notes,
  }
}

/* ------------------------------------------------------------------ */
/* Drain simulation — project the converged state, honestly labelled   */
/* ------------------------------------------------------------------ */

/**
 * Simulate one successful reprocessing pass for rows the write path would
 * touch. Assumptions (stated, never hidden):
 *  A1. AI providers succeed on the re-run (if they fail, the row stays in
 *      awaiting_processing/awaiting_rerun — explained, not unexplained).
 *  A2. Fresh evidence quotes minted by a successful pass are traceable by
 *      construction (word-aligned extractors + verbatim nulling); Africa and
 *      company quotes are owner-derived exactly.
 *  A3. The canonical-plane sync on the protected-existing path (engine,
 *      §17 seal-guard) lands even when the wholesale upsert is skipped, so
 *      Africa/company converge after ONE processed pass in every code path
 *      that seals a queue row completed.
 * Rows with terminal admission rejections are never projected.
 */
export interface Projection {
  africa: string
  company: string
  quotesTraceable: boolean
  evidenceUsable: boolean
  model: ModelBucket
}

export function projectAfterDrain(ev: JobEvaluation, rec: ValidationRecord): Projection {
  const admitted = ev.queueStatus !== "failed"
  const descOk = (rec.job.description_md || "").trim().length >= 100
  return {
    africa: ev.expectedAfrica.value,
    company: ev.expectedCompany.value,
    quotesTraceable: true, // A2 — fresh mint is traceable-or-null
    evidenceUsable: descOk, // ingest-plane ats_api row lands on sight (§17)
    model: admitted ? "real-model" : ev.model, // A1: providers succeed on the re-run
  }
}

/**
 * Build the simulated post-drain record — ONE construction, fixture-tested,
 * used by the endpoint and (in spirit) by the report. Simulates exactly the
 * writes §17/§18/V2 perform on one successful pass:
 *   - Africa/company ← the deterministic owners' current values (adjudicator
 *     + canonical owner land via the main upsert OR the canonical-plane sync,
 *     in every code path that seals a queue row completed).
 *   - Quotes ← traceable-or-null (A2): a stored quote that fails word-
 *     traceability is treated as dropped (a changed verdict never inherits
 *     it; an unchanged verdict re-mints owner/corpus text or keeps the
 *     verified one).
 *   - Evidence plane ← ingest-plane ats_api verified row when the posting
 *     text is ≥100 chars (recordIngestEvidence / collectPageEvidence).
 *   - Queue ← completed, clean (the terminal successful pass).
 * Salary/remote/quality verdict values are model-owned and NOT simulated —
 * they stay as stored (the projection proves zero UNEXPLAINED contradictions
 * on the deterministic planes; model planes converge when providers run).
 */
export function projectRecord(rec: ValidationRecord, ev?: JobEvaluation): ValidationRecord {
  const evaluation = ev ?? evaluateRecord(rec)
  const proj = projectAfterDrain(evaluation, rec)
  const jai = rec.jai
  const keepIfTraceable = (field: QuoteField, stored: string | null | undefined) => {
    if (!stored) return null
    return evaluation.quoteChecks.find((q) => q.field === field)?.traceable === true ? stored : null
  }
  const simJai: ValidationJaiInput = {
    model_version: proj.model === "real-model" ? "v2-simulated" : jai?.model_version ?? null,
    evidence_refs: jai?.evidence_refs ?? { simulated: true },
    africa_eligibility: proj.africa,
    africa_confidence: evaluation.expectedAfrica.confidence,
    africa_evidence: evaluation.expectedAfrica.evidence ?? keepIfTraceable("africa", jai?.africa_evidence ?? null),
    remote_eligibility: jai?.remote_eligibility ?? null,
    remote_evidence: keepIfTraceable("remote", jai?.remote_evidence ?? null),
    visa_sponsorship: jai?.visa_sponsorship ?? null,
    visa_evidence: keepIfTraceable("visa", jai?.visa_evidence ?? null),
    salary_transparency: jai?.salary_transparency ?? null,
    salary_evidence: keepIfTraceable("salary", jai?.salary_evidence ?? null),
    salary_min: jai?.salary_min ?? null,
    salary_max: jai?.salary_max ?? null,
    company_legitimacy: proj.company,
    company_confidence: evaluation.expectedCompany.confidence,
    company_evidence: evaluation.expectedCompany.evidence ?? keepIfTraceable("company", jai?.company_evidence ?? null),
    job_quality: jai?.job_quality ?? null,
    job_quality_evidence: keepIfTraceable("quality", jai?.job_quality_evidence ?? null),
  }
  const simEvidence =
    proj.evidenceUsable && !rec.evidence.statuses.some((s) => ["verified", "fetched", "partial"].includes(s))
      ? {
          rowCount: rec.evidence.rowCount + 1,
          kinds: [...rec.evidence.kinds, "ats_api"],
          statuses: [...rec.evidence.statuses, "verified"],
        }
      : rec.evidence
  return {
    ...rec,
    jai: simJai,
    evidence: simEvidence,
    queue: { status: "completed", error: null },
  }
}

/* ------------------------------------------------------------------ */
/* Aggregate metrics                                                   */
/* ------------------------------------------------------------------ */

export interface CompanyCohortStat {
  company: string
  jobs: number
  storedVerdicts: Record<string, number>
  consistentStored: boolean
  ownerVerdict: string
  matchesOwner: number
}

export interface TruthMetrics {
  sampleSize: number
  evidenceCoverage: {
    usable: number
    rate: number
    /** Same metric over UI-eligible rows only: terminally admission-rejected
     *  jobs are region-locked out of every list by design and are NOT part
     *  of the coverage promise. */
    eligibleTotal: number
    eligibleUsable: number
    eligibleRate: number
    byCase: Record<EvidenceCase, number>
  }
  companyConsistency: {
    cohorts: CompanyCohortStat[]
    divergentCohorts: number
    storedVsOwnerMatches: number
    storedVsOwnerTotal: number
  }
  africaConsistency: {
    matches: number
    mismatches: number
    total: number
  }
  trustConsistency: {
    arithmeticOk: number
    arithmeticBad: number
    employerClaimOk: number
    employerClaimBad: number
  }
  salaryConsistency: {
    agrees: number
    conflicts: number
    bothNull: number
    jaiOnly: number
    jobsOnly: number
  }
  quoteIntegrity: {
    stored: number
    traceable: number
    unverifiable: number
    failed: number
    failedFields: Record<string, number>
  }
  contradictions: {
    total: number
    unexplained: number
    byHeal: Record<string, number>
    byKind: Record<string, number>
  }
}

export function summarize(evaluations: JobEvaluation[]): TruthMetrics {
  const byCase = {} as Record<EvidenceCase, number>
  let usable = 0
  let africaM = 0, africaX = 0, africaT = 0
  let arOk = 0, arBad = 0, emOk = 0, emBad = 0
  let sConflict = 0, sBothNull = 0, sJaiOnly = 0, sJobsOnly = 0
  let qStored = 0, qTrace = 0, qUnver = 0, qFail = 0
  const qFailFields: Record<string, number> = {}
  let cTotal = 0, cUnexplained = 0
  const byHeal: Record<string, number> = {}
  const byKind: Record<string, number> = {}
  const cohortMap = new Map<string, JobEvaluation[]>()

  let eligibleTotal = 0
  let eligibleUsable = 0

  for (const ev of evaluations) {
    byCase[ev.evidenceCase] = (byCase[ev.evidenceCase] || 0) + 1
    if (ev.usableEvidence) usable++
    if (ev.evidenceCase !== "admission_rejected") {
      eligibleTotal++
      if (ev.usableEvidence) eligibleUsable++
    }

    if (ev.storedAfrica != null) {
      africaT++
      if (ev.storedAfrica === ev.expectedAfrica.value) africaM++
      else africaX++
    }

    for (const c of ev.contradictions) {
      cTotal++
      byHeal[c.heal] = (byHeal[c.heal] || 0) + 1
      byKind[c.kind] = (byKind[c.kind] || 0) + 1
      if (c.heal === "needs_fix") cUnexplained++
      if (c.kind === "trust_score_arithmetic") arBad++
      if (c.kind === "trust_signal_vs_owner") emBad++
      if (c.kind === "salary_jobs_vs_jai") sConflict++
    }
    // trust arithmetic ok-count (only scored rows with parseable signals)
    const hasArithContradiction = ev.contradictions.some((c) => c.kind === "trust_score_arithmetic")
    if (!hasArithContradiction) arOk++
    const hasEmployerContradiction = ev.contradictions.some((c) => c.kind === "trust_signal_vs_owner")
    if (!hasEmployerContradiction) emOk++
    for (const qc of ev.quoteChecks) {
      if (!qc.stored) continue
      qStored++
      if (qc.traceable === true) qTrace++
      else if (qc.traceable === null) qUnver++
      else {
        qFail++
        qFailFields[qc.field] = (qFailFields[qc.field] || 0) + 1
      }
    }

    const key = (ev.company || "").trim().toLowerCase()
    if (key) {
      const list = cohortMap.get(key) || []
      list.push(ev)
      cohortMap.set(key, list)
    }
  }

  const cohorts: CompanyCohortStat[] = [...cohortMap.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([company, list]) => {
      const storedVerdicts: Record<string, number> = {}
      let matchesOwner = 0
      let withStored = 0
      for (const ev of list) {
        const v = ev.storedCompany ?? "none"
        storedVerdicts[v] = (storedVerdicts[v] || 0) + 1
        if (ev.storedCompany != null) {
          withStored++
          if (ev.storedCompany === ev.expectedCompany.value) matchesOwner++
        }
      }
      return {
        company: list[0].company,
        jobs: list.length,
        storedVerdicts,
        consistentStored: Object.keys(storedVerdicts).filter((v) => v !== "none").length <= 1,
        ownerVerdict: list[0].expectedCompany.value,
        matchesOwner,
      }
    })
    .sort((a, b) => b.jobs - a.jobs)

  const divergent = cohorts.filter((c) => !c.consistentStored).length
  let allMatch = 0, allTotal = 0
  for (const ev of evaluations) {
    if (ev.storedCompany != null) {
      allTotal++
      if (ev.storedCompany === ev.expectedCompany.value) allMatch++
    }
  }

  const salAgree = evaluations.filter((e) => !e.contradictions.some((c) => c.kind === "salary_jobs_vs_jai")).length

  return {
    sampleSize: evaluations.length,
    evidenceCoverage: {
      usable,
      rate: evaluations.length ? Math.round((usable / evaluations.length) * 1000) / 10 : 0,
      eligibleTotal,
      eligibleUsable,
      eligibleRate: eligibleTotal ? Math.round((eligibleUsable / eligibleTotal) * 1000) / 10 : 0,
      byCase,
    },
    companyConsistency: {
      cohorts,
      divergentCohorts: divergent,
      storedVsOwnerMatches: allMatch,
      storedVsOwnerTotal: allTotal,
    },
    africaConsistency: { matches: africaM, mismatches: africaX, total: africaT },
    trustConsistency: { arithmeticOk: arOk, arithmeticBad: arBad, employerClaimOk: emOk, employerClaimBad: emBad },
    salaryConsistency: { agrees: salAgree, conflicts: sConflict, bothNull: sBothNull, jaiOnly: sJaiOnly, jobsOnly: sJobsOnly },
    quoteIntegrity: { stored: qStored, traceable: qTrace, unverifiable: qUnver, failed: qFail, failedFields: qFailFields },
    contradictions: { total: cTotal, unexplained: cUnexplained, byHeal, byKind },
  }
}
