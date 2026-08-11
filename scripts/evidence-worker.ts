/**
 * [V1] Evidence browser worker — renders accessible job pages with a real
 * browser (Playwright) and captures:
 *   - rendered HTML / visible text
 *   - structured data (JSON-LD)
 *   - screenshot (saved to ./evidence-shots)
 *   - block detection (challenge / 403 / 429) — recorded truthfully, never
 *     guessed around
 *
 * Run (one-time setup, NOT part of the app dependencies — Vercel installs
 * only the app deps):
 *       npm i --no-save playwright @types/pg && npx playwright install chromium
 *       npx tsx scripts/evidence-worker.ts --limit 20 [--source ashby]
 *
 * Reads jobs with evidence_state in (queued|stale|blocked|failed|NULL) and
 * writes rows to job_evidence_v1 + updates jobs.evidence_state. Operator /
 * scheduler-run (serverless cannot host a browser); the plain-fetch path in
 * lib/ai/evidence.ts covers every cron drain, this worker deepens evidence
 * with rendered content.
 */
import "dotenv/config"
import { chromium } from "playwright"
import pg from "pg"
import { sha256, extractStructuredData, workerStateFor, type EvidenceStatus } from "../lib/ai/evidence"

// Uses the DIRECT Postgres connection string (pg is already a dependency).
// Prefer SUPABASE_DIRECT env; fall back to assembled pooler URL.
const dsn =
  process.env.SUPABASE_DIRECT ||
  (process.env.POSTGRES_URL ? process.env.POSTGRES_URL.replace("?sslmode=require", "") : null)
if (!dsn) {
  console.error("Missing SUPABASE_DIRECT connection string")
  process.exit(1)
}
const pool = new pg.Pool({ connectionString: dsn, max: 3 })
const q = async (text: string, params?: any[]) => (await pool.query(text, params)).rows

const limit = Math.max(1, Math.min(50, Number(process.argv.find((a) => a.startsWith("--limit"))?.split("=")[1] || 20)))
const sourceFilter = process.argv.find((a) => a.startsWith("--source"))?.split("=")[1] || null
const timeoutMs = 25_000

async function main() {
  const jobs = sourceFilter
    ? await q(
        `select id, slug, apply_url, description_md, evidence_state from jobs
         where is_active and source=$1 and (evidence_state is null or evidence_state in ('queued','stale','blocked','failed','fetching'))
         order by posted_at desc limit $2`, [sourceFilter, limit])
    : await q(
        `select id, slug, apply_url, description_md, evidence_state from jobs
         where is_active and (evidence_state is null or evidence_state in ('queued','stale','blocked','failed','fetching'))
         order by posted_at desc limit $1`, [limit])

  if (jobs.length === 0) {
    console.log("[evidence-worker] no jobs to process")
    return
  }
  console.log(`[evidence-worker] processing ${jobs.length} jobs`)

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 NexaEvidence/1.0",
    viewport: { width: 1280, height: 900 },
  })
  const fs = await import("fs")
  const dir = "./evidence-shots"
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let ok = 0, blocked = 0, failed = 0
  for (const job of jobs) {
    try {
      await q(`update jobs set evidence_state='fetching' where id=$1`, [job.id])
      await q(
        `insert into job_evidence_v1 (job_id, evidence_type, source_url, source_kind, status) values ($1,$2,$3,$4,$5)`,
        [job.id, "browser_render", job.apply_url, "browser_render", "fetching"])

      const page = await ctx.newPage()
      let status = 0
      let blockedBy = null
      try {
        const resp = await page.goto(job.apply_url, { waitUntil: "networkidle", timeout: timeoutMs })
        status = resp?.status() || 0
        // Client-rendered pages (Ashby, etc.) need a beat to paint content.
        await page.waitForTimeout(1500)
      } catch (e: any) {
        if (/net::ERR_ABORTED|timeout/i.test(String(e?.message || ""))) {
          blockedBy = "timeout"
        }
      }

      const html = await page.content().catch(() => "")
      const visible = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 8000) : "").catch(() => "")
      const ld = extractStructuredData(html)
      const shotPath = `${dir}/${job.slug}.png`
      await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {})

      const combined = `${visible}\n${html.slice(0, 4000)}`
      // [V1.1] Legal states only: a nav timeout/abort is a `failed` fetch —
      // "timeout" is not a crawler state (it leaked raw jargon into the UI
      // and silently skipped the same treatment blocked pages get). The
      // cause stays recorded in detail.blockedBy.
      const block = workerStateFor(blockedBy, status, combined)

      if (block) {
        await q(
          `insert into job_evidence_v1 (job_id, evidence_type, source_url, source_kind, status, http_status, content_hash, excerpt, detail, fetched_at, retry_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now() + interval '6 hours')`,
          [job.id, "browser_render", job.apply_url, "browser_render", block, status,
           html ? sha256(html) : null, combined.slice(0, 300),
           JSON.stringify({ blockedBy, challenge: /cloudflare|captcha|challenge/i.test(combined.slice(0, 2000)), bytes: html.length })])
        await q(`update jobs set evidence_state=$1 where id=$2`, [block, job.id])
        blocked++
        console.log(`  [blocked] ${job.slug} (${status}) ${blockedBy || "challenge/403"}`)
      } else if (visible && visible.length >= 60) {
        const state: EvidenceStatus = ld.length > 0 ? "verified" : "fetched"
        await q(
          `insert into job_evidence_v1 (job_id, evidence_type, source_url, source_kind, status, http_status, content_hash, excerpt, detail, fetched_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
          [job.id, "browser_render", job.apply_url, "browser_render", state, status,
           html ? sha256(html) : null, visible.replace(/\s+/g, " ").slice(0, 800),
           JSON.stringify({ bytes: html.length, visibleChars: visible.length, structuredBlocks: ld.length, screenshot: shotPath })])
        if (ld.length > 0) {
          await q(
            `insert into job_evidence_v1 (job_id, evidence_type, source_url, source_kind, status, http_status, content_hash, excerpt, detail, fetched_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
            [job.id, "structured_data", job.apply_url, "structured_data", "verified", status,
             sha256(JSON.stringify(ld).slice(0, 4000)), JSON.stringify(ld).slice(0, 500),
             JSON.stringify({ blocks: ld.length })])
        }
        await q(`update jobs set evidence_state=$1 where id=$2`, [state, job.id])
        ok++
        console.log(`  [ok] ${job.slug} (${status}) visible=${visible.length} ld=${ld.length}`)
      } else {
        await q(
          `insert into job_evidence_v1 (job_id, evidence_type, source_url, source_kind, status, http_status, content_hash, excerpt, detail, fetched_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())`,
          [job.id, "browser_render", job.apply_url, "browser_render", "partial", status,
           html ? sha256(html) : null, combined.slice(0, 300),
           JSON.stringify({ note: "page rendered but little visible text", bytes: html.length })])
        await q(`update jobs set evidence_state='partial' where id=$1`, [job.id])
        console.log(`  [partial] ${job.slug} (${status}) visible=${visible.length}`)
      }
      await page.close().catch(() => {})
    } catch (e: any) {
      failed++
      console.log(`  [error] ${job.slug}: ${String(e?.message || e).slice(0, 120)}`)
      await q(
        `insert into job_evidence_v1 (job_id, evidence_type, source_url, source_kind, status, detail, fetched_at, retry_at)
         values ($1,$2,$3,$4,$5,$6,now(),now() + interval '6 hours')`,
        [job.id, "browser_render", job.apply_url, "browser_render", "failed",
         JSON.stringify({ error: String(e?.message || e).slice(0, 200) })]).catch(() => {})
      await q(`update jobs set evidence_state='failed' where id=$1`, [job.id]).catch(() => {})
    }
  }

  await browser.close()
  await pool.end()
  console.log(`[evidence-worker] done: ok=${ok} blocked=${blocked} failed=${failed} shots=./evidence-shots`)
}

main().catch((e) => { console.error(e); process.exit(1) })
