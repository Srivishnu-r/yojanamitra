import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, saveSession } from '@/lib/store'
import { getScheme } from '@/lib/data/schemes'
import { createApplication } from '@/lib/applications'

export const dynamic = 'force-dynamic'

/** Lists every application on the session. */
export async function GET() {
  const session = await getSession()
  return NextResponse.json({
    count: session.applications.length,
    applications: session.applications,
  })
}

/** Starts a new application for a scheme. */
export async function POST(request: NextRequest) {
  let body: { schemeId?: string }
  try {
    body = (await request.json()) as { schemeId?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const scheme = body.schemeId ? getScheme(body.schemeId) : undefined
  if (!scheme) {
    return NextResponse.json({ error: `Unknown scheme: ${body.schemeId}` }, { status: 404 })
  }

  const session = await getSession()
  const existing = session.applications.find(
    (a) => a.schemeId === scheme.id && a.status !== 'rejected',
  )
  if (existing) {
    return NextResponse.json({ application: existing, existing: true })
  }

  const application = createApplication(
    scheme,
    session.profile,
    session.documents,
    'citizen',
  )
  session.applications.push(application)
  await saveSession(session)

  return NextResponse.json({ application, existing: false }, { status: 201 })
}
