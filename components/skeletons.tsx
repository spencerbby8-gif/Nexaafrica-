import { cn } from '@/lib/utils'

function Block({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/70', className)} />
}

export function JobCardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="w-full space-y-2">
          <Block className="h-4 w-2/3" />
          <Block className="h-3 w-1/2" />
        </div>
        <Block className="h-3 w-12" />
      </div>
      <Block className="h-3 w-full" />
      <Block className="h-3 w-4/5" />
      <div className="flex gap-1.5">
        <Block className="h-5 w-16" />
        <Block className="h-5 w-14" />
        <Block className="h-5 w-20" />
      </div>
    </div>
  )
}

export function JobFeedSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Block className="h-14 w-14 rounded-full" />
        <div className="space-y-2">
          <Block className="h-4 w-40" />
          <Block className="h-3 w-28" />
        </div>
      </div>
      <Block className="h-24 w-full" />
      <Block className="h-24 w-full" />
    </div>
  )
}

export function OnboardingSkeleton() {
  return (
    <div className="space-y-4">
      <Block className="h-5 w-1/3" />
      <Block className="h-3 w-2/3" />
      <Block className="h-32 w-full" />
      <Block className="h-10 w-32" />
    </div>
  )
}
