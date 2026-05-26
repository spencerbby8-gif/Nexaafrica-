import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function rid() {
  return `dbg_${Math.random().toString(36).slice(2, 8)}`
}

export async function GET(req: Request) {
  const reqId = rid()
  console.log(`[v0][debug][${reqId}] request_received`, {
    method: "GET",
    url: req.url,
    ts: new Date().toISOString(),
  })

  const body = {
    success: true,
    message: "debug route works",
    method: "GET",
    runtime: "nodejs",
    reqId,
    serverTime: new Date().toISOString(),
    env: {
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasSupabaseAnon: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hasSupabaseService: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    },
  }

  console.log(`[v0][debug][${reqId}] response_sent`, body)
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  })
}

export async function POST(req: Request) {
  const reqId = rid()
  console.log(`[v0][debug][${reqId}] request_received`, {
    method: "POST",
    url: req.url,
    contentType: req.headers.get("content-type"),
    ts: new Date().toISOString(),
  })

  const body = {
    success: true,
    message: "debug route works",
    method: "POST",
    runtime: "nodejs",
    reqId,
    serverTime: new Date().toISOString(),
  }

  console.log(`[v0][debug][${reqId}] response_sent`, body)
  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  })
}
