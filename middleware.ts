import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - static assets and image optimization files
     * - API routes (they do their own auth and must receive raw streamed
     *   request bodies; running supabase-ssr middleware on multipart uploads
     *   can tear the request body before the route handler can parse it).
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
