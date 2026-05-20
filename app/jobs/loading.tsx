import { JobFeedSkeleton } from '@/components/skeletons'
import { SiteShell } from '@/components/site-shell'

export default function Loading() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted/70" />
        <div className="mt-3 h-4 w-80 animate-pulse rounded-md bg-muted/70" />
        <div className="mt-8">
          <JobFeedSkeleton />
        </div>
      </div>
    </SiteShell>
  )
}
