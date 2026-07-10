import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    ''
  const anon =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ''

  if (!url || !anon) {
    // Fail with a clear message instead of the opaque "supabaseUrl is required"
    // which masked as a 500 in metadata routes. Cookie routes still work;
    // public routes use createPublicClient instead.
    throw new Error('Missing Supabase URL / anon key (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL)')
  }

  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Called from a Server Component — middleware handles refresh.
        }
      },
    },
  })
}
