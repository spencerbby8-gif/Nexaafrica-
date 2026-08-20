import type { ProviderCallDiag } from "../gateway"
import type { Job } from "@/lib/types"
import { extractWithSingleAI, type ConsolidatedResult } from "./consolidated"

export interface VerificationBundle {
  africa: any; salary: any; remote: any; company: any; quality: any;
  experience: any; freshness: any; _diags: ProviderCallDiag[];
  _consolidated: ConsolidatedResult | null;
}

export async function verifyJobReal(job: Job): Promise<VerificationBundle> {
  try {
  const consolidated = await extractWithSingleAI(job)
  const { ai, diags, modelVersion } = consolidated
  const now = new Date().toISOString()

  // Map consolidated AI output to the legacy bundle format expected by enrichJobWithAI
  return {
    africa: {
      eligibility: ai.africa_eligibility,
      confidence: ai.africa_confidence,
      visaSponsorship: ai.visa_sponsorship,
      visaConfidence: ai.visa_confidence,  // [FIX #6] Pass visa-specific confidence
      evidence: ai.africa_evidence || "",
      countryRestrictions: ai.country_restrictions,
      languageRequirements: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion,
    },
    salary: {
      min: ai.salary_min,
      max: ai.salary_max,
      currency: ai.salary_currency,
      period: ai.salary_period,
      isEstimated: ai.salary_is_estimated,
      transparency: ai.salary_transparency,
      confidence: ai.salary_confidence,
      evidence: ai.salary_evidence || "",
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion,
    },
    remote: {
      eligibility: ai.remote_eligibility,
      confidence: ai.remote_confidence,
      evidence: ai.remote_evidence || "",
      timezoneRequirements: ai.timezone_requirements,
      travelRequirements: undefined,
      asyncFlexibility: false,
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion,
    },
    company: {
      legitimacy: ai.company_legitimacy,
      confidence: ai.company_confidence,
      evidence: ai.company_evidence || "",
      reason: consolidated.companyPageFetched ? `Company page fetched (${consolidated.companyPageLen} bytes)` : "No company page available",
      sourceUrls: consolidated.companyPageFetched ? [job.apply_url, (() => { try { return new URL(job.apply_url).origin } catch { return job.apply_url } })()] : [job.apply_url],
      lastVerified: now,
      modelVersion,
    },
    quality: {
      quality: ai.job_quality,
      confidence: ai.job_quality_confidence,
      evidence: ai.job_quality_evidence || "",
      reasons: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion,
    },
    experience: {
      experience: { value: ai.experience_level, confidence: ai.experience_confidence, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion },
      requiredSkills: { value: ai.required_skills, confidence: ai.experience_confidence, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion },
      transferableSkills: { value: ai.transferable_skills || [], confidence: 20 },
      missingSkills: { value: ai.missing_skills || [], confidence: 10 },
    },
    freshness: {
      status: ai.hiring_urgency === "high" ? "active" : ai.hiring_urgency === "low" ? "stale" : "unknown",
      confidence: ai.hiring_urgency_confidence,
      evidence: pageFetchedEvidence(consolidated),
      postedAgeDays: null,
      lastSeenAgeDays: null,
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion,
    },
    _diags: Object.assign(diags, { _pageStatus: consolidated.pageStatus, _evidenceProvenance: (consolidated as any).ai ? "page" : "regex", _evidenceBasis: consolidated.evidenceBasis ?? null }),
    _consolidated: consolidated,
  }
  } catch (e) {
    console.warn("[verifyJobReal] consolidated threw:", e instanceof Error ? e.message.slice(0,200) : String(e).slice(0,200));
    const now = new Date().toISOString();
    return { africa: { eligibility: "unknown", confidence: 0, evidence: null }, salary: { min: null, max: null, currency: null, period: null, isEstimated: false, transparency: "unknown", confidence: 0, evidence: null }, remote: { eligibility: "unknown", confidence: 0, evidence: null }, company: { legitimacy: "unknown", confidence: 0, evidence: null }, quality: { quality: "unknown", confidence: 0, evidence: null }, experience: { experience: { value: "unknown", confidence: 0 } }, freshness: { status: "unknown", confidence: 0 }, _diags: [], _consolidated: { ai: {}, diags: [], modelVersion: "verifyJobReal-threw", pageFetched: false, pageLen: 0, aiUsed: false } as any };
  }
}

function pageFetchedEvidence(c: ConsolidatedResult): string {
  if (c.pageFetched) return `Job page fetched (${c.pageLen} bytes), AI used: ${c.aiUsed}`
  return "Job page not fetched"
}
