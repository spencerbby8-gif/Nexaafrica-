/**
 * Eligibility / admission precedence lock (PR #34).
 *
 * Canonical-owner rule (verified against production rows):
 *   The admission decision (ai_processing_queue row with error
 *   "Rejected: ... [gate]", written by lib/ai/engine.ts) is the STRONGER
 *   owner of eligibility / is_open_to_africa / is_active than an ordinary
 *   re-ingest. A fresh crawl must never silently undo an admission rejection
 *   by re-writing eligibility=likely/explicit, is_open_to_africa=true or
 *   is_active=true.
 *
 *   - gate africa_eligibility | work_authorization
 *       -> eligibility = 'restricted', is_open_to_africa = false
 *          (matches the engine write-back exactly)
 *   - gate onsite_only | expired | dead_url | placeholder_company
 *       -> is_active = false
 *   - anything else / no rejection
 *       -> incoming ingest classification flows through unchanged
 *         (legitimate new classifications are preserved)
 *
 * Because the lock re-applies the ADMISSION VERDICT (not just the current DB
 * row), it also self-heals rows that were already clobbered by an earlier
 * re-ingest (the 77 production rows verified in the audit) — no backfill
 * needed; the next ingest of that posting restores the correct verdict.
 */

export type Eligibility = 'explicit' | 'likely' | 'restricted' | 'unknown'

export type AdmissionGate =
  | 'africa_eligibility'
  | 'work_authorization'
  | 'onsite_only'
  | 'expired'
  | 'dead_url'
  | 'placeholder_company'
  | string // unknown/other gates: treat as lock but preserve fields

export interface EligibilityLockInput {
  incomingEligibility: Eligibility
  incomingOpenToAfrica: boolean
  /** Gate from the queue rejection, null when the job was never rejected. */
  admissionGate: string | null
}

export interface EligibilityLockOutput {
  eligibility: Eligibility
  is_open_to_africa: boolean
  is_active: boolean
  locked: boolean
  reason?: string
}

const AFRICA_GATES = new Set(['africa_eligibility', 'work_authorization'])
const DEACTIVATE_GATES = new Set(['onsite_only', 'expired', 'dead_url', 'placeholder_company'])

export function resolveEligibilityLock(input: EligibilityLockInput): EligibilityLockOutput {
  const { incomingEligibility, incomingOpenToAfrica, admissionGate } = input

  if (admissionGate && AFRICA_GATES.has(admissionGate)) {
    return {
      eligibility: 'restricted',
      is_open_to_africa: false,
      is_active: true, // africa gates don't deactivate; listing filters hide restricted
      locked: true,
      reason: `admission-rejected [${admissionGate}]`,
    }
  }

  if (admissionGate && DEACTIVATE_GATES.has(admissionGate)) {
    return {
      eligibility: incomingEligibility, // keep classification; listing hidden via is_active
      is_open_to_africa: incomingOpenToAfrica,
      is_active: false,
      locked: true,
      reason: `admission-rejected [${admissionGate}]`,
    }
  }

  // Unknown/other gate: preserve the rejection conservatively (keep hidden),
  // but never claim a classification we can't prove.
  if (admissionGate) {
    return {
      eligibility: incomingEligibility,
      is_open_to_africa: false,
      is_active: false,
      locked: true,
      reason: `admission-rejected [${admissionGate}]`,
    }
  }

  // No rejection: legitimate ingest classification flows through unchanged.
  return {
    eligibility: incomingEligibility,
    is_open_to_africa: incomingOpenToAfrica,
    is_active: true,
    locked: false,
  }
}

/**
 * Parse the gate out of a queue rejection error message.
 * Format (from lib/ai/engine.ts): "Rejected: <reason> [<gate>]"
 * Returns null when there is no recognizable gate.
 */
export function parseAdmissionGate(error: string | null | undefined): string | null {
  if (!error) return null
  const m = /\[([a-z_]+)\]\s*$/.exec(error.trim())
  return m ? m[1] : null
}
