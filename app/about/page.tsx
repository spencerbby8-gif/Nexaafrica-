import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingPage } from '@/components/marketing-page'

export const metadata: Metadata = {
  title: 'About Nexa',
  description:
    'Nexa is a remote work platform built for African professionals. Reviewed roles, transparent pay, direct apply.',
  alternates: { canonical: '/about' },
}

export default function AboutPage() {
  return (
    <MarketingPage
      eyebrow="About"
      title="A remote work platform for African professionals."
      lede="Nexa exists for one reason: African talent deserves a calmer, more legitimate way to find global remote work."
    >
      <h2>What we do</h2>
      <p>
        Nexa surfaces remote roles from companies that actually hire across
        borders. Every listing is reviewed before it goes live, and roles that
        close are removed automatically. You apply directly on the company&rsquo;s
        site &mdash; Nexa never handles applications, never charges candidates,
        and never partners with recruiters who do.
      </p>

      <h2>How we&rsquo;re different</h2>
      <ul>
        <li>
          <strong>Reviewed roles, not scraped noise.</strong> We filter out
          fake listings, expired roles, and recruiters charging fees.
        </li>
        <li>
          <strong>Built for African candidates.</strong> Categories, salary
          framing, and trust signals are designed for people applying from
          Lagos, Nairobi, Cape Town, Accra, Kampala, and beyond.
        </li>
        <li>
          <strong>Profile transformation.</strong> Upload your CV and Nexa
          generates a recruiter-ready profile formatted for international
          hiring &mdash; standardized titles, no local fields, ATS-friendly
          structure.
        </li>
        <li>
          <strong>No middleman fees, ever.</strong> Free to apply. Free to
          create a profile. Free to use.
        </li>
      </ul>

      <h2>Who&rsquo;s behind Nexa</h2>
      <p>
        Nexa is built and maintained by a small team that has lived the
        problem &mdash; African professionals trying to find legitimate remote
        work without paying agencies, falling for scams, or reformatting CVs
        for every recruiter. We&rsquo;re building the platform we wish existed
        when we were applying.
      </p>

      <h2>What&rsquo;s next</h2>
      <p>
        We&rsquo;re focused on inventory depth, trust infrastructure, and
        making the path from CV to remote offer shorter. If you have feedback,
        a role to share, or a scam to report, please{' '}
        <Link href="/contact">get in touch</Link>.
      </p>
    </MarketingPage>
  )
}
