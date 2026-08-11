export interface AuditLog {
  id?: string
  decision: string
  evidence: string[]
  model: string
  confidence: number
  action: string
  timestamp: string
  jobId?: string
  userId?: string
  version: number
}

/**
 * Audit Log — records every decision, evidence set, model used, confidence, action taken, timestamp
 * Makes every AI decision traceable
 */
export async function logAudit(entry: Omit<AuditLog, "timestamp" | "version"> & { timestamp?: string }) {
  const log: AuditLog = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
    version: 1,
  }

  // In production, insert into trust_audit_log or ai_audit_log table
  // For foundation, log to console + attempt DB insert if table exists
  console.log(`[AI AUDIT] ${log.decision} | model=${log.model} confidence=${log.confidence} action=${log.action} job=${log.jobId || "n/a"}`)

  // [TRUTH LAYER v1] trust_audit_log has a CHECK constraint:
  //   action IN ('flagged','unflagged','score_updated','report_reviewed','auto_flagged')
  // (migration 20260723120000_trust_engine.sql:61). The AI gateway was
  // calling this with action "allow" — every row was rejected at the DB
  // CHECK and the error swallowed (PostgREST returns errors, it doesn't
  // throw): the audit table was empty by construction. Only persist actions
  // the schema actually permits; everything else stays console-visible.
  const PERSISTABLE_ACTIONS = new Set(["flagged", "unflagged", "score_updated", "report_reviewed", "auto_flagged"])
  if (!PERSISTABLE_ACTIONS.has(log.action)) {
    console.log(JSON.stringify({ scope: "ai_audit", event: "action_not_persistable", action: log.action, decision: log.decision.slice(0, 120) }))
    return log
  }

  try {
    // Dynamic import to avoid circular
    const { createServiceClient } = await import("@/lib/supabase/service")
    const supabase = createServiceClient()
    await supabase.from("trust_audit_log").insert({
      job_id: log.jobId || null,
      action: log.action as any,
      old_score: null,
      new_score: null,
      reason: `${log.decision} | evidence: ${log.evidence.join("; ").slice(0,500)}`,
    })
  } catch {
    // Non-fatal, audit log failure shouldn't break main flow
  }

  return log
}
