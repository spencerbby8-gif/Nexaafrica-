import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractPdfText } from '@/lib/profile/pdf'
import { parseCvWithGemini, MODEL, PROMPT_VERSION } from '@/lib/profile/gemini'
import { saveParsedProfile, markProfileStatus } from '@/lib/profile/queries'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

// Vercel serverless functions cap request bodies near 4.5 MB by default.
// We stay safely under that to avoid the platform aborting the request,
// which surfaces in the browser as "Failed to fetch".
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB
const MIN_TEXT_CHARS = 200

function logStep(step: string, fields: Record<string, unknown> = {}) {
  // Structured server log; visible in Vercel runtime logs.
  console.log(JSON.stringify({ scope: 'cv_upload', step, ...fields }))
}

export async function POST(req: Request) {
  const t0 = Date.now()
  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    logStep('unauthenticated', { err: userErr?.message })
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const limit = rateLimit(`cv:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })
  if (!limit.ok) {
    logStep('rate_limited', { userId: user.id, retryAfter: limit.retryAfterSeconds })
    return NextResponse.json(
      { error: 'You have uploaded too many CVs in the last hour. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  if (!process.env.GEMINI_API_KEY) {
    logStep('missing_gemini_key')
    return NextResponse.json(
      { error: 'CV parsing is temporarily unavailable. Please try again shortly.' },
      { status: 503 },
    )
  }

  const form = await req.formData().catch((e) => {
    logStep('formdata_failed', { err: (e as Error)?.message })
    return null
  })
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 })
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 })
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'This file looks empty.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'File is over 4 MB. Please upload a smaller PDF.' },
      { status: 413 },
    )
  }

  logStep('received', { userId: user.id, fileName: file.name, size: file.size })

  await markProfileStatus(user.id, 'parsing').catch((e) => {
    logStep('mark_parsing_failed', { err: (e as Error)?.message })
  })

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Save the original PDF to private storage (best-effort; failure is non-fatal).
    const path = `${user.id}/${Date.now()}-${safeName(file.name)}`
    const upload = await supabase.storage
      .from('cvs')
      .upload(path, buffer, { contentType: 'application/pdf', upsert: false })
    if (upload.error) {
      logStep('storage_upload_failed_nonfatal', { err: upload.error.message })
    }
    const cvPath = upload.error ? null : path

    const tPdfStart = Date.now()
    let text: string
    try {
      text = await extractPdfText(buffer)
    } catch (e) {
      logStep('pdf_extract_failed', { err: (e as Error)?.message })
      throw new Error(
        'We could not read this PDF. If it is a scanned document, please export a text-based PDF and try again.',
      )
    }
    logStep('pdf_extracted', { ms: Date.now() - tPdfStart, chars: text.length })

    if (text.length < MIN_TEXT_CHARS) {
      throw new Error(
        'We could not read enough text from this PDF. If it is a scanned document, export a text-based PDF and try again.',
      )
    }

    const tGeminiStart = Date.now()
    let parsed
    let tokensInput: number | undefined
    let tokensOutput: number | undefined
    try {
      const result = await parseCvWithGemini(text)
      parsed = result.parsed
      tokensInput = result.tokensInput
      tokensOutput = result.tokensOutput
    } catch (e) {
      logStep('gemini_failed', { err: (e as Error)?.message })
      throw new Error(
        'We could not structure your CV right now. Please try again, or set up your profile manually.',
      )
    }
    logStep('gemini_ok', {
      ms: Date.now() - tGeminiStart,
      tokensInput,
      tokensOutput,
      skills: parsed.skills.length,
      experience: parsed.experience.length,
    })

    try {
      await saveParsedProfile(user.id, parsed)
    } catch (e) {
      logStep('save_failed', { err: (e as Error)?.message })
      throw new Error('We could not save your profile. Please try again.')
    }

    if (cvPath) {
      const r = await supabase.from('profiles').update({ cv_storage_path: cvPath }).eq('id', user.id)
      if (r.error) logStep('cv_path_update_failed_nonfatal', { err: r.error.message })
    }

    const aiMeta = await supabase.from('profile_ai_metadata').upsert(
      {
        profile_id: user.id,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        raw_text_chars: text.length,
        tokens_input: tokensInput ?? null,
        tokens_output: tokensOutput ?? null,
        parse_attempts: 1,
        last_error: null,
        last_run_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' },
    )
    if (aiMeta.error) logStep('ai_meta_upsert_failed_nonfatal', { err: aiMeta.error.message })

    logStep('completed', { userId: user.id, totalMs: Date.now() - t0 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong.'
    logStep('failed', { userId: user.id, err: msg, totalMs: Date.now() - t0 })
    await markProfileStatus(user.id, 'failed', msg).catch(() => {})
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}
