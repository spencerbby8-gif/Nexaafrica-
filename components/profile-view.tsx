"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ProfileEditor } from "@/components/profile-editor"
import { SignOutButton } from "@/components/sign-out-button"
import { ReuploadCvButton } from "@/components/reupload-cv-button"
import {
  Pencil,
  MapPin,
  ShieldCheck,
  Globe2,
  Share2,
  Check,
  Briefcase,
  FileCheck2,
  Eraser,
  Languages,
  Sparkles,
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
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  const a = parts[0]?.[0] ?? "N"
  const b = parts[1]?.[0] ?? ""
  return (a + b).toUpperCase()
}

// Lightweight, factual readiness guidance derived from the actual profile.
// Returns a single calm sentence + an optional improvement nudge. Never uses
// percentages or scores; the goal is professional confidence, not gamification.
function readinessGuidance(args: {
  summary: string | null
  skills: string[]
  experience: ProfileExperience[]
}): { label: string; hint: string | null } {
  const summary = (args.summary ?? "").trim()
  const skills = args.skills.length
  const exp = args.experience.length

  const hasStrongSummary = summary.length >= 200
  const hasMinSkills = skills >= 6
  const hasMinExperience = exp >= 1

  if (hasStrongSummary && hasMinSkills && hasMinExperience) {
    return {
      label: "Strong remote-ready profile",
      hint:
        exp >= 2
          ? null
          : "Add another role to broaden your global hiring signal.",
    }
  }

  if (hasMinSkills && hasMinExperience) {
    return {
      label: "Well-structured for global applications",
      hint: "Could be improved with a longer summary or portfolio link.",
    }
  }

  if (hasMinExperience) {
    return {
      label: "Foundation in place",
      hint: "Add a few more skills to round out your remote-ready profile.",
    }
  }

  return {
    label: "Profile ready",
    hint: "Add experience to strengthen your remote-ready profile.",
  }
}

// Light heuristic grouping: anything that looks like a tool/proper noun goes to
// "Tools & technologies", everything else (lowercase short tokens) is
// "Disciplines". Falls back to a flat list when there's no meaningful split.
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
  const guidance = useMemo(
    () => readinessGuidance({ summary: profile.summary, skills, experience }),
    [profile.summary, skills, experience],
  )

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
      // Silent — keep this lightweight.
    }
  }

  return (
    <div className="nexa-ambient mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* Top trust strip — single calm institutional line */}
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

      {/* Editorial hero — recruiter-grade identity card.
          Composition: wordmark stamp + hairline rule above the headline,
          large display type, calm metadata row, and an institutional
          readiness footer separated by a hairline. No avatars/photos. */}
      <header className="nexa-rule nexa-surface relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-7 sm:px-9 sm:py-9">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            <span aria-hidden className="h-px w-6 bg-border" />
            <span className="font-semibold text-foreground/85">Nexa</span>
            <span aria-hidden className="text-muted-foreground/40">{"\u00b7"}</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="relative inline-flex h-1.5 w-1.5 items-center justify-center"
              >
                <span className="absolute inset-0 rounded-full bg-accent/40" />
                <span className="relative h-1 w-1 rounded-full bg-accent" />
              </span>
              Verified profile
            </span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Button
              onClick={handleShare}
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
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

        <div className="mt-7 flex items-start gap-5">
          <div
            aria-hidden
            className="mt-1.5 hidden h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-background text-base font-semibold tracking-tight text-foreground/85 ring-1 ring-accent/15 ring-offset-2 ring-offset-card sm:flex"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-balance text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] text-foreground sm:text-[30px]">
              {profile.headline || "Your professional profile"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
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
              {experience.length > 0 && (
                <span aria-hidden className="text-muted-foreground/40">
                  {"\u00b7"}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5" aria-hidden /> Open to remote
              </span>
            </div>
          </div>
        </div>

        {/* Mobile actions row — pushed below hero for thumb reach */}
        <div className="mt-5 flex items-center gap-2 sm:hidden">
          <Button
            onClick={() => setEditing(true)}
            variant="outline"
            size="sm"
            className="flex-1"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Edit
          </Button>
          <Button
            onClick={handleShare}
            variant="ghost"
            size="sm"
            className="flex-1 text-muted-foreground"
          >
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
        </div>

        {/* Institutional readiness strip — derived from real data */}
        <div className="mt-7 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border/60 pt-5 text-[13px]">
          <span className="inline-flex items-center gap-1.5 font-medium text-foreground/85">
            <ShieldCheck className="h-3.5 w-3.5 text-foreground/55" aria-hidden />
            {guidance.label}
          </span>
          {guidance.hint && (
            <>
              <span aria-hidden className="text-muted-foreground/40">
                {"\u00b7"}
              </span>
              <span className="text-muted-foreground">{guidance.hint}</span>
            </>
          )}
        </div>
      </header>

      {/* What Nexa improved — calm AI explanation block.
          Always factual, never quantified, never claims things that weren't done. */}
      <section className="mt-6 rounded-xl border border-border/70 bg-muted/30 px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          What Nexa improved
        </p>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          <li className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground/85">
            <Languages
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/55"
              aria-hidden
            />
            <span>Standardized job titles for international recruiters</span>
          </li>
          <li className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground/85">
            <Eraser className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/55" aria-hidden />
            <span>Removed local fields not used in global hiring</span>
          </li>
          <li className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground/85">
            <FileCheck2
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/55"
              aria-hidden
            />
            <span>Reformatted for ATS and recruiter readability</span>
          </li>
          <li className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground/85">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/55" aria-hidden />
            <span>Skills normalized and deduplicated</span>
          </li>
        </ul>
      </section>

      {profile.summary && (
        <section className="mt-9">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Summary
          </h2>
          <p className="mt-3 max-w-[68ch] text-pretty text-[15px] leading-relaxed text-foreground/90">
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
            <span className="text-[11px] tabular-nums text-muted-foreground/70">
              {grouped.total}
            </span>
          </div>
          <div className="mt-3 space-y-4">
            {grouped.groups.map((g) => (
              <div key={g.label}>
                {grouped.groups.length > 1 && (
                  <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
                    {g.label}
                  </p>
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
                  className="grid gap-3 py-5 sm:grid-cols-[140px_1fr]"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="text-xs leading-relaxed text-muted-foreground tabular-nums">
                      {range || (
                        <span className="text-muted-foreground/60">{"\u2014"}</span>
                      )}
                    </div>
                    {isCurrent && (
                      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                        <span aria-hidden className="h-1 w-1 rounded-full bg-accent" />
                        Current role
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-snug tracking-tight">
                      {e.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{e.company}</p>
                    {e.description && (
                      <p className="mt-2.5 max-w-[68ch] text-pretty text-[14px] leading-relaxed text-foreground/85">
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

      <section className="mt-12 rounded-lg border border-border/70 bg-card/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Formatted for global remote hiring. Local personal fields have been removed and titles
        standardized for international recruiters. Nexa never asks for payment to apply.
      </section>

      <section className="mt-6 flex flex-wrap items-center gap-1">
        <ReuploadCvButton />
        <SignOutButton />
      </section>
    </div>
  )
}
