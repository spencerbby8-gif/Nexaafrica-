/**
 * Benchmark Regression Testing — automated quality assurance.
 *
 * Maintains a benchmark dataset of representative jobs from each ATS source.
 * On every deployment, reprocesses the benchmark set and compares results
 * against previous baselines. Detects regressions in quality, latency,
 * evidence coverage, hallucination rate, and provider routing.
 */
import { createServiceClient } from "@/lib/supabase/service"
import { extractWithSingleAI, type ConsolidatedResult } from "@/lib/ai/verifiers/consolidated"
import { evaluateIntelligence } from "@/lib/ai/quality"
import type { Job } from "@/lib/types"

export interface BenchmarkResult {
  jobId: string; jobTitle: string; company: string; source: string
  modelVersion: string; overallConfidence: number; qualityScore: number
  provider: string; latencyMs: number
  evidenceFields: number; hallucinationRisk: number
  aiUsed: boolean; pageFetched: boolean
}

export interface BenchmarkComparison {
  baseline: BenchmarkResult[]; current: BenchmarkResult[]
  regressions: { jobId: string; metric: string; before: number; after: number }[]
  summary: {
    avgQualityDelta: number; avgLatencyDelta: number; providersChanged: number
    aiSuccessRateDelta: number; evidenceCoverageDelta: number
  }
}

/** Select a diverse benchmark set: 2 jobs per ATS source, never re-processed for the actual pipeline */
export async function getBenchmarkJobs(): Promise<Job[]> {
  const supabase = createServiceClient()
  const sources = ["greenhouse","ashby","lever","remoteok","himalayas","remotive"]
  const jobs: Job[] = []

  for (const src of sources) {
    const { data } = await supabase.from("jobs").select("*")
      .eq("source", src).eq("is_active", true).order("posted_at", { ascending: false }).limit(2)
    if (data) jobs.push(...(data as Job[]))
  }
  return jobs
}

/** Run a single benchmark pass and return results. */
export async function runBenchmark(jobs: Job[]): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []

  for (const job of jobs) {
    try {
      const start = Date.now()
      const consolidated: ConsolidatedResult = await extractWithSingleAI(job)
      const latency = Date.now() - start

      const quality = evaluateIntelligence({
        africa_eligibility: consolidated.ai.africa_eligibility,
        africa_evidence: consolidated.ai.africa_evidence,
        africa_confidence: consolidated.ai.africa_confidence,
        remote_eligibility: consolidated.ai.remote_eligibility,
        remote_evidence: consolidated.ai.remote_evidence,
        remote_confidence: consolidated.ai.remote_confidence,
        salary_transparency: consolidated.ai.salary_transparency,
        salary_evidence: consolidated.ai.salary_evidence,
        salary_confidence: consolidated.ai.salary_confidence,
        company_legitimacy: consolidated.ai.company_legitimacy,
        company_evidence: consolidated.ai.company_evidence,
        company_confidence: consolidated.ai.company_confidence,
        experience_level: consolidated.ai.experience_level,
        experience_confidence: consolidated.ai.experience_confidence,
        job_quality: consolidated.ai.job_quality,
        job_quality_confidence: consolidated.ai.job_quality_confidence,
        required_skills: consolidated.ai.required_skills,
      })

      results.push({
        jobId: job.id, jobTitle: job.title, company: job.company, source: job.source || "unknown",
        modelVersion: consolidated.modelVersion,
        overallConfidence: 0, qualityScore: quality.overallQuality,
        provider: consolidated.modelVersion.split(":")[0] || "unknown",
        latencyMs: latency,
        evidenceFields: quality.evidenceCoverage > 0 ? Math.round(quality.evidenceCoverage / 100 * 6) : 0,
        hallucinationRisk: quality.hallucinationRisk,
        aiUsed: consolidated.aiUsed, pageFetched: consolidated.pageFetched,
      })
    } catch (e) {
      results.push({
        jobId: job.id, jobTitle: job.title, company: job.company, source: job.source || "unknown",
        modelVersion: "error", overallConfidence: 0, qualityScore: 0,
        provider: "error", latencyMs: 0, evidenceFields: 0, hallucinationRisk: 0,
        aiUsed: false, pageFetched: false,
      })
    }
  }
  return results
}

/** Compare current results against stored baselines. */
export async function compareBenchmarks(current: BenchmarkResult[]): Promise<BenchmarkComparison> {
  const supabase = createServiceClient()
  // Store current as baseline
  const now = new Date().toISOString()
  for (const r of current) {
    await supabase.from("ai_benchmark_results").insert({
      job_id: r.jobId, run_at: now, model_version: r.modelVersion,
      quality_score: r.qualityScore, provider: r.provider, latency_ms: r.latencyMs,
      evidence_fields: r.evidenceFields, hallucination_risk: r.hallucinationRisk,
      ai_used: r.aiUsed, page_fetched: r.pageFetched,
    }).then(()=>{}, ()=>{})
  }

  // Fetch previous baseline (most recent run before this one)
  const { data: prev } = await supabase.from("ai_benchmark_results")
    .select("job_id, quality_score, provider, latency_ms, evidence_fields, hallucination_risk, ai_used, run_at")
    .lt("run_at", now).order("run_at", { ascending: false }).limit(200)

  const prevMap = new Map<string, any>()
  if (prev) for (const row of (prev as any[])) {
    if (!prevMap.has(row.job_id)) prevMap.set(row.job_id, row)
  }

  const regressions: BenchmarkComparison["regressions"] = []
  let qualityDeltaSum = 0, latencyDeltaSum = 0, providersChanged = 0, aiDeltaSum = 0, evDeltaSum = 0
  let compared = 0

  for (const cur of current) {
    const p = prevMap.get(cur.jobId)
    if (!p) continue
    compared++
    qualityDeltaSum += cur.qualityScore - (p.quality_score||0)
    latencyDeltaSum += cur.latencyMs - (p.latency_ms||0)
    if (cur.provider !== p.provider) providersChanged++
    aiDeltaSum += (cur.aiUsed?1:0) - (p.ai_used?1:0)
    evDeltaSum += cur.evidenceFields - (p.evidence_fields||0)

    if (cur.qualityScore < (p.quality_score||0) - 15) regressions.push({ jobId: cur.jobId, metric: "quality", before: p.quality_score, after: cur.qualityScore })
    if (cur.latencyMs > (p.latency_ms||0) + 5000) regressions.push({ jobId: cur.jobId, metric: "latency", before: p.latency_ms, after: cur.latencyMs })
    if (cur.hallucinationRisk > (p.hallucination_risk||0) + 20) regressions.push({ jobId: cur.jobId, metric: "hallucination_risk", before: p.hallucination_risk, after: cur.hallucinationRisk })
    if (p.ai_used && !cur.aiUsed) regressions.push({ jobId: cur.jobId, metric: "ai_success", before: 1, after: 0 })
  }

  return {
    baseline: [], current,
    regressions,
    summary: {
      avgQualityDelta: compared ? Math.round(qualityDeltaSum / compared) : 0,
      avgLatencyDelta: compared ? Math.round(latencyDeltaSum / compared) : 0,
      providersChanged,
      aiSuccessRateDelta: compared ? Math.round(aiDeltaSum / compared * 100) : 0,
      evidenceCoverageDelta: compared ? Math.round(evDeltaSum / compared) : 0,
    },
  }
}
