import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"

type Tier = "high" | "medium" | "low" | "unknown"

const TIER_MAP: Record<string, { tier: Tier; label: string; impact: number; explanation: string }> = {
  greenhouse: { tier: "high", label: "Greenhouse ATS", impact: 15, explanation: "Greenhouse is a premium ATS used by vetted tech companies. Listings include structured job IDs and are hard to spoof." },
  lever: { tier: "high", label: "Lever ATS", impact: 15, explanation: "Lever is a premium ATS with verified company boards and direct apply links." },
  ashby: { tier: "high", label: "Ashby ATS", impact: 15, explanation: "Ashby is used by modern remote-first companies. High trust source." },
  workable: { tier: "medium", label: "Workable ATS", impact: 10, explanation: "Workable is a widely used ATS. Verified feed but broader company range." },
  smartrecruiters: { tier: "medium", label: "SmartRecruiters ATS", impact: 10, explanation: "SmartRecruiters is an enterprise ATS with validated postings." },
  recruitee: { tier: "medium", label: "Recruitee ATS", impact: 10, explanation: "Recruitee is a vetted ATS with structured API." },
  personio: { tier: "medium", label: "Personio ATS", impact: 8, explanation: "Personio is used by European companies with verified feeds." },
  comeet: { tier: "medium", label: "Comeet ATS", impact: 8, explanation: "Comeet is a trusted ATS with public API." },
}

export function atsSourceQualitySignal(job: Job): TrustSignal {
  const source = (job.source || "").toLowerCase()
  const mapped = TIER_MAP[source]

  if (mapped) {
    return {
      id: "ats_source_quality",
      label: mapped.label,
      scoreImpact: mapped.impact,
      confidence: mapped.tier === "high" ? "high" : "medium",
      tone: mapped.tier === "high" ? "positive" : "neutral",
      explanation: mapped.explanation,
      evidence: `ATS: ${job.source} / ${job.source_id || job.apply_url}`,
      source: "ats",
    }
  }

  // Manual /api/ingest or unknown source
  if (!job.source) {
    return {
      id: "ats_source_quality",
      label: "Manual submission",
      scoreImpact: -5,
      confidence: "low",
      tone: "caution",
      explanation: "This listing was submitted manually, not via automated ATS feed. Extra verification recommended.",
      evidence: job.apply_url,
      source: "ats",
    }
  }

  return {
    id: "ats_source_quality",
    label: `ATS: ${job.source}`,
    scoreImpact: 5,
    confidence: "low",
    tone: "neutral",
    explanation: `Listing from ${job.source} ATS. Feed is structured but less common than top-tier ATS.`,
    evidence: `Source: ${job.source}`,
    source: "ats",
  }
}
