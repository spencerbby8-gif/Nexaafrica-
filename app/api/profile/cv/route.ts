import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractPdfText } from '@/lib/profile/pdf'
import { parseCvWithGemini, MODEL, PROMPT_VERSION } from '@/lib/profile/gemini'
import { saveParsedProfile, markProfileStatus } from '@/lib/profile/queries'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const MIN_TEXT_CHARS = 200

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  const limit = rateLimit(`cv:${user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'You have uploaded too many CVs in the last hour. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file received.' }, { status: 400 })
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported.' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is over 5 MB.' }, { status: 400 })
  }

  await markProfileStatus(user.id, 'parsing')

  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Save the original PDF to private storage (best-effort; failure is non-fatal).
    const path = `${user.id}/${Date.now()}-${safeName(file.name)}`
    const upload = await supabase.storage
      .from('cvs')
      .upload(path, buffer, { contentType: 'application/pdf', upsert: false })
    const cvPath = upload.error ? null : path

    const text = await extractPdfText(buffer)
    if (text.length < MIN_TEXT_CHARS) {
      throw new Error(
        'We could not read enough text from this PDF. If it is a scanned document, export a text-based PDF and try again.',
      )
    }

    const { parsed, tokensInput, tokensOutput } = await parseCvWithGemini(text)

    await saveParsedProfile(user.id, parsed)

    if (cvPath) {
      await supabase.from('profiles').update({ cv_storage_path: cvPath }).eq('id', user.id)
    }
    await supabase.from('profile_ai_metadata').upsert(
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

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Something went wrong.'
    await markProfileStatus(user.id, 'failed', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
}
