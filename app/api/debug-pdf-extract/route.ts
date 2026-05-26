import { type NextRequest, NextResponse } from "next/server"
import { extractPdfText } from "@/lib/profile/pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_BYTES = 4 * 1024 * 1024 // 4 MB

function jsonError(reqId: string, status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, reqId, error, ...extra }, { status })
}

export async function POST(req: NextRequest) {
  const reqId = `pdf_${Math.random().toString(36).slice(2, 10)}`
  const started = Date.now()

  console.log(`[v0][debug-pdf-extract][${reqId}] request_received`, {
    contentType: req.headers.get("content-type"),
    contentLength: req.headers.get("content-length"),
  })

  try {
    let form: FormData
    try {
      form = await req.formData()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse form data"
      console.error(`[v0][debug-pdf-extract][${reqId}] form_fail`, message)
      return jsonError(reqId, 400, `Failed to parse form data: ${message}`)
    }

    console.log(`[v0][debug-pdf-extract][${reqId}] form_parsed`)

    const file = form.get("file")
    if (!(file instanceof Blob)) {
      console.warn(`[v0][debug-pdf-extract][${reqId}] validation_fail: missing file`)
      return jsonError(reqId, 400, 'Missing "file" field in form data.')
    }

    const fileName = (file as File).name ?? "upload"
    const fileType = file.type || "application/octet-stream"
    const fileSize = file.size

    console.log(`[v0][debug-pdf-extract][${reqId}] file_received`, {
      name: fileName,
      type: fileType,
      size: fileSize,
    })

    if (fileSize === 0) {
      return jsonError(reqId, 400, "Uploaded file is empty.")
    }
    if (fileSize > MAX_BYTES) {
      return jsonError(reqId, 413, `File too large. Max ${MAX_BYTES / (1024 * 1024)}MB.`)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const isPdfMagic =
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d

    console.log(`[v0][debug-pdf-extract][${reqId}] extraction_start`, {
      bufferBytes: buffer.length,
      isPdfMagic,
    })

    let text: string
    try {
      text = await extractPdfText(buffer)
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF extraction failed"
      const stack = err instanceof Error ? err.stack : undefined
      console.error(`[v0][debug-pdf-extract][${reqId}] extraction_fail`, { message, stack })
      return jsonError(reqId, 422, `Extraction failed: ${message}`, {
        stage: "extraction",
        bufferBytes: buffer.length,
        isPdfMagic,
      })
    }

    const elapsedMs = Date.now() - started
    const preview = text.slice(0, 300)

    console.log(`[v0][debug-pdf-extract][${reqId}] extraction_success`, {
      textLength: text.length,
      elapsedMs,
    })

    const response = NextResponse.json({
      success: true,
      reqId,
      file: { name: fileName, type: fileType, size: fileSize, isPdfMagic },
      textLength: text.length,
      preview,
      elapsedMs,
    })

    console.log(`[v0][debug-pdf-extract][${reqId}] response_sent`, { elapsedMs })
    return response
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error"
    const stack = err instanceof Error ? err.stack : undefined
    console.error(`[v0][debug-pdf-extract][${reqId}] unexpected_fail`, { message, stack })
    return jsonError(reqId, 500, message)
  }
}
