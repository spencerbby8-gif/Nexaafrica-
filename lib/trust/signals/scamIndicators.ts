import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"

const SCAM_PATTERNS: Array<{ re: RegExp; label: string; impact: number; explanation: string }> = [
  { re: /pay (to|\$).*apply|pay.*fee.*apply|application fee/i, label: "Pay to apply", impact: -20, explanation: "Posting asks for payment to apply. Legitimate remote jobs never require fees. High scam risk." },
  { re: /buy.*starter kit|buy.*training kit/i, label: "Buy starter kit", impact: -20, explanation: "Asks to buy starter kit/training kit. Classic work-from-home scam pattern." },
  { re: /crypto.*investment|invest.*crypto|double your investment/i, label: "Crypto investment pitch", impact: -20, explanation: "Contains crypto investment language unrelated to job role. Scam indicator." },
  { re: /whatsapp.*\d{8,}|telegram.*join|message.*telegram/i, label: "WhatsApp/Telegram apply", impact: -15, explanation: "Uses WhatsApp/Telegram as primary application method, not corporate ATS. Common in scam listings." },
  { re: /envelope stuffing|get paid to (click|share|like)/i, label: "Envelope stuffing / paid to click", impact: -20, explanation: "Contains known work-from-home scam tropes." },
  { re: /earn \$5000.*week|earn \$10000.*month.*no experience/i, label: "Unrealistic earnings", impact: -15, explanation: "Promises unrealistic earnings with no experience. Legitimate roles disclose realistic ranges." },
]

export function scamIndicatorsSignal(job: Job): TrustSignal | null {
  const text = `${job.title} ${job.description_md}`.toLowerCase()
  const titleCapsRatio = job.title.length > 0 ? (job.title.match(/[A-Z]/g)?.length || 0) / job.title.length : 0

  for (const pattern of SCAM_PATTERNS) {
    if (pattern.re.test(text)) {
      return {
        id: "scam_indicators",
        label: pattern.label,
        scoreImpact: pattern.impact,
        confidence: "high",
        tone: "warning",
        explanation: pattern.explanation,
        evidence: pattern.re.exec(text)?.[0]?.slice(0, 160),
        source: "scam-check",
      }
    }
  }

  // Excessive caps in title
  if (titleCapsRatio > 0.6 && job.title.length > 10) {
    return {
      id: "scam_indicators",
      label: "Excessive caps in title",
      scoreImpact: -8,
      confidence: "medium",
      tone: "caution",
      explanation: "Title is mostly uppercase, often used in spam/scam listings to grab attention.",
      evidence: job.title,
      source: "scam-check",
    }
  }

  // Salary unrealistic for internship
  if (job.employment_type === "internship" && job.salary_max && job.salary_max > 200000) {
    return {
      id: "scam_indicators",
      label: "Unrealistic intern salary",
      scoreImpact: -12,
      confidence: "medium",
      tone: "warning",
      explanation: `Internship claims $${job.salary_max} max, which is unrealistic. Potential bait.`,
      evidence: job.salary_range || undefined,
      source: "scam-check",
    }
  }

  // Description too short (<100 chars) — low effort / possible scam
  if (job.description_md.trim().length < 100) {
    return {
      id: "scam_indicators",
      label: "Very short description",
      scoreImpact: -8,
      confidence: "medium",
      tone: "caution",
      explanation: "Description is under 100 characters. Legitimate employers provide detailed role info.",
      evidence: `${job.description_md.length} chars`,
      source: "scam-check",
    }
  }

  // No scam indicators found — positive signal
  return {
    id: "scam_indicators",
    label: "No scam patterns detected",
    scoreImpact: 8,
    confidence: "medium",
    tone: "positive",
    explanation: "Nexa scanned for common scam patterns (pay to apply, crypto pitch, WhatsApp apply, unrealistic pay) and found none.",
    source: "scam-check",
  }
}
