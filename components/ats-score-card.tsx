"use client"
import { getAtsLabel, type AtsResult } from "@/lib/profile/ats"
import { Sparkles, Check, TrendingUp } from "lucide-react"

export function AtsScoreCard({ ats }: { ats: AtsResult }) {
  const { label, color } = getAtsLabel(ats.score)
  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-zinc-900 to-black p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-yellow-400/80 flex items-center gap-2">
            <Sparkles className="h-3 w-3" /> ATS Compatibility
          </p>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-[42px] font-semibold leading-none tracking-tight">{ats.score}</span>
            <span className="text-zinc-500 text-[14px]">/ 100</span>
          </div>
          <p className={`mt-2 text-[13px] font-medium ${color}`}>{label}</p>
        </div>
        <div className="h-16 w-16 rounded-full border-4 border-zinc-800 flex items-center justify-center relative">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(rgb(250 204 21) ${ats.score}%, rgb(39 39 42) ${ats.score}%)`,
              mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px))",
            }}
          />
          <span className="text-[18px]">✦</span>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {[
          { k: "ATS Keywords", v: ats.breakdown.keywords, max: 25 },
          { k: "Clarity", v: ats.breakdown.clarity, max: 20 },
          { k: "Impact", v: ats.breakdown.impact, max: 25 },
          { k: "Recruiter Fit", v: ats.breakdown.recruiterFit, max: 15 },
          { k: "Remote Ready", v: ats.breakdown.remoteReadiness, max: 15 },
        ].map((row) => (
          <div key={row.k} className="flex items-center gap-3">
            <span className="w-[110px] text-[11px] text-zinc-400 uppercase tracking-wider">{row.k}</span>
            <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-yellow-400 to-amber-500" style={{ width: `${(row.v / row.max) * 100}%` }} />
            </div>
            <span className="w-6 text-[11px] text-zinc-500">{row.v}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-2">
        {ats.reasons.map((r) => (
          <div key={r} className="flex items-start gap-2 text-[13px] text-zinc-300">
            <Check className="h-3.5 w-3.5 mt-0.5 text-green-400 shrink-0" />
            <span>{r}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
