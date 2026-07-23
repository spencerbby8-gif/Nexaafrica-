import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createServiceClient as createPublicClient } from "@/lib/supabase/service"
import { ProfileView } from "@/components/profile-view"
import { SiteShell } from "@/components/site-shell"
import { siteUrl } from "@/lib/site"

export const dynamic = "force-dynamic"

type Params = { token: string }

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { token } = await params
  // SEO God Mode: share links are private by default, noindex to protect user privacy
  // But have proper canonical + OG for when user explicitly shares
  return {
    title: "Nexa — Shared Profile",
    description: "View this remote-ready profile on Nexa",
    robots: { index: false, follow: true },
    alternates: { canonical: `/p/${token}` },
    openGraph: {
      title: "Remote-ready profile on Nexa",
      description: "Verified for global remote hiring",
      url: siteUrl(`/p/${token}`),
      type: "profile",
    },
  }
}

export default async function SharedProfilePage({ params }: { params: Promise<Params> }) {
  const { token } = await params
  if (!token) notFound()

  // Use service client to bypass RLS for share_token lookup (share links are public knowledge via token)
  // In production, you want RLS policy: profiles where share_token = token are readable
  const supabase = createPublicClient()
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("share_token", token)
    .eq("status", "ready")
    .maybeSingle()

  if (error || !profile) notFound()

  const [skillsRes, expRes] = await Promise.all([
    supabase.from("profile_skills").select("name").eq("profile_id", profile.id).order("name"),
    supabase.from("profile_experience").select("*").eq("profile_id", profile.id).order("position"),
  ])

  const skills = (skillsRes.data ?? []).map((r: any) => r.name as string)
  const experience = (expRes.data ?? []) as any[]

  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-[11px] text-yellow-400 inline-flex">
          Shared profile • View only
        </div>
      </div>
      <ProfileView profile={profile as any} skills={skills} experience={experience} email={null} />
    </SiteShell>
  )
}
