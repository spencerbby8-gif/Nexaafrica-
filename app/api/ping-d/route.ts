import type { NextRequest } from 'next/server'
export async function GET(req: NextRequest) {
  const u = new URL(req.url)
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text x="1" y="9">ok ${u.pathname}</text></svg>`, {
    headers: { 'Content-Type': 'image/svg+xml' },
  })
}
