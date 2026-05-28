"use client"

import { useState } from "react"
import Link from "next/link"
import { Copy, Check, FileDown } from "lucide-react"
import { track } from "@/lib/analytics"
import type { ProfileExperience } from "@/lib/profile/types"

type Props = {
  summary: string | null
  experience: ProfileExperience[]
}

/**
 * Reusable profile snippets bar.
 *
 * Surfaces the most-asked recruiter-form actions one tap away:
 *   - Copy summary text  (paste into bio / About fields on ATS)
 *   - Copy experience    (paste into "Work history" textareas)
 *   - Download CV (PDF)  (open the print-ready CV in a new tab)
 *
 * Lightweight by design — no PDF library, no clipboard polyfills,
 * no animation libraries. Each action gives a brief tactile
 * "Copied" confirmation in place; analytics events fire so we can
 * later see which snippet drives reuse.
 */
export function ProfileUtilityBar({ summary, experience }: Props) {
  const [copied, setCopied] = useState<"summary" | "experience" | null>(null)

  const flash = (kind: "summary" | "experience") => {
    setCopied(kind)
    setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1600)
  }

  const copySummary = async () => {
    if (!summary) return
    try {
      await navigator.clipboard.writeText(summary)
      track({ name: "profile_snippet_copied", props: { kind: "summary" } })
      flash("summary")
    } catch {
      /* no-op — clipboard rejection */
    }
  }

  const copyExperience = async () => {
    if (experience.length === 0) return
    const text = experience
      .map((exp) => {
        const parts = [
          [exp.title, exp.company].filter(Boolean).join(" at "),
          [exp.start_date, exp.end_date].filter(Boolean).join(" \u2014 "),
        ]
          .filter(Boolean)
          .join("  |  ")
        return [parts, exp.description?.trim()].filter(Boolean).join("\n")
      })
      .join("\n\n")
    try {
      await navigator.clipboard.writeText(text)
      track({ name: "profile_snippet_copied", props: { kind: "experience" } })
      flash("experience")
    } catch {
      /* no-op */
    }
  }

  return (
    <section
      aria-label="Reuse your profile"
      className="mt-7 rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Reuse your profile
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">
            Recruiter-ready snippets, one tap. Skip retyping the same
            answers on every ATS.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/profile/cv?download=1"
          target="_blank"
          rel="noopener"
          onClick={() => track({ name: "profile_cv_download" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background shadow-sm transition-opacity hover:opacity-90"
        >
          <FileDown className="h-3.5 w-3.5" aria-hidden /> Download CV (PDF)
        </Link>
        <button
          type="button"
          onClick={copySummary}
          disabled={!summary}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied === "summary" ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> Copied summary
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy summary
            </>
          )}
        </button>
        <button
          type="button"
          onClick={copyExperience}
          disabled={experience.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copied === "experience" ? (
            <>
              <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> Copied experience
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" aria-hidden /> Copy experience
            </>
          )}
        </button>
      </div>
    </section>
  )
}
