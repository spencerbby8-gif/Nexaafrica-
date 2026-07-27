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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CvUploadGuidance } from "@/components/cv-upload-guidance"
import { NexaLoader } from "@/components/nexa-loader"
import { humanizeError, type ErrorContext } from "@/lib/errors"
import { track } from "@/lib/analytics"

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
  const fileWasSmallRef = useRef(false) // true when uploaded file reported size < 1024
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<{ title: string; hint?: string } | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const setHumanError = (input: unknown, ctx: ErrorContext = "cv-upload") => {
    setError(humanizeError(input as Parameters<typeof humanizeError>[0], ctx))
  }

  const validate = async (f: File): Promise<{ title: string; hint?: string } | null> => {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      return { title: "Please upload a PDF file.", hint: "Other file types aren\u2019t supported." }
    }
    if (f.size > MAX_BYTES) {
      return {
        title: "That file is a bit too large.",
        hint: "Please upload a PDF under 4MB.",
      }
    }
    // Google Drive on mobile often provides File objects whose reported size
    // is 0 (content:// URI not yet materialised) or a tiny reference stencil
    // (< 1 KB).  Try to read the actual bytes before deciding the file is
    // invalid — if the browser can access the content we let it through.
    if (f.size < 1024) {
      try {
        const ab = await f.arrayBuffer()
        if (ab.byteLength === 0) {
          return {
            title: "We couldn\u2019t read this PDF correctly.",
            hint: "If you opened the file from cloud storage like Google Drive, download it to your device first, then upload that copy.",
          }
        }
        // Bytes accessible — allow through (server validates content).
      } catch {
        return {
          title: "We couldn\u2019t read this PDF correctly.",
          hint: "If you opened the file from cloud storage like Google Drive, download it to your device first, then upload that copy.",
        }
      }
    }
    return null
  }

  const onSelect = async (f: File | null) => {
    if (!f) return
    fileWasSmallRef.current = f.size < 1024
    const v = await validate(f)
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
    if (f) void onSelect(f)
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
    const sizeKb = Math.round(file.size / 1024)
    track({ name: "cv_upload_start", props: { sizeKb } })
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
        setStatus("error")
        track({ name: "cv_upload_failed", props: { reason: "network" } })
        // If the file was small (likely a Drive content URI), the fetch
        // failure is probably a content-access issue, not a network drop.
        if (fileWasSmallRef.current) {
          setError({
            title: "We couldn\u2019t read this PDF correctly.",
            hint: "If you opened the file from cloud storage like Google Drive, download it to your device first, then upload that copy.",
          })
        } else {
          setHumanError(networkErr, "cv-upload")
        }
        return
      }

      stopStepRotation()

      let body: { error?: string; reqId?: string } = {}
      try {
        body = (await res.json()) as { error?: string; reqId?: string }
      } catch {
        body = {}
      }

      if (!res.ok) {
        setStatus("error")
        // Server status drives the mapping. Server-supplied error message
        // is treated as supporting context, not the user-facing copy.
        track({
          name: "cv_upload_failed",
          props: { reason: res.status === 422 ? "parse_failed" : `http_${res.status}` },
        })
        setHumanError(
          { status: res.status, message: body?.error },
          // 422-class parse failures get the more specific "scanned image" copy.
          res.status === 422 ? "cv-parse" : "cv-upload",
        )
        return
      }

      // Land on a brief success/transformation moment before redirecting.
      // Gives users a sense of completion and reinforces the value created.
      setStatus("success")
      track({ name: "cv_upload_success", props: { sizeKb } })
    } catch (e) {
      setStatus("error")
      track({ name: "cv_upload_failed", props: { reason: "unknown" } })
      setHumanError(e, "cv-upload")
    }
  }

  const reset = () => {
    setFile(null)
    setError(null)
    setStatus("idle")
    fileWasSmallRef.current = false
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
          <NexaLoader size={36} label="Preparing your profile" />
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
      <div className="nexa-surface nexa-rule relative overflow-hidden rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-accent/40 bg-accent/15 ring-1 ring-accent/10 ring-offset-2 ring-offset-card">
            <Check className="h-4 w-4 text-accent" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium leading-tight">
              Your remote-ready profile is complete
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Review and edit anything before sharing.
            </p>
          </div>
        </div>

        {/* Before → After transformation moment.
            Concrete, factual, recruiter-oriented. No metrics, no hype. */}
        <div className="mt-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            What changed
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
                Before
              </p>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-muted-foreground line-through decoration-muted-foreground/40">
                <li>Date of birth, marital status, state of origin</li>
                <li>NIN, address, photograph, religion</li>
                <li>&ldquo;Snr. Soft. Eng.&rdquo;, &ldquo;NYSC Corper&rdquo;</li>
                <li>Buzzword summary &mdash; &ldquo;results-driven&rdquo;</li>
                <li>&ldquo;Referees available on request&rdquo;</li>
              </ul>
            </div>
            <div className="rounded-lg border border-accent/30 bg-accent/[0.06] p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-accent">
                After
              </p>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-foreground/85">
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                  Local fields removed for global hiring
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                  Standardized job titles for international recruiters
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                  Factual summary, no buzzwords
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                  Skills deduplicated and normalized
                </li>
                <li className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                  Reformatted for ATS readability
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={goToProfile} className="sm:flex-1">
            View your profile
          </Button>
        </div>

        <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Recruiter-ready structure
          </span>
          <span aria-hidden className="mx-2 text-muted-foreground/40">
            {"\u00b7"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Globe2 className="h-3 w-3" aria-hidden /> Built for global remote applications
          </span>
        </p>
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
          onChange={(e) => { void onSelect(e.target.files?.[0] ?? null) }}
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
            Choose a different PDF
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium leading-tight">{error.title}</p>
            {error.hint && (
              <p className="mt-1 text-[13px] leading-relaxed text-destructive/85">
                {error.hint}
              </p>
            )}
          </div>
        </div>
      )}

      <CvUploadGuidance />

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
