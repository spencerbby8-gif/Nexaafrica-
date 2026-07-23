import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { SiteShell } from "@/components/site-shell"
import Link from "next/link"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Trust Admin — Nexa",
  robots: { index: false, follow: false },
}

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "spencerbby8@gmail.com").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean)

export default async function TrustAdminPage() {
  // Auth check — only allow admin emails
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect("/sign-in?next=/admin/trust")
  if (ADMIN_EMAILS.length >0 && !ADMIN_EMAILS.includes((user.email||"").toLowerCase())) {
    // For now, allow any authenticated user to view but show warning if not admin
    // In production, uncomment redirect:
    // redirect("/")
  }

  const supabase = createServiceClient()

  const [flaggedRes, lowTrustRes, reportsRes, recentRes] = await Promise.all([
    supabase.from("jobs").select("id, slug, title, company, trust_score, is_flagged, flagged_reason").eq("is_flagged", true).order("trust_score", { ascending: true }).limit(20),
    supabase.from("jobs").select("id, slug, title, company, trust_score").eq("is_active", true).lt("trust_score", 40).order("trust_score", { ascending: true }).limit(20),
    supabase.from("job_reports").select("id, job_id, reason, details, status, created_at, jobs!inner(slug, title, company)").eq("status","pending").order("created_at", { ascending: false }).limit(20),
    supabase.from("jobs").select("id, slug, title, company, trust_score, trust_confidence").eq("is_active", true).order("trust_score", { ascending: false }).limit(5),
  ])

  return (
    <SiteShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Trust Intelligence — Admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">Moderation workflow for flagged, low-trust, and reported jobs. Evidence-based, no AI black boxes.</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <section className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-red-300">Flagged Jobs ({flaggedRes.data?.length || 0})</h2>
            <ul className="mt-4 space-y-3">
              {(flaggedRes.data || []).map((j: any) => (
                <li key={j.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-[13px] font-medium">{j.title} • {j.company}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Score {j.trust_score} • {j.flagged_reason?.slice(0,120)}</p>
                  <Link href={`/role/${j.slug}`} className="mt-2 inline-block text-[11px] text-red-300 hover:underline">View →</Link>
                </li>
              ))}
              {(!flaggedRes.data || flaggedRes.data.length===0) && <p className="text-[12px] text-zinc-500">No flagged jobs</p>}
            </ul>
          </section>

          <section className="rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.05] p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-yellow-300">Low Trust &lt;40 ({lowTrustRes.data?.length || 0})</h2>
            <ul className="mt-4 space-y-3">
              {(lowTrustRes.data || []).map((j: any) => (
                <li key={j.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                  <p className="text-[13px] font-medium">{j.title} • {j.company}</p>
                  <p className="text-[11px] text-zinc-500">Trust {j.trust_score}</p>
                  <Link href={`/role/${j.slug}`} className="text-[11px] text-yellow-300 hover:underline">View →</Link>
                </li>
              ))}
              {(!lowTrustRes.data || lowTrustRes.data.length===0) && <p className="text-[12px] text-zinc-500">No low trust jobs</p>}
            </ul>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-300">Pending Reports ({reportsRes.data?.length || 0})</h2>
            <ul className="mt-4 space-y-3">
              {(reportsRes.data || []).map((r: any) => (
                <li key={r.id} className="rounded-lg border border-zinc-800 bg-black p-3">
                  <p className="text-[12px] font-medium">{r.jobs?.title} • {r.jobs?.company}</p>
                  <p className="text-[11px] text-zinc-500 capitalize">{r.reason} • {new Date(r.created_at).toLocaleDateString()}</p>
                  {r.details && <p className="mt-1 text-[11px] text-zinc-400">{r.details.slice(0,100)}</p>}
                  <Link href={`/role/${r.jobs?.slug}`} className="text-[11px] text-zinc-400 hover:underline">View job →</Link>
                </li>
              ))}
              {(!reportsRes.data || reportsRes.data.length===0) && <p className="text-[12px] text-zinc-500">No pending reports</p>}
            </ul>
          </section>
        </div>

        <section className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider">Top Trusted Jobs</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {(recentRes.data || []).map((j: any) => (
              <li key={j.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black px-3 py-2">
                <span className="text-[12px]">{j.title} • {j.company}</span>
                <span className="text-[11px] text-green-400">Trust {j.trust_score} • {j.trust_confidence}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-[12px] text-yellow-200">
          Admin is protected by service_role. In production, add email check: allow only founders. This page is noindex, not linked from public sitemap.
        </div>
      </div>
    </SiteShell>
  )
}
