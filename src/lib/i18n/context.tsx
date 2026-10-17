'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { phrase, type UIKey } from '@/lib/i18n/strings'
import { LANGUAGES, getLanguage } from '@/lib/data/languages'

interface I18nValue {
  lang: string
  setLang: (code: string) => void
  t: (key: UIKey) => string
  /** Language name in its own script. */
  langName: string
  isRtl: boolean
  /**
   * Translates dynamic text (scheme summaries, AI answers) via Sarvam.
   * Falls back to the original text when Sarvam is not configured, and caches
   * results so repeated views cost nothing.
   */
  translate: (text: string) => Promise<string>
  translationLive: boolean
}

const I18nContext = createContext<I18nValue | null>(null)

const STORAGE_KEY = 'yojanamitra.lang'
const RTL_LANGS = new Set(['ur-IN', 'ks-IN', 'sd-IN'])

export function I18nProvider({
  children,
  initialLang = 'en-IN',
  translationLive = false,
}: {
  children: ReactNode
  initialLang?: string
  translationLive?: boolean
}) {
  const [lang, setLangState] = useState(initialLang)
  const [cache, setCache] = useState<Record<string, string>>({})

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored && LANGUAGES.some((l) => l.code === stored)) {
        setLangState(stored)
      }
    } catch {
      // localStorage can be unavailable in private modes; the default is fine.
    }
  }, [])

  const setLang = useCallback((code: string) => {
    setLangState(code)
    try {
      window.localStorage.setItem(STORAGE_KEY, code)
    } catch {
      // ignore
    }
    document.documentElement.lang = code
    document.documentElement.dir = RTL_LANGS.has(code) ? 'rtl' : 'ltr'
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr'
  }, [lang])

  const t = useCallback((key: UIKey) => phrase(lang, key), [lang])

  const translate = useCallback(
    async (text: string): Promise<string> => {
      if (!text.trim() || lang === 'en-IN' || !translationLive) return text
      const key = `${lang}::${text.slice(0, 120)}`
      if (cache[key]) return cache[key]

      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, targetLanguage: lang }),
        })
        if (!res.ok) return text
        const data = (await res.json()) as { translated?: string; live?: boolean }
        const translated = data.translated?.trim()
        if (data.live && translated) {
          setCache((prev) => ({ ...prev, [key]: translated }))
          return translated
        }
        return text
      } catch {
        return text
      }
    },
    [lang, translationLive, cache],
  )

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t,
      langName: getLanguage(lang).nativeName,
      isRtl: RTL_LANGS.has(lang),
      translate,
      translationLive,
    }),
    [lang, setLang, t, translate, translationLive],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
