import { JobCard } from '@/components/job-card'
import { EmptyState } from '@/components/empty-state'
import type { Job } from '@/lib/types'

export function JobFeed({
  jobs,
  empty,
}: {
  jobs: Job[]
  empty?: React.ReactNode
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
      {jobs.map((job) => (
        <li key={job.id}>
          <JobCard job={job} />
        </li>
      ))}
    </ul>
  )
}
