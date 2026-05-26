import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import type { ParsedProfile, ProfileExperience, ProfileRecord } from "./types"

export async function getCurrentProfile(): Promise<{
  user: { id: string; email: string | null } | null
  profile: ProfileRecord | null
  skills: string[]
  experience: ProfileExperience[]
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, profile: null, skills: [], experience: [] }

  const [profileRes, skillsRes, expRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("profile_skills").select("name").eq("profile_id", user.id).order("name"),
    supabase
      .from("profile_experience")
      .select("id,title,company,start_date,end_date,description,position")
      .eq("profile_id", user.id)
      .order("position", { ascending: true }),
  ])

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: (profileRes.data as ProfileRecord | null) ?? null,
    skills: (skillsRes.data ?? []).map((r) => r.name as string),
    experience: (expRes.data ?? []) as ProfileExperience[],
  }
}

/**
 * Replace a user's parsed profile in a single flow.
 * Skills and experience are wiped and re-inserted to keep the data clean.
 *
 * Accepts an optional pre-built supabase client so a single API request can
 * reuse one client across all writes (no repeat cookies()/createClient() work).
 */
export async function saveParsedProfile(
  userId: string,
  parsed: ParsedProfile,
  client?: SupabaseClient,
) {
  const supabase = client ?? (await createClient())

  const updates = {
    headline: parsed.headline.slice(0, 160),
    summary: parsed.summary.slice(0, 1200),
    status: "ready" as const,
    completed_at: new Date().toISOString(),
  }

  const { error: profileErr } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
  if (profileErr) throw profileErr

  await supabase.from("profile_skills").delete().eq("profile_id", userId)
  if (parsed.skills.length > 0) {
    const skillRows = Array.from(new Set(parsed.skills.map((s) => s.trim()).filter(Boolean)))
      .slice(0, 30)
      .map((name) => ({ profile_id: userId, name }))
    if (skillRows.length > 0) {
      const { error } = await supabase.from("profile_skills").insert(skillRows)
      if (error) throw error
    }
  }

  await supabase.from("profile_experience").delete().eq("profile_id", userId)
  if (parsed.experience.length > 0) {
    const expRows = parsed.experience.slice(0, 12).map((e, i) => ({
      profile_id: userId,
      title: e.title.slice(0, 160),
      company: e.company.slice(0, 160),
      start_date: e.start_date?.slice(0, 32) ?? null,
      end_date: e.end_date?.slice(0, 32) ?? null,
      description: e.description?.slice(0, 1500) ?? null,
      position: i,
    }))
    const { error } = await supabase.from("profile_experience").insert(expRows)
    if (error) throw error
  }
}

export async function markProfileStatus(
  userId: string,
  status: "parsing" | "failed" | "incomplete",
  errorMsg?: string,
  client?: SupabaseClient,
) {
  const supabase = client ?? (await createClient())
  await supabase.from("profiles").update({ status }).eq("id", userId)
  if (status === "failed" && errorMsg) {
    await supabase
      .from("profile_ai_metadata")
      .upsert(
        {
          profile_id: userId,
          last_error: errorMsg.slice(0, 500),
          last_run_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      )
  }
}
