'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot,
  Send,
  Sparkles,
  User,
  CheckCircle2,
  Loader2,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import type { AgentEvent, Application, ChatMessage, UserProfile } from '@/lib/types'
import { useI18n } from '@/lib/i18n/context'
import { useSession } from '@/components/SessionProvider'
import { SpeakButton, MicButton } from '@/components/Voice'
import DigiLockerPanel from '@/components/DigiLockerPanel'
import { FIELD_LABELS } from '@/lib/eligibility'
import { titleCase } from '@/lib/utils'

interface TraceItem {
  id: string
  label: string
  ok?: boolean
  summary?: string
}

interface Turn {
  id: string
  role: 'user' | 'assistant'
  content: string
  trace?: TraceItem[]
  schemes?: string[]
  reading: boolean
}

const SUGGESTIONS = [
  'I am a 34 year old woman farmer in Bihar with an annual income of ₹1.5 lakh',
  'मेरे पिता 65 वर्ष के हैं, उनके लिए पेंशन योजना बताइए',
  'I run a small tailoring shop and need a business loan',
  'My daughter is in Class 10 — which scholarships can she get?',
  'நான் ஒரு மாணவர், கல்வி உதவித்தொகை வேண்டும்',
]

export default function Assistant() {
  const { lang, t } = useI18n()
  const { session, refresh } = useSession()

  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusLine, setStatusLine] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seeded, setSeeded] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Seed the transcript from the persisted session once.
  useEffect(() => {
    if (seeded || !session) return
    const history: Turn[] = (session.chat as ChatMessage[]).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      reading: false,
    }))
    setTurns(history)
    setSeeded(true)
  }, [session, seeded])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [])

  useEffect(scrollToBottom, [turns, scrollToBottom])

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim()
      if (!message || busy) return

      setError(null)
      setInput('')
      setBusy(true)

      const userTurn: Turn = {
        id: `u_${Date.now()}`,
        role: 'user',
        content: message,
        reading: false,
      }
      const aiTurn: Turn = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        content: '',
        trace: [],
        reading: true,
      }

      setTurns((prev) => [...prev, userTurn, aiTurn])
      scrollToBottom()

      const patchAi = (patch: (turn: Turn) => Turn) =>
        setTurns((prev) => prev.map((turn) => (turn.id === aiTurn.id ? patch(turn) : turn)))

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, language: lang }),
        })

        if (!res.ok || !res.body) {
          throw new Error(`The assistant is unavailable (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.trim()) continue
            let event: AgentEvent
            try {
              event = JSON.parse(line) as AgentEvent
            } catch {
              continue
            }
            handleEvent(event, patchAi)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        patchAi((turn) => ({ ...turn, reading: false }))
        setStatusLine(null)
        setBusy(false)
        void refresh()
      }

      function handleEvent(event: AgentEvent, patch: (fn: (turn: Turn) => Turn) => void) {
        switch (event.type) {
          case 'status':
            setStatusLine(event.message)
            break

          case 'tool':
            patch((turn) => ({
              ...turn,
              trace: [
                ...(turn.trace ?? []),
                { id: event.id, label: event.label },
              ],
            }))
            break

          case 'tool_result':
            patch((turn) => ({
              ...turn,
              trace: (turn.trace ?? []).map((item) =>
                item.id === event.id
                  ? { ...item, ok: event.ok, summary: event.summary }
                  : item,
              ),
            }))
            break

          case 'text':
            patch((turn) => ({ ...turn, content: turn.content + event.delta }))
            scrollToBottom()
            break

          case 'schemes':
            patch((turn) => ({
              ...turn,
              schemes: Array.from(new Set([...(turn.schemes ?? []), ...event.schemes])),
            }))
            break

          case 'profile':
          case 'application':
            void refresh()
            break

          case 'error':
            setError(event.message)
            break

          case 'done':
            setStatusLine(null)
            break
        }
      }
    },
    [busy, lang, refresh, scrollToBottom],
  )

  async function resetChat() {
    await fetch('/api/session', { method: 'DELETE' })
    setTurns([])
    await refresh()
  }

  const profile = session?.profile ?? {}
  const profileEntries = (Object.keys(profile) as Array<keyof UserProfile>).filter(
    (key) => profile[key] !== undefined && profile[key] !== '',
  )

  return (
    <div className="page" style={{ paddingTop: 26 }}>
      <div className="container">
        <div className="chat-shell">
          {/* ------------------------------ chat ------------------------------ */}
          <div className="chat-panel">
            <div className="chat-head">
              <span className="brand-mark" style={{ width: 32, height: 32 }}>
                <Bot size={17} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="strong" style={{ fontSize: 14.5 }}>
                  YojanaMitra Assistant
                </div>
                <div className="tiny muted">
                  {busy
                    ? `${t('assistant.thinking')}…`
                    : session?.capabilities.gemini.live
                      ? `Reasoning with ${String(session.capabilities.gemini.model)}`
                      : 'Built-in reasoning engine'}
                </div>
              </div>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={resetChat}
                disabled={busy || turns.length === 0}
                title="Clear this conversation and profile"
              >
                <RefreshCw size={14} /> Reset
              </button>
            </div>

            <div className="chat-scroll" ref={scrollRef}>
              {turns.length === 0 ? (
                <div style={{ margin: 'auto 0' }}>
                  <div className="empty" style={{ paddingBottom: 12 }}>
                    <span className="brand-mark" style={{ margin: '0 auto 14px', width: 44, height: 44 }}>
                      <Sparkles size={22} />
                    </span>
                    <h2 style={{ fontSize: 20, marginBottom: 8 }}>
                      Namaste 🙏 Let&apos;s find your schemes
                    </h2>
                    <p className="small" style={{ maxWidth: 460, margin: '0 auto' }}>
                      Tell me about yourself — your state, age, work and yearly family
                      income. Speak or type, in any language. I will check every central
                      and state scheme for you.
                    </p>
                  </div>
                </div>
              ) : null}

              {turns.map((turn) => (
                <div
                  key={turn.id}
                  className={turn.role === 'user' ? 'msg msg-user' : 'msg msg-ai'}
                >
                  <div className="row" style={{ gap: 7, marginBottom: turn.content ? 6 : 0 }}>
                    {turn.role === 'user' ? <User size={13} /> : <Bot size={13} />}
                    <span className="tiny" style={{ opacity: 0.75, fontWeight: 600 }}>
                      {turn.role === 'user' ? 'You' : 'YojanaMitra'}
                    </span>
                  </div>

                  {turn.content ? <span>{turn.content}</span> : null}

                  {turn.reading && !turn.content ? (
                    <span className="row small muted" style={{ gap: 8 }}>
                      <Loader2 size={14} className="spinner-dark" />
                      {statusLine ?? `${t('assistant.thinking')}…`}
                    </span>
                  ) : null}

                  {turn.schemes && turn.schemes.length > 0 ? (
                    <div className="row row-wrap" style={{ gap: 6, marginTop: 10 }}>
                      {turn.schemes.slice(0, 6).map((id) => (
                        <a
                          key={id}
                          className="badge badge-saffron"
                          href={`/schemes/${id}`}
                          data-mitra-scheme={id}
                        >
                          {id.replace(/-/g, ' ')}
                          <ChevronRight size={10} />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {turn.role === 'assistant' && turn.content && !turn.reading ? (
                    <div className="row" style={{ gap: 8, marginTop: 10 }}>
                      <SpeakButton text={turn.content} compact />
                    </div>
                  ) : null}
                </div>
              ))}

              {/* tool activity for the in-flight turn, shown under the last message */}
              {(() => {
                const active = [...turns].reverse().find((turn) => turn.reading)
                if (!active?.trace?.length) return null
                return (
                  <div className="tool-trace">
                    <div className="tiny muted" style={{ marginBottom: 4, fontWeight: 700 }}>
                      AGENT ACTIVITY
                    </div>
                    {active.trace.map((item) => (
                      <div className={`tool-trace-item ${item.ok ? 'done' : ''}`} key={item.id}>
                        {item.ok === undefined ? (
                          <Loader2 size={12} className="spinner spinner-dark" />
                        ) : item.ok ? (
                          <CheckCircle2 size={12} style={{ color: 'var(--green)' }} />
                        ) : (
                          <AlertTriangle size={12} style={{ color: 'var(--warn)' }} />
                        )}
                        <span>
                          {item.label}
                          {item.summary ? <span className="muted"> — {item.summary}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {turns.length === 0 ? (
              <div className="suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="chip"
                    onClick={() => void send(suggestion)}
                  >
                    {suggestion.length > 54 ? `${suggestion.slice(0, 52)}…` : suggestion}
                  </button>
                ))}
              </div>
            ) : null}

            {error ? (
              <div style={{ padding: '0 16px 12px' }}>
                <div className="notice notice-danger">
                  <AlertTriangle size={15} style={{ flex: 'none', marginTop: 2 }} />
                  <span>{error}</span>
                </div>
              </div>
            ) : null}

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault()
                void send(input)
              }}
            >
              <MicButton
                onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
                onError={(message) => setError(message || null)}
                disabled={busy}
              />
              <textarea
                className="textarea"
                placeholder={t('assistant.placeholder')}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send(input)
                  }
                }}
                rows={1}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !input.trim()}
                style={{ height: 42, borderRadius: 'var(--r)' }}
              >
                {busy ? <Loader2 size={16} className="spinner" /> : <Send size={16} />}
                <span className="visually-hidden">{t('assistant.send')}</span>
              </button>
            </form>
          </div>

          {/* ---------------------------- side panel --------------------------- */}
          <aside className="side-panel">
            <div className="card">
              <div className="card-head">
                <span className="card-title" style={{ fontSize: 15 }}>
                  Your profile
                </span>
                <span className="badge">{profileEntries.length} details</span>
              </div>
              <div className="card-body" style={{ paddingTop: 14 }}>
                {profileEntries.length === 0 ? (
                  <p className="small muted">
                    Nothing on record yet. Tell the assistant about yourself and it will
                    fill this in automatically.
                  </p>
                ) : (
                  <div>
                    {profileEntries.map((key) => (
                      <div className="kv" key={String(key)}>
                        <span className="kv-key">{FIELD_LABELS[key as never] ?? titleCase(String(key))}</span>
                        <span className="kv-val">
                          {typeof profile[key] === 'boolean'
                            ? profile[key]
                              ? 'Yes'
                              : 'No'
                            : titleCase(String(profile[key]))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <a
                  href="/eligibility"
                  className="btn btn-outline btn-sm btn-block"
                  style={{ marginTop: 14 }}
                >
                  Edit answers manually
                </a>
              </div>
            </div>

            <DigiLockerPanel compact />

            {session && session.applications.length > 0 ? (
              <div className="card">
                <div className="card-head">
                  <span className="card-title" style={{ fontSize: 15 }}>
                    Applications
                  </span>
                  <span className="badge">{session.applications.length}</span>
                </div>
                <div className="card-body" style={{ paddingTop: 14 }}>
                  <div className="stack stack-sm">
                    {session.applications.slice(-4).map((application: Application) => (
                      <div key={application.id}>
                        <div className="strong" style={{ fontSize: 13.5 }}>
                          {application.schemeName}
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 4 }}>
                          <span
                            className={
                              application.status === 'submitted' ||
                              application.status === 'under_review'
                                ? 'badge badge-blue'
                                : application.status === 'ready'
                                  ? 'badge badge-green'
                                  : 'badge badge-amber'
                            }
                          >
                            {titleCase(application.status)}
                          </span>
                          {application.referenceNo ? (
                            <span className="tiny muted mono">{application.referenceNo}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  <a
                    href="/dashboard"
                    className="btn btn-outline btn-sm btn-block"
                    style={{ marginTop: 14 }}
                  >
                    Open dashboard
                  </a>
                </div>
              </div>
            ) : null}

            <div className="card card-pad">
              <div className="tiny muted" style={{ lineHeight: 1.7 }}>
                <strong>Privacy.</strong> Your profile and documents are stored only in
                your session on this server. Documents are read from DigiLocker only
                after you consent, and nothing is ever submitted without your explicit
                confirmation.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
