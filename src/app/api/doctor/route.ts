import { NextResponse } from 'next/server'
import { getSession, saveSession } from '@/lib/store'
import { catalogueStats } from '@/lib/data/schemes'
import { LANGUAGES } from '@/lib/data/languages'
import { STATES } from '@/lib/data/states'

/**
 * Plain-JSON readiness report. Handy for smoke testing the whole stack without
 * a browser: keys present, catalogue loaded, AI reachable.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  const stats = catalogueStats()

  const checks: Array<{ name: string; ok: boolean; detail: string }> = [
    {
      name: 'Scheme catalogue',
      ok: stats.total > 50 && stats.statesCovered === 36,
      detail: `${stats.total} schemes across ${stats.statesCovered}/36 states and UTs`,
    },
    {
      name: 'Language pack',
      ok: LANGUAGES.length >= 12,
      detail: `${LANGUAGES.length} languages, ${STATES.length} states mapped`,
    },
    {
      name: 'Session store',
      ok: Boolean(session.id),
      detail: `session ${session.id}`,
    },
  ]

  return NextResponse.json({
    ok: checks.every((check) => check.ok),
    checks,
    stats,
  })
}
