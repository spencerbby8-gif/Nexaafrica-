/**
 * One-shot production ingestion executed locally against the live Supabase DB.
 * Public ATS endpoints + service-role key = no production deployment dependency.
 * Run with: pnpm tsx scripts/run-ingest.ts
 */
import 'dotenv/config'
import { runAllSources } from '../lib/ingest/run'

async function main() {
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  for (const k of required) {
    if (!process.env[k]) {
      console.error(`[ingest] missing env: ${k}`)
      process.exit(1)
    }
  }

  console.log('[ingest] starting full source run')
  const t0 = Date.now()
  const results = await runAllSources()
  const ms = Date.now() - t0

  let totalFetched = 0
  let totalInserted = 0
  let totalRejected = 0
  let okCount = 0
  let failCount = 0

  for (const r of results) {
    totalFetched += r.fetched
    totalInserted += r.inserted
    totalRejected += r.rejected
    if (r.ok) okCount += 1
    else failCount += 1
    const status = r.ok ? 'OK' : 'FAIL'
    const detail = r.ok
      ? `fetched=${r.fetched} inserted=${r.inserted} rejected=${r.rejected} skipped=${r.skipped}`
      : `error=${r.error}`
    console.log(`[ingest] ${status.padEnd(4)} ${r.source.padEnd(34)} ${detail}`)
  }

  console.log('[ingest] ---')
  console.log(
    `[ingest] sources=${results.length} ok=${okCount} fail=${failCount} ` +
      `fetched=${totalFetched} inserted=${totalInserted} rejected=${totalRejected} ` +
      `elapsed=${(ms / 1000).toFixed(1)}s`,
  )
}

main().catch((e) => {
  console.error('[ingest] fatal', e)
  process.exit(1)
})
