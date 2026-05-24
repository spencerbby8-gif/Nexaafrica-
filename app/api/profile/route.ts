import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { ParsedProfile } from "@/lib/profile/types"
import { saveParsedProfile } from "@/lib/profile/queries"

export const runtime = "nodejs"

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const headline = typeof b.headline === "string" ? b.headline.slice(0, 160).trim() : ""
  const summary = typeof b.summary === "string" ? b.summary.slice(0, 1200).trim() : ""
  const country =
    typeof b.country === "string" && b.country.trim().length > 0 ? b.country.slice(0, 60) : null

  const skills = Array.isArray(b.skills)
    ? (b.skills as unknown[])
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .slice(0, 30)
        .map((s) => s.slice(0, 40))
    : []

  const experienceRaw = Array.isArray(b.experience) ? (b.experience as unknown[]) : []
  const experience: ParsedProfile["experience"] = experienceRaw
    .map((e) => {
      const x = e as Record<string, unknown>
      const title = typeof x.title === "string" ? x.title.slice(0, 160).trim() : ""
      const company = typeof x.company === "string" ? x.company.slice(0, 160).trim() : ""
      return {
        title,
        company,
        start_date:
          typeof x.start_date === "string" && x.start_date.trim() ? x.start_date.slice(0, 32) : null,
        end_date:
          typeof x.end_date === "string" && x.end_date.trim() ? x.end_date.slice(0, 32) : null,
        description:
          typeof x.description === "string" && x.description.trim()
            ? x.description.slice(0, 1500)
            : null,
      }
    })
    .filter((e) => e.title || e.company)
    .slice(0, 12)

  // Update country first (saveParsedProfile doesn't touch it).
  await supabase.from("profiles").update({ country }).eq("id", user.id)

  try {
    await saveParsedProfile(user.id, { headline, summary, skills, experience })
  } catch (e) {
    console.error("[v0] saveParsedProfile failed", e)
    return NextResponse.json({ error: "Could not save profile" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
