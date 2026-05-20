import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-md bg-accent text-accent-foreground"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 13V3l10 10V3" />
        </svg>
      </span>
      <span className="text-base">Nexa</span>
    </span>
  )
}
