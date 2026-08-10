import type { ProviderCallDiag } from "../gateway"
import type { Job } from "@/lib/types"
import { extractWithSingleAI, type ConsolidatedResult } from "./consolidated"
// Deterministic owners (the DETERMINISTIC files, not the AI-variant
// re-exports): when the AI dimension is unknown/abstains, the deterministic
// owner decides. These were dead code — nothing imported them — so AI-only
// runs left Africa eligibility / company legitimacy as "unknown" even when
// the deterministic verifier had an evidence-backed answer (verified in
// production: 59% of recent JAI rows africa_unknown, 56% company_unknown
// while jobs.eligibility said likely/explicit).
import { verifyAfricaEligibilityReal as deterministicAfrica } from "./realAfricaEligibility"
import { verifyCompanyLegitimacyReal as deterministicCompany } from "./realCompanyLegitimacy"

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

  // ── Deterministic-owner fallback (Africa eligibility, company legitimacy) ──
  // When the AI dimension is "unknown" (abstention / AI failure / regex gap),
  // the deterministic owner decides — never seal AI failure as unknown while a
  // deterministic, evidence-backed verdict exists. Each deterministic
  // verifier returns its own honest evidence + confidence + modelVersion.
  // Runs only when needed, in parallel, and never overwrites a real AI answer.
  const [detAfrica, detCompany] = await Promise.all([
    ai.africa_eligibility === "unknown" ? deterministicAfrica(job).catch(() => null) : Promise.resolve(null),
    ai.company_legitimacy === "unknown" ? deterministicCompany(job).catch(() => null) : Promise.resolve(null),
  ])

  // Map consolidated AI output to the legacy bundle format expected by enrichJobWithAI
  return {
    africa: {
      eligibility: ai.africa_eligibility !== "unknown" ? ai.africa_eligibility : (detAfrica?.eligibility ?? "unknown"),
      confidence: ai.africa_eligibility !== "unknown" ? ai.africa_confidence : (detAfrica?.confidence ?? 0),
      visaSponsorship: ai.visa_sponsorship,
      visaConfidence: ai.visa_confidence,  // [FIX #6] Pass visa-specific confidence
      evidence: ai.africa_eligibility !== "unknown" ? (ai.africa_evidence || "") : (detAfrica?.evidence ?? ""),
      countryRestrictions: ai.africa_eligibility !== "unknown" ? ai.country_restrictions : (detAfrica?.countryRestrictions ?? []),
      languageRequirements: [],
      sourceUrls: [job.apply_url],
      lastVerified: now,
      modelVersion: ai.africa_eligibility !== "unknown" ? modelVersion : (detAfrica?.modelVersion ?? modelVersion),
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
      legitimacy: ai.company_legitimacy !== "unknown" ? ai.company_legitimacy : (detCompany?.legitimacy ?? "unknown"),
      confidence: ai.company_legitimacy !== "unknown" ? ai.company_confidence : (detCompany?.confidence ?? 0),
      evidence: ai.company_legitimacy !== "unknown" ? (ai.company_evidence || "") : (detCompany?.evidence ?? ""),
      reason: consolidated.companyPageFetched ? `Company page fetched (${consolidated.companyPageLen} bytes)` : "No company page available",
      sourceUrls: consolidated.companyPageFetched ? [job.apply_url, (() => { try { return new URL(job.apply_url).origin } catch { return job.apply_url } })()] : [job.apply_url],
      lastVerified: now,
      modelVersion: ai.company_legitimacy !== "unknown" ? modelVersion : (detCompany?.modelVersion ?? modelVersion),
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
    _diags: Object.assign(diags, { _pageStatus: consolidated.pageStatus, _evidenceProvenance: (consolidated as any).ai ? "page" : "regex" }),
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
