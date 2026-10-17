import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SarvamError, sarvamLive, synthesize } from '@/lib/sarvam'
import { getLanguage } from '@/lib/data/languages'
import { getSession, saveSession } from '@/lib/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

interface TtsBody {
  text?: string
  languageCode?: string
  speaker?: string
}

/** Text to speech via Sarvam Bulbul. Responds with a WAV binary. */
export async function POST(request: NextRequest) {
  let body: TtsBody
  try {
    body = (await request.json()) as TtsBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = (body.text ?? '').trim()
  const languageCode = body.languageCode ?? 'hi-IN'

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  if (!sarvamLive()) {
    return NextResponse.json(
      {
        live: false,
        error: 'Speech synthesis requires SARVAM_API_KEY.',
        hint: 'Add your Sarvam key to .env.local and restart the dev server.',
      },
      { status: 503 },
    )
  }

  if (!getLanguage(languageCode).tts) {
    return NextResponse.json(
      {
        error: `${getLanguage(languageCode).name} does not have a Bulbul voice yet.`,
        supported: false,
      },
      { status: 422 },
    )
  }

  try {
    const result = await synthesize(text, {
      languageCode,
      speaker: body.speaker,
    })

    const session = await getSession()
    session.usage.sarvamCalls += 1
    await saveSession(session)

    const buffer = Buffer.from(result.audio, 'base64')
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': result.mimeType,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const status = error instanceof SarvamError ? error.status || 502 : 502
    const message = error instanceof Error ? error.message : String(error)
    console.error('[tts] failed:', message)
    return NextResponse.json({ error: 'Speech synthesis failed', detail: message }, { status })
  }
}
