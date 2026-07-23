import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"

export function remotePolicyClaritySignal(job: Job): TrustSignal {
  if (job.eligibility === "explicit") {
    return {
      id: "remote_policy_clarity",
      label: "Explicitly open to Africa",
      scoreImpact: 15,
      confidence: "high",
      tone: "positive",
      explanation: "Posting explicitly names Africa or an African country as eligible. Strongest remote policy signal on Nexa.",
      evidence: `Eligibility: ${job.eligibility}`,
      source: "remote",
    }
  }

  if (job.eligibility === "likely") {
    return {
      id: "remote_policy_clarity",
      label: "Globally remote, no restriction found",
      scoreImpact: 8,
      confidence: "medium",
      tone: "positive",
      explanation: "Advertised as globally remote with no geographic restriction detected by Nexa's eligibility classifier. Africa not named, so this is an informed read, not a guarantee.",
      source: "remote",
    }
  }

  if (job.eligibility === "restricted") {
    return {
      id: "remote_policy_clarity",
      label: "Geographic restrictions",
      scoreImpact: -10,
      confidence: "high",
      tone: "warning",
      explanation: "Posting contains location, residency, or work authorization requirements that may exclude African applicants.",
      evidence: `Eligibility: ${job.eligibility}`,
      source: "remote",
    }
  }

  // unknown
  if (!job.is_remote) {
    return {
      id: "remote_policy_clarity",
      label: "Not marked remote",
      scoreImpact: -5,
      confidence: "medium",
      tone: "caution",
      explanation: "Job is not marked as remote in ATS feed. Verify remote status with employer.",
      source: "remote",
    }
  }

  return {
    id: "remote_policy_clarity",
    label: "Remote policy not stated",
    scoreImpact: 0,
    confidence: "low",
    tone: "neutral",
    explanation: "Posting does not explicitly state remote eligibility. Confirm with company.",
    source: "remote",
  }
}
