import { config, isLive } from '@/lib/config'
import { fetchJson, withTimeout } from '@/lib/utils'

/**
 * Sarvam AI client: translation, transliteration, speech-to-text and
 * text-to-speech for Indic languages.
 *
 * Endpoints (all authenticated with the `api-subscription-key` header):
 *   POST /translate        -> Mayura / Sarvam-Translate
 *   POST /transliterate    -> script conversion
 *   POST /speech-to-text   -> Saaras, multipart upload, <=30s audio
 *   POST /text-to-speech   -> Bulbul, returns base64 WAV
 */

export class SarvamError extends Error {
  readonly status: number
  readonly live: boolean

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'SarvamError'
    this.status = status
    this.live = isLive('sarvam')
  }
}

export function sarvamLive(): boolean {
  return isLive('sarvam')
}

function authHeaders(): Record<string, string> {
  if (!config.sarvam.apiKey) {
    throw new SarvamError(
      'Sarvam API key is not configured. Add SARVAM_API_KEY to .env.local.',
      503,
    )
  }
  return {
    'api-subscription-key': config.sarvam.apiKey,
    'Content-Type': 'application/json',
  }
}

/* -------------------------------------------------------------------------- */
/*  Language codes                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Sarvam's translation and speech models use `od-IN` for Odia, while the app
 * (and standard BCP-47) use `or-IN`. Every Sarvam endpoint rejects `or-IN` with
 * a validation error, so normalise the code on the way out and back.
 */
const APP_TO_SARVAM_LANGUAGE: Record<string, string> = { 'or-IN': 'od-IN' }
const SARVAM_TO_APP_LANGUAGE: Record<string, string> = { 'od-IN': 'or-IN' }

export function toSarvamLanguage(code: string): string {
  return APP_TO_SARVAM_LANGUAGE[code] ?? code
}

export function fromSarvamLanguage(code: string): string {
  return SARVAM_TO_APP_LANGUAGE[code] ?? code
}

/* -------------------------------------------------------------------------- */
/*  Translation                                                                */
/* -------------------------------------------------------------------------- */

/** Model specific input ceilings, with headroom for multi-byte characters. */
const TRANSLATE_CHUNK_LIMIT = 900

/**
 * `sarvam-translate:v1` requires an explicit `source_language_code`. Only
 * `mayura:v1` can detect the source language, so we swap models when the caller
 * asks for `auto`.
 */
const AUTO_SOURCE_MODEL = 'mayura:v1'

export type TranslateMode =
  | 'formal'
  | 'modern-colloquial'
  | 'classic-colloquial'
  | 'code-mixed'

export interface TranslateOptions {
  sourceLanguage?: string
  targetLanguage: string
  model?: string
  mode?: TranslateMode
  speakerGender?: 'Male' | 'Female'
  /** Use Devanagari etc. for numbers instead of ASCII digits. */
  nativeNumerals?: boolean
}

interface TranslateResponse {
  translated_text?: string
  request_id?: string
}

/** Split long text on sentence boundaries so nothing exceeds the API limit. */
export function chunkText(text: string, limit = TRANSLATE_CHUNK_LIMIT): string[] {
  if (text.length <= limit) return [text]

  const sentences = text
    .split(/(?<=[.!?।॥\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      // Hard-wrap a single oversized sentence.
      for (let i = 0; i < sentence.length; i += limit) {
        chunks.push(sentence.slice(i, i + limit))
      }
      continue
    }
    if ((current + ' ' + sentence).trim().length > limit) {
      chunks.push(current)
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }
  if (current) chunks.push(current)
  return chunks
}

export async function translate(
  input: string,
  options: TranslateOptions,
): Promise<string> {
  const {
    sourceLanguage = 'auto',
    targetLanguage,
    model,
    mode = 'formal',
    speakerGender = 'Female',
    nativeNumerals = false,
  } = options

  if (!input.trim()) return ''
  if (sourceLanguage === targetLanguage) return input

  const autoDetect = sourceLanguage === 'auto'
  const resolvedModel =
    model ?? (autoDetect ? AUTO_SOURCE_MODEL : config.sarvam.translateModel)

  const chunks = chunkText(input)
  const translated: string[] = []

  const request = (chunk: string, source: string, modelName: string) =>
    fetchJson<TranslateResponse>(`${config.sarvam.baseUrl}/translate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        input: chunk,
        source_language_code: toSarvamLanguage(source),
        target_language_code: toSarvamLanguage(targetLanguage),
        model: modelName,
        mode,
        speaker_gender: speakerGender,
        numerals_format: nativeNumerals ? 'native' : 'international',
      }),
      timeoutMs: 25_000,
      label: 'Sarvam translate',
    })

  for (const chunk of chunks) {
    let data: TranslateResponse
    try {
      data = await request(chunk, sourceLanguage, resolvedModel)
    } catch (error) {
      // Auto-detection is best-effort; if the account cannot use it, assume the
      // source is English rather than failing the whole translation.
      if (!autoDetect) throw error
      data = await request(chunk, 'en-IN', config.sarvam.translateModel)
    }
    translated.push(data.translated_text ?? '')
  }

  return translated.join(' ').trim()
}

/* -------------------------------------------------------------------------- */
/*  Transliteration                                                            */
/* -------------------------------------------------------------------------- */

interface TransliterateResponse {
  transliterated_text?: string
}

export async function transliterate(
  input: string,
  targetLanguage: string,
  sourceLanguage = 'en-IN',
): Promise<string> {
  const data = await fetchJson<TransliterateResponse>(
    `${config.sarvam.baseUrl}/transliterate`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        input,
        source_language_code: toSarvamLanguage(sourceLanguage),
        target_language_code: toSarvamLanguage(targetLanguage),
      }),
      timeoutMs: 20_000,
      label: 'Sarvam transliterate',
    },
  )
  return data.transliterated_text ?? input
}

/* -------------------------------------------------------------------------- */
/*  Speech to text                                                             */
/* -------------------------------------------------------------------------- */

interface SttResponse {
  transcript?: string
  language_code?: string
  request_id?: string
}

export interface TranscribeOptions {
  languageCode?: string
  /** `transcribe` keeps the source language; `translate` outputs English. */
  mode?: 'transcribe' | 'translate' | 'verbatim' | 'translit' | 'codemix'
  model?: string
}

export interface TranscriptionResult {
  transcript: string
  languageCode: string
}

export async function transcribe(
  audio: Blob,
  options: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const {
    languageCode = 'unknown',
    mode = 'transcribe',
    model = config.sarvam.sttModel,
  } = options

  if (!config.sarvam.apiKey) {
    throw new SarvamError(
      'Sarvam API key is not configured, so speech recognition is unavailable.',
      503,
    )
  }

  const form = new FormData()
  form.append('file', audio, 'audio.webm')
  form.append('model', model)
  form.append('language_code', toSarvamLanguage(languageCode))
  form.append('mode', mode)

  const res = await withTimeout(
    fetch(`${config.sarvam.baseUrl}/speech-to-text`, {
      method: 'POST',
      headers: { 'api-subscription-key': config.sarvam.apiKey },
      body: form,
    }),
    45_000,
    'Sarvam speech-to-text',
  )

  const text = await res.text()
  if (!res.ok) {
    throw new SarvamError(
      `Speech-to-text failed (${res.status}): ${text.slice(0, 300)}`,
      res.status,
    )
  }

  let data: SttResponse
  try {
    data = JSON.parse(text) as SttResponse
  } catch {
    throw new SarvamError(`Speech-to-text returned non-JSON: ${text.slice(0, 200)}`)
  }

  return {
    transcript: data.transcript ?? '',
    languageCode: fromSarvamLanguage(data.language_code ?? languageCode),
  }
}

/* -------------------------------------------------------------------------- */
/*  Text to speech                                                             */
/* -------------------------------------------------------------------------- */

interface TtsResponse {
  audios?: string[]
  request_id?: string
}

export interface SynthesizeOptions {
  languageCode: string
  speaker?: string
  model?: string
  pace?: number
  pitch?: number
  loudness?: number
}

/** Keep each Bulbul request well under the model's per-request character cap. */
const TTS_CHUNK_LIMIT = 450

export interface SynthesisResult {
  /** Base64 encoded WAV. */
  audio: string
  mimeType: 'audio/wav'
}

export async function synthesize(
  text: string,
  options: SynthesizeOptions,
): Promise<SynthesisResult> {
  const {
    languageCode,
    speaker = config.sarvam.defaultSpeaker,
    model = config.sarvam.ttsModel,
    pace = 1,
    pitch = 0,
    loudness = 1,
  } = options

  if (!config.sarvam.apiKey) {
    throw new SarvamError(
      'Sarvam API key is not configured, so speech synthesis is unavailable.',
      503,
    )
  }

  const clean = text.replace(/[*_#`>]/g, '').trim()
  if (!clean) throw new SarvamError('Nothing to speak.', 400)

  const chunks = chunkText(clean, TTS_CHUNK_LIMIT)
  const audios: string[] = []

  for (const chunk of chunks) {
    const data = await fetchJson<TtsResponse>(
      `${config.sarvam.baseUrl}/text-to-speech`,
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          text: chunk,
          target_language_code: toSarvamLanguage(languageCode),
          speaker,
          model,
          pace,
          pitch,
          loudness,
          speech_sample_rate: 22050,
          enable_preprocessing: true,
        }),
        timeoutMs: 40_000,
        label: 'Sarvam text-to-speech',
      },
    )
    if (data.audios?.length) audios.push(...data.audios)
  }

  if (audios.length === 0) {
    throw new SarvamError('Text-to-speech returned no audio.', 502)
  }

  return { audio: audios.join(''), mimeType: 'audio/wav' }
}
