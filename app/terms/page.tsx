import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingPage } from '@/components/marketing-page'

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'The terms under which you use Nexa. Plain language, no surprises.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Terms"
      title="Terms of use"
      lede="The terms under which you use Nexa. Plain language, no surprises."
      updated="February 2026"
    >
      <h2>What Nexa is</h2>
      <p>
        Nexa is a job-discovery platform. We surface remote roles from
        third-party companies and we provide a tool that transforms your CV
        into a recruiter-ready profile. We do not employ anyone listed on the
        platform, we do not handle applications, and we are not a recruitment
        agency.
      </p>

      <h2>Using Nexa</h2>
      <ul>
        <li>You must be 18 or older to create a profile.</li>
        <li>
          You agree not to upload content you don&rsquo;t have rights to, or
          content that&rsquo;s misleading or fraudulent.
        </li>
        <li>
          You agree not to scrape the platform, bypass rate limits, or
          otherwise interfere with the service.
        </li>
      </ul>

      <h2>Job listings</h2>
      <p>
        Every role on Nexa is reviewed before publication. However, listings
        come from third-party companies and we don&rsquo;t guarantee
        availability, accuracy, or that any company will respond to your
        application. If you spot a problem with a listing, please{' '}
        <Link href="/contact">contact us</Link>.
      </p>

      <h2>Your profile</h2>
      <p>
        You retain ownership of your CV and profile data. By uploading a CV,
        you grant Nexa permission to process it for the sole purpose of
        generating and storing your profile on the platform. See our{' '}
        <Link href="/privacy">privacy policy</Link> for details.
      </p>

      <h2>No fees, ever</h2>
      <p>
        Nexa is free for candidates. We will never charge you to apply, to
        create a profile, or to access listings. If anyone claiming to be
        Nexa asks for payment, it&rsquo;s fraudulent &mdash; please report it
        immediately.
      </p>

      <h2>Liability</h2>
      <p>
        Nexa is provided on an &ldquo;as-is&rdquo; basis. We&rsquo;re not
        liable for hiring decisions made by third-party companies, for offers
        that don&rsquo;t materialize, or for the conduct of recruiters
        contacted through listings on the platform.
      </p>

      <h2>Account termination</h2>
      <p>
        You can delete your account at any time by contacting us. We reserve
        the right to remove accounts that violate these terms or harm other
        users.
      </p>

      <h2>Changes</h2>
      <p>
        If we make material changes to these terms, we&rsquo;ll update the
        &ldquo;Last updated&rdquo; date and, where reasonable, notify
        registered users by email.
      </p>
    </MarketingPage>
  )
}
