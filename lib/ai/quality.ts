import { createServiceClient } from "@/lib/supabase/service"

export interface QualityMetrics {
  truthScore: number        // 0-100: how many fields have evidence backing
  evidenceCoverage: number  // 0-100: % of dimensions with non-null evidence
  hallucinationRisk: number // 0-100 inverted: lower = better (0 = no risk detected)
  missingFields: number     // count of essential fields that are unknown/null
  confidenceCalibration: number // 0-100: how well confidence aligns with evidence
  evidenceStrength: number  // 0-100: average evidence length / quality
  overallQuality: number    // 0-100: weighted composite
  dimensions: number        // how many dimensions evaluated
}

export function evaluateIntelligence(row: any): QualityMetrics {
  const dims = [
    { field: 'africa_eligibility', evidence: 'africa_evidence', conf: 'africa_confidence' },
    { field: 'remote_eligibility', evidence: 'remote_evidence', conf: 'remote_confidence' },
    { field: 'salary_transparency', evidence: 'salary_evidence', conf: 'salary_confidence' },
    { field: 'company_legitimacy', evidence: 'company_evidence', conf: 'company_confidence' },
    { field: 'job_quality', evidence: 'job_quality_evidence', conf: 'job_quality_confidence' },
    { field: 'experience_level', evidence: null, conf: 'experience_confidence' },
  ]
  const validDims = dims.filter(d => row[d.field] != null && row[d.field] !== 'unknown')
  const withEvidence = dims.filter(d => row[d.evidence ?? ''] && String(row[d.evidence ?? '']).length > 20)
  const missing = dims.filter(d => !row[d.field] || row[d.field] === 'unknown')
  const highConfNoEvidence = dims.filter(d => (row[d.conf] ?? 0) >= 60 && (!row[d.evidence ?? ''] || String(row[d.evidence ?? '']).length < 20))
  const evidenceAvgLen = dims.reduce((sum, d) => sum + (String(row[d.evidence ?? ''] || '').length), 0) / Math.max(1, dims.length)

  const truthScore = Math.round((validDims.length / Math.max(1, dims.length)) * 100)
  const evidenceCoverage = Math.round((withEvidence.length / Math.max(1, dims.length)) * 100)
  const hallucinationRisk = Math.round((highConfNoEvidence.length / Math.max(1, dims.length)) * 100)
  const missingFields = missing.length
  const confidenceCalibration = Math.round((1 - (hallucinationRisk / 100)) * 100)
  const evidenceStrength = Math.min(100, Math.round(evidenceAvgLen / 2))
  const overallQuality = Math.round(
    truthScore * 0.30 + evidenceCoverage * 0.25 + confidenceCalibration * 0.25 + evidenceStrength * 0.15 - missingFields * 5
  )

  return {
    truthScore, evidenceCoverage, hallucinationRisk, missingFields,
    confidenceCalibration, evidenceStrength, overallQuality,
    dimensions: dims.length,
  }
}

export async function evaluateAndPersist(limit = 100): Promise<{ evaluated: number }> {
  const supabase = createServiceClient()
  const { data: rows } = await supabase.from("job_ai_intelligence")
    .select("*").is("quality_score", null).order("last_verified_at", { ascending: false }).limit(limit)
  if (!rows?.length) return { evaluated: 0 }

  let evaluated = 0
  for (const row of rows as any[]) {
    try {
      const q = evaluateIntelligence(row)
      const breakdown = {
        truth_score: q.truthScore, evidence_coverage: q.evidenceCoverage,
        hallucination_risk: q.hallucinationRisk, missing_fields: q.missingFields,
        confidence_calibration: q.confidenceCalibration, evidence_strength: q.evidenceStrength,
        dimensions: q.dimensions,
      }
      await supabase.from("job_ai_intelligence").update({
        quality_score: q.overallQuality, quality_breakdown: breakdown,
        quality_evaluated_at: new Date().toISOString(),
      }).eq("id", row.id)
      evaluated++
    } catch {}
  }
  return { evaluated }
}
