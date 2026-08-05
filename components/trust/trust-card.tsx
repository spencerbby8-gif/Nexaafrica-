"use client"

import { useState } from "react"
import type { TrustResult } from "@/lib/trust/types"
import { getTrustLabel } from "@/lib/trust/engine"
import { ShieldCheck, AlertTriangle, ChevronDown, Info, Check, AlertCircle } from "lucide-react"

export function TrustCard({ trust, legitimacyScore, legitimacyRaw, aiConfidence, capNote }: { trust: TrustResult; legitimacyScore?: number | null; legitimacyRaw?: number | null; aiConfidence?: number | null; capNote?: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const { label, tone, color } = getTrustLabel(trust.score)

  return (
    <div className="rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black overflow-hidden">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative h-14 w-14 rounded-full border-4 border-zinc-800 flex items-center justify-center bg-zinc-900">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${trust.score >= 70 ? "rgb(34 197 94)" : trust.score >= 40 ? "rgb(250 204 21)" : "rgb(239 68 68)"} ${trust.score}%, rgb(39 39 42) ${trust.score}%)`,
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 3px))",
                }}
              />
              <span className="relative text-[16px] font-semibold">{trust.score}</span>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 flex items-center gap-1.5">
                <ShieldCheck className="h-3 w-3" /> Trust verification
              </p>
              <h3 className={`mt-1 text-[16px] font-semibold ${tone === "positive" ? "text-green-400" : tone === "warning" ? "text-red-300" : "text-yellow-300"}`}>
                {label}
              </h3>
              <p className="mt-1 text-[12px] text-zinc-400">
                {legitimacyScore != null || aiConfidence != null ? (<>Listing signals {legitimacyScore ?? trust.score}{legitimacyRaw != null && legitimacyRaw > 100 ? " (at ceiling — signal sum " + legitimacyRaw + ")" : ""} · Opportunity evidence {aiConfidence != null ? `${aiConfidence}%` : "pending"} · unified {trust.score}</>) : (<><span className="capitalize">{trust.confidence}</span> legitimacy · {trust.signals.length} signals checked</>)}
              </p>
              {capNote && (
                <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] leading-snug text-amber-300/90">
                  {capNote}
                </p>
              )}
            </div>
          </div>
          {trust.isFlagged && (
            <span className="rounded-full bg-red-500/10 border border-red-500/20 px-3 py-1 text-[11px] text-red-300 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Flagged
            </span>
          )}
        </div>

        {/* Warning banner */}
        {trust.isWarning && (
          <div className="mt-5 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.08] px-4 py-3 flex gap-3">
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-[13px] leading-relaxed">
              <p className="font-medium text-yellow-300">Review before applying</p>
              <p className="mt-1 text-zinc-400">{trust.flaggedReason || "This job has low trust signals. Verify directly on company site."}</p>
            </div>
          </div>
        )}

        {/* Top 3 signals preview */}
        <div className="mt-6 grid gap-2">
          {trust.signals.slice(0, 3).map((s) => (
            <div key={s.id} className="flex items-start gap-2.5 text-[13px]">
              <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${s.tone === "positive" ? "bg-green-400" : s.tone === "warning" ? "bg-red-400" : s.tone === "caution" ? "bg-yellow-400" : "bg-zinc-600"}`} />
              <div className="min-w-0">
                <span className="font-medium text-zinc-200">{s.label}</span>
                <span className="text-zinc-500"> — {s.explanation}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-5 inline-flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-white"
        >
          {expanded ? "Hide details" : `Why we trust this job • ${trust.signals.length} signals`}
          <ChevronDown className={`h-3 w-3 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 bg-zinc-950 p-6">
          <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-4">All trust signals — evidence based</p>
          <ul className="space-y-4">
            {trust.signals.map((s) => (
              <li key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] border ${
                      s.tone === "positive" ? "bg-green-500/10 border-green-500/20 text-green-400" :
                      s.tone === "warning" ? "bg-red-500/10 border-red-500/20 text-red-400" :
                      s.tone === "caution" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400" :
                      "bg-zinc-800 border-zinc-700 text-zinc-400"
                    }`}>
                      {s.tone === "positive" ? <Check className="h-3 w-3" /> : s.tone === "warning" ? <AlertTriangle className="h-3 w-3" /> : <Info className="h-3 w-3" />}
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-white">{s.label}</p>
                      <p className="text-[11px] text-zinc-500 capitalize">{s.source} • {s.confidence} confidence • {s.scoreImpact >0 ? `+${s.scoreImpact}` : s.scoreImpact}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded-full border ${
                    s.tone === "positive" ? "border-green-500/20 text-green-400" :
                    s.tone === "warning" ? "border-red-500/20 text-red-400" :
                    "border-zinc-700 text-zinc-500"
                  }`}>{s.tone}</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-zinc-300">{s.explanation}</p>
                {s.evidence && (
                  <p className="mt-2 text-[11px] font-mono text-zinc-500 border-l-2 border-zinc-700 pl-3">“{s.evidence}”</p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl bg-white text-black px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[12px] font-semibold">Every score is evidence based</p>
              <p className="text-[11px] text-zinc-600">No black boxes. <a href="/trust-and-safety" className="underline">How Nexa verifies jobs</a></p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">v{trust.version}</span>
          </div>
        </div>
      )}
    </div>
  )
}
