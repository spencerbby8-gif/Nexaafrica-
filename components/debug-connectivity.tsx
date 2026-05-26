"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

type DebugResult =
  | { kind: "idle" }
  | { kind: "loading"; method: "GET" | "POST" }
  | { kind: "success"; method: "GET" | "POST"; status: number; body: unknown; ms: number }
  | { kind: "error"; method: "GET" | "POST"; message: string; ms: number }

export function DebugConnectivity() {
  const [result, setResult] = useState<DebugResult>({ kind: "idle" })

  async function run(method: "GET" | "POST") {
    setResult({ kind: "loading", method })
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
      setResult({ kind: "success", method, status: res.status, body, ms })
    } catch (err) {
      const ms = Math.round(performance.now() - started)
      const message = err instanceof Error ? err.message : "Unknown fetch error"
      setResult({ kind: "error", method, message, ms })
    }
  }

  return (
    <section className="mt-10 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold tracking-tight">Diagnostics</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Temporary connectivity test. Calls <code className="font-mono">/api/debug</code> with no
        auth, no upload, no Gemini, no Supabase writes.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => run("GET")}
          disabled={result.kind === "loading"}
        >
          {result.kind === "loading" && result.method === "GET"
            ? "Testing GET…"
            : "Test Backend Connection (GET)"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => run("POST")}
          disabled={result.kind === "loading"}
        >
          {result.kind === "loading" && result.method === "POST"
            ? "Testing POST…"
            : "Test Backend Connection (POST)"}
        </Button>
      </div>

      {result.kind === "success" && (
        <div className="mt-3 space-y-2 text-xs">
          <p className="text-muted-foreground">
            {result.method} → HTTP {result.status} in {result.ms}ms
          </p>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </div>
      )}

      {result.kind === "error" && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="font-medium text-destructive">
            {result.method} failed in {result.ms}ms
          </p>
          <p className="mt-1 font-mono text-[11px] text-destructive/90">{result.message}</p>
        </div>
      )}
    </section>
  )
}
