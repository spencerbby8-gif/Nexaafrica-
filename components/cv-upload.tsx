"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  UploadCloud,
  FileText,
  RefreshCw,
  AlertCircle,
  Check,
  ShieldCheck,
  Globe2,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Match the server limit (4 MB). Vercel serverless caps request bodies near 4.5 MB,
// so anything larger is dropped at the platform layer and shows up as "Failed to fetch".
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB

type Status = "idle" | "uploading" | "parsing" | "success" | "error"

// Each step is shown for ~3.5s, in order. The server call usually completes
// somewhere around step 3, but the UI keeps moving forward steadily so users
// never see a stalled "stuck on step 1" feeling.
const PARSING_STEPS = [
  { label: "Reading your CV", hint: "Extracting text and structure" },
  { label: "Standardizing job titles", hint: "Aligning with global remote conventions" },
  { label: "Organizing experience", hint: "Most recent first, clean descriptions" },
  { label: "Normalizing skills", hint: "Tools, frameworks, and disciplines" },
  { label: "Improving recruiter readability", hint: "Removing local fields and clutter" },
  { label: "Preparing your remote-ready profile", hint: "Almost there" },
] as const

const STEP_INTERVAL_MS = 3500

type Props = {
  next?: string
}

export function CvUpload({ next }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const validate = (f: File): string | null => {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      return "Please upload a PDF file."
    }
    if (f.size > MAX_BYTES) {
      return "File is too large. Maximum size is 4MB."
    }
    if (f.size < 1024) {
      return "This file looks empty. Try another PDF."
    }
    return null
  }

  const onSelect = (f: File | null) => {
    if (!f) return
    const v = validate(f)
    if (v) {
      setError(v)
      setStatus("error")
      return
    }
    setError(null)
    setFile(f)
    setStatus("idle")
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onSelect(f)
  }, [])

  const startStepRotation = () => {
    setStepIndex(0)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, PARSING_STEPS.length - 1))
    }, STEP_INTERVAL_MS)
  }

  const stopStepRotation = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const submit = async () => {
    if (!file) return
    setStatus("uploading")
    setError(null)

    try {
      const fd = new FormData()
      fd.append("file", file)

      // Move into parsing UI as soon as upload starts; the API call covers both.
      setStatus("parsing")
      startStepRotation()

      let res: Response
      try {
        res = await fetch("/api/profile/cv", {
          method: "POST",
          body: fd,
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        })
      } catch (networkErr) {
        stopStepRotation()
        const detail =
          networkErr instanceof Error && networkErr.message
            ? networkErr.message
            : "Lost connection while uploading."
        throw new Error(`${detail} Check your connection and try again.`)
      }

      stopStepRotation()

      let body: { error?: string; reqId?: string } = {}
      try {
        body = (await res.json()) as { error?: string; reqId?: string }
      } catch {
        body = {}
      }

      if (!res.ok) {
        const fallback =
          res.status === 413
            ? "This file is too large. Please upload a smaller PDF (under 4MB)."
            : res.status === 429
              ? "Too many uploads in a short period. Please wait a moment and try again."
              : res.status === 401
                ? "Your session expired. Please sign in again."
                : res.status === 503
                  ? "CV parsing is temporarily unavailable. Please try again shortly."
                  : "We couldn't process this CV. Please try again."
        throw new Error(body?.error ?? fallback)
      }

      // Land on a brief success/transformation moment before redirecting.
      // Gives users a sense of completion and reinforces the value created.
      setStatus("success")
    } catch (e) {
      setStatus("error")
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.")
    }
  }

  const reset = () => {
    setFile(null)
    setError(null)
    setStatus("idle")
    if (inputRef.current) inputRef.current.value = ""
  }

  const goToProfile = () => {
    router.replace(next && next.startsWith("/") ? next : "/profile")
    router.refresh()
  }

  if (status === "parsing") {
    const current = PARSING_STEPS[stepIndex]
    const completed = stepIndex
    return (
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">{current.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{current.hint}</p>
          </div>
        </div>

        <ol className="mt-6 space-y-2">
          {PARSING_STEPS.map((step, i) => {
            const isDone = i < completed
            const isActive = i === completed
            return (
              <li
                key={step.label}
                className={cn(
                  "flex items-center gap-2.5 text-xs leading-relaxed transition-colors",
                  isDone ? "text-foreground/80" : isActive ? "text-foreground" : "text-muted-foreground/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    isDone
                      ? "border-accent/40 bg-accent/15 text-accent"
                      : isActive
                        ? "border-foreground/30 bg-foreground/5"
                        : "border-border",
                  )}
                >
                  {isDone ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : isActive ? (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/60" />
                  ) : null}
                </span>
                <span>{step.label}</span>
              </li>
            )
          })}
        </ol>

        <p className="mt-6 border-t border-border/70 pt-4 text-xs text-muted-foreground">
          Formatted for global remote hiring. This usually takes about 15 seconds.
        </p>
      </div>
    )
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-accent/15">
            <Check className="h-4 w-4 text-accent" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium leading-tight">Your remote-ready profile is complete</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Built for global remote applications. Review and edit anything before sharing.
            </p>
          </div>
        </div>

        <ul className="mt-6 space-y-2.5 text-sm">
          <li className="flex items-start gap-2.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
            <span className="text-foreground/85">Job titles standardized for international recruiters</span>
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
            <span className="text-foreground/85">
              Local fields removed (age, nationality, address, photo)
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Globe2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/60" aria-hidden />
            <span className="text-foreground/85">Skills and experience structured for remote hiring</span>
          </li>
        </ul>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={goToProfile} className="sm:flex-1">
            View your profile
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <label
        htmlFor="cv-input"
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center transition-colors",
          "hover:border-foreground/30",
          dragActive && "border-accent/60 bg-accent/5",
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
          <UploadCloud className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <p className="mt-4 text-sm font-medium">
          {file ? "Selected file" : "Drop your CV here, or tap to choose"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">PDF only. Up to 4MB.</p>
        <input
          ref={inputRef}
          id="cv-input"
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
      </label>

      {file && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)}MB
            </span>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Replace
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={submit} disabled={!file || status === "uploading"} className="sm:flex-1">
          {status === "uploading" ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Uploading
            </>
          ) : (
            "Continue"
          )}
        </Button>
        <Button asChild variant="ghost" className="text-muted-foreground sm:flex-1">
          <a href={next && next.startsWith("/") ? next : "/profile"}>Skip for now</a>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Your CV is stored privately. Only you can view it. Nexa never asks for payment to apply.
      </p>
    </div>
  )
}
