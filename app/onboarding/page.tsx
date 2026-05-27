import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getCurrentProfile } from "@/lib/profile/queries"
import { CvUpload } from "@/components/cv-upload"
import { SiteShell } from "@/components/site-shell"
import { ShieldCheck, Globe2, Lock } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Set up your profile",
  description: "Upload your CV. Nexa will format it for global remote applications.",
  robots: { index: false, follow: false },
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reupload?: string }>
}) {
  const { next, reupload } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const target = `/onboarding${next ? `?next=${encodeURIComponent(next)}` : ""}`
    redirect(`/sign-in?next=${encodeURIComponent(target)}`)
  }

  const { profile } = await getCurrentProfile()
  // Allow explicit re-upload via ?reupload=1. Without that flag, send completed
  // users to /profile so the route isn't accidentally hit by stale links.
  if (profile?.status === "ready" && reupload !== "1") {
    redirect(next && next.startsWith("/") ? next : "/profile")
  }

  const isReupload = profile?.status === "ready" && reupload === "1"

  return (
    <SiteShell>
      <main className="mx-auto w-full max-w-xl px-4 py-10 md:py-16">
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {isReupload ? "Re-upload CV" : "Step 1 of 1"}
          </p>
          <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            {isReupload ? "Upload a new CV" : "Upload your CV"}
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            {isReupload
              ? "Your existing profile will be replaced with the contents of the new CV. You can review everything before it goes live."
              : "Nexa formats your CV into a clean profile for global remote employers. We standardize your titles and skills, and remove personal fields that aren\u2019t relevant for international hiring. You can review and edit everything before saving."}
          </p>
        </div>

        <CvUpload next={next} />

        <ul className="mt-8 grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
          <li className="flex items-start gap-2">
            <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
            <span>Formatted for global remote hiring</span>
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
            <span>Recruiter-ready structure</span>
          </li>
          <li className="flex items-start gap-2">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
            <span>Private — only you can see your CV</span>
          </li>
        </ul>
      </main>
    </SiteShell>
  )
}
