/**
 * [QUEUE REPAIR — §17] Write-plane helpers for the evidence-plane repair.
 * Pure functions: no I/O, no server-only imports — unit-fixture verified.
 *
 * Two defects these helpers close (audit §16):
 *  1. Provider failure was persisted as terminal success: `regex-extracted-*`
 *     rows upserted, queue sealed `completed`, never retried.
 *  2. Completed queue rows that predate the V1 evidence plane can never be
 *     healed: nothing requeues them.
 *
 * And one preservation rule: an upsert must never overwrite stored evidence
 * with blanks (rule 4 of the repair directive).
 */

/** Model versions that mean "the AI call did not produce real intelligence".
 *  A run ending in any of these is a FAILURE — it must schedule a retry,
 *  never upsert, never seal the queue row as completed. */
export function isFailedModelVersion(m: string | null | undefined): boolean {
  if (!m) return true
  return (
    m.startsWith("regex-extracted-") ||
    m === "rule-based-v1-fast" ||
    m === "template-removed-2026" ||
    m.includes("no-ai-providers") ||
    m.includes("failed-no-evidence") ||
    m.includes("verifyJobReal-threw")
  )
}

/** Model versions known-misleading/AI-less — the "rule-based" population the
 *  homepage counts (regex% + no-ai%) plus legacy misleading versions. */
export function isRuleBasedModelVersion(m: string | null | undefined): boolean {
  if (!m) return true
  return (
    m.startsWith("regex") ||
    m.includes("no-ai") ||
    isFailedModelVersion(m) ||
    m === "gemini-2.5-flash-v1"
  )
}

export type RequeueReason = "thin_tier" | "pre_v1_evidence" | null

/** Should a COMPLETED queue row be sent back to pending for reprocessing?
 *  - Admission rejections ("Rejected: <reason> [gate]") are intentional
 *    terminal states — never requeue them.
 *  - Rule-based/AI-less JAI tiers requeue (they were sealed as terminal
 *    success while carrying no real intelligence).
 *  - Any JAI row predating the V1 evidence plane (evidence_refs null)
 *    requeues so it gains stored evidence.
 *  - Queue rows with no JAI row are left to the existing orphan-heal. */
export function queueRepairDecision(
  queueRow: { error?: string | null },
  jaiRow: { model_version?: string | null; evidence_refs?: unknown } | null | undefined,
): RequeueReason {
  const err = queueRow.error || ""
  if (err.startsWith("Rejected:") || err.startsWith("Skipped")) return null
  if (!jaiRow) return null
  if (isRuleBasedModelVersion(jaiRow.model_version)) return "thin_tier"
  if (jaiRow.evidence_refs == null) return "pre_v1_evidence"
  return null
}

/** Preservation merge for a single evidence-quote field: never blank a stored
 *  quote. Kept only while the dimension's verdict is unchanged — a changed
 *  verdict must not inherit the old verdict's evidence (that would be
 *  mis-provenance; honest absence beats wrong attribution). */
export function preserveQuote(
  newQuote: string | null | undefined,
  existingQuote: string | null | undefined,
  verdictUnchanged: boolean,
): string | null {
  const fresh = newQuote && newQuote.trim() ? newQuote.trim() : null
  if (fresh) return fresh
  const stored = existingQuote && existingQuote.trim() ? existingQuote.trim() : null
  if (stored && verdictUnchanged) return stored
  return null
}

export const REQUEUE_ERROR_LABEL: Record<Exclude<RequeueReason, null>, string> = {
  thin_tier: "Requeued: repair — rule-based/AI-less tier (must retry like a failure)",
  pre_v1_evidence: "Requeued: repair — pre-V1 row (no stored evidence plane)",
}
