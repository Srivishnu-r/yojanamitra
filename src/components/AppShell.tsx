'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  Home,
  LayoutGrid,
  MessagesSquare,
  ClipboardCheck,
  LayoutDashboard,
  Menu,
  X,
  Bot,
  Languages,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/context'
import { useSession } from '@/components/SessionProvider'
import MitraCompanion from '@/components/MitraCompanion'
import { LANGUAGES } from '@/lib/data/languages'
import type { UIKey } from '@/lib/i18n/strings'

const NAV: Array<{ href: string; key: UIKey; icon: typeof Home }> = [
  { href: '/', key: 'nav.home', icon: Home },
  { href: '/schemes', key: 'nav.schemes', icon: LayoutGrid },
  { href: '/assistant', key: 'nav.assistant', icon: MessagesSquare },
  { href: '/eligibility', key: 'nav.eligibility', icon: ClipboardCheck },
  { href: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard },
]

function LanguagePicker() {
  const { lang, setLang } = useI18n()
  const { session } = useSession()
  const state = session?.profile.state

  // Put the state's own languages first — most citizens want those.
  const ordered = [...LANGUAGES].sort((a, b) => {
    if (!state) return 0
    const order = ['hi-IN', 'en-IN']
    const ai = order.indexOf(a.code)
    const bi = order.indexOf(b.code)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <label className="row" style={{ gap: 6 }}>
      <Languages size={16} className="muted" aria-hidden />
      <span className="visually-hidden">Language</span>
      <select
        className="select lang-select"
        value={lang}
        onChange={(event) => setLang(event.target.value)}
        aria-label="Select language"
      >
        {ordered.map((language) => (
          <option key={language.code} value={language.code}>
            {language.nativeName}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { t } = useI18n()
  const { session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const geminiOff = session && !session.capabilities.gemini.live

  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <a href="/" className="brand">
            <span className="brand-mark" aria-hidden>
              <Bot size={19} />
            </span>
            <span>
              YojanaMitra
              <span className="brand-sub">{t('tagline')}</span>
            </span>
          </a>

          <nav className={cn('site-nav', menuOpen && 'open')}>
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn('nav-link', isActive(item.href) && 'active')}
                >
                  <span className="row" style={{ gap: 7 }}>
                    <Icon size={15} aria-hidden />
                    {t(item.key)}
                  </span>
                </a>
              )
            })}
          </nav>

          <div className="header-actions">
            <LanguagePicker />
            <button
              type="button"
              className="nav-toggle"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {geminiOff ? (
        <div className="container" style={{ paddingTop: 14 }}>
          <div className="notice notice-warn">
            <Lock size={16} aria-hidden style={{ marginTop: 2, flex: 'none' }} />
            <span>
              <strong>Running in demo mode.</strong> The assistant is using the built-in
              reasoning engine and DigiLocker is simulated, because{' '}
              <span className="mono">GEMINI_API_KEY</span> and DigiLocker credentials are
              not set. Add them to <span className="mono">.env.local</span> to go live.
            </span>
          </div>
        </div>
      ) : null}

      <main>{children}</main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="brand" style={{ marginBottom: 10 }}>
                <span className="brand-mark" aria-hidden>
                  <Bot size={19} />
                </span>
                <span>YojanaMitra</span>
              </div>
              <p className="small muted" style={{ maxWidth: '38ch' }}>
                An AI companion that helps citizens of India discover government
                schemes, fetch documents from DigiLocker, and apply on their behalf.
              </p>
            </div>

            <div>
              <div className="footer-title">Product</div>
              <a className="footer-link" href="/assistant">
                AI Assistant
              </a>
              <a className="footer-link" href="/schemes">
                Scheme catalogue
              </a>
              <a className="footer-link" href="/eligibility">
                Eligibility check
              </a>
              <a className="footer-link" href="/dashboard">
                My dashboard
              </a>
            </div>

            <div>
              <div className="footer-title">Government</div>
              <a
                className="footer-link"
                href="https://www.india.gov.in/"
                target="_blank"
                rel="noreferrer noopener"
              >
                india.gov.in
              </a>
              <a
                className="footer-link"
                href="https://www.myscheme.gov.in/"
                target="_blank"
                rel="noreferrer noopener"
              >
                myScheme
              </a>
              <a
                className="footer-link"
                href="https://www.digilocker.gov.in/"
                target="_blank"
                rel="noreferrer noopener"
              >
                DigiLocker
              </a>
              <a
                className="footer-link"
                href="https://scholarships.gov.in/"
                target="_blank"
                rel="noreferrer noopener"
              >
                National Scholarship Portal
              </a>
            </div>

            <div>
              <div className="footer-title">Technology</div>
              <a
                className="footer-link"
                href="https://ai.google.dev/gemini-api/docs"
                target="_blank"
                rel="noreferrer noopener"
              >
                Google Gemini
              </a>
              <a
                className="footer-link"
                href="https://docs.sarvam.ai/"
                target="_blank"
                rel="noreferrer noopener"
              >
                Sarvam AI
              </a>
              <a className="footer-link" href="/api/health">
                System status
              </a>
            </div>
          </div>

          <div className="footer-bottom">
            <span>
              YojanaMitra is an independent assistant. Scheme details are indicative —
              always confirm on the official department portal before applying.
            </span>
            <span>
              Languages powered by Sarvam · Reasoning by Gemini · Documents by DigiLocker
            </span>
          </div>
        </div>
      </footer>

      <MitraCompanion />
    </>
  )
}
