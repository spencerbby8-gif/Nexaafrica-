import type { Job } from "@/lib/types"
import { aiGateway } from "../gateway"

export async function verifyExperienceAndSkillsAI(job: Job) {
  const now = new Date().toISOString()

  const prompt = `Extract experience level and skills for this job.

Title: ${job.title}
Company: ${job.company}
Description (first 3000 chars): ${job.description_md.slice(0,3000)}
Tags: ${(job.tags||[]).join(", ")}

Determine:
- Experience level: entry/mid/senior/executive/unknown (e.g., intern/entry/junior => entry, senior/staff/lead/principal => senior, director/VP/Chief => executive)
- Required skills: list from tags + description (e.g., React, Node.js, customer support)
- Transferable skills: soft skills that transfer (communication, leadership, etc)
- Missing skills: for African talent, what might be missing (e.g., US work authorization)

Return JSON only:
{
  "experience": {"value": "entry|mid|senior|executive|unknown", "confidence": 0-100, "evidence": "verbatim quote"},
  "requiredSkills": {"value": ["React","Node.js"], "confidence": 0-100, "evidence": "..."},
  "transferableSkills": {"value": ["communication"], "confidence": 0-100},
  "missingSkills": {"value": ["US work authorization"], "confidence": 0-100}
}`

  try {
    const gwResult = await aiGateway({
      prompt,
      systemInstruction: "You are an experience and skills extractor. Be evidence-based, never guess. Return UNKNOWN when evidence missing. Extract from description, not title alone.",
      agentId: "verifier:experience-skills",
      jobId: job.id,
      temperature: 0.2,
      maxTokens: 600,
    })
    const text = gwResult.response.text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return {
        experience: { value: parsed.experience?.value || "unknown", confidence: parsed.experience?.confidence || 20, evidence: (parsed.experience?.evidence || "").slice(0,200), sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gwResult.response.provider}:${gwResult.response.model}` },
        requiredSkills: { value: parsed.requiredSkills?.value || job.tags || [], confidence: parsed.requiredSkills?.confidence || 50, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gwResult.response.provider}:${gwResult.response.model}` },
        transferableSkills: { value: parsed.transferableSkills?.value || [], confidence: parsed.transferableSkills?.confidence || 30, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gwResult.response.provider}:${gwResult.response.model}` },
        missingSkills: { value: parsed.missingSkills?.value || [], confidence: parsed.missingSkills?.confidence || 30, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gwResult.response.provider}:${gwResult.response.model}` },
      }
    }
  } catch (e) {
    console.warn(`[Experience Verifier] AI failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Fallback rule-based
  const titleLower = job.title.toLowerCase()
  let experience: "entry" | "mid" | "senior" | "executive" | "unknown" = "unknown"
  let conf = 30
  if (/intern|entry|junior|graduate/i.test(titleLower)) { experience = "entry"; conf = 75 }
  else if (/senior|staff|lead|principal/i.test(titleLower)) { experience = "senior"; conf = 70 }
  else if (/director|vp|chief|cto|ceo/i.test(titleLower)) { experience = "executive"; conf = 80 }
  else if (/mid/i.test(titleLower)) { experience = "mid"; conf = 60 }

  return {
    experience: { value: experience, confidence: conf, evidence: `Title: ${job.title}`, sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" },
    requiredSkills: { value: job.tags || [], confidence: 50, evidence: `Tags: ${(job.tags||[]).join(", ")}`, sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" },
    transferableSkills: { value: [], confidence: 20, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" },
    missingSkills: { value: [], confidence: 20, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-fallback" },
  }
}

export const verifyExperienceAndSkillsReal = verifyExperienceAndSkillsAI
