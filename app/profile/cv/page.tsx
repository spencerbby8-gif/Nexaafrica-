import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/profile/queries'
import { CvPrintView } from '@/components/cv-print-view'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'CV — Nexa',
  robots: { index: false, follow: false },
}

/**
 * Recruiter-ready printable CV.
 *
 * Server-rendered HTML deliberately. The browser's built-in
 * "Save as PDF" / "Print to PDF" handles conversion — no headless
 * Chromium, no PDF library, no extra megabytes shipped to the
 * client. ATS systems also parse this HTML cleanly because the
 * structure uses semantic headings + plain text.
 *
 * The page renders without the SiteShell so the print output is
 * pure CV content — no nav, no footer, no analytics chrome.
 */
export default async function CvPage() {
  const { user, profile, skills, experience } = await getCurrentProfile()
  if (!user) redirect('/sign-in?next=/profile/cv')
  if (!profile) redirect('/onboarding')

  return (
    <CvPrintView
      profile={profile}
      skills={skills}
      experience={experience}
      email={user.email}
    />
  )
}
