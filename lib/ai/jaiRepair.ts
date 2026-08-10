/**
 * JAI artifact repair — safe re-queue predicate (PR #34).
 *
 * Historical rows created BEFORE the false-success fixes are permanently
 * sealed as completed: the queue row is 'completed' with NULL error, but the
 * JAI row is an ARTIFACT (regex-extracted-0bytes / no-ai-providers /
 * failed-*) — intelligence with zero or invented provenance, created when the
 * AI providers were down and the pre-fix code stamped the run as done.
 *
 * These are SAFELY repairable because the source data still exists:
 *   - jobs.description_md is intact (3–8KB in all sampled rows)
 *   - apply_url is intact (the verifier re-fetches the live page)
 *   - the current pipeline (with all PR #34 fixes) produces real AI
 *     intelligence or a retryable no-ai-providers — never a 0-byte seal
 *   - the existing retry/backoff path (max_attempts=3, backoffMs, overdue-
 *     first ordering) governs the re-run
 *
 * This helper is PURE so the exact repair predicate is unit-tested.
 */
export function isRepairableArtifactJai(modelVersion: string | null | undefined): boolean {
  if (!modelVersion) return false
  if (modelVersion.startsWith('regex-extracted-')) return true
  if (modelVersion.startsWith('no-ai-providers')) return true
  if (modelVersion.startsWith('failed-')) return true
  if (modelVersion === 'verifyJobReal-threw') return true
  return false
}

/**
 * Also exclude rows that would just be re-rejected: the repair re-queues
 * only ACTIVE, visible jobs (is_active=true, not restricted, open to Africa).
 * Returns true when the job is a valid repair target.
 */
export function isRepairableJob(job: { is_active?: boolean | null; eligibility?: string | null; is_open_to_africa?: boolean | null }): boolean {
  if (!job.is_active) return false
  if (job.eligibility === 'restricted') return false
  if (job.is_open_to_africa === false) return false
  return true
}
