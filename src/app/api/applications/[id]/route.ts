import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, saveSession } from '@/lib/store'
import { getScheme } from '@/lib/data/schemes'
import {
  autofillApplication,
  missingRequiredDocuments,
  submitApplication,
} from '@/lib/applications'

export const dynamic = 'force-dynamic'

type Action = 'autofill' | 'submit' | 'withdraw' | 'attach'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getSession()
  const application = session.applications.find((a) => a.id === id)
  if (!application) {
    return NextResponse.json({ error: `Unknown application: ${id}` }, { status: 404 })
  }
  const scheme = getScheme(application.schemeId)
  return NextResponse.json({
    application,
    scheme,
    missingDocuments: missingRequiredDocuments(application),
  })
}

interface ActionBody {
  action?: Action
  /** Required for `submit` — the citizen must have explicitly agreed. */
  confirm?: boolean
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: ActionBody
  try {
    body = (await request.json()) as ActionBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const session = await getSession()
  const index = session.applications.findIndex((a) => a.id === id)
  if (index === -1) {
    return NextResponse.json({ error: `Unknown application: ${id}` }, { status: 404 })
  }

  const application = session.applications[index]
  const scheme = getScheme(application.schemeId)
  if (!scheme) {
    return NextResponse.json(
      { error: `Scheme ${application.schemeId} is no longer in the catalogue` },
      { status: 409 },
    )
  }

  switch (body.action) {
    case 'autofill': {
      const updated = autofillApplication(
        application,
        scheme,
        session.profile,
        session.documents,
      )
      session.applications[index] = updated
      await saveSession(session)
      return NextResponse.json({
        application: updated,
        missingDocuments: missingRequiredDocuments(updated),
      })
    }

    case 'attach': {
      const updated = autofillApplication(
        application,
        scheme,
        session.profile,
        session.documents,
      )
      session.applications[index] = updated
      await saveSession(session)
      return NextResponse.json({
        application: updated,
        missingDocuments: missingRequiredDocuments(updated),
      })
    }

    case 'submit': {
      const missing = missingRequiredDocuments(application)
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: 'Required documents are missing',
            missingDocuments: missing.map((d) => d.name),
          },
          { status: 409 },
        )
      }
      if (body.confirm !== true) {
        return NextResponse.json(
          {
            error: 'confirmation required',
            message: 'Set confirm: true to submit this application.',
            application,
          },
          { status: 428 },
        )
      }
      const submitted = submitApplication(application, { actor: 'citizen' })
      session.applications[index] = submitted
      await saveSession(session)
      return NextResponse.json({ application: submitted })
    }

    case 'withdraw': {
      if (application.status === 'submitted' || application.status === 'under_review') {
        return NextResponse.json(
          { error: 'A submitted application cannot be withdrawn from here.' },
          { status: 409 },
        )
      }
      session.applications.splice(index, 1)
      await saveSession(session)
      return NextResponse.json({ ok: true, removed: id })
    }

    default:
      return NextResponse.json(
        { error: 'Unknown action. Use autofill, submit, attach or withdraw.' },
        { status: 400 },
      )
  }
}
