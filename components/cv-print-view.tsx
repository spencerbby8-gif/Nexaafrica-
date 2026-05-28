"use client"

import { useEffect } from "react"
import { Printer, Download } from "lucide-react"
import type { ProfileRecord, ProfileExperience } from "@/lib/profile/types"

type Props = {
  profile: ProfileRecord
  skills: string[]
  experience: ProfileExperience[]
  email: string | null
}

function formatRange(start: string | null, end: string | null) {
  const s = (start ?? "").trim()
  const e = (end ?? "").trim()
  if (!s && !e) return ""
  if (s && e) return `${s} \u2014 ${e}`
  return s || e
}

/**
 * Recruiter-ready CV view.
 *
 * Renders an A4-shaped sheet using only system fonts so the print
 * output looks identical across devices and downloads cleanly via
 * the browser's native print-to-PDF. The on-screen frame is muted
 * so users understand they're looking at a print preview; the
 * actual print stylesheet (in the page) hides the frame entirely.
 */
export function CvPrintView({ profile, skills, experience, email }: Props) {
  // Auto-trigger the print dialog when the URL has ?download=1 so the
  // "Download PDF" button can deep-link straight to the save sheet.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("download") === "1") {
      // Small delay so fonts/layout settle before the print dialog opens.
      const t = setTimeout(() => window.print(), 250)
      return () => clearTimeout(t)
    }
  }, [])

  const name = profile.full_name || (email ? email.split("@")[0] : "Your name")
  const headline = profile.headline || "Open to remote roles"

  return (
    <div className="cv-shell min-h-dvh bg-muted/40 py-8">
      <style>{printStyles}</style>

      {/* Top action bar — hidden in the print output. */}
      <div className="cv-actions mx-auto mb-5 flex max-w-[820px] items-center justify-between gap-3 px-4">
        <p className="text-xs text-muted-foreground">
          Recruiter-ready CV {"\u00b7"} Save as PDF from your browser&apos;s print dialog
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm hover:bg-accent/10"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden /> Print
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background shadow-sm hover:opacity-90"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Save as PDF
          </button>
        </div>
      </div>

      {/* The CV sheet. Fixed A4-aspect width, generous padding, ATS-friendly. */}
      <article className="cv-sheet mx-auto max-w-[820px] bg-white px-12 py-12 text-[#111] shadow-sm">
        <header className="border-b border-[#e5e5e5] pb-5">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
            {name}
          </h1>
          <p className="mt-1 text-[14px] text-[#444]">{headline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#555]">
            {profile.country && <span>{profile.country}</span>}
            {email && <span>{email}</span>}
            <span>Open to remote</span>
          </div>
        </header>

        {profile.summary && (
          <section className="mt-6">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#666]">
              Summary
            </h2>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-[#222]">
              {profile.summary}
            </p>
          </section>
        )}

        {experience.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#666]">
              Experience
            </h2>
            <ol className="mt-3 space-y-4">
              {experience.map((exp, i) => (
                <li key={exp.id ?? i}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-[14px] font-semibold text-[#111]">
                      {exp.title}
                      {exp.company ? (
                        <span className="font-normal text-[#444]">
                          {"\u2003"}at {exp.company}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[11.5px] text-[#666]">
                      {formatRange(exp.start_date, exp.end_date)}
                    </p>
                  </div>
                  {exp.description && (
                    <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-[1.55] text-[#222]">
                      {exp.description}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {skills.length > 0 && (
          <section className="mt-6">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#666]">
              Skills
            </h2>
            <p className="mt-2 text-[13px] leading-[1.6] text-[#222]">
              {skills.join(" \u00b7 ")}
            </p>
          </section>
        )}

        <footer className="mt-10 border-t border-[#e5e5e5] pt-3 text-[10.5px] text-[#888]">
          Generated on Nexa {"\u00b7"} nexa.africa
        </footer>
      </article>
    </div>
  )
}

/**
 * Print stylesheet inlined so the CV always renders correctly,
 * even if Tailwind's print variants are configured differently.
 *
 * - Hides the action bar and any non-CV chrome
 * - Sets A4 page size with generous margins
 * - Forces white background and black text in print color mode
 */
const printStyles = `
@media print {
  @page { size: A4; margin: 18mm; }
  html, body { background: white !important; }
  .cv-shell { background: white !important; padding: 0 !important; }
  .cv-actions { display: none !important; }
  .cv-sheet {
    box-shadow: none !important;
    margin: 0 !important;
    padding: 0 !important;
    max-width: 100% !important;
  }
  /* Avoid orphaned headings at page breaks. */
  h1, h2 { break-after: avoid; }
  li, section { break-inside: avoid; }
}
`
