import type { Metadata } from 'next'
import { Mail, ShieldAlert, Bug } from 'lucide-react'
import { MarketingPage } from '@/components/marketing-page'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Reach the Nexa team for support, scam reports, or general questions.',
  alternates: { canonical: '/contact' },
}

const SUPPORT_EMAIL = 'hello@nexa.africa'
const SAFETY_EMAIL = 'safety@nexa.africa'

export default function ContactPage() {
  return (
    <MarketingPage
      eyebrow="Contact"
      title="Reach a real person."
      lede="Nexa is maintained by a small team. We read every message and respond, usually within 48 hours."
    >
      <p>
        The fastest way to reach us is by email. Pick the inbox that matches
        your message &mdash; it gets to the right person faster.
      </p>

      <div className="not-prose mt-6 grid gap-3 sm:grid-cols-1">
        <ContactCard
          icon={<Mail className="h-4 w-4" aria-hidden />}
          title="General support"
          description="Questions about your profile, applying, or how Nexa works."
          email={SUPPORT_EMAIL}
        />
        <ContactCard
          icon={<ShieldAlert className="h-4 w-4 text-accent" aria-hidden />}
          title="Report a scam or unsafe role"
          description="Spotted a fake listing, a recruiter asking for fees, or someone impersonating Nexa? Send it here."
          email={SAFETY_EMAIL}
        />
        <ContactCard
          icon={<Bug className="h-4 w-4" aria-hidden />}
          title="Bug reports & feedback"
          description="Something broken, confusing, or worth improving? We genuinely read these."
          email={SUPPORT_EMAIL}
        />
      </div>

      <h2>Response times</h2>
      <p>
        We aim to reply to every message within 48 hours. Safety reports are
        triaged first &mdash; verified bad listings are removed immediately.
      </p>

      <h2>What we can&rsquo;t help with</h2>
      <p>
        We can&rsquo;t intervene in hiring decisions made by companies listed
        on Nexa, follow up on applications you&rsquo;ve submitted, or
        guarantee callbacks. For application-specific questions, contact the
        company directly using the details on their careers page.
      </p>
    </MarketingPage>
  )
}

function ContactCard({
  icon,
  title,
  description,
  email,
}: {
  icon: React.ReactNode
  title: string
  description: string
  email: string
}) {
  return (
    <a
      href={`mailto:${email}`}
      className="group block rounded-xl border border-border/70 bg-card p-5 transition-colors hover:border-foreground/30"
    >
      <div className="flex items-center gap-2 text-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-background text-foreground/80">
          {icon}
        </span>
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      <p className="mt-3 font-mono text-xs text-foreground/85 group-hover:text-foreground">
        {email}
      </p>
    </a>
  )
}
