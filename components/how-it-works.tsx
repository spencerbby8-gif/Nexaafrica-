import { ShieldCheck, Search, Send } from 'lucide-react'

const STEPS = [
  {
    icon: Search,
    title: 'Discover roles',
    body: 'Browse remote jobs from companies hiring globally. Use filters to match your category, region, and pay.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify before you apply',
    body: 'Every listing is reviewed. Pay ranges and eligibility are surfaced upfront so you know what to expect.',
  },
  {
    icon: Send,
    title: 'Apply directly',
    body: 'You apply on the company site. Nexa never sits in the middle, never charges fees, and never sells your data.',
  },
]

export function HowItWorks() {
  return (
    <section
      className="mx-auto max-w-6xl px-4 sm:px-6"
      aria-labelledby="how-heading"
    >
      <h2
        id="how-heading"
        className="text-lg font-semibold tracking-tight sm:text-xl"
      >
        How Nexa works
      </h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        A direct path between African talent and companies hiring remote.
      </p>
      <ol className="mt-6 grid gap-3 md:grid-cols-3">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          return (
            <li
              key={s.title}
              className="rounded-lg border border-border/70 bg-card p-5"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/70 bg-secondary text-foreground/80">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-[15px] font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {s.body}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
