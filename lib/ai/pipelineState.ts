/**
 * [V3] Canonical pipeline state — the single truthful mapping from
 * (AI row, queue row) to a user-facing state. Every UI component must derive
 * its label from this function so no state is ever fabricated.
 *
 * Order of precedence:
 *   1. Real AI row (provider:model)          -> verified
 *   2. Rule-based AI row (regex/no-ai)       -> rule_based
 *   3. Queue failed                          -> failed
 *   4. Queue processing                      -> processing
 *   5. Queue pending with future retry       -> retrying
 *   6. Queue pending                         -> queued
 *   7. Queue completed + Rejected/Skipped    -> rejected (never an "error")
 *   8. Queue completed + clean (no AI row)   -> not_verified (orphan)
 *   9. No queue row                          -> queued (awaiting enqueue)
 */
export type PipelineState =
  | "verified"
  | "rule_based"
  | "failed"
  | "processing"
  | "retrying"
  | "queued"
  | "rejected"
  | "not_verified"

export interface PipelineStateInput {
  modelVersion?: string | null
  queueStatus?: string | null
  queueError?: string | null
  nextRetryAt?: string | null
}

export function isVerifiedModel(mv: string | null | undefined): boolean {
  return !!mv && mv.includes(":") && !mv.startsWith("regex") && !mv.includes("no-ai")
}

export function isRuleBasedModel(mv: string | null | undefined): boolean {
  return !!mv && (mv.startsWith("regex") || mv.includes("no-ai"))
}

export function pipelineState(input: PipelineStateInput): PipelineState {
  const mv = input.modelVersion || ""
  if (isVerifiedModel(mv)) return "verified"
  if (isRuleBasedModel(mv)) return "rule_based"

  const qs = input.queueStatus || null
  const err = (input.queueError || "").toLowerCase()
  const isRejected = err.startsWith("rejected") || err.startsWith("skipped")

  switch (qs) {
    case "failed":
      return "failed"
    case "processing":
      return "processing"
    case "pending":
      // A future next_retry_at means the pipeline scheduled a retry.
      if (input.nextRetryAt && new Date(input.nextRetryAt).getTime() > Date.now()) return "retrying"
      return "queued"
    case "completed":
      if (isRejected) return "rejected"
      return "not_verified"
    default:
      return "queued"
  }
}

/** User-facing label + tone for a canonical pipeline state. */
export function pipelineStateLabel(state: PipelineState): { label: string; tone: "accent" | "amber" | "red" | "neutral" | "blue" } {
  switch (state) {
    case "verified":
      return { label: "Nexa Intelligence", tone: "accent" }
    case "rule_based":
      return { label: "Rule-based", tone: "blue" }
    case "failed":
      return { label: "Failed", tone: "red" }
    case "processing":
      return { label: "Processing", tone: "amber" }
    case "retrying":
      return { label: "Retrying", tone: "amber" }
    case "queued":
      return { label: "Queued", tone: "amber" }
    case "rejected":
      return { label: "Not eligible", tone: "neutral" }
    case "not_verified":
      return { label: "Not verified", tone: "neutral" }
  }
}
