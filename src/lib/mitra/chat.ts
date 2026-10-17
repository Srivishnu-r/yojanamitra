import type { AgentEvent } from '@/lib/types'

/**
 * Streams one turn of the assistant conversation from `/api/chat`.
 *
 * The endpoint replies with newline-delimited JSON, one `AgentEvent` per line.
 * This helper is shared by the full assistant page and the on-screen companion
 * character so both speak the same protocol.
 */
export interface StreamChatOptions {
  message: string
  language?: string
  onEvent: (event: AgentEvent) => void
  signal?: AbortSignal
}

export async function streamChat({
  message,
  language,
  onEvent,
  signal,
}: StreamChatOptions): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, language }),
    signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`The assistant is unavailable (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        onEvent(JSON.parse(line) as AgentEvent)
      } catch {
        // A malformed/partial line should never break the conversation.
      }
    }
  }
}
