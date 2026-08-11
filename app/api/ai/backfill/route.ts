import { NextResponse } from "next/server"
import { isPipelineAuthorized, pipelineAuthConfigured } from "@/lib/server/auth"
import { createServiceClient } from "@/lib/supabase/service"
import { AFRICA_RE, corroborateAfricaClaim, eligibilityScanText } from "@/lib/geo/eligibility"
import { asSkillList } from "@/lib/ai/normalize"
import { formatSalary } from "@/lib/intelligence"
import { plainifyPosting, traceableQuote } from "@/lib/evidence"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Truth Layer v1 — backfill healer (authorized, dry-run first).
 *
 * GET /api/ai/backfill?kind=africa-fp|salary-conflict|skills-json|all[&execute=1][&limit=200]
 *
 * Three healers, each addressing a defect proven by the live production
 * audit (2026-08-05):
 *
 *  - africa-fp:    JAI rows holding "explicit" Africa verdicts whose stored
 *                  evidence quote does NOT itself pass the word-boundary
 *                  Africa matcher after dead-zone stripping (e.g. the
 *                  quote is about "anomalies" — the mali false positive),
 *                  OR whose CURRENT posting text no longer supports the
 *                  claim under the shared corpus (verifier-domain
 *                  corroboration). Heal = requeue the job for
 *                  re-verification under the Truth Layer v1 corpus.
 *  - salary-conflict: JAI says disclosed with numbers, jobs row shows a
 *                  DIFFERENT number (or a machine-junk range string /
 *                  0–0). Heal = apply the same authority rule the engine
 *                  now applies at write time. Additionally, a disclosed
 *                  salary whose stored evidence quote is no longer
 *                  traceable to the current posting is requeued for
 *                  re-verification (stale-quote class).
 *
 * [ARCHITECTURE 2026-08-05 — single-owner doctrine] These healers are the
 * WRITE-PATH home of the checks that briefly ran inside the render layer
 * (corpus re-arbitration, salary evidence authority). Stale rows are healed
 * here by re-verification/rewrite — never masked at render. Trust re-scoring
 * of historical rows lives at POST /api/jobs/backfill-trust.
 *  - skills-json:  JAI rows whose skills arrays contain objects (rendered
 *                  raw as JSON to users). Heal = normalize to plain
 *                  deduped strings via the shared persistence contract.
 *
 * Default is DRY RUN (counts + samples). `&execute=1` performs writes.
 * Machine-to-machine auth identical to /api/ai/process.
 */

const CAP = 500

type Row = Record<string, any>

function sample(ids: string[], n = 8) {
  return ids.slice(0, n)
}

async function healAfricaFp(svc: any, execute: boolean, limit: number) {
  const { data: rows, error } = await svc
    .from("job_ai_intelligence")
    .select("job_id, africa_eligibility, africa_evidence, africa_confidence, last_verified_at")
    .eq("africa_eligibility", "explicit")
    .order("last_verified_at", { ascending: false })
    .limit(CAP)
  if (error) return { kind: "africa-fp", error: error.message }

  const suspect: Row[] = []
  const suspectIds = new Set<string>()
  for (const r of rows || []) {
    const ev: string = r.africa_evidence || ""
    // An explicit verdict whose own evidence quote has no word-boundary
    // Africa match (after dead-zone stripping) is the proven fabrication
    // class; missing quotes on explicit verdicts are equally invalid.
    const scan = eligibilityScanText(ev)
    if (!ev || ev.length < 10 || !AFRICA_RE.test(scan)) {
      suspect.push({ ...r, class: "untraceable-quote" })
      suspectIds.add(r.job_id)
    }
    if (suspect.length >= limit) break
  }

  // [ARCHITECTURE 2026-08-05] Verifier-domain corroboration (moved out of
  // the render layer): re-read the CURRENT posting text through the shared
  // corpus. A stored "explicit" the corpus can no longer find in the posting
  // is a suspect even when its stored quote once looked plausible — requeue
  // it for full re-verification instead of letting the claim drift.
  const remainingRows = (rows || []).filter((r: Row) => !suspectIds.has(r.job_id))
  if (remainingRows.length > 0 && suspect.length < limit) {
    const ids = remainingRows.map((r: Row) => r.job_id)
    const { data: jobs } = await svc
      .from("jobs")
      .select("id, description_md, location")
      .in("id", ids)
    const jobMap = new Map<string, Row>((jobs || []).map((j: Row) => [j.id, j]))
    for (const r of remainingRows) {
      const j = jobMap.get(r.job_id)
      if (!j) continue
      const support = corroborateAfricaClaim(
        { text: j.description_md ?? "", locationField: j.location ?? null },
        "explicit",
      )
      if (!support.supported) {
        suspect.push({ ...r, class: support.reason })
        suspectIds.add(r.job_id)
      }
      if (suspect.length >= limit) break
    }
  }

  let requeued = 0
  if (execute && suspect.length > 0) {
    for (const r of suspect) {
      const { error: qErr } = await svc
        .from("ai_processing_queue")
        .update({
          status: "pending",
          attempts: 0,
          completed_at: null,
          started_at: null,
          next_retry_at: new Date().toISOString(),
          error: "[TLV1] re-verify: explicit Africa verdict failed word-boundary/dead-zone guard",
        })
        .eq("job_id", r.job_id)
      if (!qErr) requeued++
    }
  }
  return {
    kind: "africa-fp",
    scanned: (rows || []).length,
    suspects: suspect.length,
    sample_job_ids: sample(suspect.map((r) => r.job_id)),
    executed: execute,
    requeued,
  }
}

async function healSalaryConflict(svc: any, execute: boolean, limit: number) {
  const { data: jaiRows, error } = await svc
    .from("job_ai_intelligence")
    .select("job_id, salary_min, salary_max, salary_currency, salary_period, salary_transparency, salary_evidence, last_verified_at")
    .eq("salary_transparency", "disclosed")
    .not("salary_max", "is", null)
    .gt("salary_max", 0)
    .order("last_verified_at", { ascending: false })
    .limit(CAP)
  if (error) return { kind: "salary-conflict", error: error.message }

  const ids = (jaiRows || []).map((r: Row) => r.job_id)
  if (ids.length === 0) return { kind: "salary-conflict", scanned: 0, suspects: 0, executed: execute, fixed: 0 }
  const { data: jobs } = await svc
    .from("jobs")
    .select("id, salary_min, salary_max, salary_range, salary_currency, salary_period, description_md")
    .in("id", ids)
  const jobMap = new Map<string, Row>((jobs || []).map((j: Row) => [j.id, j]))
  const junk = /\b0\.\d+k\b|(?:usd|\$|€|£)\s*0\s*[–—-]\s*(?:usd|\$|€|£)?\s*0\b/i

  const conflicts: Array<{ jobId: string; sMin: number | null; sMax: number; currency: string; period: string; reason: string }> = []
  for (const r of jaiRows || []) {
    const j = jobMap.get(r.job_id)
    if (!j) continue
    const jMax = j.salary_max as number | null
    const machines = typeof j.salary_range === "string" && junk.test(j.salary_range)
    const missing = (j.salary_min == null || j.salary_max == null) && r.salary_min != null
    const differs = jMax != null && r.salary_max != null && Math.abs(jMax - r.salary_max) > 1
    const zeroZero = jMax === 0
    if (machines || missing || differs || zeroZero) {
      conflicts.push({
        jobId: r.job_id,
        sMin: r.salary_min,
        sMax: r.salary_max,
        currency: r.salary_currency || "USD",
        period: r.salary_period || "year",
        reason: machines ? "machine-junk-range" : missing ? "jobs-missing" : zeroZero ? "zero-zero" : "value-mismatch",
      })
      if (conflicts.length >= limit) break
    }
  }

  let fixed = 0
  if (execute && conflicts.length > 0) {
    for (const c of conflicts) {
      const range = formatSalary({ min: c.sMin, max: c.sMax, currency: c.currency, period: c.period as any, raw: "" })
      const { error: uErr } = await svc
        .from("jobs")
        .update({
          salary_min: c.sMin,
          salary_max: c.sMax,
          salary_currency: c.currency,
          salary_period: c.period,
          ...(range ? { salary_range: range } : {}),
        })
        .eq("id", c.jobId)
      if (!uErr) fixed++
    }
  }

  // [ARCHITECTURE 2026-08-05] Stale-quote requeue class — the write-path
  // home of the check that briefly ran inside the render layer: a disclosed
  // salary whose stored evidence quote is no longer traceable to the
  // current posting is NOT rewritten here and never masked at render; it is
  // requeued so the verifier re-decides with fresh evidence.
  const conflictIds = new Set(conflicts.map((c) => c.jobId))
  const staleQuote: string[] = []
  for (const r of jaiRows || []) {
    if (conflictIds.has(r.job_id)) continue
    const ev: string = r.salary_evidence || ""
    if (!ev) continue
    const j = jobMap.get(r.job_id)
    if (!j?.description_md) continue
    if (!traceableQuote(ev, plainifyPosting(j.description_md))) staleQuote.push(r.job_id)
    if (staleQuote.length >= limit) break
  }

  let requeued = 0
  if (execute && staleQuote.length > 0) {
    for (const jobId of staleQuote) {
      const { error: qErr } = await svc
        .from("ai_processing_queue")
        .update({
          status: "pending",
          attempts: 0,
          completed_at: null,
          started_at: null,
          next_retry_at: new Date().toISOString(),
          error: "[TLV1] re-verify: disclosed salary evidence quote no longer traceable to current posting",
        })
        .eq("job_id", jobId)
      if (!qErr) requeued++
    }
  }
  return {
    kind: "salary-conflict",
    scanned: (jaiRows || []).length,
    suspects: conflicts.length,
    sample: conflicts.slice(0, 8),
    stale_quote_suspects: staleQuote.length,
    stale_quote_sample: sample(staleQuote),
    executed: execute,
    fixed,
    requeued,
  }
}

async function healSkillsJson(svc: any, execute: boolean, limit: number) {
  const { data: rows, error } = await svc
    .from("job_ai_intelligence")
    .select("job_id, required_skills, transferable_skills, missing_skills")
    .order("last_verified_at", { ascending: false })
    .limit(CAP)
  if (error) return { kind: "skills-json", error: error.message }

  const hasObjects = (v: unknown): boolean =>
    Array.isArray(v) && v.some((x) => x !== null && typeof x === "object")

  const dirty: Array<{ jobId: string; required: string[]; transferable: string[]; missing: string[] }> = []
  for (const r of rows || []) {
    if (!(hasObjects(r.required_skills) || hasObjects(r.transferable_skills) || hasObjects(r.missing_skills))) continue
    dirty.push({
      jobId: r.job_id,
      required: asSkillList(r.required_skills),
      transferable: asSkillList(r.transferable_skills),
      missing: asSkillList(r.missing_skills),
    })
    if (dirty.length >= limit) break
  }

  let fixed = 0
  if (execute && dirty.length > 0) {
    for (const d of dirty) {
      const { error: uErr } = await svc
        .from("job_ai_intelligence")
        .update({
          required_skills: d.required,
          transferable_skills: d.transferable,
          missing_skills: d.missing,
        })
        .eq("job_id", d.jobId)
      if (!uErr) fixed++
    }
  }
  return {
    kind: "skills-json",
    scanned: (rows || []).length,
    suspects: dirty.length,
    sample_job_ids: sample(dirty.map((d) => d.jobId)),
    executed: execute,
    fixed,
  }
}

export async function GET(req: Request) {
  if (!pipelineAuthConfigured()) {
    return NextResponse.json({ error: "No auth secret configured (CRON_SECRET or INGEST_TOKEN)" }, { status: 500 })
  }
  if (!isPipelineAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const kind = url.searchParams.get("kind") || "all"
  const execute = url.searchParams.get("execute") === "1"
  const limit = Math.max(1, Math.min(CAP, Number(url.searchParams.get("limit")) || 200))

  if (!["africa-fp", "salary-conflict", "skills-json", "all"].includes(kind)) {
    return NextResponse.json({ error: "kind must be africa-fp | salary-conflict | skills-json | all" }, { status: 400 })
  }

  const svc = createServiceClient()
  const results: any[] = []
  if (kind === "africa-fp" || kind === "all") results.push(await healAfricaFp(svc, execute, limit))
  if (kind === "salary-conflict" || kind === "all") results.push(await healSalaryConflict(svc, execute, limit))
  if (kind === "skills-json" || kind === "all") results.push(await healSkillsJson(svc, execute, limit))

  return NextResponse.json({
    truthLayerVersion: 1,
    mode: execute ? "EXECUTE" : "DRY-RUN (add &execute=1 to write)",
    asked: kind,
    results,
    requeueNote: "africa-fp requeues jobs into ai_processing_queue; the next 05:00 UTC drain re-verifies them under the Truth Layer v1 corpus.",
  })
}
