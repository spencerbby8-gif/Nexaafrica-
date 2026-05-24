import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SiteShell } from "@/components/site-shell"
import { Button } from "@/components/ui/button"
import { getCurrentProfile } from "@/lib/profile/queries"
import { ProfileView } from "@/components/profile-view"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Your profile",
  description: "Manage your Nexa profile and CV.",
  robots: { index: false, follow: false },
}

export default async function ProfilePage() {
  const { user, profile, skills, experience } = await getCurrentProfile()
  if (!user) redirect("/sign-in?next=%2Fprofile")

  // No profile row yet (extremely rare since trigger creates one), or never uploaded a CV.
  if (!profile || profile.status === "incomplete") {
    return (
      <SiteShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Your profile</h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            You haven&apos;t set up a profile yet. Upload your CV and Nexa will format it for remote
            applications. You can edit anything before saving.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link href="/onboarding">Upload CV</Link>
            </Button>
          </div>
        </div>
      </SiteShell>
    )
  }

  if (profile.status === "parsing") {
    return (
      <SiteShell>
        <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Preparing your profile</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Refresh in a moment. This usually takes about 15 seconds.
          </p>
        </div>
      </SiteShell>
    )
  }

  if (profile.status === "failed") {
    return (
      <SiteShell>
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">We couldn&apos;t process your CV</h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            Something went wrong while reading your CV. You can try again with a different file, or
            fill in your profile manually.
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link href="/onboarding">Try again</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/profile/edit">Edit manually</Link>
            </Button>
          </div>
        </div>
      </SiteShell>
    )
  }

  return (
    <SiteShell>
      <ProfileView profile={profile} skills={skills} experience={experience} email={user.email} />
    </SiteShell>
  )
}
