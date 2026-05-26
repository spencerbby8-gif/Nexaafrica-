import "server-only"
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js"
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
 * Persistence error tagged with the table that failed and the underlying
 * Supabase / Postgrest error so the route can log it and surface it cleanly.
 */
export class PersistenceError extends Error {
  table: "profiles" | "profile_skills" | "profile_experience" | "profile_ai_metadata"
  cause?: PostgrestError | unknown
  code?: string
  details?: string
  hint?: string

  constructor(
    table: PersistenceError["table"],
    message: string,
    cause?: PostgrestError | unknown,
  ) {
    super(message)
    this.name = "PersistenceError"
    this.table = table
    this.cause = cause
    if (cause && typeof cause === "object") {
      const c = cause as Partial<PostgrestError>
      this.code = c.code
      this.details = c.details
      this.hint = c.hint
    }
  }
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v
  if (v == null) return fallback
  try {
    return String(v)
  } catch {
    return fallback
  }
}

function asNullableString(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === "string") return v.trim() === "" ? null : v
  try {
    const s = String(v)
    return s.trim() === "" ? null : s
  } catch {
    return null
  }
}

/**
 * Replace a user's parsed profile in a single flow.
 * Skills and experience are wiped and re-inserted to keep the data clean.
 *
 * Accepts an optional pre-built supabase client so a single API request can
 * reuse one client across all writes (no repeat cookies()/createClient() work).
 *
 * Throws PersistenceError tagged with the failing table on any DB error.
 */
export async function saveParsedProfile(
  userId: string,
  parsed: ParsedProfile,
  client?: SupabaseClient,
) {
  const supabase = client ?? (await createClient())

  // Defensive coercion — Gemini can omit fields or return null for sparse CVs.
  const headline = asString(parsed?.headline).slice(0, 160)
  const summary = asString(parsed?.summary).slice(0, 1200)
  const skillsArr = Array.isArray(parsed?.skills) ? parsed.skills : []
  const experienceArr = Array.isArray(parsed?.experience) ? parsed.experience : []

  console.log("[v0][persist][skills] type=", Array.isArray(parsed?.skills) ? "array" : typeof parsed?.skills, "len=", skillsArr.length, "sample=", skillsArr.slice(0, 5))

  // Upsert (not update) so the profiles row is guaranteed to exist before
  // any child rows are inserted. Users created before the handle_new_user
  // trigger was installed will not have a profiles row yet, which causes
  // FK violations (Postgres 23503 / "Reference error") on profile_skills
  // and profile_experience inserts.
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        headline,
        summary,
        status: "ready" as const,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
  if (profileErr) {
    throw new PersistenceError(
      "profiles",
      profileErr.message || "Failed to upsert profile",
      profileErr,
    )
  }

  // ----- skills ----------------------------------------------------------
  const delSkills = await supabase.from("profile_skills").delete().eq("profile_id", userId)
  if (delSkills.error) {
    throw new PersistenceError(
      "profile_skills",
      `Failed to clear skills: ${delSkills.error.message}`,
      delSkills.error,
    )
  }

  if (skillsArr.length > 0) {
    const skillRows = Array.from(
      new Set(
        skillsArr
          .map((s) => asString(s).trim())
          .filter((s) => s.length > 0 && s.length <= 80),
      ),
    )
      .slice(0, 30)
      .map((name) => ({ profile_id: userId, name }))

    if (skillRows.length > 0) {
      console.log("[v0][persist][skills] insert count=", skillRows.length, "preview=", skillRows.slice(0, 3))
      const { error } = await supabase.from("profile_skills").insert(skillRows)
      if (error) {
        throw new PersistenceError(
          "profile_skills",
          `Failed to save skills: ${error.message}`,
          error,
        )
      }
    }
  }

  // ----- experience ------------------------------------------------------
  const delExp = await supabase
    .from("profile_experience")
    .delete()
    .eq("profile_id", userId)
  if (delExp.error) {
    throw new PersistenceError(
      "profile_experience",
      `Failed to clear experience: ${delExp.error.message}`,
      delExp.error,
    )
  }

  if (experienceArr.length > 0) {
    const expRows = experienceArr
      .map((e, i) => {
        const title = asString(e?.title).trim().slice(0, 160)
        const company = asString(e?.company).trim().slice(0, 160)
        // Schema requires title and company NOT NULL — drop rows missing either.
        if (!title || !company) return null
        return {
          profile_id: userId,
          title,
          company,
          start_date: asNullableString(e?.start_date)?.slice(0, 32) ?? null,
          end_date: asNullableString(e?.end_date)?.slice(0, 32) ?? null,
          description: asNullableString(e?.description)?.slice(0, 1500) ?? null,
          position: i,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, 12)

    if (expRows.length > 0) {
      const { error } = await supabase.from("profile_experience").insert(expRows)
      if (error) {
        throw new PersistenceError(
          "profile_experience",
          `Failed to save experience: ${error.message}`,
          error,
        )
      }
    }
  }
}

export async function markProfileStatus(
  userId: string,
  status: "parsing" | "failed" | "incomplete",
  errorMsg?: string,
  client?: SupabaseClient,
) {
  const supabase = client ?? (await createClient())
  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId)
  if (error) {
    // Non-fatal here — caller decides what to do.
    throw new PersistenceError(
      "profiles",
      `Failed to set status=${status}: ${error.message}`,
      error,
    )
  }
  if (status === "failed" && errorMsg) {
    const { error: metaErr } = await supabase
      .from("profile_ai_metadata")
      .upsert(
        {
          profile_id: userId,
          last_error: errorMsg.slice(0, 500),
          last_run_at: new Date().toISOString(),
        },
        { onConflict: "profile_id" },
      )
    if (metaErr) {
      throw new PersistenceError(
        "profile_ai_metadata",
        `Failed to record error metadata: ${metaErr.message}`,
        metaErr,
      )
    }
  }
}
