import { SiteShell } from '@/components/site-shell'
import { ProfileSkeleton } from '@/components/skeletons'

export default function Loading() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        <ProfileSkeleton />
      </div>
    </SiteShell>
  )
}
