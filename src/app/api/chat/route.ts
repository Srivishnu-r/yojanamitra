import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { AgentEvent } from '@/lib/types'
import { getSession, saveSession } from '@/lib/store'
import { runAgent } from '@/lib/agent/runner'
import { uid } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

interface ChatRequestBody {
  message?: string
  language?: string
  /** Keep the turn out of the persisted transcript (used for previews). */
  ephemeral?: boolean
}

/**
 * Streams the agent's turn as newline-delimited JSON events.
 *
 * Event shapes are defined by the `AgentEvent` union, so the client can render
 * tool activity, profile updates and the answer as they happen.
 */
export async function POST(request: NextRequest) {
  let body: ChatRequestBody
  try {
    body = (await request.json()) as ChatRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = (body.message ?? '').trim()
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const language = body.language ?? 'en-IN'
  const session = await getSession()
  const history = [...session.chat]

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // Client disconnected; nothing useful to do.
        }
      }

      try {
        const { reply, engine } = await runAgent({
          session,
          message,
          language,
          history,
          onEvent: send,
        })

        if (!body.ephemeral) {
          const now = new Date().toISOString()
          session.chat.push({
            id: uid('msg'),
            role: 'user',
            content: message,
            createdAt: now,
            lang: language,
          })
          session.chat.push({
            id: uid('msg'),
            role: 'assistant',
            content: reply,
            createdAt: new Date().toISOString(),
            lang: language,
          })
          // Keep the transcript bounded.
          if (session.chat.length > 60) {
            session.chat = session.chat.slice(-60)
          }
        }

        await saveSession(session)
        console.log(`[chat] answered with ${engine} engine (${session.usage.geminiCalls} gemini calls)`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[chat] failed:', message)
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
