import { NextResponse } from 'next/server'
import { getScheme } from '@/lib/data/schemes'
import { evaluateScheme } from '@/lib/eligibility'
import { getSession } from '@/lib/store'
import { missingDocuments } from '@/lib/digilocker'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const scheme = getScheme(id)
  if (!scheme) {
    return NextResponse.json({ error: `Unknown scheme: ${id}` }, { status: 404 })
  }

  const session = await getSession()
  const eligibility = evaluateScheme(scheme, session.profile)
  const missing = missingDocuments(
    scheme.documents.filter((d) => d.required).map((d) => d.id),
    session.documents,
  )

  return NextResponse.json({
    scheme,
    eligibility,
    documentStatus: scheme.documents.map((doc) => ({
      ...doc,
      held: session.documents.some((d) => d.canonicalId === doc.id),
    })),
    missingDocuments: missing,
    hasApplication: session.applications.some((a) => a.schemeId === scheme.id),
  })
}
