import { createServiceClient } from "@/lib/supabase/service"

export interface QualityMetrics {
  truthScore: number; evidenceCoverage: number; hallucinationRisk: number
  missingFields: number; confidenceCalibration: number; evidenceStrength: number
  overallQuality: number; dimensions: number; skillsCoverage: number
  explanation: string
}

export function evaluateIntelligence(row: any): QualityMetrics {
  const EXCELLENT = 80, GOOD = 50, MIN_EVIDENCE = 20

  const dims = [
    { field: 'africa_eligibility', evidence: 'africa_evidence', conf: 'africa_confidence', weight: 1.0 },
    { field: 'remote_eligibility', evidence: 'remote_evidence', conf: 'remote_confidence', weight: 1.0 },
    { field: 'salary_transparency', evidence: 'salary_evidence', conf: 'salary_confidence', weight: 1.5 },
    { field: 'company_legitimacy', evidence: 'company_evidence', conf: 'company_confidence', weight: 1.2 },
    { field: 'experience_level', evidence: null, conf: 'experience_confidence', weight: 0.8 },
    { field: 'job_quality', evidence: 'job_quality_evidence', conf: 'job_quality_confidence', weight: 0.5 },
  ]
  const totalWeight = dims.reduce((s,d)=>s+d.weight,0)

  // Classify evidence: AI-extracted (>80 chars, no "Stored salary:" prefix) vs feed-fallback
  const isRealAIEvidence = (ev: string|null|undefined) => 
    ev && ev.length > 40 && !ev.startsWith("Stored salary:") && !ev.startsWith("Salary: ")

  const validDims = dims.filter(d => row[d.field] && row[d.field] !== 'unknown')
  const withStrongEvidence = dims.filter(d => isRealAIEvidence(row[d.evidence ?? '']))
  const withAnyEvidence = dims.filter(d => row[d.evidence ?? ''] && String(row[d.evidence ?? '']).length > MIN_EVIDENCE)
  const missing = dims.filter(d => !row[d.field] || row[d.field] === 'unknown')
  const highConfNoEvidence = dims.filter(d => (row[d.conf] ?? 0) >= 60 && (!row[d.evidence ?? ''] || String(row[d.evidence ?? '']).length < MIN_EVIDENCE))
  const skillsLen = Array.isArray(row['required_skills']) ? row['required_skills'].length : 0
  const skillsCoverage = skillsLen >= 5 ? 100 : skillsLen >= 2 ? 60 : skillsLen >= 1 ? 30 : 0

  const truthScore = Math.round((validDims.reduce((s,d)=>s+d.weight,0) / totalWeight) * 100)
  const evidenceCoverage = Math.round((withStrongEvidence.reduce((s,d)=>s+d.weight,0) / totalWeight) * 100)
  const hallucinationRisk = Math.round((highConfNoEvidence.length / Math.max(1, dims.length)) * 100)
  const missingFields = missing.length
  const confidenceCalibration = Math.round((1 - (hallucinationRisk / 100)) * 100)
  const evidenceStrength = Math.min(100, Math.round(
    dims.reduce((sum, d) => sum + Math.min(100, (String(row[d.evidence ?? ''] || '').length)), 0) / Math.max(1, dims.length) / 2
  ))
  const overallQuality = Math.round(
    truthScore * 0.25 + evidenceCoverage * 0.30 + confidenceCalibration * 0.20 +
    evidenceStrength * 0.10 + skillsCoverage * 0.10 - missingFields * 3
  )

  // Explanation
  const parts: string[] = []
  if (truthScore >= EXCELLENT) parts.push("Strong dimensional coverage")
  else if (truthScore >= GOOD) parts.push("Adequate dimensional coverage")
  else if (truthScore > 0) parts.push("Partial dimensional coverage")
  else parts.push("No dimensional coverage")
  if (withStrongEvidence.length >= 3) parts.push("well-evidenced")
  else if (withStrongEvidence.length >= 1) parts.push("partially evidenced")
  else parts.push("no strong evidence")
  if (hallucinationRisk > 20) parts.push("hallucination risk detected")
  if (skillsLen >= 5) parts.push("rich skill extraction")
  if (missingFields >= 4) parts.push("most fields unknown")

  return {
    truthScore, evidenceCoverage, hallucinationRisk, missingFields,
    confidenceCalibration, evidenceStrength, overallQuality,
    dimensions: dims.length, skillsCoverage,
    explanation: parts.join("; "),
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
      await supabase.from("job_ai_intelligence").update({
        quality_score: Math.max(0, q.overallQuality),
        quality_breakdown: {
          truth_score: q.truthScore, evidence_coverage: q.evidenceCoverage,
          hallucination_risk: q.hallucinationRisk, missing_fields: q.missingFields,
          confidence_calibration: q.confidenceCalibration, evidence_strength: q.evidenceStrength,
          skills_coverage: q.skillsCoverage, dimensions: q.dimensions,
          explanation: q.explanation,
        },
        quality_evaluated_at: new Date().toISOString(),
      }).eq("id", row.id)
      evaluated++
    } catch {}
  }
  return { evaluated }
}
