import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { UserProfile } from '@/lib/types'
import { getSession, saveSession } from '@/lib/store'
import {
  FIELD_LABELS,
  matchSchemes,
  nextBestQuestion,
  profileCompleteness,
  evaluateScheme,
} from '@/lib/eligibility'
import { getScheme } from '@/lib/data/schemes'

export const dynamic = 'force-dynamic'

/** Ranks schemes for the stored profile and reports the next best question. */
export async function GET(request: NextRequest) {
  const session = await getSession()
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? 20)

  const matches = matchSchemes(session.profile, { limit })
  const next = nextBestQuestion(session.profile)

  return NextResponse.json({
    profile: session.profile,
    completeness: profileCompleteness(session.profile),
    nextQuestion: next
      ? { field: next, label: FIELD_LABELS[next] }
      : null,
    count: matches.length,
    matches: matches.map((m) => ({
      scheme: m.scheme,
      result: m.result,
    })),
  })
}

interface EligibilityBody {
  profile?: UserProfile
  schemeId?: string
  /** Persist the supplied profile into the session. */
  save?: boolean
}

/** Evaluates one scheme, optionally against an ad-hoc profile. */
export async function POST(request: NextRequest) {
  let body: EligibilityBody
  try {
    body = (await request.json()) as EligibilityBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const session = await getSession()
  const profile = body.profile ?? session.profile

  if (body.profile && body.save !== false) {
    session.profile = { ...session.profile, ...body.profile }
    await saveSession(session)
  }

  if (!body.schemeId) {
    return NextResponse.json({ error: 'schemeId is required' }, { status: 400 })
  }

  const scheme = getScheme(body.schemeId)
  if (!scheme) {
    return NextResponse.json({ error: `Unknown scheme: ${body.schemeId}` }, { status: 404 })
  }

  return NextResponse.json({ result: evaluateScheme(scheme, profile) })
}
