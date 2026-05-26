"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"

type DebugResult =
  | { kind: "idle" }
  | { kind: "loading"; label: string }
  | { kind: "success"; label: string; status: number; body: unknown; ms: number }
  | { kind: "error"; label: string; message: string; ms: number }

export function DebugConnectivity() {
  const [result, setResult] = useState<DebugResult>({ kind: "idle" })
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function runConnectivity(method: "GET" | "POST") {
    const label = `connectivity ${method}`
    setResult({ kind: "loading", label })
    const started = performance.now()
    try {
      const res = await fetch("/api/debug", {
        method,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        body = { error: "Response was not valid JSON" }
      }
      const ms = Math.round(performance.now() - started)
      setResult({ kind: "success", label, status: res.status, body, ms })
    } catch (err) {
      const ms = Math.round(performance.now() - started)
      const message = err instanceof Error ? err.message : "Unknown fetch error"
      setResult({ kind: "error", label, message, ms })
    }
  }

  async function runUpload() {
    const label = "upload POST"
    const file = fileRef.current?.files?.[0]
    if (!file) {
      setResult({ kind: "error", label, message: "Choose a PDF file first.", ms: 0 })
      return
    }

    setResult({ kind: "loading", label })
    const started = performance.now()
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/debug-upload", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        body: fd,
      })
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        body = { error: "Response was not valid JSON" }
      }
      const ms = Math.round(performance.now() - started)
      setResult({ kind: "success", label, status: res.status, body, ms })
    } catch (err) {
      const ms = Math.round(performance.now() - started)
      const message = err instanceof Error ? err.message : "Unknown fetch error"
      setResult({ kind: "error", label, message, ms })
    }
  }

  return (
    <section className="mt-10 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold tracking-tight">Diagnostics</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Temporary tests. <code className="font-mono">/api/debug</code> verifies connectivity.{" "}
        <code className="font-mono">/api/debug-upload</code> verifies multipart file upload (no Gemini,
        no PDF extraction, no Supabase writes).
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => runConnectivity("GET")}
          disabled={result.kind === "loading"}
        >
          {result.kind === "loading" && result.label === "connectivity GET"
            ? "Testing GET…"
            : "Test Backend Connection (GET)"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => runConnectivity("POST")}
          disabled={result.kind === "loading"}
        >
          {result.kind === "loading" && result.label === "connectivity POST"
            ? "Testing POST…"
            : "Test Backend Connection (POST)"}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-muted"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={runUpload}
          disabled={result.kind === "loading"}
        >
          {result.kind === "loading" && result.label === "upload POST"
            ? "Uploading…"
            : "Test File Upload"}
        </Button>
      </div>

      {result.kind === "success" && (
        <div className="mt-3 space-y-2 text-xs">
          <p className="text-muted-foreground">
            {result.label} → HTTP {result.status} in {result.ms}ms
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}

      {result.kind === "error" && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="font-medium text-destructive">
            {result.label} failed in {result.ms}ms
          </p>
          <p className="mt-1 font-mono text-[11px] text-destructive/90">{result.message}</p>
        </div>
      )}
    </section>
  )
}
