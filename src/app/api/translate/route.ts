import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { SarvamError, sarvamLive, translate, transliterate } from '@/lib/sarvam'
import { getLanguage } from '@/lib/data/languages'
import { getSession, saveSession } from '@/lib/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface TranslateBody {
  text?: string
  targetLanguage?: string
  sourceLanguage?: string
  mode?: 'formal' | 'modern-colloquial' | 'classic-colloquial' | 'code-mixed'
  /** Convert script without changing meaning, e.g. "Ramesh Kumar" -> "रमेश कुमार". */
  transliterateOnly?: boolean
}

/**
 * Translates text with Sarvam.
 *
 * When Sarvam is not configured the route responds 200 with `live: false` and
 * the original text, so the UI can fall back to its bundled phrasebook instead
 * of showing an error.
 */
export async function POST(request: NextRequest) {
  let body: TranslateBody
  try {
    body = (await request.json()) as TranslateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = (body.text ?? '').trim()
  const target = body.targetLanguage ?? 'hi-IN'
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  if (!sarvamLive()) {
    return NextResponse.json({
      live: false,
      translated: text,
      target,
      targetName: getLanguage(target).nativeName,
      reason: 'SARVAM_API_KEY is not configured.',
    })
  }

  try {
    const translated = body.transliterateOnly
      ? await transliterate(text, target, body.sourceLanguage ?? 'en-IN')
      : await translate(text, {
          targetLanguage: target,
          sourceLanguage: body.sourceLanguage ?? 'auto',
          mode: body.mode ?? 'formal',
        })

    const session = await getSession()
    session.usage.sarvamCalls += 1
    await saveSession(session)

    return NextResponse.json({
      live: true,
      translated,
      target,
      targetName: getLanguage(target).nativeName,
      transliteratedOnly: Boolean(body.transliterateOnly),
    })
  } catch (error) {
    const status = error instanceof SarvamError ? error.status || 502 : 502
    const message = error instanceof Error ? error.message : String(error)
    console.error('[translate] failed:', message)
    return NextResponse.json(
      { error: 'Translation failed', detail: message, live: true },
      { status },
    )
  }
}
