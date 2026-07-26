import { verifyAfricaEligibilityAI } from "./realAfricaEligibilityAI"
import { verifySalaryAI } from "./realSalaryAI"
import { verifyRemotePolicyAI } from "./realRemoteAI"
import { verifyCompanyLegitimacyAI } from "./realCompanyLegitimacyAI"
import { verifyJobQualityAI } from "./realJobQualityAI"
import { verifyExperienceAndSkillsAI } from "./realExperienceAI"
import { verifyFreshnessAI } from "./realFreshnessAI"
import type { ProviderCallDiag } from "../gateway"

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
  _diags: ProviderCallDiag[]
}

function catchFallback<T>(fallback: T, name: string, diagsCollector: ProviderCallDiag[]) {
  return (e: any): T => {
    if (e?.diag && Array.isArray(e.diag)) {
      for (const d of e.diag) diagsCollector.push(d)
    }
    if (e?.diag) {
      for (const d of e.diag) {
        if (d.event === 'failure') {
          console.log(JSON.stringify({
            scope: "ai_verifier", verifier: name, provider: d.provider,
            status: d.httpStatus, code: d.errorCode,
            msg: (d.errorMessage || '').slice(0, 200)
          }))
        }
      }
    }
    return fallback
  }
}

export async function verifyJobReal(job: any): Promise<VerificationBundle> {
  const diags: ProviderCallDiag[] = []

  const fallbackAfrica: any = { eligibility: "unknown", confidence: 10, evidence: "Failed", countryRestrictions: [], visaSponsorship: "unknown", languageRequirements: [], sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" }
  const fallbackSalary: any = { min: null, max: null, currency: null, period: null, isEstimated: false, transparency: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" }
  const fallbackRemote: any = { eligibility: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" }
  const fallbackCompany: any = { legitimacy: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" }
  const fallbackQuality: any = { quality: "unknown", confidence: 10, evidence: "Failed", reasons: [], sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" }
  const fallbackExp: any = { experience: { value: "unknown", confidence: 10 }, requiredSkills: { value: [], confidence: 10 }, transferableSkills: { value: [] }, missingSkills: { value: [] } }
  const fallbackFresh: any = { status: "unknown", confidence: 10, evidence: "Failed", sourceUrls: [job.apply_url], lastVerified: new Date().toISOString(), modelVersion: "error" }

  const [africa, salary, remote, company, quality, experience, freshness] = await Promise.all([
    verifyAfricaEligibilityAI(job).catch(catchFallback(fallbackAfrica, "africa", diags)),
    verifySalaryAI(job).catch(catchFallback(fallbackSalary, "salary", diags)),
    verifyRemotePolicyAI(job).catch(catchFallback(fallbackRemote, "remote", diags)),
    verifyCompanyLegitimacyAI(job).catch(catchFallback(fallbackCompany, "company", diags)),
    verifyJobQualityAI(job).catch(catchFallback(fallbackQuality, "quality", diags)),
    verifyExperienceAndSkillsAI(job).catch(catchFallback(fallbackExp, "experience", diags)),
    verifyFreshnessAI(job).catch(catchFallback(fallbackFresh, "freshness", diags)),
  ])

  return { africa, salary, remote, company, quality, experience, freshness, _diags: diags }
}
