import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Smallest possible multipart sanity check using a tiny in-memory text Blob.
 *
 * Does NOT touch the request body. Logs and returns immediately, so any failure
 * here is happening BEFORE the route runs (browser, network, edge, or platform
 * body limits) — not in our code.
 */
export async function POST(req: Request): Promise<Response> {
  const reqId = `txt_${Math.random().toString(36).slice(2, 10)}`
  const contentType = req.headers.get("content-type") ?? "(none)"
  const contentLength = req.headers.get("content-length") ?? "(none)"

  console.log("[v0][debug-text-upload]", reqId, "request_received", {
    method: req.method,
    contentType,
    contentLength,
  })

  const body = {
    success: true,
    message: "text multipart reached route",
    reqId,
    contentType,
    contentLength,
    receivedAt: new Date().toISOString(),
  }

  console.log("[v0][debug-text-upload]", reqId, "response_sent", { status: 200 })
  return NextResponse.json(body, { status: 200 })
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    { error: "Use POST with a multipart/form-data body containing a small text Blob." },
    { status: 405 },
  )
}
