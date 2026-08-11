import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"

export function postingFreshnessSignal(job: Job): TrustSignal {
  const now = Date.now()
  const postedAt = job.posted_at ? new Date(job.posted_at).getTime() : null
  const expiresAt = job.expires_at ? new Date(job.expires_at).getTime() : null
  const createdAt = new Date(job.created_at).getTime()

  // [TRUTH LAYER v1] Fabricated-date honesty. Several feeds publish no real
  // posting date; ingest then coalesces posted_at := created_at (DB trigger),
  // which made EVERY such job read "Fresh • 0 days" (+12) forever — fabricated
  // freshness evidence at scale (audit P2-2). Detector: posted_at ===
  // created_at to the millisecond can only arise from the coalesce path.
  // Honest treatment: no freshness impact, and the signal says why.
  const fabricatedDate =
    postedAt != null && postedAt === createdAt

  const effectivePosted = postedAt || createdAt
  const ageDays = (now - effectivePosted) / (1000 * 60 * 60 * 24)

  if (fabricatedDate) {
    return {
      id: "posting_freshness",
      label: "Listed recently · no date from source",
      scoreImpact: 0,
      confidence: "low",
      tone: "neutral",
      explanation:
        "This source publishes no posting date, so Nexa cannot verify freshness. The listing time shown is when Nexa ingested it — not evidence of freshness.",
      evidence: `Ingested: ${job.created_at}`,
      source: "freshness",
    }
  }

  if (expiresAt && expiresAt < now) {
    return {
      id: "posting_freshness",
      label: "Expired",
      scoreImpact: -20,
      confidence: "high",
      tone: "warning",
      explanation: `This role expired on ${job.expires_at ? new Date(job.expires_at).toLocaleDateString() : "unknown date"} according to source. May no longer be hiring.`,
      evidence: `Expires: ${job.expires_at}`,
      source: "freshness",
    }
  }

  if (ageDays <= 3) {
    return {
      id: "posting_freshness",
      label: `Fresh • ${Math.floor(ageDays)} days ago`,
      scoreImpact: 12,
      confidence: "high",
      tone: "positive",
      explanation: `Posted ${Math.floor(ageDays)} days ago. Very fresh listing from official feed.`,
      evidence: `Posted: ${job.posted_at}`,
      source: "freshness",
    }
  }

  if (ageDays <= 7) {
    return {
      id: "posting_freshness",
      label: `Fresh • ${Math.floor(ageDays)}d ago`,
      scoreImpact: 10,
      confidence: "high",
      tone: "positive",
      explanation: `Posted ${Math.floor(ageDays)} days ago. Fresh role, actively hiring.`,
      evidence: `Posted: ${job.posted_at}`,
      source: "freshness",
    }
  }

  if (ageDays <= 30) {
    return {
      id: "posting_freshness",
      label: `Active • ${Math.floor(ageDays)}d ago`,
      scoreImpact: 5,
      confidence: "medium",
      tone: "neutral",
      explanation: `Posted ${Math.floor(ageDays)} days ago. Still within active hiring window.`,
      evidence: `Posted: ${job.posted_at}`,
      source: "freshness",
    }
  }

  if (ageDays <= 90) {
    return {
      id: "posting_freshness",
      label: `Aging • ${Math.floor(ageDays)}d ago`,
      scoreImpact: -5,
      confidence: "medium",
      tone: "caution",
      explanation: `Posted ${Math.floor(ageDays)} days ago. Role may still be open but verify with company.`,
      evidence: `Posted: ${job.posted_at}`,
      source: "freshness",
    }
  }

  return {
    id: "posting_freshness",
    label: `Stale • ${Math.floor(ageDays)}d ago`,
    scoreImpact: -12,
    confidence: "high",
    tone: "warning",
    explanation: `Posted ${Math.floor(ageDays)} days ago (>90d). High chance role is filled or stale. Check company site.`,
    evidence: `Posted: ${job.posted_at}`,
    source: "freshness",
  }
}
