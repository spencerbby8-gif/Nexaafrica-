import type { Job } from "@/lib/types"
import type { TrustSignal, TrustContext } from "../types"

export function duplicateDetectionSignal(job: Job, ctx?: TrustContext): TrustSignal | null {
  if (ctx?.isDuplicate && ctx.duplicateOf) {
    return {
      id: "duplicate_detection",
      label: "Possible duplicate",
      scoreImpact: -10,
      confidence: "medium",
      tone: "caution",
      explanation: `This listing appears similar to another active job (ID: ${ctx.duplicateOf.slice(0,8)}...). May be cross-posted across ATS sources.`,
      evidence: `Duplicate of: ${ctx.duplicateOf}`,
      source: "duplicate",
    }
  }

  // If source_id is present, it's deduplicated via unique index — positive signal of uniqueness handling
  if (job.source && job.source_id) {
    return {
      id: "duplicate_detection",
      label: "Unique source ID",
      scoreImpact: 5,
      confidence: "high",
      tone: "positive",
      explanation: `Job has unique source identifier ${job.source}:${job.source_id.slice(0,20)}... enabling accurate deduplication and refresh.`,
      evidence: `${job.source} / ${job.source_id}`,
      source: "duplicate",
    }
  }

  return null
}
