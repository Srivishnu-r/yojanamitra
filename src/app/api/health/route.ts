import { NextResponse } from 'next/server'
import { capabilityReport, config } from '@/lib/config'
import { catalogueStats } from '@/lib/data/schemes'
import { LANGUAGES } from '@/lib/data/languages'

export const dynamic = 'force-dynamic'

/** Capability probe used by the settings panel and for smoke testing. */
export async function GET() {
  return NextResponse.json({
    app: config.app.name,
    tagline: config.app.tagline,
    capabilities: capabilityReport(),
    catalogue: catalogueStats(),
    languages: LANGUAGES.length,
  })
}
