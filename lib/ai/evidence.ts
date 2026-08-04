import { createHash } from "crypto"
import type { Job } from "@/lib/types"

/**
 * [V1] Evidence service — the single place Nexa collects page evidence.
 *
 * Source preference order (public sources before rendered extraction):
 *   1. ATS APIs / ATS pages (already fetched at ingest; stored description)
 *   2. Structured data (JSON-LD) on the public job page
 *   3. Public job page HTML fetch (NexaBot user agent)
 *   4. Browser-rendered extraction (Playwright worker, scripts/evidence-worker)
 *
 * Every fetch writes a row to job_evidence_v1 and updates jobs.evidence_state.
 * States: queued | fetching | fetched | blocked | partial | verified | failed | stale.
 * A blocked page (challenge / 403 / 429) is recorded truthfully — verdicts are
 * NOT invented; existing verified evidence is preserved.
 */

export type EvidenceStatus = "queued" | "fetching" | "fetched" | "blocked" | "partial" | "verified" | "failed" | "stale"

export interface EvidenceRef {
  type: string
  sourceKind: string
  url: string | null
  hash: string | null
  status: EvidenceStatus
  httpStatus: number | null
  excerptLen: number
}

const CHALLENGE_RE = /cloudflare|cf-chl|challenge-platform|captcha|recaptcha|hcaptcha|access denied|attention required|just a moment/i

export function classifyBlockStatus(httpStatus: number | null, text: string): EvidenceStatus | null {
  if (httpStatus === 403 || httpStatus === 429 || httpStatus === 401) return "blocked"
  if (httpStatus != null && httpStatus >= 400) return "failed"
  if (text && CHALLENGE_RE.test(text.slice(0, 2000))) return "blocked"
  return null
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 32)
}

export interface EvidenceWrite {
  evidence_type: string
  source_url: string | null
  source_kind: string
  status: EvidenceStatus
  http_status?: number | null
  content_hash?: string | null
  excerpt?: string | null
  detail?: Record<string, unknown> | null
  fetched_at?: string | null
  retry_at?: string | null
}

async function upsertEvidence(sb: any, jobId: string, row: EvidenceWrite, setJobState = true): Promise<void> {
  try {
    await sb.from("job_evidence_v1").insert({ job_id: jobId, ...row })
    if (setJobState) {
      await sb.from("jobs").update({ evidence_state: row.status }).eq("id", jobId)
    }
  } catch (e) {
    console.log(JSON.stringify({ scope: "evidence", event: "write_error", jobId: String(jobId).slice(0, 8), error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }))
  }
}

function retryAt(status: EvidenceStatus): string | null {
  if (status === "blocked" || status === "failed") {
    // Retry in 6 hours — never within the same drain.
    return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
  }
  return null
}

/** Extract JSON-LD structured data blocks from an HTML string. */
export function extractStructuredData(html: string): any[] {
  const out: any[] = []
  try {
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      try {
        const parsed = JSON.parse(m[1].trim())
        out.push(parsed)
      } catch {}
    }
  } catch {}
  return out
}

/**
 * Fetch a job page as public evidence (plain fetch, NexaBot UA).
 * Prefers ATS-hosted pages' stored description (ingested via ATS APIs) —
 * the ATS API evidence is recorded as ats_api kind.
 */
export async function collectPageEvidence(sb: any, job: Job): Promise<{ state: EvidenceStatus; refs: EvidenceRef[] }> {
  const refs: EvidenceRef[] = []
  const atsHosts = ["boards.greenhouse.io", "jobs.ashbyhq.com", "jobs.lever.co", "apply.workable.com", "jobs.smartrecruiters.com", "recruitee.com", "comeet.com", "personio.com"]
  let host = ""
  try { host = new URL(job.apply_url).hostname } catch {}
  const isAts = atsHosts.some((h) => host.includes(h))

  // 1) ATS API / ATS-page evidence (from ingest) — always available when desc exists.
  if (job.description_md && job.description_md.length >= 100) {
    await upsertEvidence(sb, job.id, {
      evidence_type: "ats_api",
      source_url: job.apply_url,
      source_kind: "ats_api",
      status: "verified",
      http_status: 200,
      content_hash: sha256(job.description_md),
      excerpt: job.description_md.replace(/\s+/g, " ").slice(0, 800),
      detail: { bytes: job.description_md.length, via: isAts ? "ats_page" : "feed" },
      fetched_at: new Date().toISOString(),
    })
    refs.push({ type: "ats_api", sourceKind: "ats_api", url: job.apply_url, hash: sha256(job.description_md), status: "verified", httpStatus: 200, excerptLen: job.description_md.length })
  }

  // 2) Live page fetch (public source) — real evidence with honest status.
  let liveStatus: number | null = null
  let body = ""
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 8000)
    const res = await fetch(job.apply_url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; NexaBot/2.0; +https://v0-nexaafrica.vercel.app)", "Accept": "text/html,application/xhtml+xml" },
      signal: c.signal,
      redirect: "follow",
    })
    clearTimeout(t)
    liveStatus = res.status
    body = await res.text()
  } catch {
    liveStatus = null
  }

  const block = classifyBlockStatus(liveStatus, body)
  if (block) {
    await upsertEvidence(sb, job.id, {
      evidence_type: "page_html",
      source_url: job.apply_url,
      source_kind: "page_html",
      status: block,
      http_status: liveStatus,
      content_hash: body ? sha256(body) : null,
      excerpt: body ? body.replace(/\s+/g, " ").slice(0, 300) : null,
      detail: { challenge: CHALLENGE_RE.test(body.slice(0, 2000)) ? "detected" : null },
      fetched_at: new Date().toISOString(),
      retry_at: retryAt(block),
    })
    refs.push({ type: "page_html", sourceKind: "page_html", url: job.apply_url, hash: body ? sha256(body) : null, status: block, httpStatus: liveStatus, excerptLen: body.length })
    return { state: block, refs }
  }

  if (liveStatus != null && liveStatus >= 200 && liveStatus < 300) {
    // Structured data from the live page (preferred public source).
    const ld = extractStructuredData(body)
    let structuredState: EvidenceStatus = "fetched"
    if (ld.length > 0) structuredState = "verified"
    await upsertEvidence(sb, job.id, {
      evidence_type: "structured_data",
      source_url: job.apply_url,
      source_kind: "structured_data",
      status: structuredState,
      http_status: liveStatus,
      content_hash: sha256(JSON.stringify(ld).slice(0, 4000)),
      excerpt: JSON.stringify(ld).slice(0, 500),
      detail: { blocks: ld.length },
      fetched_at: new Date().toISOString(),
    })
    refs.push({ type: "structured_data", sourceKind: "structured_data", url: job.apply_url, hash: sha256(JSON.stringify(ld).slice(0, 4000)), status: structuredState, httpStatus: liveStatus, excerptLen: JSON.stringify(ld).length })

    await upsertEvidence(sb, job.id, {
      evidence_type: "page_html",
      source_url: job.apply_url,
      source_kind: "page_html",
      status: "fetched",
      http_status: liveStatus,
      content_hash: sha256(body),
      excerpt: body.replace(/\s+/g, " ").slice(0, 800),
      detail: { bytes: body.length, state: "partial_fetch" },
      fetched_at: new Date().toISOString(),
    })
    refs.push({ type: "page_html", sourceKind: "page_html", url: job.apply_url, hash: sha256(body), status: "fetched", httpStatus: liveStatus, excerptLen: body.length })
    return { state: "fetched", refs }
  }

  // Timeout / network error — record failed, retry later.
  await upsertEvidence(sb, job.id, {
    evidence_type: "page_html",
    source_url: job.apply_url,
    source_kind: "page_html",
    status: "failed",
    http_status: liveStatus,
    detail: { error: "fetch timeout or network error" },
    fetched_at: new Date().toISOString(),
    retry_at: retryAt("failed"),
  })
  refs.push({ type: "page_html", sourceKind: "page_html", url: job.apply_url, hash: null, status: "failed", httpStatus: liveStatus, excerptLen: 0 })
  return { state: "failed", refs }
}
