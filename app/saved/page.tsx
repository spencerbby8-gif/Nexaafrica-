import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Bookmark } from 'lucide-react'
import { SiteShell } from '@/components/site-shell'
import { JobFeed } from '@/components/job-feed'
import { createClient } from '@/lib/supabase/server'
import { getSavedJobs } from '@/lib/saved-jobs'

export const metadata: Metadata = {
  title: 'Saved roles · Nexa',
  description:
    'Roles you saved on Nexa. Apply when you are ready — we keep them here for you.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function SavedJobsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/sign-in?next=' + encodeURIComponent('/saved'))
  }

  const jobs = await getSavedJobs()

  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="border-b border-border/60 pb-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Your list
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight sm:text-[28px]">
            Saved roles
          </h1>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Roles you bookmarked on Nexa. Closed listings are removed
            automatically so this list stays useful.
          </p>
        </header>

        <div className="mt-8">
          {jobs.length > 0 ? (
            <JobFeed jobs={jobs} />
          ) : (
            <div className="rounded-xl border border-dashed border-border/70 bg-card/40 px-5 py-10 text-center">
              <Bookmark
                className="mx-auto h-5 w-5 text-muted-foreground"
                aria-hidden
              />
              <p className="mt-3 text-sm font-medium text-foreground">
                Nothing saved yet
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                Browse remote roles and tap the save icon to keep them here for
                later.
              </p>
              <Link
                href="/jobs"
                className="mt-5 inline-flex h-9 items-center rounded-md border border-border/70 bg-card px-4 text-sm font-medium text-foreground/85 transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                Browse remote roles
              </Link>
            </div>
          )}
        </div>
      </div>
    </SiteShell>
  )
}
