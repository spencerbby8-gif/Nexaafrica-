"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ProfileEditor } from "@/components/profile-editor"
import {
  Pencil,
  MapPin,
  Mail,
  ShieldCheck,
  Globe2,
  Share2,
  Check,
} from "lucide-react"
import type { ProfileRecord, ProfileExperience } from "@/lib/profile/types"

type Props = {
  profile: ProfileRecord
  skills: string[]
  experience: ProfileExperience[]
  email: string | null
}

function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return ""
  if (start && end) return `${start} — ${end}`
  return start ?? end ?? ""
}

export function ProfileView({ profile, skills, experience, email }: Props) {
  const [editing, setEditing] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  if (editing) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Edit profile</h1>
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
    const text = "My remote-ready profile is complete on Nexa — built for global remote applications."
    const url = typeof window !== "undefined" ? window.location.origin : ""

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Nexa — remote-ready profile", text, url })
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
      {/* Trust strip — calm, single line */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Globe2 className="h-3 w-3" aria-hidden /> Remote-ready
        </span>
        <span aria-hidden className="text-muted-foreground/40">·</span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Recruiter-ready structure
        </span>
      </div>

      <header className="flex flex-col gap-4 border-b border-border/70 pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight md:text-[28px]">
            {profile.headline || "Your profile"}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {profile.country && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {profile.country}
              </span>
            )}
            {email && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{email}</span>
              </span>
            )}
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
      </header>

      {profile.summary && (
        <section className="mt-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Summary
          </h2>
          <p className="mt-3 text-pretty text-[15px] leading-relaxed text-foreground/90">
            {profile.summary}
          </p>
        </section>
      )}

      {skills.length > 0 && (
        <section className="mt-9">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Skills
          </h2>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <li
                key={s}
                className="rounded-md border border-border/70 bg-muted/60 px-2.5 py-1 text-xs text-foreground/85"
              >
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Experience
          </h2>
          <ol className="mt-4 space-y-7">
            {experience.map((e) => {
              const range = formatDateRange(e.start_date, e.end_date)
              return (
                <li
                  key={e.id ?? `${e.title}-${e.company}`}
                  className="relative border-l border-border/70 pl-5"
                >
                  <span
                    aria-hidden
                    className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-foreground/30"
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="text-[15px] font-medium leading-snug">{e.title}</p>
                    {range && (
                      <p className="text-xs text-muted-foreground">{range}</p>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{e.company}</p>
                  {e.description && (
                    <p className="mt-2.5 text-pretty text-[14px] leading-relaxed text-foreground/85">
                      {e.description}
                    </p>
                  )}
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
          <Link href="/onboarding">Re-upload CV</Link>
        </Button>
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
            Sign out
          </Button>
        </form>
      </section>
    </div>
  )
}
