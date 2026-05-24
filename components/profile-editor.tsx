"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { X, Plus, Save } from "lucide-react"
import type { ProfileRecord, ProfileExperience } from "@/lib/profile/types"

type Props = {
  profile: ProfileRecord
  skills: string[]
  experience: ProfileExperience[]
  onClose?: () => void
}

export function ProfileEditor({ profile, skills: initialSkills, experience: initialExp, onClose }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [headline, setHeadline] = useState(profile.headline ?? "")
  const [summary, setSummary] = useState(profile.summary ?? "")
  const [country, setCountry] = useState(profile.country ?? "")
  const [skills, setSkills] = useState<string[]>(initialSkills ?? [])
  const [skillInput, setSkillInput] = useState("")
  const [experience, setExperience] = useState<ProfileExperience[]>(initialExp ?? [])

  const addSkill = () => {
    const s = skillInput.trim()
    if (!s) return
    if (!skills.includes(s)) setSkills([...skills, s])
    setSkillInput("")
  }
  const removeSkill = (s: string) => setSkills(skills.filter((x) => x !== s))

  const updateExp = (i: number, patch: Partial<ProfileExperience>) =>
    setExperience((arr) => arr.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))

  const addExp = () =>
    setExperience([
      ...experience,
      { title: "", company: "", start_date: null, end_date: null, description: null },
    ])

  const removeExp = (i: number) => setExperience(experience.filter((_, idx) => idx !== i))

  const save = () => {
    setError(null)
    start(async () => {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: headline.trim(),
          summary: summary.trim(),
          country: country.trim() || null,
          skills,
          experience: experience.filter((e) => e.title.trim() || e.company.trim()),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? "Could not save your profile.")
        return
      }
      router.refresh()
      onClose?.()
    })
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Senior Frontend Engineer"
            maxLength={160}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="Nigeria"
            maxLength={60}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="A short, factual summary of your experience."
            rows={5}
            maxLength={1200}
            className="mt-1.5 resize-none leading-relaxed"
          />
          <p className="mt-1 text-xs text-muted-foreground">{summary.length}/1200</p>
        </div>
      </section>

      <section className="space-y-3">
        <Label>Skills</Label>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs"
            >
              {s}
              <button
                type="button"
                onClick={() => removeSkill(s)}
                className="text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${s}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {skills.length === 0 && <p className="text-xs text-muted-foreground">No skills yet.</p>}
        </div>
        <div className="flex gap-2">
          <Input
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addSkill()
              }
            }}
            placeholder="Add a skill"
            maxLength={40}
          />
          <Button type="button" variant="outline" onClick={addSkill}>
            Add
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Experience</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addExp}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add role
          </Button>
        </div>

        <div className="space-y-3">
          {experience.map((e, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={e.title}
                  onChange={(ev) => updateExp(i, { title: ev.target.value })}
                  placeholder="Title"
                  maxLength={160}
                />
                <Input
                  value={e.company}
                  onChange={(ev) => updateExp(i, { company: ev.target.value })}
                  placeholder="Company"
                  maxLength={160}
                />
                <Input
                  value={e.start_date ?? ""}
                  onChange={(ev) => updateExp(i, { start_date: ev.target.value })}
                  placeholder="Start (e.g. 2022-01)"
                  maxLength={32}
                />
                <Input
                  value={e.end_date ?? ""}
                  onChange={(ev) => updateExp(i, { end_date: ev.target.value })}
                  placeholder="End (or 'Present')"
                  maxLength={32}
                />
              </div>
              <Textarea
                value={e.description ?? ""}
                onChange={(ev) => updateExp(i, { description: ev.target.value })}
                placeholder="What you did. Keep it factual."
                rows={3}
                maxLength={1500}
                className="mt-2 resize-none leading-relaxed"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => removeExp(i)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {experience.length === 0 && (
            <p className="text-xs text-muted-foreground">No experience added yet.</p>
          )}
        </div>
      </section>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <Button onClick={save} disabled={pending} className="flex-1 md:flex-none">
          <Save className="mr-2 h-4 w-4" />
          {pending ? "Saving" : "Save changes"}
        </Button>
        {onClose && (
          <Button variant="ghost" onClick={onClose} className="flex-1 md:flex-none">
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
