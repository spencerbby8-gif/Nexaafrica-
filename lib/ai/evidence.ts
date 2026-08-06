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

/** [V1.1] The legal crawler-state vocabulary (mirrors migration 20260805000000).
 *  Every writer (collector, browser worker) MUST produce a state in this set —
 *  anything else would be a made-up state the UI cannot describe truthfully. */
export const EVIDENCE_STATES: readonly EvidenceStatus[] = ["queued", "fetching", "fetched", "blocked", "partial", "verified", "failed", "stale"]

export function isEvidenceState(x: unknown): x is EvidenceStatus {
  return typeof x === "string" && (EVIDENCE_STATES as readonly string[]).includes(x)
}

/** [V1.1] Honest, human copy for every crawler state (shared by UI + fixtures).
 *  Never render the raw enum — it is internal vocabulary, not user language. */
export function crawlerStateLabel(state: string): { label: string; tone: "red" | "green" | "amber" } {
  switch (state) {
    case "blocked": return { label: "Page blocked — evidence unavailable, retrying later", tone: "red" }
    case "verified": return { label: "Page evidence verified from the live posting", tone: "green" }
    case "fetched": return { label: "Page evidence collected from the live posting", tone: "green" }
    case "partial": return { label: "Page partially readable — evidence is limited", tone: "amber" }
    case "failed": return { label: "Page could not be read — retry is scheduled", tone: "red" }
    case "fetching": return { label: "Page evidence is being collected now", tone: "amber" }
    case "queued": return { label: "Page evidence collection is queued", tone: "amber" }
    case "stale": return { label: "Page evidence is aging — refresh scheduled", tone: "amber" }
    default: return { label: "Page evidence state not recorded", tone: "amber" }
  }
}

/** [V1.1] Browser-worker state decision. A navigation failure (timeout/abort)
 *  is a `failed` fetch — "timeout" is NOT a crawler state and must never be
 *  written as one (it would leak raw jargon into the UI and silently skip the
 *  blocked-cap the same condition gets when a server refuses us). The cause
 *  is preserved in the row's detail. */
export function workerStateFor(navFailure: string | null, httpStatus: number | null, pageText: string): EvidenceStatus | null {
  if (navFailure) return "failed"
  return classifyBlockStatus(httpStatus, pageText)
}

/** [V1.1] Respect our own retry schedule: when the latest page-level evidence
 *  says blocked/failed and retry_at is still in the future, do NOT re-hit a
 *  page that already refused us, and do NOT insert a duplicate row restating
 *  the same refusal. The stored state is reused truthfully. */
export function shouldDeferLiveFetch(
  latest: { status: string | null; retry_at: string | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!latest) return false
  if (latest.status !== "blocked" && latest.status !== "failed") return false
  if (!latest.retry_at) return false
  const retryMs = new Date(latest.retry_at).getTime()
  return Number.isFinite(retryMs) && retryMs > now.getTime()
}

/** [V1.1] The evidence store holds content VERSIONS, not echoes: identical
 *  content (same hash) must not mint a new row. */
export function sameContentHash(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a === b
}

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

/**
 * [§17 INGEST-PLANE EVIDENCE] Source-preference #1 is "ATS APIs / pages
 * already fetched at ingest; stored description" — but the row was only ever
 * written during the AI drain, so jobs not yet drained carried an empty
 * evidence plane. Every accepted job now writes its ingest evidence at ingest.
 * Pure row-builder (fixture-tested): null when there's genuinely nothing to
 * prove — short/absent descriptions stay an honest absence.
 */
export function ingestEvidenceRow(job: { apply_url: string; description_md: string | null }): EvidenceWrite | null {
  const desc = job.description_md ?? ""
  if (desc.trim().length < 100) return null
  return {
    evidence_type: "ats_api",
    source_url: job.apply_url,
    source_kind: "ats_api",
    status: "verified",
    http_status: 200,
    content_hash: sha256(desc),
    excerpt: desc.replace(/\s+/g, " ").slice(0, 800),
    detail: { bytes: desc.length, via: "ingest" },
    fetched_at: new Date().toISOString(),
  }
}

/** Write the ingest-plane evidence row for an accepted job. Version-aware:
 *  identical content is a version, not a new row. Fills `jobs.evidence_state`
 *  ONLY when unset — a crawler-attested state (blocked/failed/partial) is
 *  never overwritten by ingest. */
export async function recordIngestEvidence(sb: any, jobId: string, job: { apply_url: string; description_md: string | null }): Promise<void> {
  const row = ingestEvidenceRow(job)
  if (!row) return
  try {
    const { data: latest } = await sb
      .from("job_evidence_v1")
      .select("content_hash")
      .eq("job_id", jobId)
      .eq("source_kind", "ats_api")
      .order("created_at", { ascending: false })
      .limit(1)
    if (sameContentHash(latest?.[0]?.content_hash, row.content_hash)) return
    await sb.from("job_evidence_v1").insert({ job_id: jobId, ...row })
    await sb.from("jobs").update({ evidence_state: "verified" }).eq("id", jobId).is("evidence_state", null)
  } catch (e) {
    console.log(JSON.stringify({ scope: "evidence", event: "ingest_write_error", jobId: String(jobId).slice(0, 8), error: (e instanceof Error ? e.message : String(e)).slice(0, 120) }))
  }
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

  // [V1.1] Read recent evidence once: (a) retry_at must be respected — a page
  // that refused us is not re-hit until its retry window opens; (b) identical
  // content (same hash) is a version, not a new row. Fail-open: if the read
  // itself fails we fall back to the old collect-everything behavior.
  let recent: { source_kind: string; status: string | null; content_hash: string | null; retry_at: string | null }[] = []
  try {
    const { data } = await sb
      .from("job_evidence_v1")
      .select("source_kind,status,content_hash,retry_at")
      .eq("job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(20)
    if (Array.isArray(data)) recent = data as any
  } catch {}
  const latestOf = (kinds: string[]) => recent.find((r) => kinds.includes(r.source_kind)) ?? null
  const latestPage = latestOf(["browser_render", "page_html", "structured_data"])

  // 1) ATS API / ATS-page evidence (from ingest) — always available when desc exists.
  if (job.description_md && job.description_md.length >= 100) {
    const hash = sha256(job.description_md)
    const dup = sameContentHash(latestOf(["ats_api"])?.content_hash, hash)
    if (!dup) await upsertEvidence(sb, job.id, {
      evidence_type: "ats_api",
      source_url: job.apply_url,
      source_kind: "ats_api",
      status: "verified",
      http_status: 200,
      content_hash: hash,
      excerpt: job.description_md.replace(/\s+/g, " ").slice(0, 800),
      detail: { bytes: job.description_md.length, via: isAts ? "ats_page" : "feed" },
      fetched_at: new Date().toISOString(),
    })
    refs.push({ type: "ats_api", sourceKind: "ats_api", url: job.apply_url, hash, status: "verified", httpStatus: 200, excerptLen: job.description_md.length })
  }

  // [V1.1] Defer live re-fetch while a blocked/failed retry window is still
  // closed: reuse the stored state truthfully instead of hammering a page
  // that already refused us (and instead of echoing the same refusal into
  // the evidence store again).
  if (shouldDeferLiveFetch(latestPage) && isEvidenceState(latestPage?.status)) {
    const st = latestPage!.status as EvidenceStatus
    refs.push({ type: "page_html", sourceKind: latestPage!.source_kind, url: job.apply_url, hash: latestPage!.content_hash, status: st, httpStatus: null, excerptLen: 0 })
    return { state: st, refs }
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
    const ldHash = sha256(JSON.stringify(ld).slice(0, 4000))
    // [V1.1] Same structured data as last time = same version — no new row.
    if (!sameContentHash(latestOf(["structured_data"])?.content_hash, ldHash)) {
      await upsertEvidence(sb, job.id, {
        evidence_type: "structured_data",
        source_url: job.apply_url,
        source_kind: "structured_data",
        status: structuredState,
        http_status: liveStatus,
        content_hash: ldHash,
        excerpt: JSON.stringify(ld).slice(0, 500),
        detail: { blocks: ld.length },
        fetched_at: new Date().toISOString(),
      }, false)
    }
    refs.push({ type: "structured_data", sourceKind: "structured_data", url: job.apply_url, hash: ldHash, status: structuredState, httpStatus: liveStatus, excerptLen: JSON.stringify(ld).length })

    const pageHash = sha256(body)
    await upsertEvidence(sb, job.id, {
      evidence_type: "page_html",
      source_url: job.apply_url,
      source_kind: "page_html",
      status: "fetched",
      http_status: liveStatus,
      content_hash: pageHash,
      excerpt: body.replace(/\s+/g, " ").slice(0, 800),
      detail: { bytes: body.length, state: "partial_fetch" },
      fetched_at: new Date().toISOString(),
    })
    refs.push({ type: "page_html", sourceKind: "page_html", url: job.apply_url, hash: pageHash, status: "fetched", httpStatus: liveStatus, excerptLen: body.length })
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
