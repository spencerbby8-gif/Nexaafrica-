"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ProfileEditor } from "@/components/profile-editor"
import { Pencil, MapPin, Mail } from "lucide-react"
import type { ProfileRecord, ProfileExperience } from "@/lib/profile/types"

type Props = {
  profile: ProfileRecord
  skills: string[]
  experience: ProfileExperience[]
  email: string | null
}

export function ProfileView({ profile, skills, experience, email }: Props) {
  const [editing, setEditing] = useState(false)

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            {profile.headline || "Your profile"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {profile.country && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {profile.country}
              </span>
            )}
            {email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" aria-hidden /> {email}
              </span>
            )}
          </div>
        </div>
        <Button onClick={() => setEditing(true)} variant="outline" size="sm">
          <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Edit profile
        </Button>
      </header>

      {profile.summary && (
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Summary
          </h2>
          <p className="mt-3 text-pretty leading-relaxed text-foreground/90">{profile.summary}</p>
        </section>
      )}

      {skills.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Skills
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {skills.map((s) => (
              <li
                key={s}
                className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs text-foreground/90"
              >
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Experience
          </h2>
          <ol className="mt-3 space-y-5">
            {experience.map((e) => (
              <li key={e.id ?? `${e.title}-${e.company}`} className="border-l border-border pl-4">
                <p className="font-medium leading-snug">{e.title}</p>
                <p className="text-sm text-muted-foreground">
                  {e.company}
                  {(e.start_date || e.end_date) && (
                    <span className="ml-2 text-xs">
                      {[e.start_date, e.end_date].filter(Boolean).join(" — ")}
                    </span>
                  )}
                </p>
                {e.description && (
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground/85">
                    {e.description}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-10 flex flex-wrap items-center gap-3 border-t border-border pt-6">
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
