"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { ProfileEditor } from "@/components/profile-editor"
import { SignOutButton } from "@/components/sign-out-button"
import { ReuploadCvButton } from "@/components/reupload-cv-button"
import { joinedLabel, relativeTime } from "@/lib/format"
import {
  Pencil,
  MapPin,
  ShieldCheck,
  Globe2,
  Share2,
  Check,
  Briefcase,
  Sparkles,
  CalendarDays,
  Zap,
  Star,
  TrendingUp,
  Download,
  Link as LinkIcon,
} from "lucide-react"
import type { ProfileRecord, ProfileExperience } from "@/lib/profile/types"
import { calculateAtsScore } from "@/lib/profile/ats"
import { AtsScoreCard } from "@/components/ats-score-card"
import { BeforeAfterComparison } from "@/components/before-after-comparison"
import { RecruiterView } from "@/components/recruiter-view"

type Props = {
  profile: ProfileRecord & { raw_cv_text?: string | null; share_token?: string | null }
  skills: string[]
  experience: ProfileExperience[]
  email: string | null
}

function formatDateRange(start: string | null, end: string | null) {
  const s = (start ?? "").trim()
  const e = (end ?? "").trim()
  if (!s && !e) return ""
  if (s && e) return `${s} — ${e}`
  return s || e
}

function monogram(headline: string | null, email: string | null) {
  const source = (headline || email || "N").trim()
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  const a = parts[0]?.[0] ?? "N"
  const b = parts[1]?.[0] ?? ""
  return (a + b).toUpperCase()
}

function readinessGuidance(args: {
  summary: string | null
  skills: string[]
  experience: ProfileExperience[]
}): { label: string; hint: string | null; level: number } {
  const summary = (args.summary ?? "").trim()
  const skills = args.skills.length
  const exp = args.experience.length

  const hasStrongSummary = summary.length >= 200
  const hasMinSkills = skills >= 6
  const hasMinExperience = exp >= 1

  if (hasStrongSummary && hasMinSkills && hasMinExperience) {
    return {
      label: "Elite • Remote-ready",
      hint: exp >= 3 ? "Top 10% structure for global hiring" : "Add one more role and you're top 5%",
      level: 100,
    }
  }
  if (hasMinSkills && hasMinExperience) {
    return {
      label: "Strong • Global format",
      hint: "You're above 70% of profiles. Longer summary = elite",
      level: 75,
    }
  }
  if (hasMinExperience) {
    return {
      label: "Foundation • Elevating",
      hint: "Add skills to unlock God Tier",
      level: 45,
    }
  }
  return {
    label: "Draft • Awakening",
    hint: "Add experience to ignite transformation",
    level: 20,
  }
}

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
    const looksLikeTool = /^[A-Z]/.test(s) || /[.+ #]/.test(s) || /\d/.test(s) || s.length <= 4
    if (looksLikeTool) tools.push(s)
    else disciplines.push(s)
  }
  if (tools.length < 3 || disciplines.length < 3) {
    return { groups: [{ label: "Superpowers", items: dedup }], total: dedup.length }
  }
  return {
    groups: [
      { label: "Tools & Technologies", items: tools },
      { label: "Craft & Disciplines", items: disciplines },
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
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-yellow-400" /> God Tier Editor
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight md:text-[28px]">Refine your legend</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Make it undeniably you — but elevated.</p>
          </div>
          <button onClick={() => setEditing(false)} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
        <ProfileEditor profile={profile} skills={skills} experience={experience} onClose={() => setEditing(false)} />
      </div>
    )
  }

  const handleShare = async () => {
    const shareUrl = profile.share_token ? `${typeof window !== "undefined" ? window.location.origin : ""}/p/${profile.share_token}` : typeof window !== "undefined" ? window.location.origin : ""
    const text = "My God Tier remote profile is live on Nexa — built for global hiring."
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Nexa — God Tier Profile", text, url: shareUrl })
        return
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2200)
    } catch {}
  }

  const [activeTab, setActiveTab] = useState<"you" | "recruiter">("you")
  const [showBeforeAfter, setShowBeforeAfter] = useState(false)

  const ats = useMemo(() => {
    return calculateAtsScore(
      {
        headline: profile.headline || "",
        summary: profile.summary || "",
        skills,
        experience,
      },
      (profile as any).raw_cv_text || "",
    )
  }, [profile.headline, profile.summary, skills, experience, (profile as any).raw_cv_text])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <style>{`
        .god-glow { background: radial-gradient(1200px 400px at 20% -10%, rgba(250,204,21,0.15), transparent), radial-gradient(800px 300px at 80% 0%, rgba(168,85,247,0.12), transparent); }
        .shine { position: relative; overflow: hidden; }
        .shine::after { content: ''; position: absolute; top: -50%; left: -60%; width: 200%; height: 200%; background: linear-gradient(120deg, transparent, rgba(255,255,255,0.08), transparent); transform: rotate(25deg); animation: shine 4s infinite; }
        @keyframes shine { 0% { transform: translateX(-100%) rotate(25deg); } 60%, 100% { transform: translateX(100%) rotate(25deg); } }
      `}</style>

      {/* GOD TIER HEADER */}
      <div className="god-glow rounded-3xl border border-yellow-500/20 bg-gradient-to-b from-zinc-900 to-black p-[1px]">
        <div className="rounded-[calc(1.5rem-1px)] bg-card px-6 py-8 sm:px-9 sm:py-9 shine">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <span className="flex items-center gap-2 text-yellow-400">
                <Star className="h-3 w-3 fill-yellow-400" /> God Tier V2
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-green-400/40 animate-ping" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-green-400" />
                </span>
                Live & Verified
              </span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Button onClick={handleShare} variant="ghost" size="sm" className="text-muted-foreground">
                {shareCopied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Copied Link
                  </>
                ) : (
                  <>
                    <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
                  </>
                )}
              </Button>
              <Button onClick={() => setEditing(true)} size="sm" className="bg-white text-black hover:bg-zinc-200">
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Elevate
              </Button>
            </div>
          </div>

          <div className="mt-8 flex items-start gap-6">
            <div
              aria-hidden
              className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-600 text-lg font-bold tracking-tight text-black shadow-[0_0_30px_rgba(250,204,21,0.3)] sm:flex"
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-yellow-400/80 flex items-center gap-2">
                <Zap className="h-3 w-3" /> Transformed by Nexa AI
              </p>
              <h1 className="mt-2 text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[34px]">
                {profile.headline || "Your legend starts here"}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
                {profile.country && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {profile.country}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="h-3.5 w-3.5" /> {experience.length} {experience.length === 1 ? "role elevated" : "roles elevated"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5" /> Open to global remote
                </span>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowBeforeAfter(!showBeforeAfter)}
                  className="rounded-full border-yellow-500/20 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                >
                  <Sparkles className="mr-1.5 h-3 w-3" /> {showBeforeAfter ? "Hide" : "See"} Before vs After
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => (window.location.href = "/profile/cv")}
                  className="rounded-full"
                >
                  <Download className="mr-1.5 h-3 w-3" /> One-Click PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  className="rounded-full"
                >
                  <LinkIcon className="mr-1.5 h-3 w-3" /> Share Link
                </Button>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 uppercase tracking-wider text-muted-foreground">
                    <TrendingUp className="h-3 w-3" /> {guidance.label}
                  </span>
                  <span className="text-yellow-400">{guidance.level}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-1000"
                    style={{ width: `${guidance.level}%` }}
                  />
                </div>
                {guidance.hint && <p className="mt-2 text-[12px] text-muted-foreground">{guidance.hint}</p>}
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 sm:hidden">
            <Button onClick={() => setEditing(true)} size="sm" className="flex-1 bg-white text-black">
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Elevate
            </Button>
            <Button onClick={handleShare} variant="outline" size="sm" className="flex-1">
              <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
            </Button>
          </div>
        </div>
      </div>

      {/* VIEW TOGGLE: You vs Recruiter */}
      <div className="mt-6 flex items-center justify-center">
        <div className="flex rounded-full bg-zinc-900 p-1 border border-zinc-800">
          <button
            onClick={() => setActiveTab("you")}
            className={`rounded-full px-5 py-2 text-[12px] font-medium transition ${activeTab === "you" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
          >
            Your View
          </button>
          <button
            onClick={() => setActiveTab("recruiter")}
            className={`rounded-full px-5 py-2 text-[12px] font-medium transition ${activeTab === "recruiter" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
          >
            Recruiter View
          </button>
        </div>
      </div>

      {activeTab === "recruiter" && (
        <div className="mt-6">
          <RecruiterView headline={profile.headline} summary={profile.summary} skills={skills} experienceCount={experience.length} ats={ats} />
        </div>
      )}

      {showBeforeAfter && (
        <div className="mt-6">
          <BeforeAfterComparison rawText={(profile as any).raw_cv_text || null} headline={profile.headline} summary={profile.summary} improvements={ats.improvements} />
        </div>
      )}

      {/* ATS SCORE - Always visible in Your View */}
      {activeTab === "you" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <AtsScoreCard ats={ats} />
          <div className="rounded-2xl border border-yellow-500/10 bg-gradient-to-br from-yellow-500/[0.08] to-purple-500/[0.05] px-6 py-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-yellow-400/80 flex items-center gap-2">
              <Sparkles className="h-3 w-3" /> What God Tier V2 Changed — Explained
            </p>
            <div className="mt-4 space-y-3">
              {ats.improvements.slice(0, 4).map((imp, i) => (
                <div key={i} className="flex gap-2.5">
                  <span className="text-yellow-400 mt-0.5">✦</span>
                  <div>
                    <p className="text-[13px] font-medium text-foreground/90 capitalize">{imp.field} • {imp.type.replace(/_/g, " ")}</p>
                    <p className="text-[12px] leading-relaxed text-zinc-400">{imp.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {profile.summary && (
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-px w-6 bg-border" /> Your Story, Elevated
          </h2>
          <p className="mt-4 max-w-[68ch] text-pretty text-[16px] leading-relaxed text-foreground/90">
            {profile.summary}
          </p>
        </section>
      )}

      {grouped.total > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span className="h-px w-6 bg-border" /> Superpowers • {grouped.total}
            </h2>
          </div>
          <div className="mt-4 space-y-5">
            {grouped.groups.map((g) => (
              <div key={g.label}>
                {grouped.groups.length > 1 && (
                  <p className="mb-2 text-[11px] uppercase tracking-[0.14em] text-yellow-400/70">{g.label}</p>
                )}
                <ul className="flex flex-wrap gap-2">
                  {g.items.map((s) => (
                    <li
                      key={s}
                      className="group relative rounded-full border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 text-[13px] text-foreground/90 transition hover:border-yellow-500/30 hover:bg-zinc-800"
                    >
                      <span className="relative z-10">{s}</span>
                      <span className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-500/0 to-amber-500/0 opacity-0 transition group-hover:from-yellow-500/10 group-hover:to-amber-500/10 group-hover:opacity-100" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {experience.length > 0 && (
        <section className="mt-12">
          <h2 className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <span className="h-px w-6 bg-border" /> Legend • Experience
          </h2>
          <ol className="mt-6 space-y-0">
            {experience.map((e, idx) => {
              const range = formatDateRange(e.start_date, e.end_date)
              const isCurrent = /present/i.test(e.end_date ?? "")
              return (
                <li
                  key={e.id ?? `${e.title}-${e.company}-${idx}`}
                  className="group relative border-l border-zinc-800 pl-6 pb-8 last:pb-0 hover:border-yellow-500/30 transition-colors"
                >
                  <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-zinc-700 group-hover:bg-yellow-400 transition" />
                  {isCurrent && <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-yellow-400 animate-ping" />}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[16px] font-semibold leading-snug tracking-tight flex items-center gap-2">
                        {e.title}
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-green-400 border border-green-500/20">
                            ● Now
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[13px] text-yellow-400/80">{e.company}</p>
                    </div>
                    <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] tabular-nums text-muted-foreground">
                      {range || "—"}
                    </span>
                  </div>
                  {e.description && (
                    <p className="mt-3 max-w-[68ch] text-pretty text-[14px] leading-relaxed text-zinc-300">
                      {e.description}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      <section className="mt-12 rounded-2xl bg-white text-black px-6 py-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Every line is you — elevated.
          </p>
          <p className="mt-1 text-[12px] text-zinc-600">No fabrications. No fluff. Just your truth, made undeniable.</p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Nexa God Tier</span>
      </section>

      <section className="mt-8 flex flex-wrap items-center gap-2">
        <ReuploadCvButton />
        <SignOutButton />
      </section>
    </div>
  )
}
