import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingPage } from '@/components/marketing-page'

export const metadata: Metadata = {
  title: 'How Nexa works',
  description:
    'How Nexa reviews roles, transforms CVs into recruiter-ready profiles, and helps African professionals apply directly to remote jobs.',
  alternates: { canonical: '/how-it-works' },
}

export default function HowItWorksPage() {
  return (
    <MarketingPage
      eyebrow="How it works"
      title="From local CV to global remote application, in one calm flow."
      lede="No agencies. No fees. No reformatting your CV for every recruiter. Here's the full path on Nexa."
    >
      <h2>1. Browse reviewed remote roles</h2>
      <p>
        Every role on Nexa is checked before it goes live. We remove fake
        listings, recruiter-fee schemes, and roles that have already closed.
        You can browse by category, region, or filter for roles{' '}
        <Link href="/jobs?africa=1">explicitly open to candidates in Africa</Link>.
      </p>

      <h2>2. Upload your CV once</h2>
      <p>
        On <Link href="/onboarding">onboarding</Link>, you upload your existing
        CV in PDF or DOCX. Nexa extracts the structured content and generates
        a recruiter-ready profile in your dashboard.
      </p>

      <h2>3. Your profile gets transformed for global hiring</h2>
      <ul>
        <li>Job titles standardized for international recruiters</li>
        <li>Local CV fields removed (date of birth, marital status, NIN, address, photo)</li>
        <li>Skills deduplicated and normalized</li>
        <li>Summary rewritten in calm, factual language &mdash; no buzzwords</li>
        <li>Reformatted for ATS readability</li>
      </ul>
      <p>
        You can review every change before saving, and re-upload anytime. The
        original CV is yours; the transformed profile is what recruiters and
        ATS systems read cleanly.
      </p>

      <h2>4. Apply directly to companies</h2>
      <p>
        When you click Apply, Nexa redirects you straight to the company&rsquo;s
        own application page. Nexa never collects applications, never charges
        a fee, and never sits between you and the recruiter.
      </p>

      <h2>What Nexa never does</h2>
      <ul>
        <li>Charge candidates. Ever.</li>
        <li>Sell your CV or profile data.</li>
        <li>Partner with recruiters who charge fees.</li>
        <li>Post fake or unverified roles to inflate inventory.</li>
      </ul>

      <p>
        Read more about how we keep the platform safe in our{' '}
        <Link href="/trust-and-safety">Trust &amp; safety</Link> page.
      </p>
    </MarketingPage>
  )
}
