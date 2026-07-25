import { verifyAfricaEligibilityAI } from "./realAfricaEligibilityAI"
import { verifySalaryAI } from "./realSalaryAI"
import { verifyRemotePolicyAI } from "./realRemoteAI"
import { verifyCompanyLegitimacyAI } from "./realCompanyLegitimacyAI"
import { verifyJobQualityAI } from "./realJobQualityAI"
import { verifyExperienceAndSkillsAI } from "./realExperienceAI"
import { verifyFreshnessAI } from "./realFreshnessAI"

export * from "./realAfricaEligibilityAI"
export * from "./realSalaryAI"
export * from "./realRemoteAI"
export * from "./realCompanyLegitimacyAI"
export * from "./realJobQualityAI"
export * from "./realExperienceAI"
export * from "./realFreshnessAI"

export interface VerificationBundle {
  africa: Awaited<ReturnType<typeof verifyAfricaEligibilityAI>>
  salary: Awaited<ReturnType<typeof verifySalaryAI>>
  remote: Awaited<ReturnType<typeof verifyRemotePolicyAI>>
  company: Awaited<ReturnType<typeof verifyCompanyLegitimacyAI>>
  quality: Awaited<ReturnType<typeof verifyJobQualityAI>>
  experience: Awaited<ReturnType<typeof verifyExperienceAndSkillsAI>>
  freshness: Awaited<ReturnType<typeof verifyFreshnessAI>>
}

export async function verifyJobReal(job: any) {
  const [africa, salary, remote, company, quality, experience, freshness] = await Promise.all([
    verifyAfricaEligibilityAI(job).catch(() => ({ eligibility: "unknown", confidence: 10, evidence: "Failed", countryRestrictions: [], visaSponsorship: "unknown", languageRequirements: [], sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifySalaryAI(job).catch(() => ({ min: null, max: null, currency: null, period: null, isEstimated: false, transparency: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifyRemotePolicyAI(job).catch(() => ({ eligibility: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifyCompanyLegitimacyAI(job).catch(() => ({ legitimacy: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifyJobQualityAI(job).catch(() => ({ quality: "unknown", confidence: 10, evidence: "Failed", reasons: [], sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifyExperienceAndSkillsAI(job).catch(() => ({ experience: { value: "unknown", confidence: 10 }, requiredSkills: { value: [], confidence: 10 }, transferableSkills: { value: [] }, missingSkills: { value: [] } } as any)),
    verifyFreshnessAI(job).catch(() => ({ status: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
  ])

  return { africa, salary, remote, company, quality, experience, freshness }
}
