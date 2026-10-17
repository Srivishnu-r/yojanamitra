import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, saveSession } from '@/lib/store'
import {
  buildAuthorizeUrl,
  createOauthState,
  createPkcePair,
  digilockerLive,
} from '@/lib/digilocker'

export const dynamic = 'force-dynamic'

/**
 * Step 1 of the DigiLocker handshake.
 *
 * With credentials configured this generates a PKCE pair, stores the verifier
 * on the session and returns the real consent URL. Without credentials it
 * reports that the built-in simulator will be used instead.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard'

  if (!digilockerLive()) {
    return NextResponse.json({
      mode: 'simulator',
      next,
      message:
        'DigiLocker partner credentials are not configured, so the built-in simulator will be used. The flow and document shapes are identical.',
    })
  }

  const { verifier, challenge } = createPkcePair()
  const state = createOauthState()

  session.digilocker = {
    ...session.digilocker,
    pkceVerifier: verifier,
    oauthState: state,
  }
  await saveSession(session)

  return NextResponse.json({
    mode: 'oauth',
    url: buildAuthorizeUrl(state, challenge),
    next,
  })
}
