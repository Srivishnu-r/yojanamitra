import Link from 'next/link'
import {
  Bot,
  Sparkles,
  ShieldCheck,
  Mic,
  FileCheck2,
  Wand2,
  ArrowRight,
  Globe2,
  Building2,
  Languages as LanguagesIcon,
} from 'lucide-react'
import { catalogueStats, searchSchemes } from '@/lib/data/schemes'
import { STATES } from '@/lib/data/states'
import { LANGUAGES } from '@/lib/data/languages'
import { capabilityReport } from '@/lib/config'
import SearchBar from '@/components/SearchBar'
import SchemeCard from '@/components/SchemeCard'

export const dynamic = 'force-dynamic'

const STEPS = [
  {
    icon: Mic,
    title: 'Speak in your language',
    body: 'Tell the assistant about yourself in Hindi, Tamil, Bengali or any of 22 Indian languages. Type or use the microphone.',
  },
  {
    icon: Sparkles,
    title: 'The agent finds your schemes',
    body: 'It checks every central and state scheme against your situation and explains exactly which conditions you meet — and which you do not.',
  },
  {
    icon: FileCheck2,
    title: 'Documents come from DigiLocker',
    body: 'Aadhaar, income certificate, marksheets and land records are fetched with your consent. No uploads, no photocopies.',
  },
  {
    icon: Wand2,
    title: 'It applies for you',
    body: 'Forms are pre-filled from your verified records. You review, confirm, and the agent submits the application on your behalf.',
  },
]

export default async function HomePage() {
  const stats = catalogueStats()
  const capabilities = capabilityReport()
  const popular = searchSchemes({ limit: 6 })
  const statesWithSchemes = Array.from(
    new Set(
      searchSchemes({ level: 'state', limit: 200 }).map((s) => s.state).filter(Boolean),
    ),
  ) as string[]

  return (
    <>
      {/* ------------------------------- hero ------------------------------- */}
      <section className="hero">
        <div className="container hero-inner">
          <div>
            <span className="eyebrow">AI saathi for Indian citizens</span>
            <h1 className="hero-title">
              Find every government scheme you are <em>entitled</em> to
            </h1>
            <p className="hero-sub">
              Describe your situation in your own language. YojanaMitra finds the
              schemes you qualify for, pulls your documents straight from DigiLocker,
              and submits the application on your behalf.
            </p>

            <div className="hero-actions">
              <Link href="/assistant" className="btn btn-primary btn-lg">
                <Bot size={18} />
                Talk to the AI assistant
              </Link>
              <Link href="/schemes" className="btn btn-outline btn-lg">
                Browse {stats.total} schemes
              </Link>
            </div>

            <div style={{ marginTop: 26 }}>
              <SearchBar />
            </div>

            <div className="hero-stats">
              <div>
                <div className="stat-value">{stats.total}</div>
                <div className="stat-label">Schemes indexed</div>
              </div>
              <div>
                <div className="stat-value">{stats.statesCovered}</div>
                <div className="stat-label">States &amp; UTs covered</div>
              </div>
              <div>
                <div className="stat-value">{LANGUAGES.length}</div>
                <div className="stat-label">Indian languages</div>
              </div>
              <div>
                <div className="stat-value">{stats.categories}</div>
                <div className="stat-label">Categories</div>
              </div>
            </div>
          </div>

          {/* Live-looking assistant preview */}
          <div className="hero-card" aria-hidden>
            <div className="row" style={{ gap: 10, marginBottom: 14 }}>
              <span className="brand-mark" style={{ width: 30, height: 30 }}>
                <Bot size={16} />
              </span>
              <div>
                <div className="strong" style={{ fontSize: 14 }}>
                  YojanaMitra Assistant
                </div>
                <div className="tiny muted">
                  {capabilities.gemini.live
                    ? `Reasoning with ${capabilities.gemini.model}`
                    : 'Built-in reasoning engine'}
                </div>
              </div>
              <span className="spacer" />
              <span className="badge badge-green">Live</span>
            </div>

            <div className="hero-chat-line hero-chat-user">
              <span className="avatar">You</span>
              <span>
                मैं बिहार की रहने वाली हूँ, 34 साल की हूँ। पति किसान हैं, सालाना आय डेढ़ लाख है।
              </span>
            </div>

            <div className="hero-chat-line hero-chat-ai">
              <span className="avatar avatar-ai">AI</span>
              <span>
                5 योजनाएँ मिलीं। डिजिलॉकर से आपकी आय प्रमाण-पत्र और राशन कार्ड मिल गए —
                मुख्यमंत्री कन्या उत्थान योजना के लिए आवेदन तैयार है।
              </span>
            </div>

            <div className="row row-wrap" style={{ gap: 6, marginTop: 12 }}>
              <span className="badge badge-saffron">Hindi</span>
              <span className="badge badge-blue">DigiLocker linked</span>
              <span className="badge badge-green">3 documents verified</span>
            </div>

            <div className="divider" />

            <div className="stack stack-sm">
              <div className="kv">
                <span className="kv-key">Scheme match</span>
                <span className="kv-val">Mukhyamantri Kanya Utthan</span>
              </div>
              <div className="kv">
                <span className="kv-key">Documents</span>
                <span className="kv-val">Aadhaar · Income · Ration</span>
              </div>
              <div className="kv">
                <span className="kv-key">Status</span>
                <span className="kv-val" style={{ color: 'var(--ok)' }}>
                  Ready to submit
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------- capabilities --------------------------- */}
      <section className="section">
        <div className="container">
          <span className="eyebrow">How it works</span>
          <h2 className="section-title">Four steps, and the agent does three of them</h2>
          <p className="lead" style={{ marginBottom: 30 }}>
            Built for citizens who have never filed an online application before.
          </p>

          <div className="grid grid-4">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              return (
                <div className="card card-pad" key={step.title}>
                  <div
                    className="doc-icon"
                    style={{ background: 'var(--saffron-soft)', color: 'var(--saffron-dark)' }}
                  >
                    <Icon size={19} />
                  </div>
                  <div className="row" style={{ gap: 8, margin: '14px 0 6px' }}>
                    <span className="badge badge-saffron">{index + 1}</span>
                    <span className="card-title">{step.title}</span>
                  </div>
                  <p className="small muted">{step.body}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------- popular ---------------------------- */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="row-between" style={{ marginBottom: 20 }}>
            <div>
              <span className="eyebrow">Most applied</span>
              <h2 className="section-title">Popular schemes right now</h2>
            </div>
            <Link href="/schemes" className="btn btn-outline">
              All schemes <ArrowRight size={15} />
            </Link>
          </div>

          <div className="grid grid-3">
            {popular.map((scheme) => (
              <SchemeCard key={scheme.id} scheme={scheme} />
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------- states ---------------------------- */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <span className="eyebrow">Across the country</span>
          <h2 className="section-title">Every state and union territory</h2>
          <p className="lead" style={{ marginBottom: 22 }}>
            Central schemes apply everywhere. State schemes are listed for all{' '}
            {stats.statesCovered} states and union territories.
          </p>

          <div className="card card-pad">
            <div className="row row-wrap" style={{ gap: 8 }}>
              {STATES.map((state) => {
                const covered = statesWithSchemes.includes(state.name)
                return (
                  <Link
                    key={state.name}
                    href={`/schemes?state=${encodeURIComponent(state.name)}`}
                    className="chip"
                    title={
                      covered
                        ? `${state.languages.length} official languages indexed`
                        : undefined
                    }
                  >
                    {state.name}
                    {covered ? (
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--green)',
                        }}
                      />
                    ) : null}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------- trust ------------------------------ */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="grid grid-2">
            <div className="card card-pad">
              <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                <ShieldCheck size={20} style={{ color: 'var(--green)' }} />
                <span className="card-title">Consent-first by design</span>
              </div>
              <p className="small muted">
                Nothing is read from DigiLocker and nothing is submitted without your
                explicit confirmation. The agent always shows you exactly which
                documents and values it is about to send.
              </p>
              <div className="row row-wrap" style={{ gap: 6, marginTop: 14 }}>
                <span className="badge badge-green">DigiLocker OAuth 2.0 + PKCE</span>
                <span className="badge badge-green">Explicit submit confirmation</span>
              </div>
            </div>

            <div className="card card-pad">
              <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                <LanguagesIcon size={20} style={{ color: 'var(--saffron-dark)' }} />
                <span className="card-title">Made for Indian languages</span>
              </div>
              <p className="small muted">
                Speech recognition, speech synthesis and translation run on Sarvam
                models trained on Indian languages and code-mixed speech — so
                &ldquo;Hinglish&rdquo; works, and so do 22 scheduled languages.
              </p>
              <div className="row row-wrap" style={{ gap: 6, marginTop: 14 }}>
                {LANGUAGES.slice(0, 7).map((language) => (
                  <span className="badge" key={language.code}>
                    {language.nativeName}
                  </span>
                ))}
                <span className="badge">+{LANGUAGES.length - 7} more</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------- cta ------------------------------- */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div
            className="card card-pad"
            style={{
              background:
                'linear-gradient(120deg, var(--ink) 0%, #232a4d 55%, #3a2a52 100%)',
              color: '#fff',
              border: 'none',
              padding: '40px 34px',
            }}
          >
            <div className="grid grid-2" style={{ alignItems: 'center', gap: 26 }}>
              <div>
                <h2 className="section-title" style={{ color: '#fff' }}>
                  Not sure which scheme applies to you?
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.78)', maxWidth: '52ch' }}>
                  Answer a few questions, or simply talk to the assistant. It will tell
                  you what you qualify for, what documents it already has, and what is
                  still missing.
                </p>
                <div className="row row-wrap" style={{ gap: 12, marginTop: 22 }}>
                  <Link href="/assistant" className="btn btn-primary btn-lg">
                    <Bot size={18} /> Start with the assistant
                  </Link>
                  <Link
                    href="/eligibility"
                    className="btn btn-lg"
                    style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
                  >
                    <Building2 size={18} /> Answer a few questions
                  </Link>
                </div>
              </div>
              <div className="stack stack-sm">
                <div className="row" style={{ gap: 9, color: 'rgba(255,255,255,0.9)' }}>
                  <Globe2 size={16} /> {stats.central} central schemes
                </div>
                <div className="row" style={{ gap: 9, color: 'rgba(255,255,255,0.9)' }}>
                  <Building2 size={16} /> {stats.state} state &amp; UT schemes
                </div>
                <div className="row" style={{ gap: 9, color: 'rgba(255,255,255,0.9)' }}>
                  <FileCheck2 size={16} /> {LANGUAGES.length} languages for voice and text
                </div>
                <div className="row" style={{ gap: 9, color: 'rgba(255,255,255,0.9)' }}>
                  <ShieldCheck size={16} /> Documents fetched from DigiLocker
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
