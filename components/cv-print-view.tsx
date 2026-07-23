"use client"

import { useEffect } from "react"
import { Printer, Download, Sparkles } from "lucide-react"
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
  if (s && e) return `${s} — ${e}`
  return s || e
}

export function CvPrintView({ profile, skills, experience, email }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("download") === "1") {
      const t = setTimeout(() => window.print(), 250)
      return () => clearTimeout(t)
    }
  }, [])

  const name = profile.full_name || (email ? email.split("@")[0] : "Your name")
  const headline = profile.headline || "Open to remote roles"

  return (
    <div className="cv-shell min-h-dvh bg-[#0a0a0a] py-8">
      <style>{printStyles}</style>

      <div className="cv-actions mx-auto mb-6 flex max-w-[820px] items-center justify-between gap-3 px-4">
        <p className="text-xs text-zinc-400 flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-yellow-400" /> God Tier CV • Crafted by Nexa AI
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-4 text-xs font-medium text-white hover:bg-zinc-800"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-xs font-medium text-black hover:bg-zinc-200"
          >
            <Download className="h-3.5 w-3.5" /> Save as PDF
          </button>
        </div>
      </div>

      <article className="cv-sheet mx-auto max-w-[820px] overflow-hidden rounded-[24px] border border-zinc-800 bg-white text-[#111] shadow-2xl">
        {/* HEADER */}
        <header className="relative bg-[#0a0a0a] px-10 py-10 text-white">
          <div className="absolute top-0 right-0 h-[200px] w-[400px] bg-gradient-to-bl from-yellow-500/20 via-amber-500/10 to-transparent blur-[40px]" />
          <div className="relative">
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-yellow-400">
                  <span className="h-1 w-1 rounded-full bg-yellow-400 animate-pulse" /> God Tier • Verified by Nexa
                </div>
                <h1 className="mt-4 text-[32px] font-semibold leading-[1.05] tracking-tight">{name}</h1>
                <p className="mt-2 max-w-[500px] text-[15px] leading-snug text-zinc-300">{headline}</p>
              </div>
              <div className="hidden h-14 w-14 items-center justify-center rounded-2xl bg-white text-black font-bold sm:flex">
                {name
                  .split(" ")
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-[12px] text-zinc-400">
              {profile.country && (
                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">{profile.country}</span>
              )}
              {email && <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1">{email}</span>}
              <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-yellow-400">Open to Remote • Global</span>
            </div>
          </div>
        </header>

        <div className="px-10 py-8">
          {profile.summary && (
            <section>
              <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                <span className="h-px w-6 bg-zinc-200" /> Profile • Elevated Story
              </h2>
              <p className="mt-4 max-w-[65ch] text-[15px] leading-[1.7] text-zinc-800">{profile.summary}</p>
            </section>
          )}

          {experience.length > 0 && (
            <section className="mt-10">
              <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                <span className="h-px w-6 bg-zinc-200" /> Experience • Legend
              </h2>
              <ol className="mt-6 space-y-8">
                {experience.map((exp, i) => (
                  <li key={exp.id ?? i} className="relative border-l border-zinc-200 pl-6">
                    <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-zinc-900" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[15px] font-semibold text-zinc-900">
                        {exp.title}{" "}
                        <span className="font-normal text-zinc-500">at {exp.company}</span>
                      </p>
                      <span className="text-[11px] rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-600">
                        {formatRange(exp.start_date, exp.end_date)}
                      </span>
                    </div>
                    {exp.description && (
                      <p className="mt-3 whitespace-pre-line text-[13.5px] leading-[1.65] text-zinc-700">{exp.description}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {skills.length > 0 && (
            <section className="mt-10">
              <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
                <span className="h-px w-6 bg-zinc-200" /> Superpowers
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {skills.map((s) => (
                  <span key={s} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[12px] font-medium text-zinc-800">
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          <footer className="mt-12 flex items-center justify-between border-t border-zinc-100 pt-4 text-[10px] text-zinc-400">
            <span>Crafted on Nexa • God Tier AI • nexa.africa</span>
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-yellow-500" /> Elevated, not fabricated
            </span>
          </footer>
        </div>
      </article>
    </div>
  )
}

const printStyles = `
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: white !important; }
  .cv-shell { background: white !important; padding: 0 !important; }
  .cv-actions { display: none !important; }
  .cv-sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; max-width: 100% !important; }
  h1, h2 { break-after: avoid; }
  li, section { break-inside: avoid; }
}
`
