'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Volume2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/context'
import { useSession } from '@/components/SessionProvider'
import { MicButton } from '@/components/Voice'
import { mitra, onMitraCommand, type MitraGesture } from '@/lib/mitra/bus'
import { streamChat } from '@/lib/mitra/chat'

/** Greeting shown the moment the citizen lands, in their chosen language. */
const GREETINGS: Record<string, string> = {
  'en-IN': 'Namaste 🙏 I am Mitra, your YojanaMitra saathi. Tell me about yourself and I will find the schemes you qualify for.',
  'hi-IN': 'नमस्ते 🙏 मैं मित्रा हूँ, आपकी योजनामित्र साथी। अपने बारे में बताइए, मैं आपके लिए योग्य योजनाएँ ढूँढूँगी।',
  'bn-IN': 'নমস্কার 🙏 আমি মিত্রা, আপনার যোজনামিত্র সঙ্গী। নিজের সম্পর্কে বলুন, আমি আপনার যোগ্য প্রকল্প খুঁজে দেব।',
  'mr-IN': 'नमस्कार 🙏 मी मित्रा, तुमची योजनामित्र सोबती. तुमच्याबद्दल सांगा, मी तुमच्यासाठी योग्य योजना शोधेन.',
  'ta-IN': 'வணக்கம் 🙏 நான் மித்ரா, உங்கள் யோஜனாமித்ரா துணைவி. உங்களைப் பற்றி சொல்லுங்கள், தகுதியான திட்டங்களை கண்டுபிடிக்கிறேன்.',
  'te-IN': 'నమస్తే 🙏 నేను మిత్రా, మీ యోజనామిత్ర సహచరి. మీ గురించి చెప్పండి, అర్హత ఉన్న పథకాలు వెతుకుతాను.',
  'kn-IN': 'ನಮಸ್ಕಾರ 🙏 ನಾನು ಮಿತ್ರಾ, ನಿಮ್ಮ ಯೋಜನಾಮಿತ್ರ ಒಡನಾಡಿ. ನಿಮ್ಮ ಬಗ್ಗೆ ಹೇಳಿ, ಅರ್ಹ ಯೋಜನೆಗಳನ್ನು ಹುಡುಕುತ್ತೇನೆ.',
  'ml-IN': 'നമസ്കാരം 🙏 ഞാൻ മിത്ര, നിങ്ങളുടെ യോജനാമിത്ര കൂട്ടുകാരി. നിങ്ങളെക്കുറിച്ച് പറയൂ, അർഹമായ പദ്ധതികൾ കണ്ടെത്താം.',
  'gu-IN': 'નમસ્તે 🙏 હું મિત્રા, તમારી યોજનામિત્ર સાથી. તમારા વિશે કહો, હું યોગ્ય યોજનાઓ શોધીશ.',
  'pa-IN': 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ 🙏 ਮੈਂ ਮਿੱਤਰਾ ਹਾਂ, ਤੁਹਾਡੀ ਯੋਜਨਾਮਿੱਤਰ ਸਾਥਣ। ਆਪਣੇ ਬਾਰੇ ਦੱਸੋ, ਮੈਂ ਯੋਗ ਯੋਜਨਾਵਾਂ ਲੱਭਾਂਗੀ।',
}

/** Agent tool → the UI element Mitra should reach over and point at. */
const TOOL_TARGETS: Record<string, string> = {
  fetch_digilocker_documents: '[data-mitra="digilocker-connect"], [data-mitra="digilocker-panel"]',
  connect_digilocker: '[data-mitra="digilocker-connect"]',
  start_application: '[data-mitra="apply-panel"]',
  autofill_application: '[data-mitra="apply-panel"]',
  submit_application: '[data-mitra="apply-panel"]',
}

interface GhostState {
  x: number
  y: number
  tap: boolean
}

/**
 * Mitra — the on-screen companion.
 *
 * A flat, anime-styled Indian woman drawn entirely in SVG so she can be posed
 * and animated with CSS: she greets every visitor with a namaste, blinks and
 * breathes while idle, talks (lip-sync + optional Sarvam voice), answers via
 * the same agent used by the assistant page, and — when the agent decides a
 * screen action is needed — a transparent hand glides across the page and taps
 * the real button for you.
 */
export default function MitraCompanion() {
  const { lang, translationLive } = useI18n()
  const { refresh } = useSession()

  const [gesture, setGestureState] = useState<MitraGesture>('idle')
  const [talking, setTalking] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [ghost, setGhost] = useState<GhostState | null>(null)
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null)
  const [visible, setVisible] = useState(false)

  const gestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const talkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms)
    timers.current.push(id)
    return id
  }, [])

  const setGesture = useCallback(
    (next: MitraGesture, hold?: number) => {
      setGestureState(next)
      if (gestureTimer.current) clearTimeout(gestureTimer.current)
      if (hold) {
        gestureTimer.current = setTimeout(() => setGestureState('idle'), hold)
      }
    },
    [],
  )

  /* ------------------------------- speech -------------------------------- */

  const animateTalkEstimate = useCallback(
    (text: string) => {
      setTalking(true)
      if (talkTimer.current) clearTimeout(talkTimer.current)
      talkTimer.current = setTimeout(() => setTalking(false), Math.min(9000, text.length * 60))
    },
    [],
  )

  const speak = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean) return

      if (!translationLive) {
        animateTalkEstimate(clean)
        return
      }

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean.slice(0, 700), languageCode: lang }),
        })
        if (!res.ok) {
          animateTalkEstimate(clean)
          return
        }
        const url = URL.createObjectURL(await res.blob())
        const audio = new Audio(url)
        audioRef.current = audio
        setTalking(true)
        audio.onended = () => {
          setTalking(false)
          audioRef.current = null
          URL.revokeObjectURL(url)
        }
        await audio.play()
      } catch {
        animateTalkEstimate(clean)
      }
    },
    [animateTalkEstimate, lang, translationLive],
  )

  const say = useCallback(
    (text: string, options: { speak?: boolean; gesture?: MitraGesture; hold?: number } = {}) => {
      setBubble(text)
      if (options.gesture) setGesture(options.gesture, options.hold ?? 1800)
      if (options.speak) void speak(text)
    },
    [setGesture, speak],
  )

  /* --------------------------- reach & click ----------------------------- */

  const pointAt = useCallback(
    (selector: string, options: { click?: boolean; text?: string } = {}) => {
      if (typeof document === 'undefined') return
      const el = document.querySelector<HTMLElement>(selector)

      if (!el) {
        setGesture('point', 1500)
        if (options.text) say(options.text, { gesture: 'point' })
        return
      }

      setGesture('point', 2400)
      if (options.text) say(options.text, { gesture: 'point', hold: 2400 })

      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })

      later(() => {
        const rect = el.getBoundingClientRect()
        const to = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        const from = { x: window.innerWidth - 120, y: window.innerHeight - 96 }

        setGhost({ x: from.x, y: from.y, tap: false })
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setGhost({ x: to.x, y: to.y, tap: false })),
        )

        later(() => {
          setGhost((g) => (g ? { ...g, tap: true } : g))
          setRipple(to)
          el.classList.add('mitra-attention')
          if (options.click) {
            try {
              el.click()
            } catch {
              /* element may be disabled — pointing was still useful */
            }
          }
        }, 720)

        later(() => {
          el.classList.remove('mitra-attention')
          setGhost(null)
          setRipple(null)
        }, 1500)
      }, 340)
    },
    [later, say, setGesture],
  )

  /* ------------------------------- chat ---------------------------------- */

  const ask = useCallback(
    async (raw: string) => {
      const message = raw.trim()
      if (!message || busy) return

      setInput('')
      setBusy(true)
      setStatus(null)
      setPanelOpen(true)
      setBubble('…')
      setGesture('think', 0)

      let full = ''
      const schemeIds: string[] = []

      try {
        await streamChat({
          message,
          language: lang,
          onEvent: (event) => {
            switch (event.type) {
              case 'status':
                setStatus(event.message)
                break
              case 'tool': {
                setGesture('think', 0)
                const target = TOOL_TARGETS[event.name]
                if (target) pointAt(target)
                break
              }
              case 'text':
                full += event.delta
                setBubble(full)
                setStatus(null)
                setTalking(true)
                break
              case 'schemes':
                schemeIds.push(...event.schemes)
                break
              case 'application':
                setGesture('celebrate', 2200)
                void refresh()
                break
              case 'profile':
                void refresh()
                break
              case 'error':
                setStatus(event.message)
                break
              case 'done':
                break
            }
          },
        })
      } catch (error) {
        setBubble(
          error instanceof Error
            ? `Sorry — ${error.message}`
            : 'Sorry, I could not reach the assistant just now.',
        )
      } finally {
        setTalking(false)
        setBusy(false)
        setStatus(null)
        setGesture('idle')

        if (!full.trim()) {
          setBubble('I did not catch that. Try telling me your state, age, work and yearly income.')
        } else {
          void speak(full)
        }

        if (schemeIds.length > 0) {
          later(() => pointAt(`[data-mitra-scheme="${schemeIds[0]}"]`), 260)
        }
      }
    },
    [busy, lang, later, pointAt, refresh, setGesture, speak],
  )

  /* ------------------------------ effects -------------------------------- */

  // Subscribe to the global action bus.
  useEffect(() => {
    const off = onMitraCommand((command) => {
      switch (command.kind) {
        case 'say':
          say(command.text, {
            speak: command.speak,
            gesture: command.gesture,
            hold: command.ttl,
          })
          break
        case 'gesture':
          setGesture(command.gesture, command.hold ?? 1800)
          break
        case 'point':
          pointAt(command.target, { click: command.click, text: command.text })
          break
        case 'open':
          setPanelOpen(true)
          break
        case 'close':
          setPanelOpen(false)
          break
      }
    })
    return off
  }, [say, setGesture, pointAt])

  // Expose the bus for quick console demos: `mitra.say('hello')`.
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as unknown as { mitra: typeof mitra }).mitra = mitra
    return () => {
      delete (window as unknown as { mitra?: typeof mitra }).mitra
    }
  }, [])

  // Let any element opt into opening the chat: <button data-mitra-open>.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest('[data-mitra-open]')
      if (target) setPanelOpen(true)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // Entrance + the namaste greeting, once per full page load.
  useEffect(() => {
    const appear = later(() => {
      setVisible(true)
      setGesture('namaste', 2800)
      say(GREETINGS[lang] ?? GREETINGS['en-IN'], { speak: true, hold: 2800 })
    }, 900)

    return () => clearTimeout(appear)
  }, [lang, later, say, setGesture])

  // Tidy up timers and audio on unmount.
  useEffect(() => {
    const pending = timers
    return () => {
      for (const id of pending.current) clearTimeout(id)
      if (gestureTimer.current) clearTimeout(gestureTimer.current)
      if (talkTimer.current) clearTimeout(talkTimer.current)
      audioRef.current?.pause()
    }
  }, [])

  return (
    <>
      <div
        className={cn('mitra', visible && 'mitra-visible')}
        data-gesture={gesture}
        data-talking={talking}
        data-open={panelOpen}
      >
        {bubble ? (
          <div className="mitra-bubble" role="status" aria-live="polite">
            <button
              type="button"
              className="mitra-bubble-x"
              aria-label="Dismiss"
              onClick={() => setBubble(null)}
            >
              <X size={13} />
            </button>
            <p className="mitra-bubble-text">
              {bubble}
              {busy ? <span className="mitra-typing">▍</span> : null}
            </p>
            {status ? <p className="mitra-bubble-status">{status}…</p> : null}
            {translationLive ? (
              <button
                type="button"
                className="mitra-bubble-speak"
                onClick={() => speak(bubble)}
                title="Read aloud"
              >
                <Volume2 size={12} /> listen
              </button>
            ) : null}
          </div>
        ) : null}

        {panelOpen ? (
          <form
            className="mitra-panel"
            onSubmit={(event) => {
              event.preventDefault()
              void ask(input)
            }}
          >
            <input
              className="mitra-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={busy ? 'Mitra is thinking…' : 'Ask Mitra anything…'}
              aria-label="Ask Mitra"
              autoComplete="off"
            />
            <MicButton
              onTranscript={(text) => void ask(text)}
              onError={(message) => message && setStatus(message)}
              disabled={busy}
            />
            <button
              type="submit"
              className="mitra-send"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </form>
        ) : null}

        <button
          type="button"
          className="mitra-stage"
          onClick={() => setPanelOpen((open) => !open)}
          aria-label={panelOpen ? 'Close Mitra chat' : 'Talk to Mitra'}
          title="Mitra — your scheme saathi"
        >
          <MitraFigure />
          <span className="mitra-shadow" aria-hidden />
        </button>
      </div>

      {ghost ? (
        <div
          className="mitra-ghost"
          data-tap={ghost.tap}
          style={{ transform: `translate3d(${ghost.x}px, ${ghost.y}px, 0)` }}
          aria-hidden
        >
          <GhostHand />
        </div>
      ) : null}

      {ripple ? (
        <span
          className="mitra-ripple"
          style={{ left: ripple.x, top: ripple.y }}
          aria-hidden
        />
      ) : null}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Artwork                                                                    */
/* -------------------------------------------------------------------------- */

function MitraFigure() {
  return (
    <svg
      className="mitra-svg"
      viewBox="0 0 220 340"
      role="img"
      aria-label="Mitra"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mitra-skin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2c69e" />
          <stop offset="1" stopColor="#e0a878" />
        </linearGradient>
        <linearGradient id="mitra-saree" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#d62b7e" />
          <stop offset="1" stopColor="#a81d5c" />
        </linearGradient>
        <linearGradient id="mitra-blouse" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f8f7c" />
          <stop offset="1" stopColor="#146b5d" />
        </linearGradient>
        <linearGradient id="mitra-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#33243a" />
          <stop offset="1" stopColor="#1b121f" />
        </linearGradient>
        <radialGradient id="mitra-cheek" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f2849a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f2849a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* hair behind the body */}
      <path
        className="mitra-hair-back"
        d="M110 26 C56 26 42 74 44 126 C46 182 40 252 54 310 L166 310 C180 252 174 182 176 126 C178 74 164 26 110 26 Z"
        fill="url(#mitra-hair)"
      />

      <g className="mitra-body-wrap">
        {/* torso: blouse + draped saree pallu */}
        <path
          className="mitra-torso"
          d="M40 340 L46 252 Q50 198 84 182 L96 174 L124 174 L136 182 Q170 198 174 252 L180 340 Z"
          fill="url(#mitra-blouse)"
        />
        <path
          className="mitra-pallu"
          d="M84 182 Q62 236 64 340 L120 340 Q108 250 112 194 Z"
          fill="url(#mitra-saree)"
        />
        <path
          className="mitra-pallu-trim"
          d="M84 182 Q62 236 64 340"
          fill="none"
          stroke="#f0b429"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          className="mitra-necklace"
          d="M86 186 Q110 204 134 186"
          fill="none"
          stroke="#f4c23c"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="110" cy="196" r="3.2" fill="#f4c23c" />

        {/* arms — rotated at the shoulder for the gestures */}
        <g className="mitra-arm mitra-arm-r">
          <path
            d="M66 196 Q54 232 62 258"
            fill="none"
            stroke="url(#mitra-skin)"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <ellipse cx="62" cy="262" rx="11" ry="12.5" fill="url(#mitra-skin)" />
          <path
            d="M52 246 Q62 250 72 246"
            fill="none"
            stroke="#f4c23c"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
        <g className="mitra-arm mitra-arm-l">
          <path
            d="M154 196 Q166 232 158 258"
            fill="none"
            stroke="url(#mitra-skin)"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <ellipse cx="158" cy="262" rx="11" ry="12.5" fill="url(#mitra-skin)" />
          <path
            d="M148 246 Q158 250 168 246"
            fill="none"
            stroke="#f4c23c"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* neck */}
        <path d="M96 138 L124 138 L124 172 Q110 180 96 172 Z" fill="#d99f72" />

        {/* head */}
        <g className="mitra-head">
          <ellipse cx="66" cy="104" rx="8" ry="11" fill="url(#mitra-skin)" />
          <ellipse cx="154" cy="104" rx="8" ry="11" fill="url(#mitra-skin)" />
          <ellipse cx="110" cy="98" rx="44" ry="50" fill="url(#mitra-skin)" />

          {/* hair: bangs + side locks */}
          <path
            className="mitra-hair-front"
            d="M62 98 Q60 40 110 40 Q160 40 158 98 Q150 72 132 64 Q122 80 110 64 Q98 80 88 64 Q70 72 62 98 Z"
            fill="url(#mitra-hair)"
          />
          <path
            className="mitra-lock"
            d="M62 94 Q50 150 60 214 Q68 158 72 108 Z"
            fill="url(#mitra-hair)"
          />
          <path
            className="mitra-lock"
            d="M158 94 Q170 150 160 214 Q152 158 148 108 Z"
            fill="url(#mitra-hair)"
          />

          {/* bindi */}
          <path d="M110 70 Q114 78 110 82 Q106 78 110 70 Z" fill="#d81b60" />

          {/* blush */}
          <ellipse cx="82" cy="116" rx="11" ry="7" fill="url(#mitra-cheek)" />
          <ellipse cx="138" cy="116" rx="11" ry="7" fill="url(#mitra-cheek)" />

          {/* brows */}
          <path d="M78 86 Q90 80 100 86" fill="none" stroke="#3a2b3d" strokeWidth="2.8" strokeLinecap="round" />
          <path d="M120 86 Q130 80 142 86" fill="none" stroke="#3a2b3d" strokeWidth="2.8" strokeLinecap="round" />

          {/* eyes */}
          <g className="mitra-eye">
            <ellipse cx="90" cy="106" rx="10.5" ry="12.5" fill="#ffffff" />
            <ellipse cx="90" cy="108" rx="7.6" ry="9.4" fill="#6b4326" />
            <ellipse cx="90" cy="109" rx="3.6" ry="4.6" fill="#2a1b12" />
            <circle cx="86.5" cy="102" r="2.7" fill="#ffffff" />
            <circle cx="93" cy="113" r="1.4" fill="#ffffff" opacity="0.85" />
            <path d="M79 98 Q90 90.5 101 98" fill="none" stroke="#241a2b" strokeWidth="3.4" strokeLinecap="round" />
          </g>
          <g className="mitra-eye">
            <ellipse cx="130" cy="106" rx="10.5" ry="12.5" fill="#ffffff" />
            <ellipse cx="130" cy="108" rx="7.6" ry="9.4" fill="#6b4326" />
            <ellipse cx="130" cy="109" rx="3.6" ry="4.6" fill="#2a1b12" />
            <circle cx="126.5" cy="102" r="2.7" fill="#ffffff" />
            <circle cx="133" cy="113" r="1.4" fill="#ffffff" opacity="0.85" />
            <path d="M119 98 Q130 90.5 141 98" fill="none" stroke="#241a2b" strokeWidth="3.4" strokeLinecap="round" />
          </g>

          {/* nose */}
          <path d="M110 116 Q106.5 121 111 122.5" fill="none" stroke="#cf9166" strokeWidth="2" strokeLinecap="round" />

          {/* mouth — a smile, plus an open shape used for lip-sync */}
          <path
            className="mitra-mouth-smile"
            d="M100 131 Q110 139 120 131"
            fill="none"
            stroke="#c14953"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse className="mitra-mouth-open" cx="110" cy="133" rx="6" ry="3.4" fill="#8a2f3a" />

          {/* jhumka earrings */}
          <g className="mitra-earring">
            <circle cx="66" cy="112" r="3" fill="#f4c23c" />
            <path d="M60 116 Q66 128 72 116 Z" fill="#f4c23c" />
            <circle cx="63" cy="130" r="1.6" fill="#f4c23c" />
            <circle cx="66" cy="132" r="1.6" fill="#f4c23c" />
            <circle cx="69" cy="130" r="1.6" fill="#f4c23c" />
          </g>
          <g className="mitra-earring">
            <circle cx="154" cy="112" r="3" fill="#f4c23c" />
            <path d="M148 116 Q154 128 160 116 Z" fill="#f4c23c" />
            <circle cx="151" cy="130" r="1.6" fill="#f4c23c" />
            <circle cx="154" cy="132" r="1.6" fill="#f4c23c" />
            <circle cx="157" cy="130" r="1.6" fill="#f4c23c" />
          </g>
        </g>
      </g>
    </svg>
  )
}

function GhostHand() {
  return (
    <svg className="mitra-ghost-hand" viewBox="0 0 40 44" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <path
        d="M13 26 V10 a3.4 3.4 0 0 1 6.8 0 v9 M19.8 19 V6.4 a3.3 3.3 0 0 1 6.6 0 V19 M26.4 19.5 v-8 a3.2 3.2 0 0 1 6.4 0 V27 c0 9-6 15-14 15 -6.5 0-10-3.5-12.6-8.4 -1.4-2.7-2.5-4.6-3.4-6 -1-1.6-0.3-4.4 2.1-4.4 1.4 0 2.6 0.8 3.4 2.1 z"
        fill="#edb98d"
        stroke="#c98f64"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
