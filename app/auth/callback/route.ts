import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = sanitizeNext(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}/sign-in?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/sign-in?error=exchange_failed`)
  }

  // Decide post-auth destination: onboarding if profile incomplete.
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
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.redirect(`${origin}${next ?? '/profile'}`)
}

function sanitizeNext(value: string | null): string | null {
  if (!value) return null
  if (!value.startsWith('/')) return null
  if (value.startsWith('//')) return null
  return value
}
