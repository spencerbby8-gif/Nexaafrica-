"use client"
import { useState } from "react"
import { ArrowLeftRight, Sparkles } from "lucide-react"

type Props = {
  rawText: string | null
  headline: string | null
  summary: string | null
  improvements: Array<{ type: string; field: string; after: string; reason: string }>
}

export function BeforeAfterComparison({ rawText, headline, summary, improvements }: Props) {
  const [mode, setMode] = useState<"split" | "after">("split")

  const beforeSnippet = rawText ? rawText.slice(0, 800) + (rawText.length > 800 ? "..." : "") : "Original CV text not stored — upload again to see before."

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-2">
          <ArrowLeftRight className="h-3 w-3" /> Before vs After
        </p>
        <div className="flex rounded-full bg-zinc-900 p-1">
          <button
            onClick={() => setMode("split")}
            className={`rounded-full px-3 py-1 text-[11px] ${mode === "split" ? "bg-white text-black" : "text-zinc-400"}`}
          >
            Split
          </button>
          <button
            onClick={() => setMode("after")}
            className={`rounded-full px-3 py-1 text-[11px] ${mode === "after" ? "bg-white text-black" : "text-zinc-400"}`}
          >
            After
          </button>
        </div>
      </div>

      {mode === "split" ? (
        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800">
          <div className="p-5">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3">Before • Raw CV</p>
            <p className="text-[13px] leading-relaxed text-zinc-400 whitespace-pre-wrap font-mono">{beforeSnippet}</p>
          </div>
          <div className="p-5 bg-gradient-to-b from-yellow-500/[0.05] to-transparent">
            <p className="text-[11px] uppercase tracking-wider text-yellow-400/80 mb-3 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> After • God Tier
            </p>
            <div className="space-y-4">
              <div>
                <p className="text-[11px] text-zinc-500 uppercase">Headline</p>
                <p className="mt-1 text-[14px] font-medium text-white">{headline}</p>
              </div>
              <div>
                <p className="text-[11px] text-zinc-500 uppercase">Summary</p>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">{summary}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <p className="text-[13px] text-zinc-300">{summary}</p>
        </div>
      )}

      <div className="border-t border-zinc-800 bg-zinc-900/50 p-5">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-3">What changed — explained</p>
        <ul className="space-y-3">
          {improvements.slice(0, 5).map((imp, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-1 h-5 w-5 shrink-0 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-[10px] text-yellow-400">
                {i + 1}
              </span>
              <div>
                <p className="text-[13px] font-medium text-white">
                  <span className="capitalize">{imp.field}</span> • {imp.type.replace(/_/g, " ")}
                </p>
                <p className="mt-1 text-[12px] text-zinc-400">{imp.reason}</p>
                <p className="mt-1 text-[12px] text-zinc-300 italic">→ {imp.after}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
