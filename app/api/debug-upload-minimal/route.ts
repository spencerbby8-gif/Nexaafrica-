import { NextResponse, type NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function rid() {
  return `dbgmin_${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(req: NextRequest) {
  const reqId = rid()
  const started = Date.now()
  console.log(
    `[v0][debug-upload-minimal][${reqId}][request_received]`,
    JSON.stringify({
      method: req.method,
      contentType: req.headers.get("content-type"),
      contentLength: req.headers.get("content-length"),
      url: req.url,
    }),
  )

  // CRITICAL: do NOT touch req.body / req.formData() / req.text() / req.arrayBuffer().
  // We want to confirm the request reached the handler before any body parsing.
  const payload = {
    success: true,
    message: "multipart request reached route",
    reqId,
    elapsedMs: Date.now() - started,
    contentType: req.headers.get("content-type"),
    contentLength: req.headers.get("content-length"),
  }

  console.log(`[v0][debug-upload-minimal][${reqId}][response_sent]`, JSON.stringify(payload))
  return NextResponse.json(payload, { status: 200 })
}

export async function GET() {
  return NextResponse.json({ success: true, message: "GET ok (use POST for upload test)" })
}
