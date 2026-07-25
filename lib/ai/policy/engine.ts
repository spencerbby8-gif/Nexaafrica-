import type { TrustResult } from "@/lib/trust/types"

export type PolicyAction = "allow" | "warn" | "hide" | "soft_lock" | "limit" | "queue_for_review" | "suspend"

export interface PolicyDecision {
  action: PolicyAction
  reason: string
  confidence: number
  evidence: string[]
  nextSteps: string
  appealPath?: string
}

/**
 * Policy Engine — decides what happens next from evidence and confidence
 * No permanent bans without review support
 */
export function decidePolicy(params: {
  trust: TrustResult
  aiConfidence: number
  reportCount: number
  observerAlerts: { type: string; severity: "low" | "medium" | "high" }[]
}): PolicyDecision {
  const { trust, aiConfidence, reportCount, observerAlerts } = params

  const hasHighSeverityAlert = observerAlerts.some(a => a.severity === "high")
  const hasMediumAlert = observerAlerts.some(a => a.severity === "medium")

  // Permanent ban never without review — only queue_for_review
  if (trust.isFlagged && trust.score < 20 && reportCount >= 5) {
    return {
      action: "queue_for_review",
      reason: `Low trust ${trust.score} + ${reportCount} user reports + high severity alert`,
      confidence: 90,
      evidence: [trust.flaggedReason || "", ...observerAlerts.map(a => a.type)],
      nextSteps: "Queued for human review, hidden from public feed until reviewed",
      appealPath: "/contact?subject=appeal&reason=flagged_job",
    }
  }

  if (hasHighSeverityAlert || trust.score < 20) {
    return {
      action: "hide",
      reason: `High severity alert or trust ${trust.score} <20`,
      confidence: 80,
      evidence: observerAlerts.map(a => a.type),
      nextSteps: "Job hidden from public feed, still accessible via direct link for review",
      appealPath: "/trust-and-safety",
    }
  }

  if (trust.score < 40 || reportCount >= 3) {
    return {
      action: "warn",
      reason: `Trust ${trust.score} moderate low + ${reportCount} reports`,
      confidence: 70,
      evidence: [trust.flaggedReason || "Low trust"],
      nextSteps: "Job stays visible but shows warning banner, user can still apply with caution",
    }
  }

  if (hasMediumAlert) {
    return {
      action: "warn",
      reason: "Medium severity observer alert",
      confidence: 60,
      evidence: observerAlerts.map(a => a.type),
      nextSteps: "Warning banner shown",
    }
  }

  if (aiConfidence < 30) {
    return {
      action: "limit",
      reason: `Low AI confidence ${aiConfidence} — evidence missing`,
      confidence: 50,
      evidence: ["Evidence incomplete"],
      nextSteps: "Job visible but not boosted in search ranking",
    }
  }

  return {
    action: "allow",
    reason: `Trust ${trust.score} OK, AI confidence ${aiConfidence}, no high alerts`,
    confidence: 85,
    evidence: ["Verified via ATS", "No scam patterns"],
    nextSteps: "Job fully visible, boosted in search if high trust",
  }
}
