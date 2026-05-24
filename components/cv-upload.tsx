"use client"

import { useCallback, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { UploadCloud, FileText, RefreshCw, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const MAX_BYTES = 8 * 1024 * 1024 // 8MB

type Status = "idle" | "uploading" | "parsing" | "success" | "error"

const PARSING_STEPS = [
  "Reading your CV",
  "Organizing experience",
  "Standardizing skills",
  "Preparing your profile",
] as const

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

  const validate = (f: File): string | null => {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      return "Please upload a PDF file."
    }
    if (f.size > MAX_BYTES) {
      return "File is too large. Maximum size is 8MB."
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
    const interval = setInterval(() => {
      setStepIndex((i) => (i + 1) % PARSING_STEPS.length)
    }, 1400)
    return () => clearInterval(interval)
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
      const stop = startStepRotation()

      const res = await fetch("/api/profile/cv", {
        method: "POST",
        body: fd,
      })

      stop()

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? "We couldn't process this CV. Please try again.")
      }

      setStatus("success")
      router.replace(next && next.startsWith("/") ? next : "/profile")
      router.refresh()
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

  if (status === "parsing") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
        </div>
        <p className="mt-4 text-base font-medium">{PARSING_STEPS[stepIndex]}</p>
        <p className="mt-1 text-sm text-muted-foreground">This usually takes about 15 seconds.</p>
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
        <p className="mt-1 text-xs text-muted-foreground">PDF only. Up to 8MB.</p>
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
