import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SiteShell } from '@/components/site-shell'
import { SignOutButton } from '@/components/sign-out-button'
import { DeleteAccountDialog } from '@/components/delete-account-dialog'
import { joinedLabel } from '@/lib/format'
import { ShieldCheck, Mail, FileCheck2, ExternalLink } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Account, privacy, and trust controls for your Nexa profile.',
  robots: { index: false, follow: false },
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in?next=/settings')

  const joined = joinedLabel(user.created_at ?? new Date().toISOString())

  return (
    <SiteShell>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Settings
          </p>
          <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Account & preferences
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            Manage how you appear to recruiters and what stays on your profile.
            Changes here apply across Nexa.
          </p>
        </header>

        {/* Account */}
        <Section title="Account" hint={joined}>
          <Row
            icon={<Mail className="h-3.5 w-3.5" aria-hidden />}
            label="Email"
            value={user.email ?? 'Unknown'}
            help="The email tied to your sign-in. Used only for magic-link auth."
          />
          <Row
            label="Profile"
            value="Public via your shareable profile link"
            action={
              <Link
                href="/profile"
                className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground"
              >
                Open profile
                <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
            }
            help="Edit your transformed summary, links, and visibility from the profile page."
          />
        </Section>

        {/* Privacy & Trust */}
        <Section title="Privacy & trust">
          <Row
            icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
            label="Recruiter contact"
            value="Off by default"
            help="We never share your email with recruiters. They can only reach you through the apply links you choose."
          />
          <Row
            icon={<FileCheck2 className="h-3.5 w-3.5" aria-hidden />}
            label="Saved jobs"
            value="Stored on your account"
            action={
              <Link
                href="/saved"
                className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground"
              >
                View saved
                <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
            }
            help="Saved roles are private to you. Removing your account clears them."
          />
        </Section>

        {/* Session */}
        <Section title="Session">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Sign out on this device. Your profile, saved jobs, and history
              stay on Nexa.
            </p>
            <div className="-ml-1.5 sm:ml-0">
              <SignOutButton />
            </div>
          </div>
        </Section>

        {/* Danger */}
        <Section title="Delete account" tone="danger">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Permanently remove your Nexa profile, saved jobs, and uploaded CV.
            This cannot be undone.
          </p>
          <div className="mt-4">
            <DeleteAccountDialog email={user.email ?? ''} />
          </div>
        </Section>
      </main>
    </SiteShell>
  )
}

/* ----------------------------- presentation ----------------------------- */

function Section({
  title,
  hint,
  tone,
  children,
}: {
  title: string
  hint?: string
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <section
      className={
        'mb-5 rounded-xl border bg-card p-5 sm:p-6 ' +
        (tone === 'danger' ? 'border-destructive/30' : 'border-border/70')
      }
    >
      <div className="mb-4 flex items-end justify-between gap-3">
        <h2
          className={
            'text-sm font-medium ' +
            (tone === 'danger' ? 'text-destructive' : 'text-foreground')
          }
        >
          {title}
        </h2>
        {hint && (
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Row({
  icon,
  label,
  value,
  help,
  action,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  help?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border/40 pt-4 first:border-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          {icon && (
            <span className="grid h-5 w-5 place-items-center rounded border border-border/70 bg-secondary text-foreground/70">
              {icon}
            </span>
          )}
          {label}
        </div>
        <p className="mt-1.5 truncate text-sm text-foreground">{value}</p>
        {help && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {help}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
