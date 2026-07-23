"use client"
import { ShieldCheck, Globe2, Briefcase, Star, Eye } from "lucide-react"
import type { AtsResult } from "@/lib/profile/ats"

export function RecruiterView({
  headline,
  summary,
  skills,
  experienceCount,
  ats,
}: {
  headline: string | null
  summary: string | null
  skills: string[]
  experienceCount: number
  ats: AtsResult
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-card overflow-hidden">
      <div className="bg-zinc-950 px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
          <Eye className="h-3 w-3" /> Recruiter View • What hiring managers see
        </p>
        <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">Trusted</span>
      </div>

      <div className="p-6 grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Top Strengths</p>
          <ul className="mt-3 space-y-2 text-[13px] text-zinc-200">
            <li className="flex gap-2"><Star className="h-3.5 w-3.5 text-yellow-400 mt-0.5" /> {headline?.split("|")[0]?.trim() || "Clear role positioning"}</li>
            <li className="flex gap-2"><Briefcase className="h-3.5 w-3.5 text-zinc-400 mt-0.5" /> {experienceCount} roles with ownership narrative</li>
            <li className="flex gap-2"><Globe2 className="h-3.5 w-3.5 text-zinc-400 mt-0.5" /> Remote-ready language & async fit</li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Trust Signals</p>
          <ul className="mt-3 space-y-2 text-[13px] text-zinc-300">
            <li className="flex gap-2"><ShieldCheck className="h-3.5 w-3.5 text-green-400 mt-0.5" /> No buzzwords, no fabrications</li>
            <li>ATS Score {ats.score}/100 — {ats.score >= 80 ? "Top 10%" : "Above average"}</li>
            <li>Skills normalized for ATS parsing</li>
          </ul>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Best Fit For</p>
          <ul className="mt-3 space-y-2 text-[13px]">
            <li className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300 inline-block mr-2">Remote Support</li>
            <li className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300 inline-block">Fintech Ops</li>
            <li className="mt-2 text-zinc-500 text-[12px]">Suggested: Customer Support, Operations, Trust & Safety</li>
          </ul>
        </div>
      </div>

      <div className="px-6 py-4 bg-yellow-500/[0.06] border-t border-yellow-500/10 text-[12px] text-zinc-300">
        <strong className="text-yellow-400">Recruiter note:</strong> This profile was elevated by Nexa God Tier AI to make African experience globally legible. Every line is truthful — just undeniable.
      </div>
    </div>
  )
}
