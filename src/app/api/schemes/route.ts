import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { SchemeCategory } from '@/lib/types'
import { searchSchemes, catalogueStats } from '@/lib/data/schemes'

export const dynamic = 'force-dynamic'

/** Browse and search the scheme catalogue. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const results = searchSchemes({
    text: params.get('q') ?? '',
    state: params.get('state') ?? undefined,
    category: (params.get('category') as SchemeCategory | null) ?? undefined,
    level: (params.get('level') as 'central' | 'state' | null) ?? undefined,
    limit: Number(params.get('limit') ?? 60),
  })

  return NextResponse.json({
    count: results.length,
    stats: catalogueStats(),
    schemes: results,
  })
}
