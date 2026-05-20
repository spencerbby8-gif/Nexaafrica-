import { JobCard } from '@/components/job-card'
import type { Job } from '@/lib/types'

export function JobFeed({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 p-10 text-center">
        <p className="text-sm text-muted-foreground">No roles match this view yet.</p>
      </div>
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
