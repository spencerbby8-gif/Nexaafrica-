import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { extractPdfText } from "@/lib/profile/pdf"
import { parseCvWithGemini, MODEL, PROMPT_VERSION } from "@/lib/profile/gemini"
import { saveParsedProfile, markProfileStatus } from "@/lib/profile/queries"
import { rateLimit } from "@/lib/rate-limit"

// Pinned to Node runtime: pdf.js (via unpdf) and the Gemini SDK both need Node APIs.
export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Vercel serverless caps request bodies near 4.5 MB. Stay safely under that.
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB
const MIN_TEXT_CHARS = 200

type LogFields = Record<string, unknown>

function logStep(step: string, fields: LogFields = {}) {
  // Single-line JSON so Vercel's log search can filter by `scope:"cv_upload"` and `step`.
  try {
    console.log(JSON.stringify({ scope: "cv_upload", step, t: Date.now(), ...fields }))
  } catch {
    console.log(`[cv_upload] ${step}`)
  }
}

function jsonError(message: string, status: number, extra: LogFields = {}) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export async function POST(req: Request) {
  const t0 = Date.now()
  let userId: string | null = null

  try {
    logStep("request_received", {
      contentType: req.headers.get("content-type") ?? null,
      contentLength: req.headers.get("content-length") ?? null,
    })

    // ---- 1. Auth ---------------------------------------------------------
    let supabase
    try {
      supabase = await createClient()
    } catch (e) {
      logStep("supabase_client_failed", { err: errMsg(e) })
      return jsonError("Server is misconfigured. Please try again shortly.", 500)
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      logStep("unauthenticated", { err: userErr?.message ?? null })
      return jsonError("Not signed in.", 401)
    }
    userId = user.id
    logStep("auth_ok", { userId })

    // ---- 2. Rate limit ---------------------------------------------------
    const limit = rateLimit(`cv:${userId}`, { limit: 5, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) {
      logStep("rate_limited", { userId, retryAfter: limit.retryAfterSeconds })
      return jsonError(
        "You have uploaded too many CVs in the last hour. Please try again later.",
        429,
      )
    }

    // ---- 3. Env check ----------------------------------------------------
    if (!process.env.GEMINI_API_KEY) {
      logStep("missing_gemini_key", { userId })
      return jsonError(
        "CV parsing is temporarily unavailable. Please try again shortly.",
        503,
      )
    }

    // ---- 4. Parse multipart form ----------------------------------------
    let form: FormData
    try {
      form = await req.formData()
    } catch (e) {
      logStep("formdata_failed", { userId, err: errMsg(e) })
      return jsonError(
        "We could not read the uploaded file. Please try again with a different PDF.",
        400,
      )
    }

    const file = form.get("file")
    if (!(file instanceof File)) {
      logStep("no_file", { userId })
      return jsonError("No file received.", 400)
    }

    const fileName = file.name || "cv.pdf"
    const fileType = file.type || ""
    const fileSize = file.size

    logStep("file_metadata", { userId, fileName, fileType, fileSize })

    if (fileType !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
      return jsonError("Only PDF files are supported.", 400)
    }
    if (fileSize === 0) {
      return jsonError("This file looks empty.", 400)
    }
    if (fileSize > MAX_BYTES) {
      return jsonError("File is over 4 MB. Please upload a smaller PDF.", 413)
    }

    // ---- 5. Mark profile as parsing (best-effort) -----------------------
    await markProfileStatus(userId, "parsing").catch((e) => {
      logStep("mark_parsing_failed_nonfatal", { userId, err: errMsg(e) })
    })

    // ---- 6. Read bytes --------------------------------------------------
    let buffer: Buffer
    try {
      const ab = await file.arrayBuffer()
      buffer = Buffer.from(ab)
    } catch (e) {
      logStep("buffer_read_failed", { userId, err: errMsg(e) })
      throw new Error("We could not read this file. Please try again.")
    }

    // ---- 7. Storage upload (best-effort, non-fatal) ---------------------
    const storagePath = `${userId}/${Date.now()}-${safeName(fileName)}`
    let cvPath: string | null = null
    try {
      const upload = await supabase.storage
        .from("cvs")
        .upload(storagePath, buffer, {
          contentType: "application/pdf",
          upsert: false,
        })
      if (upload.error) {
        logStep("storage_upload_failed_nonfatal", {
          userId,
          err: upload.error.message,
        })
      } else {
        cvPath = storagePath
        logStep("storage_upload_ok", { userId, path: storagePath })
      }
    } catch (e) {
      logStep("storage_upload_threw_nonfatal", { userId, err: errMsg(e) })
    }

    // ---- 8. PDF extraction ----------------------------------------------
    const tPdfStart = Date.now()
    let text: string
    try {
      text = await extractPdfText(buffer)
    } catch (e) {
      logStep("pdf_extract_failed", { userId, err: errMsg(e) })
      throw new Error(
        "We could not read this PDF. If it is a scanned document, please export a text-based PDF and try again.",
      )
    }
    logStep("pdf_extracted", {
      userId,
      ms: Date.now() - tPdfStart,
      chars: text.length,
    })

    if (text.length < MIN_TEXT_CHARS) {
      logStep("pdf_too_short", { userId, chars: text.length })
      throw new Error(
        "We could not read enough text from this PDF. If it is a scanned document, export a text-based PDF and try again.",
      )
    }

    // ---- 9. Gemini parse -------------------------------------------------
    const tGeminiStart = Date.now()
    logStep("gemini_request_start", { userId, model: MODEL, chars: text.length })
    let parsed
    let tokensInput: number | undefined
    let tokensOutput: number | undefined
    try {
      const result = await parseCvWithGemini(text)
      parsed = result.parsed
      tokensInput = result.tokensInput
      tokensOutput = result.tokensOutput
    } catch (e) {
      logStep("gemini_failed", { userId, err: errMsg(e), ms: Date.now() - tGeminiStart })
      throw new Error(
        "We could not structure your CV right now. Please try again, or set up your profile manually.",
      )
    }
    logStep("gemini_ok", {
      userId,
      ms: Date.now() - tGeminiStart,
      tokensInput,
      tokensOutput,
      skills: parsed.skills.length,
      experience: parsed.experience.length,
    })

    // ---- 10. Persist profile --------------------------------------------
    try {
      await saveParsedProfile(userId, parsed)
    } catch (e) {
      logStep("save_failed", { userId, err: errMsg(e) })
      throw new Error("We could not save your profile. Please try again.")
    }
    logStep("profile_saved", { userId })

    if (cvPath) {
      const r = await supabase
        .from("profiles")
        .update({ cv_storage_path: cvPath })
        .eq("id", userId)
      if (r.error) {
        logStep("cv_path_update_failed_nonfatal", { userId, err: r.error.message })
      }
    }

    const aiMeta = await supabase.from("profile_ai_metadata").upsert(
      {
        profile_id: userId,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        raw_text_chars: text.length,
        tokens_input: tokensInput ?? null,
        tokens_output: tokensOutput ?? null,
        parse_attempts: 1,
        last_error: null,
        last_run_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    )
    if (aiMeta.error) {
      logStep("ai_meta_upsert_failed_nonfatal", { userId, err: aiMeta.error.message })
    }

    logStep("completed", { userId, totalMs: Date.now() - t0 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = errMsg(err)
    logStep("failed", { userId, err: msg, totalMs: Date.now() - t0 })
    if (userId) {
      await markProfileStatus(userId, "failed", msg).catch(() => {})
    }
    return jsonError(msg || "Something went wrong.", 500)
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === "string") return e
  try {
    return JSON.stringify(e)
  } catch {
    return "Unknown error"
  }
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)
}
