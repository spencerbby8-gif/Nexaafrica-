import { JobCard } from '@/components/job-card'
import { EmptyState } from '@/components/empty-state'
import type { Job } from '@/lib/types'
import type { JobWithAI } from '@/lib/ai/queries'

export function JobFeed({
  jobs,
  empty,
  showOpportunityIntelligence = true,
}: {
  jobs: (Job | JobWithAI<Job>)[]
  empty?: React.ReactNode
  showOpportunityIntelligence?: boolean
}) {
  if (jobs.length === 0) {
    return (
      empty ?? (
        <EmptyState
          title="No roles match this view yet."
          body="New roles are added regularly. Try a broader search or browse a related category."
          suggestions={[
            { label: 'All remote jobs', href: '/jobs' },
            { label: 'Open to Africa', href: '/jobs?africa=1' },
            { label: 'Remote engineering', href: '/jobs/engineering/worldwide' },
          ]}
        />
      )
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {jobs.map((job) => {
        const withAI = job as JobWithAI<Job>
        return (
          <li key={job.id} className="min-w-0">
            <JobCard
              job={job}
              aiIntelligence={withAI.aiIntelligence || null}
              showOpportunityIntelligence={showOpportunityIntelligence}
            />
          </li>
        )
      })}
    </ul>
  )
}
