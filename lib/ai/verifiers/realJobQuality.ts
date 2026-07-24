import type { Job } from "@/lib/types"
import { cleanDescription } from "@/lib/cleanDescription"
export async function verifyJobQualityReal(job: Job) {
  const now = new Date().toISOString()
  const desc = cleanDescription(job.description_md)
  let score=0
  const reasons:string[]=[]
  if (desc.length>500){score+=30; reasons.push("Detailed >500 chars")} else if(desc.length>200){score+=15; reasons.push("Adequate")} else reasons.push("Short <200")
  if(/responsibilities|what you'll do/i.test(desc)){score+=20; reasons.push("Has responsibilities")}
  if(/requirements|qualifications/i.test(desc)){score+=20; reasons.push("Has requirements")}
  if(/benefits|perks/i.test(desc)){score+=15; reasons.push("Lists benefits")}
  if(/apply/i.test(desc)){score+=15; reasons.push("Clear apply steps")}
  if(/pay.*to.*apply|buy.*kit/i.test(desc.toLowerCase())){score=Math.max(0,score-50); reasons.push("Scam language")}
  let quality: "high"|"medium"|"low"|"unknown" = "unknown"
  let confidence=50
  if(score>=70){quality="high"; confidence=80} else if(score>=40){quality="medium"; confidence=60} else if(score>=0){quality="low"; confidence=70}
  if(!desc){quality="unknown"; confidence=20}
  return { quality, confidence, evidence: reasons.join("; ").slice(0,300), reasons, sourceUrls: [job.apply_url], lastVerified: now, modelVersion: "rule-based-v1" }
}
