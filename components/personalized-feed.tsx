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

  // Homepage shows only Nexa Intelligence (AI-verified) jobs.
  // Pending/unverified jobs stay out of the homepage feed entirely.
  const verifiedMatched = matched.filter((m) => {
    const ai = aiMap.get(m.job.id)
    return ai?.model_version?.includes(':') && !ai?.model_version?.startsWith('regex')
  })
  // Sort by match score within the verified set
  const sortedMatched = [...verifiedMatched].sort((a, b) => b.score - a.score)
  if (sortedMatched.length === 0) return null // no verified matches — show nothing

  // Headline reflects what we actually used to match — never invent a
  // signal source we don't have.
  const headline =
    signals.categories.size > 0
      ? 'Matching your experience'
      : signals.skills.size > 0
        ? 'Aligned with your skills'
        : 'Recommended for your profile'

  const skillPreview = Array.from(signals.skills).slice(0, 3).join(', ')
  const categoryPreview = Array.from(signals.categories).slice(0, 2).map(c => c.replace(/-/g, ' ')).join(', ')
  const matchBasis = skillPreview
    ? `Based on your skills in ${skillPreview}`
    : categoryPreview
    ? `Based on your experience in ${categoryPreview}`
    : 'Based on your saved roles'
  const subhead =
    sortedMatched.length === 1
      ? `${matchBasis}. One verified role matches.`
      : `${matchBasis}. ${sortedMatched.length} verified roles match.`

  return (
    <section
      className="mx-auto max-w-6xl px-4 sm:px-6"
      aria-labelledby="matching-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border/60 pb-4">
        <div className="min-w-0 flex-1">
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
          className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          See more
        </Link>
      </div>
      <ul className="grid gap-3 py-6 sm:grid-cols-2 lg:grid-cols-3">
        {sortedMatched.map(({ job, reasons, score }) => (
          <li key={job.id} className="min-w-0">
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
