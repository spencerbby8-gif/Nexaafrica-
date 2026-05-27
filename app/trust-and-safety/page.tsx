import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingPage } from '@/components/marketing-page'

export const metadata: Metadata = {
  title: 'Trust & safety',
  description:
    'How Nexa reviews roles, protects candidates from scams, and handles your profile data.',
  alternates: { canonical: '/trust-and-safety' },
}

export default function TrustPage() {
  return (
    <MarketingPage
      eyebrow="Trust & safety"
      title="How we keep Nexa safe and legitimate."
      lede="Remote job platforms attract scammers. Here's exactly how Nexa is built to keep candidates safe."
    >
      <h2>How roles are reviewed</h2>
      <p>
        Every role on Nexa goes through a review check before it goes live.
        We verify the company exists, the role is currently hiring, and the
        application URL points directly to the company&rsquo;s own ATS or
        careers page. If a listing fails any of these checks, it doesn&rsquo;t
        appear on Nexa.
      </p>

      <h2>What we never do</h2>
      <ul>
        <li>
          <strong>We never charge candidates.</strong> Free to browse, free to
          apply, free to create a profile. If anyone claiming to be Nexa asks
          you for payment, it&rsquo;s a scam &mdash; please{' '}
          <Link href="/contact">report it to us</Link>.
        </li>
        <li>
          <strong>We never collect applications.</strong> Apply takes you
          directly to the company&rsquo;s own site. Nexa is not a middleman.
        </li>
        <li>
          <strong>We never sell your data.</strong> Your CV, profile, and
          contact details are not sold or shared with recruiters who pay for
          access. There is no such program.
        </li>
        <li>
          <strong>We never list pay-to-apply roles.</strong> Any company
          requesting fees from candidates is removed.
        </li>
      </ul>

      <h2>How we handle your CV</h2>
      <p>
        Your CV is uploaded over an encrypted connection and stored in a
        private bucket only you can read. The transformed profile is saved
        against your account and visible only to you unless you choose to
        share it. You can re-upload or delete your data at any time from your{' '}
        <Link href="/profile">profile</Link>.
      </p>

      <h2>Common scams to watch for</h2>
      <ul>
        <li>
          <strong>Recruiters asking for an &ldquo;application fee&rdquo; or
          &ldquo;visa processing fee.&rdquo;</strong> Legitimate remote
          companies never charge candidates.
        </li>
        <li>
          <strong>Job offers via WhatsApp or Telegram from an unknown
          number.</strong> Real companies use email and structured ATS flows.
        </li>
        <li>
          <strong>&ldquo;Equipment fees&rdquo; or &ldquo;onboarding
          deposits.&rdquo;</strong> Always a scam.
        </li>
        <li>
          <strong>Offers that arrive without an interview.</strong> Treat as
          fraudulent until verified directly with the company.
        </li>
      </ul>

      <h2>Reporting a problem</h2>
      <p>
        If you spot a suspicious role, a misleading apply link, or a recruiter
        asking for fees while citing Nexa, please{' '}
        <Link href="/contact">contact us</Link> with the role URL and any
        details. We respond to safety reports within 48 hours and remove
        verified bad listings immediately.
      </p>
    </MarketingPage>
  )
}
