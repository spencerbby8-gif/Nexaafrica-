import { SiteShell } from '@/components/site-shell'
import { OnboardingSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
        <OnboardingSkeleton />
      </div>
    </SiteShell>
  )
}
