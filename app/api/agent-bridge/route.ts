import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

/**
 * Agent Bridge — authenticated entry point for external agents (operator
 * scripts, automations) to run prompts through Nexa's LIVE AI stack.
 *
 * SECURITY MODEL
 *  - Handshake: every request must carry the header `x-arena-secret` whose
 *    value must equal the Vercel environment variable ARENA_SECRET.
 *    Constant-time comparison (timingSafeEqual). The secret NEVER appears in
 *    code — this repo is public; it exists only as an encrypted Vercel env
 *    var. Route returns 503 when ARENA_SECRET is not configured.
 *  - Input caps: prompt <= 4,000 chars, systemInstruction <= 2,000,
 *    maxTokens <= 4,096, temperature clamped to [0,2]. No arbitrary URLs or
 *    provider names are accepted — model selection is done entirely by the
 *    app's own health-aware router (aiGateway -> live provider registry).
 *  - GET is disabled (405). No secrets, API keys, or prompts are returned in
 *    responses or logged by this route.
 *
 * MODEL ROUTING
 *  The route delegates to the project's existing AI gateway, which refreshes
 *  the live provider registry (health checks against the current model set),
 *  picks the best provider/model via the health-aware orchestrator, and
 *  retries with fallbacks. Provider API keys come from the pre-configured
 *  Vercel environment variables (GEMINI_API_KEY, MISTRAL_API_KEY,
 *  OPENROUTER_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, ...).
 *
 * REQUEST  POST { "prompt": "...", "systemInstruction"?: "...",
 *                "responseSchema"?: object, "temperature"?: 0-2,
 *                "maxTokens"?: 1-4096, "jobId"?: "..." }
 * RESPONSE 200 { ok, response, provider, model, latencyMs, fallbackUsed,
 *                fallbackChain }   |   401/400/405/502/503 { ok:false, error }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

const MAX_PROMPT_LEN = 4000
const MAX_SYSTEM_LEN = 2000
const MAX_TOKENS = 4096
const MAX_RESPONSE_CHARS = 8000

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.ARENA_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'bridge not configured (ARENA_SECRET missing)' }, { status: 503 })
  }
  const token = req.headers.get('x-arena-secret') ?? ''
  if (!token || !safeEqual(token, secret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) return NextResponse.json({ ok: false, error: 'prompt is required' }, { status: 400 })
  if (prompt.length > MAX_PROMPT_LEN) {
    return NextResponse.json({ ok: false, error: `prompt too long (max ${MAX_PROMPT_LEN} chars)` }, { status: 400 })
  }

  const systemInstruction = typeof body.systemInstruction === 'string'
    ? body.systemInstruction.slice(0, MAX_SYSTEM_LEN) : undefined
  const responseSchema = body.responseSchema && typeof body.responseSchema === 'object'
    ? body.responseSchema : undefined
  const temperature = typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2
    ? body.temperature : undefined
  const maxTokens = typeof body.maxTokens === 'number' && body.maxTokens >= 1 && body.maxTokens <= MAX_TOKENS
    ? Math.floor(body.maxTokens) : undefined
  const jobId = typeof body.jobId === 'string' ? body.jobId.slice(0, 64) : undefined

  try {
    const { aiGateway } = await import('@/lib/ai/gateway')
    const result = await aiGateway({
      prompt,
      systemInstruction,
      responseSchema,
      temperature,
      maxTokens,
      agentId: 'agent-bridge',
      jobId,
    })
    return NextResponse.json({
      ok: true,
      response: result.response.text.slice(0, MAX_RESPONSE_CHARS),
      provider: result.response.provider,
      model: result.response.model,
      latencyMs: result.response.latencyMs,
      fallbackUsed: result.fallbackUsed,
      fallbackChain: result.fallbackChain,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : 'bridge failed'
    return NextResponse.json({ ok: false, error: msg }, { status: 502 })
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: false, error: 'method not allowed' }, { status: 405 })
}
