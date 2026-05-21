import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SiteShell } from '@/components/site-shell'
import { SignInForm } from '@/components/auth/sign-in-form'

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
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-md items-center px-4 sm:px-6">
        <div className="w-full py-12">
          <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Sign in to Nexa
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Save your profile, apply to roles, and pick up where you left off.
          </p>

          <div className="mt-8">
            <Suspense fallback={null}>
              <SignInForm next={next ?? null} />
            </Suspense>
          </div>
        </div>
      </div>
    </SiteShell>
  )
}
