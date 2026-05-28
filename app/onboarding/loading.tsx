import { SiteShell } from '@/components/site-shell'
import { NexaPageLoader } from '@/components/nexa-loader'

export default function Loading() {
  return (
    <SiteShell>
      <NexaPageLoader label="Preparing your onboarding" />
    </SiteShell>
  )
}
