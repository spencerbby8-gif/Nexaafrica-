import { NexaLoader } from '@/components/nexa-loader'
import { SiteShell } from '@/components/site-shell'

export default function Loading() {
  return (
    <SiteShell>
      <div className="mx-auto flex min-h-[60dvh] max-w-2xl flex-col items-center justify-center gap-3 px-4">
        <NexaLoader size={36} />
        <p className="text-xs font-medium tracking-wide text-muted-foreground">
          Loading your settings
        </p>
      </div>
    </SiteShell>
  )
}
