import { cn } from '@/lib/utils'

/**
 * Signature Nexa loading mark.
 *
 * Two breathing accent rings around the Nexa monogram. Calm, premium,
 * mobile-first. No spinning. No flashy effects. Honors prefers-reduced-motion.
 */
export function NexaLoader({
  size = 36,
  className,
  label = 'Loading',
}: {
  size?: number
  className?: string
  label?: string
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Two outer rings, breathing on offset cycles. Stays still for users
          with prefers-reduced-motion (handled in globals.css). */}
      <span
        aria-hidden
        className="nexa-loader-ring absolute inset-0 rounded-full border border-accent/50"
      />
      <span
        aria-hidden
        className="nexa-loader-ring nexa-loader-ring--delayed absolute inset-0 rounded-full border border-accent/30"
      />
      {/* Solid Nexa monogram center. Same shape as the wordmark. */}
      <span
        aria-hidden
        className="grid place-items-center rounded-md bg-accent text-accent-foreground"
        style={{ width: size * 0.55, height: size * 0.55 }}
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ width: size * 0.32, height: size * 0.32 }}
        >
          <path d="M3 13V3l10 10V3" />
        </svg>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * Full-screen branded loading container for top-level loading.tsx files.
 * Centered, calm, ~one breath of motion.
 */
export function NexaPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <NexaLoader size={44} label={label} />
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </p>
    </div>
  )
}
