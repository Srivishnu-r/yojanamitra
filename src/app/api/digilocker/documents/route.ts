import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession, saveSession } from '@/lib/store'
import { downloadDocument, digilockerLive } from '@/lib/digilocker'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Lists the documents in the citizen's vault (metadata only). */
export async function GET(request: NextRequest) {
  const session = await getSession()
  const id = request.nextUrl.searchParams.get('id')

  if (id) {
    const doc = session.documents.find((d) => d.id === id)
    if (!doc) {
      return NextResponse.json({ error: `Unknown document: ${id}` }, { status: 404 })
    }

    // Live mode: stream the real file down from DigiLocker on demand.
    if (digilockerLive() && doc.uri && session.digilocker.accessToken && !doc.content) {
      try {
        const downloaded = await downloadDocument(
          session.digilocker.accessToken,
          doc.uri,
        )
        doc.content = downloaded.content
        doc.mimeType = downloaded.mimeType
        await saveSession(session)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
          { error: 'Could not download the document', detail: message },
          { status: 502 },
        )
      }
    }

    if (!doc.content) {
      return NextResponse.json(
        {
          error: 'No file payload is available for this document.',
          document: { ...doc, content: undefined },
        },
        { status: 404 },
      )
    }

    const buffer = Buffer.from(doc.content, 'base64')
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': doc.mimeType ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${doc.canonicalId}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return NextResponse.json({
    connected: session.digilocker.connected,
    method: session.digilocker.method,
    linkedAt: session.digilocker.linkedAt,
    count: session.documents.length,
    documents: session.documents.map(({ content: _content, ...rest }) => rest),
  })
}

/** Unlinks DigiLocker and clears the vault. */
export async function DELETE() {
  const session = await getSession()
  session.documents = []
  session.digilocker = { connected: false, method: null }
  await saveSession(session)
  return NextResponse.json({ ok: true, unlinked: true })
}
