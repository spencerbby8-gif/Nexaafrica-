/**
 * Curated registry of real remote-first / globally-distributed companies
 * to ingest from. Every entry is a known public company with a public
 * ATS feed that requires no API key.
 *
 * Selection criteria (in priority order):
 *  1. Known to hire globally / EMEA / "anywhere"
 *  2. Async-friendly culture
 *  3. Active hiring (not zombie boards)
 *  4. ATS feed verified to return 200 + non-empty postings as of writing
 *
 * Adding a company is a one-line change. Removing one is also one line —
 * we don't want this list to ossify around dead boards.
 */

export type AtsKind =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workable'
  | 'smartrecruiters'
  | 'recruitee'
  | 'personio'
  | 'comeet'

export interface IngestSource {
  /** ATS provider */
  ats: AtsKind
  /** ATS-specific board identifier (slug, subdomain, or uid) */
  slug: string
  /** Company name as we want it displayed on Nexa */
  company: string
  /** Optional logo override (URL). Most ATS feeds don't expose a logo. */
  logo?: string
}

/**
 * Curated registry — CLEANED 2026-07-23 after live audit.
 * Removed 29 dead/empty sources that were returning 404 or 0 jobs and wasting cron time.
 * 22 healthy sources remain, fetching ~3600 jobs per full run.
 * Dead sources commented out with reason, not deleted, so history is visible.
 */
export const INGEST_SOURCES: IngestSource[] = [
  // ── Greenhouse (12 healthy) ─────────────────────────────────────────
  { ats: 'greenhouse', slug: 'airbnb', company: 'Airbnb' }, // 157
  { ats: 'greenhouse', slug: 'stripe', company: 'Stripe' }, // 519
  { ats: 'greenhouse', slug: 'figma', company: 'Figma' }, // 172
  { ats: 'greenhouse', slug: 'instacart', company: 'Instacart' }, // 127
  { ats: 'greenhouse', slug: 'gitlab', company: 'GitLab' }, // 178 - Africa-friendly
  { ats: 'greenhouse', slug: 'discord', company: 'Discord' }, // 24
  { ats: 'greenhouse', slug: 'reddit', company: 'Reddit' }, // 192
  { ats: 'greenhouse', slug: 'pinterest', company: 'Pinterest' }, // 139
  { ats: 'greenhouse', slug: 'cloudflare', company: 'Cloudflare' }, // 271
  { ats: 'greenhouse', slug: 'mongodb', company: 'MongoDB' }, // 394
  { ats: 'greenhouse', slug: 'elastic', company: 'Elastic' }, // 209
  { ats: 'greenhouse', slug: 'mozilla', company: 'Mozilla' }, // 72

  // Dead Greenhouse (404) — disabled 2026-07-23
  // { ats: 'greenhouse', slug: 'doordash', company: 'DoorDash' }, // 404
  // { ats: 'greenhouse', slug: 'andela', company: 'Andela' }, // 404 — board moved
  // { ats: 'greenhouse', slug: 'flutterwave', company: 'Flutterwave' }, // 404
  // { ats: 'greenhouse', slug: 'paystackhq', company: 'Paystack' }, // 404
  // { ats: 'greenhouse', slug: 'chipper', company: 'Chipper Cash' }, // 404

  // ── Lever (1 healthy, 8 dead) ───────────────────────────────────────
  // { ats: 'lever', slug: 'netflix', company: 'Netflix' }, // 0 jobs - no remote filtered
  // { ats: 'lever', slug: 'github', company: 'GitHub' }, // 404
  // { ats: 'lever', slug: 'shopify', company: 'Shopify' }, // 404
  { ats: 'lever', slug: 'spotify', company: 'Spotify' }, // 38
  // { ats: 'lever', slug: 'eventbrite', company: 'Eventbrite' }, // 404
  // { ats: 'lever', slug: 'kong', company: 'Kong' }, // 404
  // { ats: 'lever', slug: 'mux', company: 'Mux' }, // 404
  // { ats: 'lever', slug: 'turing', company: 'Turing' }, // 404
  // { ats: 'lever', slug: 'remote', company: 'Remote' }, // 404
  // { ats: 'lever', slug: 'deel', company: 'Deel' }, // 404

  // ── Ashby (7 healthy, 6 dead) ────────────────────────────────────────
  // { ats: 'ashby', slug: 'vercel', company: 'Vercel' }, // 0 jobs - empty board
  { ats: 'ashby', slug: 'linear', company: 'Linear' }, // 24
  { ats: 'ashby', slug: 'replit', company: 'Replit' }, // 93
  { ats: 'ashby', slug: 'browserbase', company: 'Browserbase' }, // 2
  { ats: 'ashby', slug: 'posthog', company: 'PostHog' }, // 17
  { ats: 'ashby', slug: 'supabase', company: 'Supabase' }, // 55
  // { ats: 'ashby', slug: 'huggingface', company: 'Hugging Face' }, // 404
  { ats: 'ashby', slug: 'openai', company: 'OpenAI' }, // 737 - high volume
  // { ats: 'ashby', slug: 'anthropic', company: 'Anthropic' }, // 404
  { ats: 'ashby', slug: 'ramp', company: 'Ramp' }, // 121
  // { ats: 'ashby', slug: 'mercury', company: 'Mercury' }, // 0
  { ats: 'ashby', slug: 'attio', company: 'Attio' }, // 37
  // { ats: 'ashby', slug: 'arc', company: 'Arc' }, // 404
  // { ats: 'ashby', slug: 'cleartax', company: 'ClearTax' }, // 404

  // ── Workable (0 healthy, 3 dead) — disabled, all 0 or 404
  // { ats: 'workable', slug: 'toptal', company: 'Toptal' }, // 0
  // { ats: 'workable', slug: 'invisionapp', company: 'InVision' }, // 0
  // { ats: 'workable', slug: 'mybit', company: 'MyBit' }, // 404

  // ── SmartRecruiters (0 healthy, 3 dead) — disabled, all 0
  // { ats: 'smartrecruiters', slug: 'Square', company: 'Square' }, // 0
  // { ats: 'smartrecruiters', slug: 'Bosch', company: 'Bosch' }, // 0
  // { ats: 'smartrecruiters', slug: 'Visa', company: 'Visa' }, // 0

  // ── Recruitee (1 healthy, 1 dead) ───────────────────────────────────
  // { ats: 'recruitee', slug: 'datacamp', company: 'DataCamp' }, // 404
  { ats: 'recruitee', slug: 'channable', company: 'Channable' }, // 13 - currently live on site

  // ── Personio (0 healthy, 2 dead) — disabled (404 + 429 rate limit)
  // { ats: 'personio', slug: 'personio', company: 'Personio' }, // 404
  // { ats: 'personio', slug: 'about-you', company: 'ABOUT YOU' }, // 429 Too Many Requests
]
