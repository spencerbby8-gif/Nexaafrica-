import type { PolicyAction } from "../policy/engine"

export interface ActionResult {
  executedAction: PolicyAction
  explanation: string
  nextSteps: string
  appealPath?: string
  timestamp: string
}

/**
 * Action Engine — executes chosen action on jobs, recruiters, employers, users
 * Writes clear user-facing explanations and next steps
 */
export async function executeAction(params: {
  action: PolicyAction
  jobId?: string
  userId?: string
  reason: string
}): Promise<ActionResult> {
  const now = new Date().toISOString()

  switch (params.action) {
    case "allow":
      return {
        executedAction: "allow",
        explanation: "Job verified and allowed to remain fully visible",
        nextSteps: "No action needed, job boosted in search",
        timestamp: now,
      }
    case "warn":
      return {
        executedAction: "warn",
        explanation: `Warning: ${params.reason}`,
        nextSteps: "Job stays visible but shows warning banner",
        appealPath: "/trust-and-safety",
        timestamp: now,
      }
    case "hide":
      return {
        executedAction: "hide",
        explanation: `Hidden from public feed: ${params.reason}`,
        nextSteps: "Job accessible via direct link for review, not in search",
        appealPath: "/contact?subject=hidden_job",
        timestamp: now,
      }
    case "soft_lock":
      return {
        executedAction: "soft_lock",
        explanation: `Soft locked: ${params.reason}`,
        nextSteps: "Apply button disabled, requires verification",
        appealPath: "/contact?subject=soft_lock",
        timestamp: now,
      }
    case "limit":
      return {
        executedAction: "limit",
        explanation: `Limited visibility: ${params.reason}`,
        nextSteps: "Job visible but not boosted, lower ranking",
        timestamp: now,
      }
    case "queue_for_review":
      return {
        executedAction: "queue_for_review",
        explanation: `Queued for human review: ${params.reason}`,
        nextSteps: "Hidden until human reviewer approves",
        appealPath: "/contact?subject=review_queue",
        timestamp: now,
      }
    case "suspend":
      return {
        executedAction: "suspend",
        explanation: `Suspended: ${params.reason}. No permanent ban without review.`,
        nextSteps: "Suspended pending review, appeal possible",
        appealPath: "/contact?subject=suspend_appeal",
        timestamp: now,
      }
    default:
      return {
        executedAction: "allow",
        explanation: "Unknown action, defaulting to allow",
        nextSteps: "No action",
        timestamp: now,
      }
  }
}
