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
