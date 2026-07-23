import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"

export function locationConsistencySignal(job: Job): TrustSignal | null {
  const location = (job.location || "").toLowerCase()
  const country = (job.country || "").toLowerCase()
  const description = (job.description_md || "").toLowerCase()

  // If location says worldwide but eligibility restricted -> inconsistency
  if (location.includes("worldwide") || location.includes("anywhere")) {
    if (job.eligibility === "restricted") {
      return {
        id: "location_consistency",
        label: "Location mismatch",
        scoreImpact: -12,
        confidence: "high",
        tone: "warning",
        explanation: `Location says worldwide/anywhere but posting contains geographic restrictions (eligibility: ${job.eligibility}). Check requirements carefully.`,
        evidence: `Location: ${job.location} | Eligibility: ${job.eligibility}`,
        source: "location",
      }
    }
  }

  // If country field says Nigeria but location says US only
  if (country && location) {
    if (country.includes("nigeria") && /(us only|united states only|us based only)/i.test(location + " " + description)) {
      return {
        id: "location_consistency",
        label: "Country vs description mismatch",
        scoreImpact: -8,
        confidence: "medium",
        tone: "caution",
        explanation: `Country field says ${job.country} but description mentions US-only. Possible inconsistency in location data.`,
        evidence: `Country: ${job.country}, Location: ${job.location}`,
        source: "location",
      }
    }
  }

  // Consistent case
  if (job.location && job.country) {
    return {
      id: "location_consistency",
      label: "Location consistent",
      scoreImpact: 5,
      confidence: "medium",
      tone: "positive",
      explanation: `Location "${job.location}" aligns with country "${job.country}" and remote policy.`,
      evidence: `${job.location} — ${job.country}`,
      source: "location",
    }
  }

  return null
}
