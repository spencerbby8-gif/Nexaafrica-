import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentProfile } from "@/lib/profile/queries"
import { CvUpload } from "@/components/cv-upload"
import { SiteShell } from "@/components/site-shell"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Set up your profile",
  description: "Upload your CV. Nexa will format it for global remote applications.",
  robots: { index: false, follow: false },
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const target = `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`
    redirect(`/sign-in?next=${encodeURIComponent(target)}`)
  }

  const { profile } = await getCurrentProfile()
  if (profile?.status === "ready") {
    redirect(next && next.startsWith("/") ? next : "/profile")
  }

  return (
    <SiteShell>
      <main className="mx-auto w-full max-w-xl px-4 py-10 md:py-16">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Onboarding
          </p>
          <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            Upload your CV
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            Nexa formats your CV into a clean profile for remote employers. We remove personal
            fields that aren&apos;t relevant for global hiring and standardize your titles and
            skills. You can edit anything before saving.
          </p>
        </div>

        <CvUpload next={next} />
      </main>
    </SiteShell>
  )
}
