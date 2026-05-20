import { cn } from '@/lib/utils'
import { BadgeCheck, Globe, DollarSign, Sparkles, type LucideIcon } from 'lucide-react'

type Variant = 'verified' | 'remote' | 'usd' | 'ai'

const variants: Record<
  Variant,
  { label: string; icon: LucideIcon; className: string }
> = {
  verified: {
    label: 'Verified',
    icon: BadgeCheck,
    className: 'border-accent/30 text-accent bg-accent/5',
  },
  remote: {
    label: 'Remote',
    icon: Globe,
    className: 'border-border text-foreground/80 bg-secondary',
  },
  usd: {
    label: 'USD',
    icon: DollarSign,
    className: 'border-border text-foreground/80 bg-secondary',
  },
  ai: {
    label: 'AI optimized',
    icon: Sparkles,
    className: 'border-border text-foreground/80 bg-secondary',
  },
}

export function TrustBadge({
  variant,
  label,
  className,
}: {
  variant: Variant
  label?: string
  className?: string
}) {
  const v = variants[variant]
  const Icon = v.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none',
        v.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2.25} />
      {label ?? v.label}
    </span>
  )
}
