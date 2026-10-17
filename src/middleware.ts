import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session-constants'

/**
 * Ensures every visitor has a stable session id before any route or page runs,
 * which lets the rest of the app read the session without worrying about
 * cookie mutation rules.
 */
export function middleware(request: NextRequest) {
  const existing = request.cookies.get(SESSION_COOKIE)?.value
  if (existing) return NextResponse.next()

  const id = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const response = NextResponse.next()
  response.cookies.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
