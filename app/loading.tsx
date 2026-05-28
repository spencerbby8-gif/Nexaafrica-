import { NexaLoader } from '@/components/nexa-loader'

/**
 * Root loading state. Shown by Next.js during cross-route transitions
 * before any segment-specific loading.tsx kicks in. Branded so users
 * always see the Nexa identity rather than a flash of unstyled bg.
 *
 * Sized at min-h-dvh to fully cover the viewport on mobile and avoid
 * a layout reflow when the destination renders.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background"
      aria-live="polite"
      role="status"
    >
      <NexaLoader size={44} />
      <p className="text-xs font-medium tracking-wide text-muted-foreground">
        Loading Nexa
      </p>
    </div>
  )
}
