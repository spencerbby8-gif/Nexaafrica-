import crypto from 'node:crypto'

/**
 * Shared authorization for machine-to-machine routes (cron, ingest, AI pipeline).
 *
 * Threat model: these routes trigger paid AI provider calls and bulk DB writes.
 * Before this fix they trusted the spoofable `x-vercel-cron: 1` header while
 * CRON_SECRET / INGEST_TOKEN were never even configured — meaning that once
 * deployment protection was lifted, anyone on the internet could run them.
 *
 * Rules now:
 *  - Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
 *    when CRON_SECRET is set (official documented behaviour).
 *  - Manual triggers use `Authorization: Bearer $INGEST_TOKEN`.
 *  - Constant-time comparison; the x-vercel-cron header alone is NOT trusted.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  } catch {
    return false
  }
}

export function pipelineAuthConfigured(): boolean {
  return Boolean(process.env.CRON_SECRET || process.env.INGEST_TOKEN)
}

export function isPipelineAuthorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && safeEqual(auth, `Bearer ${cronSecret}`)) return true
  const ingestToken = process.env.INGEST_TOKEN
  if (ingestToken && safeEqual(auth, `Bearer ${ingestToken}`)) return true
  return false
}
