"use client"
import { getTrustLabel } from "@/lib/trust/engine"
import { ShieldCheck, AlertTriangle } from "lucide-react"

export function TrustBadge({ score, compact = false }: { score: number | null | undefined; compact?: boolean }) {
  if (score == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-400">
        <ShieldCheck className="h-3 w-3" /> Verifying
      </span>
    )
  }

  const { label, tone, color } = getTrustLabel(score)

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${color}`}>
        {tone === "warning" ? <AlertTriangle className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
        {score}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${color}`}>
      {tone === "warning" ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
      Trust {score} • {label}
    </span>
  )
}
