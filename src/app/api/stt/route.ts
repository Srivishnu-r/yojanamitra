import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SarvamError, sarvamLive, transcribe } from '@/lib/sarvam'
import { getSession, saveSession } from '@/lib/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Speech to text via Sarvam Saaras.
 *
 * Accepts `multipart/form-data` with a `file` field, plus optional
 * `languageCode` and `mode`. Audio must be 30 seconds or shorter, which is the
 * REST endpoint's limit.
 */
export async function POST(request: NextRequest) {
  if (!sarvamLive()) {
    return NextResponse.json(
      {
        live: false,
        error: 'Speech recognition requires SARVAM_API_KEY.',
        hint: 'Add your Sarvam key to .env.local and restart the dev server.',
      },
      { status: 503 },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart/form-data with a file field.' },
      { status: 400 },
    )
  }

  const file = form.get('file')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'file field is required.' }, { status: 400 })
  }

  const languageCode = String(form.get('languageCode') ?? 'unknown')
  const mode = String(form.get('mode') ?? 'transcribe') as
    | 'transcribe'
    | 'translate'
    | 'verbatim'
    | 'translit'
    | 'codemix'

  try {
    const result = await transcribe(file, { languageCode, mode })
    const session = await getSession()
    session.usage.sarvamCalls += 1
    await saveSession(session)

    return NextResponse.json({
      live: true,
      transcript: result.transcript,
      languageCode: result.languageCode,
    })
  } catch (error) {
    const status = error instanceof SarvamError ? error.status || 502 : 502
    const message = error instanceof Error ? error.message : String(error)
    console.error('[stt] failed:', message)
    return NextResponse.json({ error: 'Speech recognition failed', detail: message }, { status })
  }
}
