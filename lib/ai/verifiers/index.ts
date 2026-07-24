export * from "./realAfricaEligibility"
export * from "./realSalary"
export * from "./realRemote"
export * from "./realCompanyLegitimacy"
export * from "./realJobQuality"
export * from "./realExperience"
export * from "./realFreshness"

export interface VerificationBundle {
  africa: Awaited<ReturnType<typeof import("./realAfricaEligibility").verifyAfricaEligibilityReal>>
  salary: Awaited<ReturnType<typeof import("./realSalary").verifySalaryReal>>
  remote: Awaited<ReturnType<typeof import("./realRemote").verifyRemotePolicyReal>>
  company: Awaited<ReturnType<typeof import("./realCompanyLegitimacy").verifyCompanyLegitimacyReal>>
  quality: Awaited<ReturnType<typeof import("./realJobQuality").verifyJobQualityReal>>
  experience: Awaited<ReturnType<typeof import("./realExperience").verifyExperienceAndSkillsReal>>
  freshness: Awaited<ReturnType<typeof import("./realFreshness").verifyFreshnessReal>>
}

export async function verifyJobReal(job: any) {
  const { verifyAfricaEligibilityReal } = await import("./realAfricaEligibility")
  const { verifySalaryReal } = await import("./realSalary")
  const { verifyRemotePolicyReal } = await import("./realRemote")
  const { verifyCompanyLegitimacyReal } = await import("./realCompanyLegitimacy")
  const { verifyJobQualityReal } = await import("./realJobQuality")
  const { verifyExperienceAndSkillsReal } = await import("./realExperience")
  const { verifyFreshnessReal } = await import("./realFreshness")

  const [africa, salary, remote, company, quality, experience, freshness] = await Promise.all([
    verifyAfricaEligibilityReal(job).catch(() => ({ eligibility: "unknown", confidence: 10, evidence: "Failed", countryRestrictions: [], visaSponsorship: "unknown", languageRequirements: [], sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifySalaryReal(job).catch(() => ({ min: null, max: null, currency: null, period: null, isEstimated: false, transparency: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifyRemotePolicyReal(job).catch(() => ({ eligibility: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifyCompanyLegitimacyReal(job).catch(() => ({ legitimacy: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifyJobQualityReal(job).catch(() => ({ quality: "unknown", confidence: 10, evidence: "Failed", reasons: [], sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
    verifyExperienceAndSkillsReal(job).catch(() => ({ experience: { value: "unknown", confidence: 10 }, requiredSkills: { value: [], confidence: 10 }, transferableSkills: { value: [] }, missingSkills: { value: [] } } as any)),
    verifyFreshnessReal(job).catch(() => ({ status: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" } as any)),
  ])

  return { africa, salary, remote, company, quality, experience, freshness }
}
