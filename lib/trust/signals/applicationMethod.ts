import type { Job } from "@/lib/types"
import type { TrustSignal } from "../types"

const TRUSTED_ATS_HOSTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.eu.lever.co",
  "jobs.ashbyhq.com",
  "apply.workable.com",
  "jobs.workable.com",
  "jobs.smartrecruiters.com",
  "careers.smartrecruiters.com",
  "app.dover.com",
])

const GENERIC_SEGMENTS = new Set(["careers","career","jobs","job","join","hiring","opportunities","roles","positions","apply","home","","/"])

function hasJobIdSegment(pathname: string): boolean {
  const segs = pathname.split("/").filter(Boolean)
  if (segs.length === 0) return false
  if (segs.length === 1 && GENERIC_SEGMENTS.has(segs[0].toLowerCase())) return false
  return segs.some(s => /^\d{3,}$/.test(s) || /^[0-9a-f]{8}-/.test(s) || (/\d/.test(s) && s.length>=4) || (s.match(/-/g)||[]).length>=2)
}

export function applicationMethodSignal(job: Job): TrustSignal {
  let url: URL
  try {
    url = new URL(job.apply_url)
  } catch {
    return {
      id: "application_method",
      label: "Invalid apply URL",
      scoreImpact: -15,
      confidence: "high",
      tone: "warning",
      explanation: "Apply URL is not a valid URL. High scam risk.",
      evidence: job.apply_url,
      source: "application",
    }
  }

  if (url.protocol !== "https:") {
    return {
      id: "application_method",
      label: "Non-HTTPS apply link",
      scoreImpact: -10,
      confidence: "high",
      tone: "caution",
      explanation: "Apply link is not HTTPS. Legitimate companies use secure application portals.",
      evidence: job.apply_url,
      source: "application",
    }
  }

  const host = url.hostname.toLowerCase()

  // Gmail/outlook apply emails in URL? e.g. mailto: or URL containing gmail
  if (host.includes("gmail.com") || host.includes("outlook.com") || host.includes("yahoo.com") || job.apply_url.includes("@gmail.com")) {
    return {
      id: "application_method",
      label: "Personal email apply",
      scoreImpact: -12,
      confidence: "high",
      tone: "warning",
      explanation: "Apply method uses personal email (Gmail/Outlook), not corporate ATS. Common in scam listings.",
      evidence: job.apply_url,
      source: "application",
    }
  }

  if (TRUSTED_ATS_HOSTS.has(host)) {
    const hasId = hasJobIdSegment(url.pathname)
    if (hasId || url.pathname.split("/").filter(Boolean).length >= 2) {
      return {
        id: "application_method",
        label: `Direct ATS apply • ${host}`,
        scoreImpact: 15,
        confidence: "high",
        tone: "positive",
        explanation: `Apply link goes directly to verified ATS host ${host} with specific job ID. You apply on the company's official system, not via Nexa.`,
        evidence: job.apply_url,
        source: "application",
      }
    }
  }

  // Generic landing page
  const segs = url.pathname.split("/").filter(Boolean)
  if (segs.length <= 1) {
    return {
      id: "application_method",
      label: "Generic careers page",
      scoreImpact: -10,
      confidence: "medium",
      tone: "caution",
      explanation: "Apply URL points to generic careers homepage, not specific role. May be outdated or redirect.",
      evidence: job.apply_url,
      source: "application",
    }
  }

  // [TRUTH LAYER v1] Job boards are NOT the company's own domain. Proven
  // live: users were told "Apply link is on company domain himalayas.app —
  // direct application". A board apply is still fine — but it is described
  // truthfully, and it does not impersonate employer-domain provenance.
  const KNOWN_BOARD_HOSTS = new Set([
    "himalayas.app",
    "remoteok.com",
    "remoteok.io",
    "remotive.com",
    "weworkremotely.com",
    "remote.co",
    "workingnomads.com",
    "jobspresso.co",
    "flexjobs.com",
    "indeed.com",
    "linkedin.com",
  ])
  if (KNOWN_BOARD_HOSTS.has(host) || KNOWN_BOARD_HOSTS.has(host.replace(/^www\./, ""))) {
    return {
      id: "application_method",
      label: `Job board apply • ${host}`,
      scoreImpact: 4,
      confidence: "medium",
      tone: "positive",
      explanation: `Apply link goes to the job board ${host} with a job-specific path. You apply on the board that carries this listing, not on the company's own site.`,
      evidence: job.apply_url,
      source: "application",
    }
  }

  // Default: direct company domain with job-id
  if (hasJobIdSegment(url.pathname)) {
    return {
      id: "application_method",
      label: "Direct company apply",
      scoreImpact: 8,
      confidence: "medium",
      tone: "positive",
      explanation: `Apply link is on company domain ${host} with job-specific path, indicating direct application.`,
      evidence: job.apply_url,
      source: "application",
    }
  }

  return {
    id: "application_method",
    label: "Company website apply",
    scoreImpact: 2,
    confidence: "low",
    tone: "neutral",
    explanation: "Apply link goes to company website. Verify it's the specific role before applying.",
    evidence: job.apply_url,
    source: "application",
  }
}
