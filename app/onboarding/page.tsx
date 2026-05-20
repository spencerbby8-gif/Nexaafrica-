import type { Metadata } from 'next'
import { SiteShell } from '@/components/site-shell'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Get started',
  description: 'Set up your Nexa profile in a few steps.',
  robots: { index: false, follow: false },
}

const steps = [
  { n: '01', title: 'Tell us about you', body: 'Name, country, and the roles you want.' },
  { n: '02', title: 'Add your CV', body: 'Upload a PDF or paste a link to your portfolio.' },
  { n: '03', title: 'Set preferences', body: 'Salary range, time zones, and availability.' },
]

export default function OnboardingPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">Onboarding</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Set up your profile
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Three short steps. You can edit anything later.
        </p>

        <ol className="mt-10 space-y-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="flex items-start gap-4 rounded-lg border border-border/70 bg-card p-5"
            >
              <span className="font-mono text-xs text-muted-foreground">{s.n}</span>
              <div className="min-w-0">
                <h2 className="text-sm font-medium">{s.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex gap-2">
          <Button>Begin</Button>
          <Button variant="ghost">Skip for now</Button>
        </div>
      </div>
    </SiteShell>
  )
}
