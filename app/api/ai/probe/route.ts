import { NextResponse } from 'next/server'
import { probeAllProviders } from '@/lib/ai/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isAuthorized(req: Request): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const token = process.env.INGEST_TOKEN
  if (!token) return false
  return req.headers.get('authorization') === `Bearer ${token}`
}

async function compareGeminiPaths() {
  const apiKey = process.env.GEMINI_API_KEY
  const MODEL = "gemini-2.5-flash"
  const PING = "Respond with exactly: ok"
  const results: any[] = []
  const rows: any[] = []

  function add(row: any) { rows.push(row) }

  // PATH A: Gateway-style callProvider
  const ta = Date.now()
  add({ p:"gw", e:"attempt", t:0 })
  try {
    const { GoogleGenAI: G } = await import("@google/genai")
    const ai = new G({ apiKey })
    const r = await ai.models.generateContent({
      model: MODEL, contents: [{ role: "user", parts: [{ text: PING }] }],
      config: { temperature: 0.3, maxOutputTokens: 1024 },
    })
    const lat = Date.now() - ta
    add({ p:"gw", e:"success", ms:lat, rlen:(r.text||"").length, tokIn:r.usageMetadata?.promptTokenCount, tokOut:r.usageMetadata?.candidatesTokenCount })
    results.push({ path:"gateway", result:"success", latencyMs:lat, textLen:(r.text||"").length, tokensIn:r.usageMetadata?.promptTokenCount, tokensOut:r.usageMetadata?.candidatesTokenCount })
  } catch (e: any) {
    const lat = Date.now() - ta
    const msg = e?.message || String(e)
    add({ p:"gw", e:"failure", ms:lat, errName:e?.name, errMsg:msg.slice(0,500), errBody:msg.slice(0,1000) })
    results.push({ path:"gateway", result:"failure", latencyMs:lat, errorName:e?.name, errorMessage:msg.slice(0,300) })
  }

  // PATH B: CV-parser-style parseCvWithGemini
  const tb = Date.now()
  add({ p:"cv", e:"attempt", t:0 })
  try {
    const { GoogleGenAI: G, Type: T } = await import("@google/genai")
    const ai = new G({ apiKey })
    const r = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: `Source CV text:\n"""\n${PING}\n"""\n\nReturn JSON matching the schema.` }] }],
      config: {
        systemInstruction: "You are Nexa. Output strictly JSON.",
        responseMimeType: "application/json",
        responseSchema: { type: T.OBJECT, properties: { ok: { type: T.BOOLEAN } }, required: ["ok"] },
        temperature: 0.75, maxOutputTokens: 3000,
      },
    })
    const lat = Date.now() - tb
    add({ p:"cv", e:"success", ms:lat, rlen:(r.text||"").length, tokIn:r.usageMetadata?.promptTokenCount, tokOut:r.usageMetadata?.candidatesTokenCount })
    results.push({ path:"cvparser", result:"success", latencyMs:lat, textLen:(r.text||"").length, tokensIn:r.usageMetadata?.promptTokenCount, tokensOut:r.usageMetadata?.candidatesTokenCount })
  } catch (e: any) {
    const lat = Date.now() - tb
    const msg = e?.message || String(e)
    add({ p:"cv", e:"failure", ms:lat, errName:e?.name, errMsg:msg.slice(0,500), errBody:msg.slice(0,1000) })
    results.push({ path:"cvparser", result:"failure", latencyMs:lat, errorName:e?.name, errorMessage:msg.slice(0,300) })
  }

  // Fire-and-forget persistence via Supabase REST
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (base && key) {
    for (const r of rows) {
      fetch(`${base}/rest/v1/ai_provider_log`, {
        method: "POST",
        headers: { "Content-Type":"application/json", "Authorization":`Bearer ${key}`, "apikey":key },
        body: JSON.stringify({
          agent_id: "compare:"+(r.p||""), provider: r.p==="gw"?"gemini-gateway":"gemini-cvparser",
          model: MODEL, event: r.e,
          duration_ms: r.ms ?? null, response_len: r.rlen ?? null, prompt_len: PING.length,
          retry_count: 0, fallback_used: false,
          error_code: r.errName ?? null, error_message: r.errMsg?.slice(0,500) ?? null, error_body: r.errBody?.slice(0,1000) ?? null,
        }),
      }).catch(()=>{})
    }
  }

  return results
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const mode = new URL(req.url).searchParams.get('mode') || 'all'
  if (mode === 'compare') {
    const started = Date.now()
    const results = await compareGeminiPaths()
    return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, results })
  }
  const started = Date.now()
  const result = await probeAllProviders()
  return NextResponse.json({ ok: true, elapsedMs: Date.now() - started, ...result })
}

export const GET = POST
