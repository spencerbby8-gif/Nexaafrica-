/**
 * Provider diagnostic classification — pure, testable.
 * Maps an HTTP status + (short) error text to a failure class so diagnostics
 * and audits can report WHY a provider failed without exposing raw bodies
 * (which could echo secrets) or dumping the secret itself.
 */
export type DiagClass =
  | 'ok'
  | 'auth'       // 401/403 — bad key / forbidden
  | 'quota'      // 429 — rate limit / quota exhaustion
  | 'billing'    // 402 / payment required
  | 'model'      // 404 — dead/missing model ID
  | 'server'     // 5xx — provider-side failure
  | 'network'    // connection/timeout/DNS
  | 'other'

export function classifyProviderError(status: number | null, bodyText: string): DiagClass {
  const t = (bodyText || '').toLowerCase()
  if (status === 200 || (status !== null && status >= 200 && status < 300)) return 'ok'
  if (status === 401 || status === 403) return 'auth'
  if (status === 402 || /insufficient credits|payment required|purchase credits|billing/i.test(t)) return 'billing'
  if (status === 429 || /rate.?limit|quota|resource_exhausted|too many requests/i.test(t)) return 'quota'
  if (status === 404 || /no longer available|not found|does not exist|invalid model|unknown model|model .* not/i.test(t)) return 'model'
  if (status !== null && status >= 500) return 'server'
  if (status === null || /fetch failed|network|timeout|econnreset|econnrefused|dns/i.test(t)) return 'network'
  return 'other'
}
