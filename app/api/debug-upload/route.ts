import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB — must match the real /api/profile/cv route.

function reqId() {
  return `dbg_${Math.random().toString(36).slice(2, 10)}`
}

function jsonError(id: string, stage: string, status: number, message: string, extra?: Record<string, unknown>) {
  console.log(`[v0][debug-upload][${id}][${stage}] fail`, { message, ...extra })
  return NextResponse.json({ success: false, stage, error: message, reqId: id }, { status })
}

export async function POST(req: Request) {
  const id = reqId()
  const t0 = Date.now()
  console.log(`[v0][debug-upload][${id}][request_start]`, {
    contentType: req.headers.get("content-type"),
    contentLength: req.headers.get("content-length"),
  })

  try {
    const ct = req.headers.get("content-type") ?? ""
    if (!ct.toLowerCase().startsWith("multipart/form-data")) {
      return jsonError(id, "validation_fail", 415, "Expected multipart/form-data.", { contentType: ct })
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not parse form data."
      return jsonError(id, "form_fail", 400, message)
    }
    console.log(`[v0][debug-upload][${id}][form_parsed]`, {
      keys: Array.from(form.keys()),
    })

    const file = form.get("file")
    if (!(file instanceof File)) {
      return jsonError(id, "validation_fail", 400, "No file was uploaded under the 'file' field.")
    }

    const meta = {
      filename: file.name || "(unnamed)",
      size: file.size,
      type: file.type || "(unknown)",
    }
    console.log(`[v0][debug-upload][${id}][file_received]`, meta)

    if (file.size === 0) {
      return jsonError(id, "validation_fail", 400, "Uploaded file is empty.", meta)
    }
    if (file.size > MAX_BYTES) {
      return jsonError(id, "validation_fail", 413, "File is too large. Maximum size is 4MB.", meta)
    }
    if (file.type && file.type !== "application/pdf") {
      return jsonError(id, "validation_fail", 415, "Only PDF files are supported in production.", meta)
    }

    // Read enough bytes to detect the PDF magic header without holding huge buffers.
    const buf = Buffer.from(await file.arrayBuffer())
    const header = buf.subarray(0, 5).toString("utf8")
    const isPdf = header.startsWith("%PDF-")

    const elapsedMs = Date.now() - t0
    console.log(`[v0][debug-upload][${id}][response_sent]`, { ...meta, isPdf, elapsedMs })

    return NextResponse.json(
      {
        success: true,
        reqId: id,
        filename: meta.filename,
        size: meta.size,
        type: meta.type,
        bytesRead: buf.byteLength,
        isPdfMagicHeader: isPdf,
        elapsedMs,
      },
      { status: 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error."
    return jsonError(id, "unexpected_fail", 500, message)
  }
}

export async function GET() {
  return NextResponse.json(
    { success: false, error: "Use POST with multipart/form-data." },
    { status: 405 },
  )
}
