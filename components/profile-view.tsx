"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ProfileEditor } from "@/components/profile-editor"
import { SignOutButton } from "@/components/sign-out-button"
import {
  Pencil,
  MapPin,
  ShieldCheck,
  Globe2,
  Share2,
  Check,
  Briefcase,
  RefreshCw,
} from "lucide-react"
import type { ProfileRecord, ProfileExperience } from "@/lib/profile/types"

type Props = {
  profile: ProfileRecord
  skills: string[]
  experience: ProfileExperience[]
  email: string | null
}

function formatDateRange(start: string | null, end: string | null) {
  const s = (start ?? "").trim()
  const e = (end ?? "").trim()
  if (!s && !e) return ""
  if (s && e) return `${s} \u2014 ${e}`
  return s || e
}

function monogram(headline: string | null, email: string | null) {
  const source = (headline || email || "N").trim()
  // Take the first letter of the first two whitespace-separated tokens.
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  const a = parts[0]?.[0] ?? "N"
  const b = parts[1]?.[0] ?? ""
  return (a + b).toUpperCase()
}

// Light heuristic grouping: anything that looks like a tool/proper noun goes to
// "Tools & technologies", everything else (lowercase short tokens, e.g. "sql",
// "copywriting") is "Disciplines". Falls back to a flat list when there is no
// meaningful split. Keeps presentation calm without inventing data.
function groupSkills(skills: string[]) {
  const dedup: string[] = []
  const seen = new Set<string>()
  for (const raw of skills) {
    const v = raw.trim()
    if (!v) continue
    const k = v.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    dedup.push(v)
  }

  const tools: string[] = []
  const disciplines: string[] = []
  for (const s of dedup) {
    const looksLikeTool =
      /^[A-Z]/.test(s) || /[.+#]/.test(s) || /\d/.test(s) || s.length <= 4
    if (looksLikeTool) tools.push(s)
    else disciplines.push(s)
  }

  // Avoid awkward 1-item groups by collapsing to a flat list.
  if (tools.length < 3 || disciplines.length < 3) {
    return { groups: [{ label: "Skills", items: dedup }], total: dedup.length }
  }
  return {
    groups: [
      { label: "Tools & technologies", items: tools },
      { label: "Disciplines", items: disciplines },
    ],
    total: dedup.length,
  }
}

export function ProfileView({ profile, skills, experience, email }: Props) {
  const [editing, setEditing] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const grouped = useMemo(() => groupSkills(skills), [skills])
  const initials = useMemo(() => monogram(profile.headline, email), [profile.headline, email])

  if (editing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Review &amp; edit
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight md:text-[28px]">
              Make it yours
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Adjust anything Nexa got wrong. Keep it factual and concise.
            </p>
          </div>
          <button
            onClick={() => setEditing(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
        <ProfileEditor
          profile={profile}
          skills={skills}
          experience={experience}
          onClose={() => setEditing(false)}
        />
      </div>
    )
  }

  const handleShare = async () => {
    const text =
      "My remote-ready profile is complete on Nexa \u2014 built for global remote applications."
    const url = typeof window !== "undefined" ? window.location.origin : ""

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Nexa \u2014 remote-ready profile", text, url })
        return
      } catch {
        // user cancelled or share unavailable; fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`.trim())
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2200)
    } catch {
      // Silent — keep this lightweight, no toast system here.
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Top trust strip — single calm line above the recruiter card */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Globe2 className="h-3 w-3" aria-hidden /> Remote-ready
        </span>
        <span aria-hidden className="text-muted-foreground/40">
          {"\u00b7"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Recruiter-ready structure
        </span>
        <span aria-hidden className="text-muted-foreground/40">
          {"\u00b7"}
        </span>
        <span>Formatted for global remote hiring</span>
      </div>

      {/* Recruiter card — premium hero */}
      <header className="rounded-2xl border border-border bg-card px-5 py-6 sm:px-7 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold tracking-tight text-foreground/80"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Nexa profile
              </p>
              <h1 className="mt-1.5 text-balance text-[22px] font-semibold leading-tight tracking-tight md:text-[26px]">
                {profile.headline || "Your professional profile"}
              </h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                {profile.country && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" aria-hidden /> {profile.country}
                  </span>
                )}
                {profile.country && experience.length > 0 && (
                  <span aria-hidden className="text-muted-foreground/40">
                    {"\u00b7"}
                  </span>
                )}
                {experience.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" aria-hidden /> {experience.length}{" "}
                    {experience.length === 1 ? "role" : "roles"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button onClick={handleShare} variant="ghost" size="sm" className="text-muted-foreground">
              {shareCopied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copied
                </>
              ) : (
                <>
                  <Share2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Share
                </>
              )}
            </Button>
            <Button onClick={() => setEditing(true)} variant="outline" size="sm">
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              Edit
            </Button>
          </div>
        </div>
      </header>

      {profile.summary && (
        <section className="mt-9">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Summary
          </h2>
          <p className="mt-3 text-pretty text-[15px] leading-relaxed text-foreground/90">
            {profile.summary}
          </p>
        </section>
      )}

      {grouped.total > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Skills
            </h2>
            <span className="text-[11px] text-muted-foreground/70">{grouped.total}</span>
          </div>
          <div className="mt-3 space-y-4">
            {grouped.groups.map((g) => (
              <div key={g.label}>
                {grouped.groups.length > 1 && (
                  <p className="mb-1.5 text-[11px] text-muted-foreground/80">{g.label}</p>
                )}
                <ul className="flex flex-wrap gap-1.5">
                  {g.items.map((s) => (
                    <li
                      key={s}
                      className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs text-foreground/85"
                    >
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Experience
          </h2>
          <ol className="mt-4 divide-y divide-border/60 border-y border-border/60">
            {experience.map((e, idx) => {
              const range = formatDateRange(e.start_date, e.end_date)
              const isCurrent = /present/i.test(e.end_date ?? "")
              return (
                <li
                  key={e.id ?? `${e.title}-${e.company}-${idx}`}
                  className="grid gap-3 py-5 sm:grid-cols-[120px_1fr]"
                >
                  <div className="text-xs leading-relaxed text-muted-foreground tabular-nums">
                    {range || (
                      <span className="text-muted-foreground/60">{"\u2014"}</span>
                    )}
                    {isCurrent && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                        <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
                        Now
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium leading-snug">{e.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{e.company}</p>
                    {e.description && (
                      <p className="mt-2.5 text-pretty text-[14px] leading-relaxed text-foreground/85">
                        {e.description}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section className="mt-12 rounded-lg border border-border/70 bg-card/60 px-4 py-3 text-xs text-muted-foreground">
        <p className="leading-relaxed">
          This profile is formatted for global remote hiring. Local personal fields have been
          removed and titles standardized for international recruiters. Nexa never asks for payment
          to apply.
        </p>
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/onboarding?reupload=1">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Re-upload CV
          </Link>
        </Button>
        <SignOutButton />
      </section>
    </div>
  )
}
