import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, saveSession } from '@/lib/store'
import { digilockerLive, enrichProfileFromDocuments, simulateVault } from '@/lib/digilocker'

export const dynamic = 'force-dynamic'

interface ConnectBody {
  consent?: boolean
  /** So the simulator can produce documents that match the citizen. */
  name?: string
  state?: string
}

/**
 * Connects the DigiLocker vault.
 *
 * When partner credentials are absent this is the whole flow: it simulates the
 * consent screen's outcome and materialises a realistic document set derived
 * from the stored profile.
 */
export async function POST(request: NextRequest) {
  let body: ConnectBody = {}
  try {
    body = (await request.json()) as ConnectBody
  } catch {
    // An empty body is acceptable — treat it as no extra hints.
  }

  if (body.consent !== true) {
    return NextResponse.json(
      { error: 'consent is required', message: 'The citizen must agree before documents are read.' },
      { status: 428 },
    )
  }

  if (digilockerLive()) {
    // With live credentials the real flow must run through /authorize.
    return NextResponse.json(
      {
        error: 'Live DigiLocker is configured',
        mode: 'oauth',
        message: 'Start the flow at /api/digilocker/authorize so the citizen can consent at DigiLocker.',
      },
      { status: 409 },
    )
  }

  const session = await getSession()

  if (body.name && !session.profile.name) session.profile.name = body.name
  if (body.state && !session.profile.state) session.profile.state = body.state

  const documents = simulateVault(session.profile)
  session.documents = documents
  session.profile = enrichProfileFromDocuments(session.profile, documents)
  session.digilocker = {
    connected: true,
    method: 'simulator',
    name: session.profile.name ?? 'Demo Citizen',
    digilockerId: `SIM${Math.floor(100000000 + Math.random() * 899999999)}`,
    linkedAt: new Date().toISOString(),
  }
  await saveSession(session)

  return NextResponse.json({
    mode: 'simulator',
    connected: true,
    profile: session.profile,
    documents: session.documents.map(({ content: _content, ...rest }) => rest),
  })
}
