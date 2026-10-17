import { config, isLive } from '@/lib/config'
import { fetchJson } from '@/lib/utils'

/**
 * Google Gemini client (free tier friendly).
 *
 * Uses the plain REST surface so there is no SDK dependency:
 *   POST {base}/models/{model}:generateContent
 *
 * Models are tried in order — the configured model, then the fallbacks — so a
 * retired or unavailable model degrades to the next one instead of failing the
 * whole request.
 */

export class GeminiError extends Error {
  readonly status: number
  readonly live: boolean

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
    this.live = isLive('gemini')
  }
}

export function geminiLive(): boolean {
  return isLive('gemini')
}

export interface TextPart {
  text: string
}

export interface FunctionCallPart {
  functionCall: { name: string; args: Record<string, unknown> }
}

export interface FunctionResponsePart {
  functionResponse: { name: string; response: Record<string, unknown> }
}

export type Part = TextPart | FunctionCallPart | FunctionResponsePart

export interface Content {
  role: 'user' | 'model'
  parts: Part[]
}

export interface FunctionDeclaration {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface GenerateOptions {
  systemInstruction?: string
  contents: Content[]
  tools?: FunctionDeclaration[]
  temperature?: number
  maxOutputTokens?: number
  /** Disable the model's tool access for a structured single-shot reply. */
  responseMimeType?: 'text/plain' | 'application/json'
  signal?: AbortSignal
}

interface GeminiCandidate {
  content?: { parts?: Part[]; role?: string }
  finishReason?: string
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; code?: number; status?: string }
}

export interface GenerateResult {
  parts: Part[]
  text: string
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>
  model: string
  finishReason?: string
}

function modelChain(): string[] {
  return [config.gemini.model, ...config.gemini.fallbackModels].filter(
    (m, i, arr) => Boolean(m) && arr.indexOf(m) === i,
  )
}

function buildBody(options: GenerateOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents: options.contents,
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      maxOutputTokens: options.maxOutputTokens ?? 2048,
      ...(options.responseMimeType
        ? { responseMimeType: options.responseMimeType }
        : {}),
    },
  }

  if (options.systemInstruction) {
    body.systemInstruction = { parts: [{ text: options.systemInstruction }] }
  }

  if (options.tools && options.tools.length > 0) {
    body.tools = [{ functionDeclarations: options.tools }]
  }

  return body
}

function isModelUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /\b404\b/.test(message) ||
    /not found/i.test(message) ||
    /is not supported/i.test(message) ||
    /unsupported model/i.test(message)
  )
}

/**
 * Runs a single generateContent turn, walking the model chain if the primary
 * model is unavailable.
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  if (!config.gemini.apiKey) {
    throw new GeminiError(
      'GEMINI_API_KEY is not set. Add it to .env.local to enable the AI assistant.',
      503,
    )
  }

  const body = buildBody(options)
  let lastError: unknown

  for (const model of modelChain()) {
    const url = `${config.gemini.baseUrl}/models/${encodeURIComponent(model)}:generateContent`
    try {
      const data = await fetchJson<GeminiResponse>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.gemini.apiKey,
        },
        body: JSON.stringify(body),
        timeoutMs: 60_000,
        label: `Gemini ${model}`,
        signal: options.signal,
      })

      if (data.error?.message) {
        throw new GeminiError(`Gemini returned an error: ${data.error.message}`)
      }

      if (data.promptFeedback?.blockReason) {
        throw new GeminiError(
          `Gemini blocked the request (${data.promptFeedback.blockReason}).`,
        )
      }

      const candidate = data.candidates?.[0]
      const parts = candidate?.content?.parts ?? []
      const functionCalls = parts
        .filter((p): p is FunctionCallPart => 'functionCall' in p)
        .map((p) => ({
          name: p.functionCall.name,
          args: p.functionCall.args ?? {},
        }))
      const text = parts
        .filter((p): p is TextPart => 'text' in p)
        .map((p) => p.text)
        .join('')

      return { parts, text, functionCalls, model, finishReason: candidate?.finishReason }
    } catch (error) {
      lastError = error
      if (isModelUnavailable(error)) {
        console.warn(`[gemini] model ${model} unavailable, trying next`)
        continue
      }
      throw error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new GeminiError('All configured Gemini models were unavailable.')
}

/** Convenience wrapper for a single-shot text completion. */
export async function generateText(
  prompt: string,
  systemInstruction?: string,
  options: Omit<GenerateOptions, 'contents' | 'systemInstruction'> = {},
): Promise<{ text: string; model: string }> {
  const result = await generate({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction,
    ...options,
  })
  return { text: result.text, model: result.model }
}
