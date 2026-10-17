import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, saveSession } from '@/lib/store'
import { capabilityReport } from '@/lib/config'

export const dynamic = 'force-dynamic'

/** Everything the client needs to render the app for this citizen. */
export async function GET() {
  const session = await getSession()
  return NextResponse.json({
    id: session.id,
    profile: session.profile,
    documents: session.documents.map(({ content: _content, ...rest }) => rest),
    applications: session.applications,
    chat: session.chat,
    digilocker: {
      connected: session.digilocker.connected,
      method: session.digilocker.method,
      name: session.digilocker.name,
      linkedAt: session.digilocker.linkedAt,
    },
    capabilities: capabilityReport(),
  })
}

/** Reset the whole session — useful for demos. */
export async function DELETE() {
  const session = await getSession()
  session.profile = {}
  session.documents = []
  session.applications = []
  session.chat = []
  session.digilocker = { connected: false, method: null }
  await saveSession(session)
  return NextResponse.json({ ok: true, reset: true })
}

/** Bulk profile update, used by the eligibility wizard. */
export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>
  const session = await getSession()

  const allowed = [
    'name',
    'age',
    'gender',
    'state',
    'district',
    'caste',
    'annualIncome',
    'occupation',
    'landHolding',
    'education',
    'disability',
    'bpl',
    'maritalStatus',
    'employmentStatus',
    'residence',
    'familySize',
    'hasBankAccount',
    'hasRationCard',
  ] as const

  for (const key of allowed) {
    if (key in body) {
      const value = body[key]
      if (value === null || value === undefined || value === '') {
        delete (session.profile as Record<string, unknown>)[key]
      } else {
        ;(session.profile as Record<string, unknown>)[key] = value
      }
    }
  }

  await saveSession(session)
  return NextResponse.json({ ok: true, profile: session.profile })
}
