import type { TrustSignal, TrustContext } from "../types"
import type { Job } from "@/lib/types"

export function companyHistorySignal(job: Job, ctx?: TrustContext): TrustSignal | null {
  const count = ctx?.companyJobCount ?? 0

  if (count >= 10) {
    return {
      id: "company_history",
      label: `Established employer • ${count} roles`,
      scoreImpact: 12,
      confidence: "high",
      tone: "positive",
      explanation: `${job.company} has ${count} active roles on Nexa, indicating consistent hiring and stable presence.`,
      evidence: `${count} active jobs`,
      source: "history",
    }
  }

  if (count >= 5) {
    return {
      id: "company_history",
      label: `Active employer • ${count} roles`,
      scoreImpact: 8,
      confidence: "medium",
      tone: "positive",
      explanation: `${job.company} has ${count} active listings, showing ongoing hiring activity.`,
      evidence: `${count} active jobs`,
      source: "history",
    }
  }

  if (count >= 2) {
    return {
      id: "company_history",
      label: "Returning employer",
      scoreImpact: 4,
      confidence: "medium",
      tone: "neutral",
      explanation: `${job.company} has posted before on Nexa (${count} roles).`,
      evidence: `${count} roles`,
      source: "history",
    }
  }

  return {
    id: "company_history",
    label: "First seen",
    scoreImpact: 0,
    confidence: "low",
    tone: "neutral",
    explanation: `First time Nexa sees ${job.company}. No history to boost trust yet, but listing is still verified via ATS.`,
    source: "history",
  }
}
