import 'server-only'

type Bucket = { count: number; resetAt: number }

// Module-level Map. Process-local; good enough for solo-founder scale.
const buckets = new Map<string, Bucket>()

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
  }
  b.count += 1
  return { ok: true, retryAfterSeconds: 0 }
}
