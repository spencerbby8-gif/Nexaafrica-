import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { Hero } from '@/components/hero'
import { JobFeed } from '@/components/job-feed'
import { HowItWorks } from '@/components/how-it-works'
import { FAQ } from '@/components/faq'
import { PersonalizedFeed } from '@/components/personalized-feed'
import { ProofBadge } from '@/components/proof-badge'
import { ShieldCheck, Loader2 } from 'lucide-react'
import {
  countJobs,
  getCategories,
  getFreshnessPulse,
  getVerifiedJobs,
  getQueuedJobs,
  getProofStats,
} from '@/lib/queries'

// Personalized section reads the user's session — keep this page dynamic
// per-request rather than statically cached.
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [verified, queued, categories, total, pulse, proofStats] = await Promise.all([
    getVerifiedJobs(6),
    getQueuedJobs(3),
    getCategories(),
    countJobs(),
    getFreshnessPulse(),
    getProofStats(),
  ])

  // Quiet, factual life signal. Hidden when the platform is empty so we
  // never invent activity that isn't there.
  const pulseLine =
    pulse.addedThisWeek > 0
      ? pulse.openToAfricaThisWeek > 0
        ? `${pulse.addedThisWeek} new role${pulse.addedThisWeek === 1 ? '' : 's'} this week · ${pulse.openToAfricaThisWeek} open to Africa`
        : `${pulse.addedThisWeek} new role${pulse.addedThisWeek === 1 ? '' : 's'} this week`
      : null

  return (
    <SiteShell>
      <Hero categories={categories} jobCount={total} />

      <div className="mb-10 sm:mb-14">
        <PersonalizedFeed />
      </div>

      {/* ─── Live Proof Header ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6" aria-label="Verification coverage">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-secondary/20 p-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {proofStats.verified} AI-Verified
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {proofStats.aiCoveragePct}% coverage · {proofStats.queueDepth} in queue · {proofStats.stale} rule-based
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            of {proofStats.totalActive} active roles
          </span>
        </div>
      </section>

      {/* ─── Freshly Verified (real AI intelligence) ───────── */}
      {verified.length > 0 && (
        <section className="mx-auto mt-8 max-w-6xl px-4 sm:px-6" aria-labelledby="verified-heading">
          <div className="flex items-end justify-between border-b border-border/60 pb-4">
            <div>
              <h2 id="verified-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <ShieldCheck className="h-4.5 w-4.5 text-green-400" aria-hidden />
                AI-Verified roles
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Verified by live AI with real evidence from the source page.
                {pulseLine && <span className="ml-1.5 font-medium text-accent">{pulseLine}</span>}
              </p>
            </div>
            <Link href="/jobs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              View all
            </Link>
          </div>
          <div className="py-6">
            <JobFeed jobs={verified} showOpportunityIntelligence={true} />
          </div>
        </section>
      )}

      {/* ─── Queued (pending AI verification) ──────────────── */}
      {queued.length > 0 && (
        <section className="mx-auto mt-8 max-w-6xl px-4 sm:px-6" aria-labelledby="queued-heading">
          <div className="border-b border-border/60 pb-4">
            <h2 id="queued-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Loader2 className="h-4.5 w-4.5 text-amber-400" aria-hidden />
              Pending verification
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Newly ingested roles awaiting AI intelligence analysis.
            </p>
          </div>
          <div className="py-6">
            <JobFeed jobs={queued} />
          </div>
        </section>
      )}

      <div className="mt-10 sm:mt-14">
        <HowItWorks />
      </div>

      <section
        className="mx-auto mt-10 max-w-6xl px-4 sm:mt-14 sm:px-6"
        aria-labelledby="categories-heading"
      >
        <h2
          id="categories-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Browse by category
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Roles grouped by what you do.
        </p>
        <ul className="mt-5 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/jobs/${c.slug}/worldwide`}
                className="block rounded-lg border border-border/70 bg-card p-4 transition-colors hover:border-foreground/30"
              >
                <p className="text-sm font-medium text-foreground">{c.title}</p>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {c.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 sm:mt-14">
        <FAQ />
      </div>

      <div className="h-14" />
    </SiteShell>
  )
}
