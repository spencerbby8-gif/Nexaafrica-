import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteShell } from '@/components/site-shell'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Your profile',
  description: 'Manage your Nexa profile, work preferences, and CV.',
  robots: { index: false, follow: false },
}

export default function ProfilePage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        <header className="border-b border-border/60 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This is where you&apos;ll manage your work preferences and CV. Profile editing arrives next.
          </p>
        </header>

        <section className="mt-8 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/70 bg-card p-5">
            <h2 className="text-sm font-medium">Personal details</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Name, country, and contact information.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-card p-5">
            <h2 className="text-sm font-medium">Work preferences</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Categories, salary expectations, and time zones.
            </p>
          </div>
          <div className="rounded-lg border border-border/70 bg-card p-5">
            <h2 className="text-sm font-medium">CV</h2>
            <p className="mt-2 text-sm text-muted-foreground">Upload and manage your CV.</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-card p-5">
            <h2 className="text-sm font-medium">Account</h2>
            <p className="mt-2 text-sm text-muted-foreground">Email, password, and sessions.</p>
          </div>
        </section>

        <div className="mt-8">
          <Button asChild variant="outline">
            <Link href="/onboarding">Continue onboarding</Link>
          </Button>
        </div>
      </div>
    </SiteShell>
  )
}
