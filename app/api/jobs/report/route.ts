import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "anon"
  const rl = rateLimit(`report:${ip}`, { limit: 5, windowMs: 60_000 * 10 })
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many reports, try later" }, { status: 429 })
  }

  let body: { job_id?: string; reason?: string; details?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const job_id = body.job_id?.trim()
  const reason = body.reason?.trim() || "other"
  const details = body.details?.trim().slice(0, 1000) || null

  if (!job_id) return NextResponse.json({ error: "Missing job_id" }, { status: 400 })

  const allowedReasons = new Set(["scam","fake","expired","wrong_location","discriminatory","spam","other"])
  if (!allowedReasons.has(reason)) return NextResponse.json({ error: "Invalid reason" }, { status: 400 })

  const supabaseAuth = await createClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()

  const service = createServiceClient()
  const { error } = await service.from("job_reports").insert({
    job_id,
    user_id: user?.id || null,
    reason,
    details,
    status: "pending",
  })

  if (error) {
    console.error("[report] insert error", error.message)
    return NextResponse.json({ error: "Failed to save report" }, { status: 500 })
  }

  // Auto-flag job if 3+ pending reports
  try {
    const { count } = await service.from("job_reports").select("id", { count: "exact", head: true }).eq("job_id", job_id).eq("status","pending")
    if ((count || 0) >= 3) {
      await service.from("jobs").update({ is_flagged: true, flagged_reason: `Auto-flagged: ${count} user reports (${reason})` }).eq("id", job_id)
      await service.from("trust_audit_log").insert({
        job_id,
        action: "auto_flagged",
        reason: `${count} reports, latest: ${reason}`,
      })
    }
  } catch {}

  return NextResponse.json({ ok: true }, { status: 200 })
}
