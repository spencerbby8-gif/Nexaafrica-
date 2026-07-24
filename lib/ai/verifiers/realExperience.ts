import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
export async function verifyExperienceAndSkillsReal(job: Job) {
  const now = new Date().toISOString()
  const desc = cleanDescription(job.description_md)
  const titleLower = job.title.toLowerCase()
  let experience: "entry"|"mid"|"senior"|"executive"|"unknown" = "unknown"
  let expConfidence=30
  if(/intern|entry|junior|graduate|0-1 years?/i.test(titleLower+" "+desc)){experience="entry"; expConfidence=75}
  else if(/senior|staff|lead|principal|architect|manager|head/i.test(titleLower)){experience="senior"; expConfidence=70}
  else if(/director|vp|vice president|chief|executive|cto|ceo/i.test(titleLower)){experience="executive"; expConfidence=80}
  else if(/mid|3\+?\s*years?|5\+?\s*years?/i.test(desc)){experience="mid"; expConfidence=60}
  const requiredSkills=[...new Set(job.tags||[])].slice(0,20)
  const transferable:string[]=[]
  const transferablePatterns=[/communication/i,/leadership/i,/teamwork/i,/problem solving/i,/customer service/i,/project management/i]
  for(const pat of transferablePatterns){const m=desc.match(pat); if(m) transferable.push(m[0])}
  const missing:string[]=[]
  if(/us work authorization|us citizen|must reside in us/i.test(desc.toLowerCase())) missing.push("US work authorization")
  return {
    experience:{value:experience,confidence:expConfidence,evidence:`Title: ${job.title}`,sourceUrls:[job.apply_url],lastVerified:now,modelVersion:"rule-based-v1"},
    requiredSkills:{value:requiredSkills,confidence:60,evidence:`Tags: ${requiredSkills.join(", ")}`,sourceUrls:[job.apply_url],lastVerified:now,modelVersion:"rule-based-v1"},
    transferableSkills:{value:[...new Set(transferable)].slice(0,10),confidence:40,evidence:"Soft skills detected",sourceUrls:[job.apply_url],lastVerified:now,modelVersion:"rule-based-v1"},
    missingSkills:{value:missing,confidence:missing.length>0?75:30,evidence:missing.length>0?`Missing: ${missing.join(", ")}`:"No obvious missing",sourceUrls:[job.apply_url],lastVerified:now,modelVersion:"rule-based-v1"},
  }
}
