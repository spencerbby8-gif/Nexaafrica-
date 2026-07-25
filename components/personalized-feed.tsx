import Link from 'next/link'
import { JobCard } from '@/components/job-card'
import { getUserMatchSignals, getMatchedJobs } from '@/lib/profile/match'
import { getAIIntelligenceForJobs } from '@/lib/ai/queries'

/**
 * Personalized "Matching for you" homepage section.
 *
 * Renders nothing (returns null) for signed-out users, users without a
 * usable profile, or when the deterministic matcher finds no jobs above
 * the score threshold. Trust > filler.
 *
 * Now loads job_ai_intelligence correctly: join by job_id, render AI fields,
 * remove raw markdown from preview, use cleaned description everywhere,
 * show intelligence summary instead of only trust/remote/salary/likely open.
 * If AI missing, shows "Intelligence pending".
 *
 * SEO God Mode: server-rendered, crawlable, no client JS for this section,
 * fast, evidence-backed, no fabrication.
 */
export async function PersonalizedFeed() {
  const signals = await getUserMatchSignals()
  if (!signals.hasSignal) return null

  const matched = await getMatchedJobs(signals, 6)
  if (matched.length === 0) return null

  // Load AI intelligence for these jobs – join by job_id, production safe,
  // fallback to pending if not ready, raw job untouched.
  let aiMap = new Map()
  try {
    aiMap = await getAIIntelligenceForJobs(matched.map((m) => m.job.id))
  } catch {
    // Fallback: no intelligence, cards will show pending state
  }

  // Headline reflects what we actually used to match — never invent a
  // signal source we don't have.
  const headline =
    signals.categories.size > 0
      ? 'Matching your experience'
      : signals.skills.size > 0
        ? 'Aligned with your skills'
        : 'Recommended for your profile'

  const subhead =
    matched.length === 1
      ? 'One fresh remote role we think fits your profile.'
      : `${matched.length} fresh remote roles we think fit your profile.`

  return (
    <section
      className="mx-auto max-w-6xl px-4 sm:px-6"
      aria-labelledby="matching-heading"
    >
      <div className="flex items-end justify-between border-b border-border/60 pb-4">
        <div>
          <h2
            id="matching-heading"
            className="text-lg font-semibold tracking-tight"
          >
            {headline}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{subhead}</p>
        </div>
        <Link
          href="/jobs"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          See more
        </Link>
      </div>
      <ul className="grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-3">
        {matched.map(({ job, reasons, score }) => (
          <li key={job.id}>
            <JobCard
              job={job}
              matchReasons={reasons}
              matchScore={score}
              aiIntelligence={aiMap.get(job.id) || null}
              showOpportunityIntelligence={true}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
