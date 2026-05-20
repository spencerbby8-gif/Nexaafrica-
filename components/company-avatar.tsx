import Image from 'next/image'
import { companyInitials } from '@/lib/format'
import { cn } from '@/lib/utils'

export function CompanyAvatar({
  name,
  src,
  size = 40,
  className,
}: {
  name: string
  src?: string | null
  size?: number
  className?: string
}) {
  const dim = `${size}px`
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-secondary text-[11px] font-medium text-foreground/70',
        className,
      )}
      style={{ width: dim, height: dim }}
      aria-hidden
    >
      {src ? (
        <Image
          src={src || '/placeholder.svg'}
          alt=""
          fill
          sizes={dim}
          className="object-cover"
        />
      ) : (
        <span>{companyInitials(name)}</span>
      )}
    </div>
  )
}
