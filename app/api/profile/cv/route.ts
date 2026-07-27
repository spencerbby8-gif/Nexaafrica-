import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/rate-limit"

// Pinned to Node runtime: pdf.js (via unpdf) and the Gemini SDK both need Node APIs.
export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

// Vercel serverless caps request bodies near 4.5 MB. Stay safely under that.
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB
const MIN_TEXT_CHARS = 200

type LogFields = Record<string, unknown>

function makeReqId(): string {
  // Short, log-friendly id. Not security-sensitive.
  return `cv_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

function logStep(reqId: string, step: string, fields: LogFields = {}) {
  // Single-line JSON so Vercel's log search can filter by `scope:"cv_upload"` and `step`.
  try {
    console.log(
      JSON.stringify({ scope: "cv_upload", reqId, step, t: Date.now(), ...fields }),
    )
  } catch {
    console.log(`[cv_upload] ${reqId} ${step}`)
  }
}

function jsonError(reqId: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: message, reqId }, { status })
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

export async function POST(req: Request) {
  const reqId = makeReqId()
  const t0 = Date.now()
  let userId: string | null = null
  // Built lazily so we can still reach this in the failure path even if
  // createClient throws.
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null

  try {
    logStep(reqId, "request_start", {
      contentType: req.headers.get("content-type") ?? null,
      contentLength: req.headers.get("content-length") ?? null,
    })

    // ---- 1. Supabase client ---------------------------------------------
    try {
      supabase = await createClient()
    } catch (e) {
      logStep(reqId, "supabase_client_failed", { err: errMsg(e) })
      return jsonError(reqId, "Server is misconfigured. Please try again shortly.", 500)
    }

    // ---- 2. Auth --------------------------------------------------------
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user) {
      logStep(reqId, "auth_failed", { err: userErr?.message ?? null })
      return jsonError(reqId, "Not signed in.", 401)
    }
    userId = user.id
    logStep(reqId, "auth_ok", { userId })

    // ---- 3. Rate limit --------------------------------------------------
    const limit = rateLimit(`cv:${userId}`, { limit: 5, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) {
      logStep(reqId, "rate_limited", { userId, retryAfter: limit.retryAfterSeconds })
      return jsonError(
        reqId,
        "You have uploaded too many CVs in the last hour. Please try again later.",
        429,
      )
    }

    // ---- 4. Env check ---------------------------------------------------
    if (!process.env.GEMINI_API_KEY) {
      logStep(reqId, "missing_gemini_key", { userId })
      return jsonError(
        reqId,
        "CV parsing is temporarily unavailable. Please try again shortly.",
        503,
      )
    }

    // ---- 5. Parse multipart form ---------------------------------------
    let form: FormData
    try {
      form = await req.formData()
    } catch (e) {
      logStep(reqId, "formdata_failed", { userId, err: errMsg(e) })
      return jsonError(
        reqId,
        "We could not read the uploaded file. Please try again with a different PDF.",
        400,
      )
    }

    const file = form.get("file")
    if (!(file instanceof File)) {
      logStep(reqId, "no_file", { userId })
      return jsonError(reqId, "No file received.", 400)
    }

    const fileName = file.name || "cv.pdf"
    const fileType = file.type || ""
    const fileSize = file.size

    logStep(reqId, "file_received", { userId, fileName, fileType, fileSize })

    if (fileType !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
      return jsonError(reqId, "Only PDF files are supported.", 400)
    }
    if (fileSize === 0) {
      return jsonError(reqId, "This file looks empty.", 400)
    }
    if (fileSize > MAX_BYTES) {
      return jsonError(reqId, "File is over 4 MB. Please upload a smaller PDF.", 413)
    }

    // ---- 6. Mark parsing (best-effort) ---------------------------------
    {
      const { markProfileStatus } = await import("@/lib/profile/queries")
      await markProfileStatus(userId, "parsing", undefined, supabase).catch((e) => {
        logStep(reqId, "mark_parsing_failed_nonfatal", { userId, err: errMsg(e) })
      })
    }

    // ---- 7. Read bytes --------------------------------------------------
    let buffer: Buffer
    try {
      const ab = await file.arrayBuffer()
      buffer = Buffer.from(ab)
    } catch (e) {
      logStep(reqId, "buffer_read_failed", { userId, err: errMsg(e) })
      throw new Error("We could not read this file. Please try again.")
    }

    // ---- 8. Storage upload (best-effort, non-fatal) --------------------
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
        logStep(reqId, "storage_upload_failed_nonfatal", {
          userId,
          err: upload.error.message,
        })
      } else {
        cvPath = storagePath
        logStep(reqId, "storage_ok", { userId, path: storagePath })
      }
    } catch (e) {
      logStep(reqId, "storage_upload_threw_nonfatal", { userId, err: errMsg(e) })
    }

    // ---- 9. PDF extraction ---------------------------------------------
    const tPdf = Date.now()
    let text: string
    try {
      const { extractPdfText } = await import("@/lib/profile/pdf")
      text = await extractPdfText(buffer)
    } catch (e) {
      logStep(reqId, "extraction_failed", {
        userId,
        ms: Date.now() - tPdf,
        err: errMsg(e),
      })
      throw new Error(
        "We could not read this PDF. If it is a scanned document, please export a text-based PDF and try again.",
      )
    }
    logStep(reqId, "extraction_ok", { userId, ms: Date.now() - tPdf, chars: text.length })

    if (text.length < MIN_TEXT_CHARS) {
      logStep(reqId, "extraction_too_short", { userId, chars: text.length })
      throw new Error(
        "We could not read enough text from this PDF. If it is a scanned document, export a text-based PDF and try again.",
      )
    }

    // ---- 10. Gemini parse ----------------------------------------------
    const tGemini = Date.now()
    logStep(reqId, "gemini_start", { userId, chars: text.length })
    let parsed
    let tokensInput: number | undefined
    let tokensOutput: number | undefined
    let geminiModel: string
    let promptVersion: string
    try {
      const { parseCvWithGemini, MODEL, PROMPT_VERSION } = await import(
        "@/lib/profile/gemini"
      )
      geminiModel = MODEL
      promptVersion = PROMPT_VERSION
      const result = await parseCvWithGemini(text)
      parsed = result.parsed
      tokensInput = result.tokensInput
      tokensOutput = result.tokensOutput
    } catch (e) {
      logStep(reqId, "gemini_failed", {
        userId,
        ms: Date.now() - tGemini,
        err: errMsg(e),
      })
      throw new Error(
        "We could not structure your CV right now. Please try again, or set up your profile manually.",
      )
    }
    logStep(reqId, "gemini_success", {
      userId,
      ms: Date.now() - tGemini,
      tokensInput,
      tokensOutput,
      skills: parsed.skills.length,
      experience: parsed.experience.length,
    })
    // ---- 10.5. Cerebras review (best-effort, non-fatal) -----------------
    const tCerebras = Date.now()
    logStep(reqId, "cerebras_review_start", { userId })
    let reviewedBy = geminiModel
    try {
      const { reviewCVWithCerebras } = await import("@/lib/profile/cerebrasReview")
      const reviewed = await reviewCVWithCerebras(parsed, text)
      if (reviewed.applied) {
        parsed = reviewed.parsed
        reviewedBy = geminiModel + "+cerebras-review"
        logStep(reqId, "cerebras_review_success", {
          userId, ms: Date.now() - tCerebras,
          skills: parsed.skills.length, experience: parsed.experience.length,
          changes: reviewed.changes.length,
          sample: reviewed.changes.slice(0, 3).map((c: any) => c.field),
        })
      } else {
        logStep(reqId, "cerebras_review_skipped", {
          userId, ms: Date.now() - tCerebras,
          reason: "Cerebras returned unchanged output or was unavailable",
        })
      }
    } catch (e) {
      logStep(reqId, "cerebras_review_failed_nonfatal", {
        userId, ms: Date.now() - tCerebras, err: errMsg(e),
      })
    }

    // ---- 11. Persist profile -------------------------------------------
    logStep(reqId, "profile_save_start", {
      userId,
      skills: parsed.skills.length,
      experience: parsed.experience.length,
    })
    try {
      const { saveParsedProfile, PersistenceError } = await import("@/lib/profile/queries")
      try {
        await saveParsedProfile(userId, parsed, supabase)
      } catch (e) {
        if (e instanceof PersistenceError) {
          // Log the real Postgrest error with table + code so we can diagnose.
          logStep(reqId, `${e.table}_save_fail`, {
            userId,
            table: e.table,
            code: e.code ?? null,
            details: e.details ?? null,
            hint: e.hint ?? null,
            err: e.message,
          })
          // Surface a precise, user-readable reason while keeping it short.
          const friendly =
            e.code === "23505"
              ? `Duplicate value while saving ${e.table}.`
              : e.code === "23503"
                ? `Reference error while saving ${e.table}.`
                : e.code === "42501" || e.code === "PGRST301"
                  ? `Permission denied while saving ${e.table}. Please sign out and sign back in.`
                  : `Could not save ${e.table.replace("_", " ")}: ${e.message}`
          throw new Error(friendly)
        }
        logStep(reqId, "profile_save_fail", { userId, err: errMsg(e) })
        throw e
      }
    } catch (e) {
      // Re-throw to outer catch which writes status=failed and returns JSON 500.
      throw e
    }
    logStep(reqId, "profile_save_success", { userId })

    // ---- 12. Side metadata (non-fatal) ---------------------------------
    if (cvPath) {
      const r = await supabase
        .from("profiles")
        .update({ cv_storage_path: cvPath })
        .eq("id", userId)
      if (r.error) {
        logStep(reqId, "cv_path_update_failed_nonfatal", { userId, err: r.error.message })
      }
    }

    const aiMeta = await supabase.from("profile_ai_metadata").upsert(
      {
        profile_id: userId,
        model: reviewedBy,
        prompt_version: promptVersion,
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
      logStep(reqId, "metadata_save_fail", {
        userId,
        table: "profile_ai_metadata",
        code: aiMeta.error.code ?? null,
        details: aiMeta.error.details ?? null,
        err: aiMeta.error.message,
      })
    }

    logStep(reqId, "response_sent", { userId, totalMs: Date.now() - t0 })
    return NextResponse.json({ ok: true, reqId })
  } catch (err) {
    const msg = errMsg(err)
    logStep(reqId, "failed", { userId, err: msg, totalMs: Date.now() - t0 })
    if (userId && supabase) {
      try {
        const { markProfileStatus } = await import("@/lib/profile/queries")
        await markProfileStatus(userId, "failed", msg, supabase)
      } catch {
        // swallow — the user can still retry; we already logged the original error
      }
    }
    return jsonError(reqId, msg || "Something went wrong.", 500)
  }
}

// Reject anything that isn't POST with a clean JSON 405 instead of Next's
// default HTML, which can also surface as "Failed to fetch" if a client
// accidentally hits this route with the wrong method.
export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 })
}
