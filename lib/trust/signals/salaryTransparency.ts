import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"

export function salaryTransparencySignal(job: Job): TrustSignal {
  const hasRange = !!job.salary_range
  const hasStructured = job.salary_min != null || job.salary_max != null

  if (hasRange && hasStructured) {
    return {
      id: "salary_transparency",
      label: `Salary disclosed • ${job.salary_range}`,
      scoreImpact: 12,
      confidence: "high",
      tone: "positive",
      explanation: `Company published compensation: ${job.salary_range} (${job.salary_currency || "USD"}). Structured salary with min/max signals transparency.`,
      evidence: job.salary_range || undefined,
      source: "salary",
    }
  }

  if (hasRange) {
    return {
      id: "salary_transparency",
      label: `Salary: ${job.salary_range}`,
      scoreImpact: 8,
      confidence: "high",
      tone: "positive",
      explanation: `Company disclosed pay range: ${job.salary_range}. Transparency is a trust signal for remote roles.`,
      evidence: job.salary_range || undefined,
      source: "salary",
    }
  }

  return {
    id: "salary_transparency",
    label: "Salary not disclosed",
    scoreImpact: 0,
    confidence: "medium",
    tone: "neutral",
    explanation: "No compensation listed in official feed. Nexa never estimates pay — ask early. Not a negative trust signal, just less transparency.",
    source: "salary",
  }
}
