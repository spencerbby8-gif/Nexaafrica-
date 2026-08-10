/**
 * JAI artifact repair — safe re-queue predicates + drain limits (PR #34).
 *
 * Re-audit findings (2026-08-10, real rows):
 *   - The repairable set of ZERO-EVIDENCE artifacts is 162 rows
 *     (regex-extracted-0bytes only). regex-extracted-Nbytes (N>0) rows carry
 *     real page text — re-running them would RE-SEAL the same class (the page
 *     text exists, so the current pipeline legitimately returns
 *     regex-extracted-Nbytes) and requeue forever. They are NOT artifacts.
 *   - A failed re-run over an artifact existing JAI must RETRY (backoff →
 *     failed after max_attempts), never upsert the failed result + complete
 *     (that is the infinite requeue loop).
 *   - Repair rows must never starve fresh ingestion or true retries: the
 *     drain processes TRUE overdue retries first, then fresh rows, then
 *     repair rows (capped).
 */

/** Exact error text set on repair-requeued rows (matched by the drain). */
export const JAI_REPAIR_ERROR = 'Requeued: JAI artifact repair (regex/0-byte/no-ai sealed row)'

/** True only for ZERO-EVIDENCE artifacts (safe to re-run). */
export function isRepairableArtifactJai(modelVersion: string | null | undefined): boolean {
  if (!modelVersion) return false
  if (modelVersion === 'regex-extracted-0bytes') return true
  if (modelVersion.startsWith('no-ai-providers')) return true
  if (modelVersion.startsWith('failed-')) return true
  if (modelVersion === 'verifyJobReal-threw') return true
  return false
}

/** Only active, visible jobs (is_active, not restricted, open-to-Africa). */
export function isRepairableJob(job: { is_active?: boolean | null; eligibility?: string | null; is_open_to_africa?: boolean | null }): boolean {
  if (!job.is_active) return false
  if (job.eligibility === 'restricted') return false
  if (job.is_open_to_africa === false) return false
  return true
}

/** True when the verification run produced NO real intelligence (failed). */
export function isFailedVerification(modelVersion: string | null | undefined): boolean {
  if (!modelVersion) return false
  return (
    modelVersion.includes('no-ai-providers') ||
    modelVersion.includes('failed-no-evidence') ||
    modelVersion.includes('verifyJobReal-threw')
  )
}

/**
 * Retry decision for a failed verification run.
 *   - newFailed false  -> nothing to retry
 *   - skipUpsert true  -> an existing REAL row is protected; do not retry
 *   - no existing JAI  -> retry (job never had intelligence)
 *   - existing ARTIFACT -> retry (never seal a failed run over an artifact;
 *     this is what terminates the repair loop: backoff -> max_attempts -> failed)
 *   - existing REAL    -> protection handles it (skipUpsert); no retry
 */
export function shouldRetryFailedRun(
  existingJai: { modelVersion: string | null; isReal: boolean } | null,
  newFailed: boolean,
  skipUpsert: boolean,
): boolean {
  if (!newFailed) return false
  if (skipUpsert) return false
  return !existingJai || !existingJai.isReal
}

/** True when the queue error marks a repair-requeued row. */
export function isRepairRequeueError(error: string | null | undefined): boolean {
  return typeof error === 'string' && error.startsWith('Requeued: JAI artifact')
}

/**
 * Drain batch limits — bounds how many repair rows can run per drain so they
 * can never starve normal ingestion or true retries:
 *   retryLimit  = batchSize   (true overdue retries, processed first)
 *   freshLimit  = batchSize   (fresh rows, processed second — normal ingestion)
 *   repairLimit = ≤25% of batch, clamped [5,50] (repair rows, processed last)
 */
export function drainBatchLimits(batchSize: number): { retryLimit: number; freshLimit: number; repairLimit: number } {
  const b = Math.max(1, Math.floor(Number(batchSize) || 100))
  const repairLimit = Math.max(5, Math.min(50, Math.floor(b * 0.25)))
  return { retryLimit: b, freshLimit: b, repairLimit }
}
