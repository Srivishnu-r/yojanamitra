'use client'

import { useState } from 'react'
import { useRef } from 'react'
import { Loader2, Mic, Square, Volume2, Languages } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/context'
import { getLanguage } from '@/lib/data/languages'

/**
 * Text to speech through Sarvam Bulbul.
 * Renders nothing useful when the language has no voice, and explains itself
 * when Sarvam is not configured.
 */
export function SpeakButton({
  text,
  label,
  className,
  compact = false,
}: {
  text: string
  label?: string
  className?: string
  compact?: boolean
}) {
  const { lang, t, translationLive } = useI18n()
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [detail, setDetail] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  async function speak() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
      setState('idle')
      return
    }

    setState('loading')
    setDetail(null)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 900), languageCode: lang }),
      })

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Speech failed (${res.status})`)
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setState('idle')
        URL.revokeObjectURL(url)
        audioRef.current = null
      }
      await audio.play()
      setState('idle')
    } catch (err) {
      setState('error')
      setDetail(err instanceof Error ? err.message : String(err))
    }
  }

  // Hide the button when Sarvam is off, or when Bulbul has no voice for the
  // selected language, so the UI never offers speech the model cannot produce.
  if (!translationLive || !getLanguage(lang).tts) return null

  return (
    <span className={cn('row', className)} style={{ gap: 8 }}>
      <button
        type="button"
        className={cn('btn btn-outline btn-sm', compact && 'btn-sm')}
        onClick={speak}
        disabled={state === 'loading'}
        title={detail ?? t('voice.speak')}
      >
        {state === 'loading' ? (
          <Loader2 size={14} className="spinner-dark" />
        ) : (
          <Volume2 size={14} />
        )}
        {!compact && (label ?? t('voice.speak'))}
      </button>
      {detail ? <span className="tiny muted">{detail}</span> : null}
    </span>
  )
}

/**
 * Speech to text through Sarvam Saaras.
 * Records the microphone to webm and hands the transcript to the caller.
 */
export function MicButton({
  onTranscript,
  onError,
  className,
  disabled = false,
}: {
  onTranscript: (text: string, languageCode?: string) => void
  onError?: (message: string) => void
  className?: string
  disabled?: boolean
}) {
  const { lang, t, translationLive } = useI18n()
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  async function start() {
    if (!translationLive) {
      onError?.('Voice input needs SARVAM_API_KEY. Add it to .env.local to enable speech recognition.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : undefined,
      })
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })

        if (blob.size < 1200) {
          setBusy(false)
          onError?.('That was too short to hear. Please try again.')
          return
        }

        setBusy(true)
        try {
          const form = new FormData()
          form.append('file', blob, 'recording.webm')
          form.append('languageCode', lang)
          form.append('mode', 'transcribe')

          const res = await fetch('/api/stt', { method: 'POST', body: form })
          const data = (await res.json().catch(() => ({}))) as {
            transcript?: string
            languageCode?: string
            error?: string
            detail?: string
          }
          if (!res.ok) {
            throw new Error(data.error ?? data.detail ?? `Transcription failed (${res.status})`)
          }
          const transcript = (data.transcript ?? '').trim()
          if (transcript) onTranscript(transcript, data.languageCode)
          else onError?.('I could not make out any words. Please try again.')
        } catch (err) {
          onError?.(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }

      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
      onError?.('')
    } catch {
      onError?.('Microphone permission was denied. Allow access and try again.')
    }
  }

  function stop() {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  return (
    <button
      type="button"
      className={cn('icon-btn', recording && 'recording', className)}
      onClick={recording ? stop : start}
      disabled={disabled || busy}
      title={recording ? t('voice.listening') : 'Speak your question'}
      aria-label={recording ? 'Stop recording' : 'Start voice input'}
    >
      {busy ? (
        <Loader2 size={17} className="spinner-dark" />
      ) : recording ? (
        <Square size={15} />
      ) : (
        <Mic size={17} />
      )}
    </button>
  )
}

/**
 * Renders text in the selected language, translating on demand.
 * Used for scheme summaries and AI answers.
 */
export function TranslatableText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const { lang, translate, translationLive } = useI18n()
  const [shown, setShown] = useState(text)
  const [translated, setTranslated] = useState(false)
  const [busy, setBusy] = useState(false)

  const needsTranslation = translationLive && lang !== 'en-IN'

  async function toggle() {
    if (busy) return
    if (translated) {
      setShown(text)
      setTranslated(false)
      return
    }
    setBusy(true)
    const result = await translate(text)
    setShown(result)
    setTranslated(result !== text)
    setBusy(false)
  }

  return (
    <span className={className}>
      {shown}
      {needsTranslation ? (
        <>
          {' '}
          <button
            type="button"
            onClick={toggle}
            className="tiny"
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--saffron-dark)',
              cursor: 'pointer',
              padding: 0,
              fontWeight: 600,
            }}
          >
            {busy ? '…' : translated ? 'show original' : (
              <span className="row" style={{ gap: 3, display: 'inline-flex' }}>
                <Languages size={11} /> translate
              </span>
            )}
          </button>
        </>
      ) : null}
    </span>
  )
}
