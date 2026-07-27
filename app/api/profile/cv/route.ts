import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

const MAX_BYTES = 4 * 1024 * 1024
const MIN_TEXT_CHARS = 200

type LogFields = Record<string, unknown>

function makeReqId(): string {
  return `cv_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
}

function logStep(reqId: string, step: string, fields: LogFields = {}) {
  try {
    console.log(JSON.stringify({ scope: "cv_upload", reqId, step, t: Date.now(), ...fields }))
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
  try { return JSON.stringify(e) } catch { return "Unknown error" }
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)
}

export async function POST(req: Request) {
  const reqId = makeReqId()
  const t0 = Date.now()
  let userId: string | null = null
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null

  try {
    logStep(reqId, "request_start", {
      contentType: req.headers.get("content-type") ?? null,
      contentLength: req.headers.get("content-length") ?? null,
    })

    // ---- 1. Supabase client ---------------------------------------------
    try { supabase = await createClient() } catch (e) {
      logStep(reqId, "supabase_client_failed", { err: errMsg(e) })
      return jsonError(reqId, "Server is misconfigured. Please try again shortly.", 500)
    }

    // ---- 2. Auth --------------------------------------------------------
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      logStep(reqId, "auth_failed", { err: userErr?.message ?? null })
      return jsonError(reqId, "Not signed in.", 401)
    }
    userId = user.id
    logStep(reqId, "auth_ok", { userId })

    // ---- 3. Rate limit --------------------------------------------------
    const limit = rateLimit(`cv:${userId}`, { limit: 5, windowMs: 60 * 60 * 1000 })
    if (!limit.ok) {
      return jsonError(reqId, "You have uploaded too many CVs in the last hour. Please try again later.", 429)
    }

    // ---- 4. Env check ---------------------------------------------------
    if (!process.env.GEMINI_API_KEY) {
      return jsonError(reqId, "CV parsing is temporarily unavailable. Please try again shortly.", 503)
    }

    // ---- 5. Parse multipart form ---------------------------------------
    let form: FormData
    try { form = await req.formData() } catch (e) {
      return jsonError(reqId, "We could not read the uploaded file. Please try again with a different PDF.", 400)
    }

    const file = form.get("file")
    if (!(file instanceof File)) return jsonError(reqId, "No file received.", 400)

    const fileName = file.name || "cv.pdf"
    const fileType = file.type || ""
    const fileSize = file.size
    logStep(reqId, "file_received", { userId, fileName, fileType, fileSize })

    if (fileType !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) {
      return jsonError(reqId, "Only PDF files are supported.", 400)
    }
    if (fileSize === 0) return jsonError(reqId, "This file looks empty.", 400)
    if (fileSize > MAX_BYTES) return jsonError(reqId, "File is over 4 MB. Please upload a smaller PDF.", 413)

    // ---- 6. Mark parsing (best-effort) ---------------------------------
    const { markProfileStatus } = await import("@/lib/profile/queries")
    await markProfileStatus(userId, "parsing", undefined, supabase).catch(() => {})

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
      const upload = await supabase.storage.from("cvs").upload(storagePath, buffer, {
        contentType: "application/pdf", upsert: false,
      })
      if (!upload.error) { cvPath = storagePath; logStep(reqId, "storage_ok", { path: storagePath }) }
    } catch {}

    // ---- 9. PDF extraction ---------------------------------------------
    const tPdf = Date.now()
    let rawCvText: string
    try {
      const { extractPdfText } = await import("@/lib/profile/pdf")
      rawCvText = await extractPdfText(buffer)
    } catch (e) {
      throw new Error("We could not read this PDF. If it is a scanned document, please export a text-based PDF and try again.")
    }
    logStep(reqId, "extraction_ok", { ms: Date.now() - tPdf, chars: rawCvText.length })

    if (rawCvText.length < MIN_TEXT_CHARS) {
      throw new Error("We could not read enough text from this PDF. If it is a scanned document, export a text-based PDF and try again.")
    }

    // ---- 10. STAGE 1: Gemini parse (primary extraction) ----------------
    const tGemini = Date.now()
    const { parseCvWithGemini, MODEL, PROMPT_VERSION } = await import("@/lib/profile/gemini")
    let geminiResult
    try {
      geminiResult = await parseCvWithGemini(rawCvText)
    } catch (e) {
      logStep(reqId, "gemini_failed", { ms: Date.now() - tGemini, err: errMsg(e) })
      throw new Error("We could not structure your CV right now. Please try again, or set up your profile manually.")
    }
    logStep(reqId, "gemini_success", {
      ms: Date.now() - tGemini,
      tokensIn: geminiResult.tokensInput, tokensOut: geminiResult.tokensOutput,
      skills: geminiResult.parsed.skills.length, experience: geminiResult.parsed.experience.length,
    })

    // ---- 11. STAGE 2: Validation layer (normalize, verify) -------------
    const tValidate = Date.now()
    const { validateGeminiOutput } = await import("@/lib/profile/validate")
    const { profile: validatedProfile, report: validationReport } = validateGeminiOutput(
      geminiResult.parsed, rawCvText,
    )
    logStep(reqId, "validation_done", {
      ms: Date.now() - tValidate,
      passed: validationReport.passed,
      confidence: validationReport.confidence.overall,
      issues: validationReport.issues.filter((i) => i.severity === "error").length,
      skillsNormalized: validationReport.stats.skillsNormalized,
      skillsRemoved: validationReport.stats.skillsRemoved,
      datesNormalized: validationReport.stats.datesNormalized,
    })

    // ---- 12. STAGE 3: Cerebras review (ATS optimization) ---------------
    const tCerebras = Date.now()
    let reviewerModel: string | null = null
    let reviewerApplied = false
    let reviewerChanges: Array<{ field: string; before: string; after: string }> = []
    let enhancedProfile = validatedProfile

    try {
      const { reviewCVWithCerebras } = await import("@/lib/profile/cerebrasReview")
      const reviewed = await reviewCVWithCerebras(validatedProfile, rawCvText)
      if (reviewed.applied) {
        enhancedProfile = reviewed.parsed
        reviewerModel = "gpt-oss-120b"
        reviewerApplied = true
        reviewerChanges = reviewed.changes
        logStep(reqId, "cerebras_review_success", {
          ms: Date.now() - tCerebras,
          changes: reviewed.changes.length,
          fields: reviewed.changes.map((c) => c.field),
        })
      } else {
        logStep(reqId, "cerebras_review_skipped", {
          ms: Date.now() - tCerebras,
          reason: "Cerebras returned unchanged output or was unavailable",
        })
      }
    } catch (e) {
      logStep(reqId, "cerebras_review_failed_nonfatal", {
        ms: Date.now() - tCerebras, err: errMsg(e),
      })
    }

    // ---- 13. STAGE 4: Consistency validator (facts check) --------------
    const tConsistency = Date.now()
    const { consistencyCheck } = await import("@/lib/profile/consistencyCheck")
    const { profile: finalProfile, report: consistencyReport } = consistencyCheck(
      enhancedProfile, geminiResult.parsed, rawCvText, validationReport,
    )
    logStep(reqId, "consistency_done", {
      ms: Date.now() - tConsistency,
      passed: consistencyReport.passed,
      score: consistencyReport.score,
      factoriesAccept: consistencyReport.factoriesAccept,
      headlineMatch: consistencyReport.details.headlineMatch,
      summaryOverlap: consistencyReport.details.summaryOverlap,
      skillGroundedness: consistencyReport.details.skillGroundedness,
      experienceGroundedness: consistencyReport.details.experienceGroundedness,
      dateIntegrity: consistencyReport.details.dateIntegrity,
      companyVerification: consistencyReport.details.companyVerification,
    })
    if (consistencyReport.issues.length > 0) {
      logStep(reqId, "consistency_issues", {
        count: consistencyReport.issues.length,
        sample: consistencyReport.issues.slice(0, 5).map((i) => ({
          field: i.field, type: i.type, severity: i.severity,
        })),
      })
    }

    // ---- 14. Build complete metadata -----------------------------------
    const tokensInput = geminiResult.tokensInput || 0
    const tokensOutput = geminiResult.tokensOutput || 0

    const qualityScore = Math.round(
      (validationReport.confidence.overall * 0.4) +
      (consistencyReport.score * 0.4) +
      (reviewerApplied ? 20 : 0)
    )

    const atsScore = validationReport.confidence.overall // Base ATS on validation strength

    const pipelineMetadata = {
      parserModel: MODEL,
      reviewerModel,
      reviewerApplied,
      validationPassed: validationReport.passed,
      validationConfidence: validationReport.confidence.overall,
      consistencyPassed: consistencyReport.passed,
      consistencyScore: consistencyReport.score,
      atsScore,
      qualityScore,
      reviewerChanges,
      consistencyIssues: consistencyReport.issues.map((i) => ({
        field: i.field, type: i.type, message: i.message,
      })),
      tokenUsage: { input: tokensInput, output: tokensOutput },
      timings: {
        pdfExtractionMs: Date.now() - tPdf - (Date.now() - tGemini) - (Date.now() - tValidate) - (Date.now() - tCerebras) - (Date.now() - tConsistency),
        geminiMs: Date.now() - tGemini,
        validationMs: Date.now() - tValidate,
        cerebrasMs: Date.now() - tCerebras,
        consistencyMs: Date.now() - tConsistency,
        totalMs: Date.now() - t0,
      },
    }

    // ---- 15. Persist profile with full metadata ------------------------
    const modelChain = [MODEL, reviewerModel ? `+${reviewerModel}` : null]
      .filter(Boolean).join("")
    const { saveParsedProfile, PersistenceError } = await import("@/lib/profile/queries")
    try {
      await saveParsedProfile(userId, finalProfile, supabase, rawCvText, {
        model: modelChain,
        promptVersion: PROMPT_VERSION,
      }, pipelineMetadata)
    } catch (e) {
      if (e instanceof PersistenceError) {
        logStep(reqId, `${e.table}_save_fail`, {
          table: e.table, code: e.code ?? null, err: e.message,
        })
        const friendly = e.code === "23505" ? `Duplicate value while saving ${e.table}.`
          : e.code === "23503" ? `Reference error while saving ${e.table}.`
          : `Could not save ${e.table.replace("_", " ")}: ${e.message}`
        throw new Error(friendly)
      }
      throw e
    }
    logStep(reqId, "profile_save_success", { userId })

    // ---- 16. Side metadata (non-fatal) ---------------------------------
    if (cvPath) {
      supabase.from("profiles").update({ cv_storage_path: cvPath }).eq("id", userId).then(() => {}, () => {})
    }

    // Use service client for internal metadata table
    let metaClient = supabase
    try {
      const { createServiceClient } = await import("@/lib/supabase/service")
      metaClient = createServiceClient()
    } catch {}

    const now = new Date().toISOString()
    const aiMeta = await metaClient.from("profile_ai_metadata").upsert({
      profile_id: userId,
      model: modelChain,
      prompt_version: PROMPT_VERSION,
      raw_text_chars: rawCvText.length,
      tokens_input: tokensInput || null,
      tokens_output: tokensOutput || null,
      parse_attempts: 1,
      last_error: null,
      last_run_at: now,
      validation_result: {
        passed: validationReport.passed,
        confidence: validationReport.confidence,
        stats: validationReport.stats,
        issues: validationReport.issues,
      },
      consistency_result: {
        passed: consistencyReport.passed,
        score: consistencyReport.score,
        factories_accept: consistencyReport.factoriesAccept,
        details: consistencyReport.details,
        issues: consistencyReport.issues.map((i) => ({
          field: i.field, type: i.type, severity: i.severity, message: i.message,
        })),
      },
      quality_score: qualityScore,
      ats_score: atsScore,
      reviewer_changes: reviewerChanges.length > 0 ? reviewerChanges : null,
      factual_consistency_score: consistencyReport.score,
    }, { onConflict: "profile_id" })

    if (aiMeta?.error) {
      logStep(reqId, "metadata_save_fail", {
        code: aiMeta.error.code ?? null,
        message: aiMeta.error.message?.slice(0, 200),
      })
    }

    logStep(reqId, "response_sent", { userId, totalMs: Date.now() - t0 })
    return NextResponse.json({
      ok: true,
      reqId,
      pipeline: {
        parserModel: MODEL,
        reviewerModel,
        reviewerApplied,
        validationPassed: validationReport.passed,
        validationConfidence: validationReport.confidence.overall,
        consistencyPassed: consistencyReport.passed,
        consistencyScore: consistencyReport.score,
        qualityScore,
        atsScore,
        factualConsistencyScore: consistencyReport.score,
        changesByReviewer: reviewerChanges,
        consistencyIssues: consistencyReport.issues.slice(0, 10),
      },
    })
  } catch (err) {
    const msg = errMsg(err)
    logStep(reqId, "failed", { userId, err: msg, totalMs: Date.now() - t0 })
    if (userId && supabase) {
      const { markProfileStatus } = await import("@/lib/profile/queries")
      await markProfileStatus(userId, "failed", msg, supabase).catch(() => {})
    }
    return jsonError(reqId, msg || "Something went wrong.", 500)
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed" }, { status: 405 })
}
