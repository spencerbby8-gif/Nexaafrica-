import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingPage } from '@/components/marketing-page'

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'How Nexa collects, stores, and protects your data. Plain language, no legalese.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Privacy"
      title="Privacy policy"
      lede="Plain language. No legalese. Here's exactly what we collect, why, and what we never do with it."
      updated="February 2026"
    >
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account info:</strong> the email address you sign in with,
          plus a session token from our auth provider.
        </li>
        <li>
          <strong>CV and profile data:</strong> the CV file you upload and the
          structured profile generated from it.
        </li>
        <li>
          <strong>Usage analytics:</strong> aggregate, anonymous data about
          which pages are visited, via Vercel Analytics. No third-party ad
          trackers.
        </li>
      </ul>

      <h2>Why we collect it</h2>
      <ul>
        <li>To let you sign in and access your profile.</li>
        <li>To generate and store your transformed profile.</li>
        <li>To improve role discoverability and platform quality.</li>
      </ul>

      <h2>Where it&rsquo;s stored</h2>
      <p>
        Profile data and CVs are stored on Supabase, hosted on AWS, with
        row-level security enabled. Files are stored in a private bucket only
        accessible to your authenticated session. The site is hosted on
        Vercel.
      </p>

      <h2>What we never do</h2>
      <ul>
        <li>Sell your data to recruiters, agencies, or anyone else.</li>
        <li>Share your CV without your explicit action.</li>
        <li>Use your data to train external AI models.</li>
        <li>Run third-party ad tracking or behavioral profiling.</li>
      </ul>

      <h2>AI processing</h2>
      <p>
        Your CV text is sent to Google&rsquo;s Gemini API to generate the
        structured profile. Google does not retain or train on this data
        under their enterprise API terms. The generated profile is then
        stored on your Nexa account and never sent back to any external AI
        service.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Access:</strong> view your profile and uploaded CV from{' '}
          <Link href="/profile">your profile page</Link>.
        </li>
        <li>
          <strong>Correction:</strong> edit any field in your profile, or
          re-upload your CV.
        </li>
        <li>
          <strong>Deletion:</strong> request full deletion via{' '}
          <Link href="/contact">contact</Link>. We action it within 7 days.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions about privacy or a deletion request? Reach us at{' '}
        <a href="mailto:hello@nexa.africa">hello@nexa.africa</a> or via the{' '}
        <Link href="/contact">contact page</Link>.
      </p>
    </MarketingPage>
  )
}
