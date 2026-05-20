import Link from 'next/link'

type Suggestion = { label: string; href: string }

export function EmptyState({
  title,
  body,
  suggestions = [],
}: {
  title: string
  body?: string
  suggestions?: Suggestion[]
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-card/40 px-6 py-10 sm:px-10">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      {body && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}
      {suggestions.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                className="inline-flex items-center rounded-md border border-border/70 bg-secondary px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
