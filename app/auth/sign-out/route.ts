import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Sign out and clear Supabase auth cookies.
 *
 * The Supabase client's cookies adapter (configured in lib/supabase/server.ts)
 * is what actually removes the cookies via Next's cookies() API on the
 * outgoing response. We just need to call signOut() and return a redirect.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Redirect home with a no-store header so the browser does not serve a
  // cached authenticated copy of the previous page after sign-out.
  const res = NextResponse.redirect(new URL("/", request.url), { status: 303 })
  res.headers.set("Cache-Control", "no-store, max-age=0")
  return res
}

// Some browsers send GET on form fallbacks; keep it consistent.
export const GET = POST
