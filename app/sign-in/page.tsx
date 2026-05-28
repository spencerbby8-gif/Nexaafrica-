import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ShieldCheck, Lock, BadgeCheck } from 'lucide-react'
import { SiteShell } from '@/components/site-shell'
import { SignInForm } from '@/components/auth/sign-in-form'
import { Logo } from '@/components/logo'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Nexa to apply to remote roles and manage your profile.',
  robots: { index: false, follow: false },
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <SiteShell>
      <div className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl items-stretch gap-0 px-4 sm:px-6 lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-12">
        {/* Left: trust frame. Hidden on small screens. */}
        <aside
          aria-hidden
          className="relative hidden flex-col justify-between py-16 lg:flex"
        >
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Open to Africa
            </div>
            <h2 className="mt-6 max-w-md text-balance text-3xl font-semibold leading-tight tracking-tight text-foreground">
              Built for African professionals working with the world.
            </h2>
            <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              Verified remote roles. Transparent pay. Direct apply on the
              company&apos;s site. No data resold, no recruiter spam.
            </p>
          </div>

          <ul className="mt-12 space-y-4 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-accent">
                <ShieldCheck className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block text-foreground">Reviewed inventory</span>
                <span className="text-xs leading-relaxed">
                  Every role is sourced from real ATS feeds, not job-board scrapes.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-accent">
                <BadgeCheck className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block text-foreground">Recruiter-ready profiles</span>
                <span className="text-xs leading-relaxed">
                  Your CV becomes a transformed, hiring-grade summary in minutes.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-accent">
                <Lock className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="block text-foreground">Privacy-first sign-in</span>
                <span className="text-xs leading-relaxed">
                  Magic-link or Google. We never sell your data.
                </span>
              </span>
            </li>
          </ul>
        </aside>

        {/* Right: the actual sign-in. Centered on small screens. */}
        <div className="flex w-full items-center py-12 sm:py-16">
          <div className="mx-auto w-full max-w-md">
            <div className="lg:hidden">
              <Logo />
            </div>
            <h1 className="mt-6 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              Sign in to Nexa
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Save your profile, apply to roles, and pick up where you left off.
            </p>

            <div className="mt-8">
              <Suspense fallback={null}>
                <SignInForm next={next ?? null} />
              </Suspense>
            </div>

            <p className="mt-8 text-[11px] leading-relaxed text-muted-foreground">
              We never post on your behalf or share your email with recruiters
              without your action. Sign-in is privacy-first and can be removed
              from Settings at any time.
            </p>
          </div>
        </div>
      </div>
    </SiteShell>
  )
}
