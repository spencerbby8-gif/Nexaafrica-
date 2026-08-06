import { NextRequest, NextResponse } from "next/server"

/**
 * [TRUTH LAYER V2 — VALIDATION ENDPOINT] Read-only proof lane.
 *
 * Measures, from stored rows ONLY (no AI calls, no writes):
 *   1. Evidence coverage        — how many active jobs have usable evidence,
 *                                 and which of the six honest cases every
 *                                 sampled job falls into.
 *   2. Zero contradictions      — stored Africa/company verdicts vs the
 *                                 deterministic owners, trust arithmetic,
 *                                 salary plane agreement, quote integrity.
 *   3. Simulated drain          — runs the drain-start repair decision (the
 *                                 SAME pure functions lib/ai/engine.ts uses)
 *                                 over the completed queue and projects the
 *                                 converged state: regex rows → real-model
 *                                 rows, pre-V1 rows → evidence-plane rows,
 *                                 company legitimacy → one verdict per company.
 *   4. Cohort audit             — named-company cohorts (Reddit, Pinterest,
 *                                 MongoDB, Stripe) + stratified samples across
 *                                 remoteok/greenhouse/ashby/lever. 50–100 jobs.
 *
 * Privacy/secrecy: model versions are reported as internal buckets only
 * (real-model | rule-based | none) — provider names never leave the server.
 * Evidence table contents are never returned; only counts/kinds/statuses.
 *
 * READ-ONLY: every Supabase call below is a select. There are no writes,
 * no upserts, no RPCs — preview lane, zero mutation by contract.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { createServiceClient } from "@/lib/supabase/service"
import {
  evaluateRecord,
  summarize,
  projectRecord,
  contradictionFlags,
  type ValidationRecord,
  type ValidationEvidenceInput,
  type ValidationJaiInput,
  type JobEvaluation,
} from "@/lib/validation/truth-v2"
import {
  queueRepairDecision,
  contradictionRepairDecision,
  isTerminalAdmissionError,
  type RequeueReason,
} from "@/lib/ai/queue-repair"
import type { CompanyLearningInput } from "@/lib/company/legitimacy"

const JOB_COLS =
  "id, slug, title, company, location, description_md, source, is_remote, eligibility, is_open_to_africa, salary_min, salary_max, salary_currency, salary_range, trust_score, trust_signals, evidence_state, created_at"
const JAI_COLS =
  "job_id, model_version, evidence_refs, africa_eligibility, africa_confidence, africa_evidence, remote_eligibility, remote_evidence, visa_sponsorship, visa_evidence, salary_transparency, salary_evidence, salary_min, salary_max, company_legitimacy, company_confidence, company_evidence, job_quality, job_quality_evidence"

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const clampInt = (raw: string | null, def: number, min: number, max: number) => {
  const n = parseInt(raw || "", 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

/* Assemble validation records for a set of job rows (chunked lookups). */
async function assemble(sb: any, jobs: any[]): Promise<ValidationRecord[]> {
  const ids = jobs.map((j) => j.id)
  const jaiRows = new Map<string, any>()
  const queueRows = new Map<string, any>()
  const evidenceByJob = new Map<string, ValidationEvidenceInput>()

  for (const idsChunk of chunk(ids, 100)) {
    const [{ data: jai }, { data: queue }, { data: ev }] = await Promise.all([
      sb.from("job_ai_intelligence").select(JAI_COLS).in("job_id", idsChunk),
      sb.from("ai_processing_queue").select("job_id, status, error").in("job_id", idsChunk),
      sb.from("job_evidence_v1").select("job_id, source_kind, status").in("job_id", idsChunk),
    ])
    for (const r of jai || []) jaiRows.set(r.job_id, r)
    for (const r of queue || []) queueRows.set(r.job_id, r)
    for (const r of ev || []) {
      const cur = evidenceByJob.get(r.job_id) || { rowCount: 0, kinds: [], statuses: [] }
      cur.rowCount++
      if (!cur.kinds.includes(r.source_kind)) cur.kinds.push(r.source_kind)
      if (r.status && !cur.statuses.includes(r.status)) cur.statuses.push(r.status)
      evidenceByJob.set(r.job_id, cur)
    }
  }

  const companies = [...new Set(jobs.map((j) => (j.company || "").trim()).filter(Boolean))]
  const learning = new Map<string, CompanyLearningInput>()
  for (const names of chunk(companies, 100)) {
    const { data } = await sb
      .from("company_intelligence")
      .select("company, total_jobs, verification_rate, hiring_velocity_30d")
      .in("company", names)
    for (const ci of data || []) {
      learning.set((ci as any).company, {
        totalRoles: Number((ci as any).total_jobs) || 0,
        verificationRate: typeof (ci as any).verification_rate === "number" ? (ci as any).verification_rate : null,
        roles30d: Number((ci as any).hiring_velocity_30d) || 0,
      })
    }
  }

  return jobs.map((j) => ({
    job: j,
    jai: (jaiRows.get(j.id) ?? null) as ValidationJaiInput | null,
    queue: queueRows.get(j.id) ?? null,
    evidence: evidenceByJob.get(j.id) ?? { rowCount: 0, kinds: [], statuses: [] },
    learning: learning.get((j.company || "").trim()) ?? null,
  }))
}

/** Compact per-job row for the audit (no quotes, no provider names). */
function jobRow(ev: JobEvaluation) {
  return {
    slug: ev.slug,
    co: ev.company,
    src: ev.source,
    mdl: ev.model === "real-model" ? "R" : ev.model === "rule-based" ? "B" : "-",
    q: ev.queueStatus || "-",
    ev: `${ev.evidenceCase}${ev.usableEvidence ? "+" : ""}`,
    af: `${ev.storedAfrica ?? "-"}→${ev.expectedAfrica.value}`,
    coV: `${ev.storedCompany ?? "-"}→${ev.expectedCompany.value}`,
    quotes: `${ev.quoteChecks.filter((q) => q.traceable === true).length}/${ev.quoteChecks.filter((q) => q.stored).length}`,
    rq: ev.repairClass,
    ctr: ev.contradictions.map((c) => `${c.kind}[${c.heal}]: ${c.detail}`),
    notes: ev.notes.length ? ev.notes : undefined,
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const perSource = clampInt(sp.get("perSource"), 12, 1, 15)
  const cohortN = clampInt(sp.get("cohortN"), 20, 1, 30)
  const scanN = clampInt(sp.get("scan"), 1000, 100, 1000)
  const includeJobs = sp.get("detail") !== "0"
  const extraCompany = (sp.get("company") || "").trim()

  const sb = createServiceClient()

  /* ---------------- Queue health (head counts only) ---------------- */
  const queueHealth: Record<string, number | null> = {}
  for (const st of ["pending", "processing", "completed", "failed"]) {
    try {
      const { count } = await sb.from("ai_processing_queue").select("id", { count: "exact", head: true }).eq("status", st)
      queueHealth[st] = count ?? null
    } catch {
      queueHealth[st] = null
    }
  }

  /* ---------------- Stratified sample (§4 end-to-end audit) -------- */
  const named = ["Reddit", "Pinterest", "MongoDB", "Stripe", ...(extraCompany ? [extraCompany] : [])]
  const sourceBuckets = ["remoteok", "greenhouse", "ashby", "lever"]
  const jobs: any[] = []
  const bucketSizes: Record<string, number> = {}

  for (const name of named) {
    const { data } = await sb
      .from("jobs")
      .select(JOB_COLS)
      .eq("is_active", true)
      .ilike("company", name)
      .order("created_at", { ascending: false })
      .limit(cohortN)
    bucketSizes[`company:${name}`] = (data || []).length
    jobs.push(...(data || []).map((j) => ({ ...j, _bucket: `company:${name}` })))
  }
  for (const src of sourceBuckets) {
    const { data } = await sb
      .from("jobs")
      .select(JOB_COLS)
      .eq("is_active", true)
      .ilike("source", `${src}%`)
      .order("created_at", { ascending: false })
      .limit(perSource)
    bucketSizes[`source:${src}`] = (data || []).length
    jobs.push(...(data || []).map((j) => ({ ...j, _bucket: `source:${src}` })))
  }

  // De-duplicate (a named-company job can also appear in an ATS bucket).
  const seen = new Set<string>()
  const uniqueJobs = jobs.filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)))
  const bucketOf = new Map<string, string>(uniqueJobs.map((j) => [j.id, (j as any)._bucket]))

  const records = await assemble(sb, uniqueJobs)
  const evaluations = records.map((r) => evaluateRecord(r))
  const metrics = summarize(evaluations)

  /* ---------------- Simulated drain (§3) ---------------------------
   * Mirrors processAIQueue's drain-start passes with the SAME pure
   * decisions, over a live scan of the completed queue. */
  const { data: doneRows } = await sb
    .from("ai_processing_queue")
    .select("id, job_id, error")
    .eq("status", "completed")
    .order("created_at", { ascending: true })
    .limit(scanN)

  const simRequeue: Record<string, number> = {}
  const simSamples: Record<string, string[]> = {}
  let simScanned = 0
  let simOrphans = 0
  let simNoQueueRow = 0

  if (doneRows && doneRows.length > 0) {
    simScanned = doneRows.length
    const jobIds = [...new Set(doneRows.map((d: any) => d.job_id))]
    const jaiMap = new Map<string, any>()
    for (const ids of chunk(jobIds, 100)) {
      const { data } = await sb.from("job_ai_intelligence").select(JAI_COLS).in("job_id", ids)
      for (const r of data || []) jaiMap.set(r.job_id, r)
    }
    const basePass = (doneRows as any[]).filter((d) => {
      const jai = jaiMap.get(d.job_id)
      return jai && queueRepairDecision(d, jai) === null
    })
    const jobsMap = new Map<string, any>()
    for (const ids of chunk([...new Set(basePass.map((d: any) => d.job_id))], 100)) {
      if (ids.length === 0) continue
      const { data } = await sb.from("jobs").select("id, title, company, location, description_md, salary_range").in("id", ids)
      for (const j of data || []) jobsMap.set((j as any).id, j)
    }
    const learningMap = new Map<string, CompanyLearningInput>()
    const companyNames = [...new Set([...jobsMap.values()].map((j: any) => (j.company || "").trim()).filter(Boolean))]
    for (const names of chunk(companyNames, 100)) {
      if (names.length === 0) continue
      const { data } = await sb.from("company_intelligence").select("company, total_jobs, verification_rate, hiring_velocity_30d").in("company", names)
      for (const ci of data || []) {
        learningMap.set((ci as any).company, {
          totalRoles: Number((ci as any).total_jobs) || 0,
          verificationRate: typeof (ci as any).verification_rate === "number" ? (ci as any).verification_rate : null,
          roles30d: Number((ci as any).hiring_velocity_30d) || 0,
        })
      }
    }

    // slug lookup for samples (readability of the proof)
    const slugMap = new Map<string, string>()
    if (jobsMap.size === 0) {
      for (const ids of chunk(jobIds, 100)) {
        const { data } = await sb.from("jobs").select("id, slug").in("id", ids)
        for (const j of data || []) slugMap.set((j as any).id, (j as any).slug)
      }
    } else {
      for (const [id, j] of jobsMap) slugMap.set(id, (j as any).slug)
    }

    for (const d of doneRows as any[]) {
      if (isTerminalAdmissionError(d.error)) continue // loop-guard: terminal means terminal
      const jai = jaiMap.get(d.job_id)
      const base = queueRepairDecision(d, jai)
      let reason: RequeueReason = base
      if (!reason && jai) {
        const job = jobsMap.get(d.job_id)
        if (job) {
          reason = contradictionRepairDecision(
            contradictionFlags(job, jai, learningMap.get((job.company || "").trim()) ?? null),
          )
        }
      }
      if (reason) {
        simRequeue[reason] = (simRequeue[reason] || 0) + 1
        const list = simSamples[reason] || []
        if (list.length < 12) list.push(slugMap.get(d.job_id) || String(d.job_id).slice(0, 8))
        simSamples[reason] = list
      }
    }

    // Orphans: completed + clean + no JAI
    simOrphans = (doneRows as any[]).filter((d) => !d.error && !jaiMap.get(d.job_id)).length
  }

  // No-queue-row detection (mirror of the engine pass, oldest active jobs)
  {
    const { data: oldest } = await sb.from("jobs").select("id").eq("is_active", true).order("created_at", { ascending: true }).limit(1000)
    if (oldest && oldest.length > 0) {
      const have = new Set<string>()
      for (const ids of chunk(oldest.map((j: any) => j.id), 100)) {
        const { data } = await sb.from("ai_processing_queue").select("job_id").in("job_id", ids)
        for (const r of data || []) have.add(r.job_id)
      }
      simNoQueueRow = (oldest as any[]).filter((j) => !have.has(j.id)).length
    }
  }

  /* ---------------- Projected post-drain metrics (§3) --------------
   * For every sampled row the write path would touch (any repair class,
   * or a queue row awaiting processing/rerun, or no queue row yet),
   * project the converged stored state and re-measure. Assumptions are
   * the lib/validation A1–A3 block — stated, never hidden. */
  const projEvals = evaluations.map((ev, i) => {
    const rec = records[i]
    const touched =
      ev.repairClass != null ||
      ev.queueStatus == null ||
      ev.queueStatus === "pending" ||
      ev.queueStatus === "processing" ||
      ev.queueStatus === "failed"
    if (!touched || (rec.queue?.error || "").startsWith("Rejected:")) return ev
    return evaluateRecord(projectRecord(rec, ev))
  })
  const projectedMetrics = summarize(projEvals)

  /* ---------------- Response ---------------- */
  const contradictionRows = evaluations
    .filter((ev) => ev.contradictions.length > 0)
    .slice(0, 60)
    .map((ev) => jobRow(ev))
  const projectedContradictionRows = projEvals
    .filter((ev) => ev.contradictions.length > 0)
    .slice(0, 60)
    .map((ev) => jobRow(ev))

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    lane: "preview-read-only",
    contracts: {
      sampledJobs: uniqueJobs.length,
      buckets: bucketSizes,
      queueHealth,
    },
    metricsCurrent: metrics,
    simulatedDrain: {
      completedScanned: simScanned,
      requeueByClass: simRequeue,
      requeueTotal: Object.values(simRequeue).reduce((a, b) => a + b, 0),
      orphans: simOrphans,
      noQueueRow: simNoQueueRow,
      samples: simSamples,
      assumption:
        "A1 providers succeed on re-run · A2 fresh quotes traceable-or-null by construction · A3 canonical-plane sync lands even when the wholesale upsert is protection-skipped",
    },
    metricsProjectedPostDrain: projectedMetrics,
    auditRows: includeJobs ? evaluations.map((ev) => ({ ...jobRow(ev), b: bucketOf.get(ev.jobId) })) : undefined,
    contradictions: contradictionRows,
    projectedContradictions: projectedContradictionRows,
  })
}
