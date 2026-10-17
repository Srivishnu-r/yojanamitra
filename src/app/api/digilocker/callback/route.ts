import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, saveSession } from '@/lib/store'
import {
  canonicalIdForType,
  enrichProfileFromDocuments,
  exchangeCodeForToken,
  fetchIssuedDocuments,
  fetchLiveProfile,
} from '@/lib/digilocker'
import type { CitizenDocument } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Step 2 of the DigiLocker handshake: DigiLocker redirects the citizen back
 * here with an authorization code, which is exchanged for an access token.
 * The citizen's issued documents are then pulled into the vault.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  const params = request.nextUrl.searchParams
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')
  const appUrl = new URL(request.url).origin

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${appUrl}/dashboard?digilocker=error&reason=${encodeURIComponent(reason)}`,
    )

  if (error) return fail(error)
  if (!code) return fail('DigiLocker did not return an authorization code.')

  if (!session.digilocker.oauthState || session.digilocker.oauthState !== state) {
    return fail('The security state did not match. Please try connecting again.')
  }

  if (!session.digilocker.pkceVerifier) {
    return fail('The PKCE verifier was missing from your session.')
  }

  try {
    const tokens = await exchangeCodeForToken(code, session.digilocker.pkceVerifier)
    const [profile, issued] = await Promise.all([
      fetchLiveProfile(tokens.access_token),
      fetchIssuedDocuments(tokens.access_token),
    ])

    const documents: CitizenDocument[] = issued.map((item, index) => {
      const canonicalId = canonicalIdForType(item.doctype, item.name)
      return {
        id: `dl_${index}_${canonicalId}`,
        canonicalId,
        name: item.name,
        issuer: item.issuer,
        uri: item.uri,
        docType: item.doctype,
        issuedAt: item.date,
        status: 'verified',
        source: 'digilocker',
      }
    })

    session.documents = documents
    session.profile = {
      ...enrichProfileFromDocuments(session.profile, documents),
      name: session.profile.name || profile.name,
    }
    session.digilocker = {
      connected: true,
      method: 'oauth',
      name: profile.name,
      digilockerId: profile.digilockerid,
      linkedAt: new Date().toISOString(),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : undefined,
    }
    await saveSession(session)

    return NextResponse.redirect(
      `${appUrl}/dashboard?digilocker=connected&documents=${documents.length}`,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[digilocker] callback failed:', message)
    return fail('Could not complete the DigiLocker handshake.')
  }
}
