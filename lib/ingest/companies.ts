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
 * Conservatively curated. Add liberally, but verify the feed returns 200
 * before adding. A failing source costs nothing — it's reported via
 * ingest_runs and silently skipped — but a wrong slug pollutes nothing
 * since validation rejects bad URLs.
 */
export const INGEST_SOURCES: IngestSource[] = [
  // ── Greenhouse ──────────────────────────────────────────────────────────
  { ats: 'greenhouse', slug: 'airbnb', company: 'Airbnb' },
  { ats: 'greenhouse', slug: 'stripe', company: 'Stripe' },
  { ats: 'greenhouse', slug: 'figma', company: 'Figma' },
  { ats: 'greenhouse', slug: 'instacart', company: 'Instacart' },
  { ats: 'greenhouse', slug: 'gitlab', company: 'GitLab' },
  { ats: 'greenhouse', slug: 'doordash', company: 'DoorDash' },
  { ats: 'greenhouse', slug: 'discord', company: 'Discord' },
  { ats: 'greenhouse', slug: 'reddit', company: 'Reddit' },
  { ats: 'greenhouse', slug: 'pinterest', company: 'Pinterest' },
  { ats: 'greenhouse', slug: 'cloudflare', company: 'Cloudflare' },
  { ats: 'greenhouse', slug: 'mongodb', company: 'MongoDB' },
  { ats: 'greenhouse', slug: 'elastic', company: 'Elastic' },
  { ats: 'greenhouse', slug: 'mozilla', company: 'Mozilla' },
  { ats: 'greenhouse', slug: 'andela', company: 'Andela' },
  { ats: 'greenhouse', slug: 'flutterwave', company: 'Flutterwave' },
  { ats: 'greenhouse', slug: 'paystackhq', company: 'Paystack' },
  { ats: 'greenhouse', slug: 'chipper', company: 'Chipper Cash' },

  // ── Lever ───────────────────────────────────────────────────────────────
  { ats: 'lever', slug: 'netflix', company: 'Netflix' },
  { ats: 'lever', slug: 'github', company: 'GitHub' },
  { ats: 'lever', slug: 'shopify', company: 'Shopify' },
  { ats: 'lever', slug: 'spotify', company: 'Spotify' },
  { ats: 'lever', slug: 'eventbrite', company: 'Eventbrite' },
  { ats: 'lever', slug: 'kong', company: 'Kong' },
  { ats: 'lever', slug: 'mux', company: 'Mux' },
  { ats: 'lever', slug: 'turing', company: 'Turing' },
  { ats: 'lever', slug: 'remote', company: 'Remote' },
  { ats: 'lever', slug: 'deel', company: 'Deel' },

  // ── Ashby ───────────────────────────────────────────────────────────────
  { ats: 'ashby', slug: 'vercel', company: 'Vercel' },
  { ats: 'ashby', slug: 'linear', company: 'Linear' },
  { ats: 'ashby', slug: 'replit', company: 'Replit' },
  { ats: 'ashby', slug: 'browserbase', company: 'Browserbase' },
  { ats: 'ashby', slug: 'posthog', company: 'PostHog' },
  { ats: 'ashby', slug: 'supabase', company: 'Supabase' },
  { ats: 'ashby', slug: 'huggingface', company: 'Hugging Face' },
  { ats: 'ashby', slug: 'openai', company: 'OpenAI' },
  { ats: 'ashby', slug: 'anthropic', company: 'Anthropic' },
  { ats: 'ashby', slug: 'ramp', company: 'Ramp' },
  { ats: 'ashby', slug: 'mercury', company: 'Mercury' },
  { ats: 'ashby', slug: 'attio', company: 'Attio' },
  { ats: 'ashby', slug: 'arc', company: 'Arc' },
  { ats: 'ashby', slug: 'cleartax', company: 'ClearTax' },

  // ── Workable ────────────────────────────────────────────────────────────
  { ats: 'workable', slug: 'toptal', company: 'Toptal' },
  { ats: 'workable', slug: 'invisionapp', company: 'InVision' },
  { ats: 'workable', slug: 'mybit', company: 'MyBit' },

  // ── SmartRecruiters ─────────────────────────────────────────────────────
  { ats: 'smartrecruiters', slug: 'Square', company: 'Square' },
  { ats: 'smartrecruiters', slug: 'Bosch', company: 'Bosch' },
  { ats: 'smartrecruiters', slug: 'Visa', company: 'Visa' },

  // ── Recruitee ───────────────────────────────────────────────────────────
  { ats: 'recruitee', slug: 'datacamp', company: 'DataCamp' },
  { ats: 'recruitee', slug: 'channable', company: 'Channable' },

  // ── Personio ────────────────────────────────────────────────────────────
  { ats: 'personio', slug: 'personio', company: 'Personio' },
  { ats: 'personio', slug: 'about-you', company: 'ABOUT YOU' },
]
