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
      systemInstruction: "You are an experience and skills extractor. Be evidence-based, never guess. Return UNKNOWN when evidence missing. Extract verbatim quote from description as evidence, not generic title.",
      agentId: "verifier:experience-skills",
      jobId: job.id,
      temperature: 0.2,
      maxTokens: 600,
    })
    const text = gwResult.response.text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const ev = (parsed.experience?.evidence || "").toString().trim()
      const isGeneric = /^(title:)/i.test(ev)
      return {
        experience: { value: parsed.experience?.value || "unknown", confidence: parsed.experience?.confidence || 20, evidence: isGeneric ? "" : ev.slice(0,200), sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gwResult.response.provider}:${gwResult.response.model}` },
        requiredSkills: { value: parsed.requiredSkills?.value || job.tags || [], confidence: parsed.requiredSkills?.confidence || 50, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gwResult.response.provider}:${gwResult.response.model}` },
        transferableSkills: { value: parsed.transferableSkills?.value || [], confidence: parsed.transferableSkills?.confidence || 30, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gwResult.response.provider}:${gwResult.response.model}` },
        missingSkills: { value: parsed.missingSkills?.value || [], confidence: parsed.missingSkills?.confidence || 30, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: `${gwResult.response.provider}:${gwResult.response.model}` },
      }
    }
  } catch (e) {
    console.warn(`[Experience Verifier] AI failed, unknown: ${e instanceof Error ? e.message : String(e)}`)
  }

  return {
    experience: { value: "unknown" as const, confidence: 10, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "failed-no-evidence" },
    requiredSkills: { value: job.tags || [], confidence: 20, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "failed-no-evidence" },
    transferableSkills: { value: [], confidence: 10, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "failed-no-evidence" },
    missingSkills: { value: [], confidence: 10, evidence: "", sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "failed-no-evidence" },
  }
}

export const verifyExperienceAndSkillsReal = verifyExperienceAndSkillsAI
