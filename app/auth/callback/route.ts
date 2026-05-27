import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
  res.headers.set('Pragma', 'no-cache')
  return res
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')
  const next = sanitizeNext(searchParams.get('next'))

  // OAuth provider returned an error (e.g. user cancelled)
  if (errorParam) {
    return noStore(
      NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(errorParam)}`),
    )
  }

  if (!code) {
    return noStore(NextResponse.redirect(`${origin}/sign-in?error=missing_code`))
  }

  const supabase = await createClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
  if (exchangeError) {
    return noStore(
      NextResponse.redirect(`${origin}/sign-in?error=exchange_failed`),
    )
  }

  // Decide post-auth destination: onboarding if profile incomplete.
  // Wrap in try/catch — a transient profile-lookup failure should not
  // strand the user; default to onboarding so they can complete setup.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.status !== 'ready') {
        const url = new URL('/onboarding', origin)
        if (next) url.searchParams.set('next', next)
        return noStore(NextResponse.redirect(url))
      }
    }
  } catch {
    return noStore(NextResponse.redirect(`${origin}/onboarding`))
  }

  return noStore(NextResponse.redirect(`${origin}${next ?? '/profile'}`))
}

function sanitizeNext(value: string | null): string | null {
  if (!value) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  return value
}
