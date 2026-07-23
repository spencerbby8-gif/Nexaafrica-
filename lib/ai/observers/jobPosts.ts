import type { Job } from "@/lib/types"

export interface ObserverAlert {
  type: string
  severity: "low" | "medium" | "high"
  jobId: string
  reason: string
  evidence: string
  source: string
  timestamp: string
}

/**
 * Observer: Watches job posts for suspicious patterns, no direct punishment, only alerts
 */
export function observeJobPost(job: Job): ObserverAlert[] {
  const alerts: ObserverAlert[] = []
  const text = `${job.title} ${job.description_md}`.toLowerCase()
  const now = new Date().toISOString()

  // Pay to apply
  if (/pay.*to.*apply|pay.*fee|buy.*kit|envelope stuffing/i.test(text)) {
    alerts.push({
      type: "scam_pay_to_apply",
      severity: "high",
      jobId: job.id,
      reason: "Job asks for payment to apply",
      evidence: text.slice(0,200),
      source: job.apply_url,
      timestamp: now,
    })
  }

  // WhatsApp/Telegram apply
  if (/whatsapp|telegram.*join|message.*telegram/i.test(text)) {
    alerts.push({
      type: "suspicious_apply_method",
      severity: "medium",
      jobId: job.id,
      reason: "Uses WhatsApp/Telegram as primary apply method",
      evidence: text.slice(0,200),
      source: job.apply_url,
      timestamp: now,
    })
  }

  // Unrealistic salary
  if (job.salary_max && job.salary_max > 500000 && job.employment_type === "internship") {
    alerts.push({
      type: "unrealistic_salary",
      severity: "high",
      jobId: job.id,
      reason: `Internship claims $${job.salary_max} unrealistic`,
      evidence: job.salary_range || "",
      source: job.apply_url,
      timestamp: now,
    })
  }

  // Very short description
  if (job.description_md.length < 100) {
    alerts.push({
      type: "short_description",
      severity: "low",
      jobId: job.id,
      reason: "Description under 100 chars, low effort",
      evidence: `${job.description_md.length} chars`,
      source: job.apply_url,
      timestamp: now,
    })
  }

  return alerts
}
