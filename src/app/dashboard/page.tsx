'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BadgeCheck,
  Bot,
  ClipboardList,
  FileText,
  Loader2,
  Sparkles,
  User,
  CheckCircle2,
  AlertTriangle,
  CircleDashed,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import type { Application, EligibilityResult, Scheme } from '@/lib/types'
import { useSession } from '@/components/SessionProvider'
import { useI18n } from '@/lib/i18n/context'
import DigiLockerPanel from '@/components/DigiLockerPanel'
import SchemeCard from '@/components/SchemeCard'
import { FIELD_LABELS } from '@/lib/eligibility'
import { formatDateTime, titleCase } from '@/lib/utils'

const STATUS_META: Record<
  Application['status'],
  { className: string; label: string }
> = {
  draft: { className: 'badge', label: 'Draft' },
  docs_pending: { className: 'badge badge-amber', label: 'Documents pending' },
  ready: { className: 'badge badge-green', label: 'Ready to submit' },
  submitted: { className: 'badge badge-blue', label: 'Submitted' },
  under_review: { className: 'badge badge-blue', label: 'Under review' },
  approved: { className: 'badge badge-green', label: 'Approved' },
  rejected: { className: 'badge badge-red', label: 'Rejected' },
}

function DashboardInner() {
  const params = useSearchParams()
  const { session, loading, refresh } = useSession()
  const { t } = useI18n()
  const [matches, setMatches] = useState<Array<{ scheme: Scheme; result: EligibilityResult }>>([])
  const [banner, setBanner] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Handle the DigiLocker callback banner.
  useEffect(() => {
    const status = params.get('digilocker')
    if (status === 'connected') {
      const count = params.get('documents')
      setBanner(`DigiLocker linked successfully${count ? ` — ${count} documents fetched` : ''}.`)
    } else if (status === 'error') {
      setBanner(`DigiLocker error: ${params.get('reason') ?? 'unknown reason'}`)
    }
  }, [params])

  useEffect(() => {
    if (!session) return
    fetch('/api/eligibility?limit=6')
      .then((res) => res.json())
      .then((data: { matches: Array<{ scheme: Scheme; result: EligibilityResult }> }) =>
        setMatches(data.matches ?? []),
      )
      .catch(() => undefined)
  }, [session])

  async function action(application: Application, act: 'autofill' | 'submit' | 'withdraw') {
    setBusyId(application.id)
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(act === 'submit' ? { action: act, confirm: true } : { action: act }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setBanner(data.error ?? 'That action could not be completed.')
      }
      await refresh()
    } finally {
      setBusyId(null)
    }
  }

  if (loading && !session) {
    return (
      <div className="page">
        <div className="container">
          <div className="skeleton" style={{ height: 200, marginBottom: 20 }} />
          <div className="grid grid-2">
            <div className="skeleton" style={{ height: 260 }} />
            <div className="skeleton" style={{ height: 260 }} />
          </div>
        </div>
      </div>
    )
  }

  const profile = session?.profile ?? {}
  const profileEntries = (Object.keys(profile) as Array<keyof typeof profile>).filter(
    (key) => profile[key] !== undefined && profile[key] !== '',
  )
  const applications = session?.applications ?? []

  return (
    <div className="page">
      <div className="container">
        <span className="eyebrow">My dashboard</span>
        <h1 className="section-title">
          {profile.name ? `Namaste, ${profile.name}` : 'Your schemes and applications'}
        </h1>
        <p className="lead" style={{ marginBottom: 22 }}>
          Everything the assistant has gathered, prepared and submitted for you.
        </p>

        {banner ? (
          <div className="notice notice-info" style={{ marginBottom: 20 }}>
            <BadgeCheck size={16} style={{ flex: 'none', marginTop: 2 }} />
            <span>{banner}</span>
          </div>
        ) : null}

        {/* --------------------------- capabilities -------------------------- */}
        <div className="grid grid-3" style={{ marginBottom: 24 }}>
          {session
            ? (
                [
                  { key: 'gemini', label: 'AI reasoning', icon: Bot },
                  { key: 'sarvam', label: 'Language & voice', icon: Sparkles },
                  { key: 'digilocker', label: 'DigiLocker', icon: FileText },
                ] as const
              ).map(({ key, label, icon: Icon }) => {
                const capability = session.capabilities[key]
                return (
                  <div className="card card-pad" key={key}>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="doc-icon">
                        <Icon size={17} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="strong" style={{ fontSize: 14 }}>
                          {label}
                        </div>
                        <span
                          className={capability.live ? 'badge badge-green' : 'badge badge-amber'}
                        >
                          {capability.live ? 'Live' : 'Simulated'}
                        </span>
                      </div>
                    </div>
                    <p className="tiny muted" style={{ marginTop: 10 }}>
                      {capability.live
                        ? 'Connected and ready.'
                        : String(capability.reason ?? 'Not configured.')}
                    </p>
                  </div>
                )
              })
            : null}
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(300px, 1fr)', gap: 24, alignItems: 'start' }}>
          {/* -------------------------- applications ------------------------- */}
          <div className="stack stack-lg">
            <div className="card">
              <div className="card-head">
                <div className="row" style={{ gap: 9 }}>
                  <ClipboardList size={17} />
                  <span className="card-title">Applications</span>
                </div>
                <span className="badge">{applications.length}</span>
              </div>

              <div className="card-body" style={{ paddingTop: 16 }}>
                {applications.length === 0 ? (
                  <div className="empty" style={{ padding: '30px 10px' }}>
                    <p className="strong">No applications yet.</p>
                    <p className="small muted" style={{ marginBottom: 16 }}>
                      Find a scheme you qualify for, and let the agent prepare it for you.
                    </p>
                    <a href="/eligibility" className="btn btn-primary">
                      <ClipboardList size={15} /> Check my eligibility
                    </a>
                  </div>
                ) : (
                  <div className="stack stack-lg">
                    {applications.map((application) => {
                      const meta = STATUS_META[application.status]
                      const attached = application.documents.filter(
                        (d) => d.status === 'attached',
                      ).length
                      const missing = application.documents.filter(
                        (d) => d.required && d.status === 'missing',
                      )
                      const canSubmit =
                        missing.length === 0 &&
                        application.status !== 'submitted' &&
                        application.status !== 'under_review'

                      return (
                        <div key={application.id} className="card card-pad">
                          <div className="row-between row-wrap" style={{ gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                              <div className="row row-wrap" style={{ gap: 8 }}>
                                <span className="card-title" style={{ fontSize: 15.5 }}>
                                  {application.schemeName}
                                </span>
                                <span className={meta.className}>{meta.label}</span>
                                {application.submittedByAgent ? (
                                  <span className="badge badge-lotus">Filed by agent</span>
                                ) : null}
                              </div>
                              <div className="tiny muted" style={{ marginTop: 4 }}>
                                {application.schemeLevel === 'central'
                                  ? 'Central'
                                  : application.state}{' '}
                                · updated {formatDateTime(application.updatedAt)}
                                {application.referenceNo
                                  ? ` · ref ${application.referenceNo}`
                                  : ''}
                              </div>
                            </div>
                            <a
                              className="btn btn-outline btn-sm"
                              href={`/schemes/${application.schemeId}`}
                            >
                              Open scheme <ExternalLink size={12} />
                            </a>
                          </div>

                          <div className="divider" />

                          <div className="grid grid-2" style={{ gap: 18 }}>
                            <div>
                              <div className="small strong" style={{ marginBottom: 8 }}>
                                Documents ({attached}/{application.documents.length})
                              </div>
                              <div className="stack stack-sm">
                                {application.documents.map((doc) => (
                                  <div
                                    className="row small"
                                    key={doc.id}
                                    style={{ gap: 7, alignItems: 'flex-start' }}
                                  >
                                    {doc.status === 'attached' ? (
                                      <CheckCircle2
                                        size={14}
                                        style={{ color: 'var(--green)', flex: 'none', marginTop: 2 }}
                                      />
                                    ) : (
                                      <CircleDashed
                                        size={14}
                                        style={{
                                          color: 'var(--warn)',
                                          flex: 'none',
                                          marginTop: 2,
                                        }}
                                      />
                                    )}
                                    <span>{doc.name}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div>
                              <div className="small strong" style={{ marginBottom: 8 }}>
                                Activity
                              </div>
                              <div className="timeline">
                                {application.timeline.slice(-4).map((entry, index) => (
                                  <div className="timeline-item" key={`${entry.at}-${index}`}>
                                    <div className="timeline-label">{entry.label}</div>
                                    <div className="timeline-detail">
                                      {entry.detail ?? formatDateTime(entry.at)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="row row-wrap" style={{ gap: 8, marginTop: 16 }}>
                            {application.status !== 'submitted' &&
                            application.status !== 'under_review' ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => action(application, 'autofill')}
                                  disabled={busyId === application.id}
                                >
                                  {busyId === application.id ? (
                                    <Loader2 size={13} className="spinner-dark" />
                                  ) : (
                                    <Sparkles size={13} />
                                  )}
                                  Refresh documents
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => action(application, 'submit')}
                                  disabled={!canSubmit || busyId === application.id}
                                  title={
                                    missing.length > 0
                                      ? `${missing.length} required document(s) missing`
                                      : undefined
                                  }
                                >
                                  Submit on my behalf
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => action(application, 'withdraw')}
                                  disabled={busyId === application.id}
                                >
                                  <Trash2 size={13} /> Discard
                                </button>
                              </>
                            ) : (
                              <span className="small muted row" style={{ gap: 7 }}>
                                <CheckCircle2 size={14} style={{ color: 'var(--green)' }} />
                                {application.submittedByAgent
                                  ? 'The agent submitted this on your behalf and it is now with the department.'
                                  : 'Submitted. The department will review it.'}
                              </span>
                            )}
                          </div>

                          {missing.length > 0 ? (
                            <div className="notice notice-warn" style={{ marginTop: 12 }}>
                              <AlertTriangle size={14} style={{ flex: 'none', marginTop: 2 }} />
                              <span>
                                Missing: {missing.map((d) => d.name).join(', ')}. Link
                                DigiLocker to fetch them automatically.
                              </span>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* --------------------------- recommended ------------------------ */}
            <div>
              <div className="row-between" style={{ marginBottom: 16 }}>
                <div>
                  <span className="eyebrow">Recommended</span>
                  <h2 className="section-title" style={{ fontSize: 22 }}>
                    Schemes that fit you
                  </h2>
                </div>
                <a href="/schemes" className="btn btn-outline btn-sm">
                  {t('action.viewAll')}
                </a>
              </div>

              {matches.length === 0 ? (
                <div className="card empty">
                  <p className="strong">No matches yet.</p>
                  <p className="small muted" style={{ marginBottom: 14 }}>
                    Fill in your profile so the rules engine can find your schemes.
                  </p>
                  <a href="/assistant" className="btn btn-primary btn-sm">
                    <Bot size={14} /> Talk to the assistant
                  </a>
                </div>
              ) : (
                <div className="grid grid-2">
                  {matches.map((match) => (
                    <SchemeCard
                      key={match.scheme.id}
                      scheme={match.scheme}
                      result={match.result}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---------------------------- sidebar --------------------------- */}
          <div className="side-panel">
            <div className="card">
              <div className="card-head">
                <div className="row" style={{ gap: 9 }}>
                  <User size={16} />
                  <span className="card-title" style={{ fontSize: 15 }}>
                    Your profile
                  </span>
                </div>
                <span className="badge">{profileEntries.length}</span>
              </div>
              <div className="card-body" style={{ paddingTop: 14 }}>
                {profileEntries.length === 0 ? (
                  <p className="small muted">
                    Nothing on record yet. The assistant will fill this in as you chat.
                  </p>
                ) : (
                  profileEntries.map((key) => (
                    <div className="kv" key={String(key)}>
                      <span className="kv-key">
                        {FIELD_LABELS[key as never] ?? titleCase(String(key))}
                      </span>
                      <span className="kv-val">
                        {typeof profile[key] === 'boolean'
                          ? profile[key]
                            ? 'Yes'
                            : 'No'
                          : titleCase(String(profile[key]))}
                      </span>
                    </div>
                  ))
                )}
                <a href="/eligibility" className="btn btn-outline btn-sm btn-block" style={{ marginTop: 14 }}>
                  Update profile
                </a>
              </div>
            </div>

            <DigiLockerPanel />

            <div className="card card-pad">
              <div className="row" style={{ gap: 9, marginBottom: 12 }}>
                <Bot size={16} />
                <span className="strong" style={{ fontSize: 14 }}>
                  Need something else?
                </span>
              </div>
              <p className="small muted" style={{ marginBottom: 14 }}>
                The assistant can search all {matches.length > 0 ? 'schemes' : 'central and state schemes'},
                explain eligibility and prepare more applications.
              </p>
              <a href="/assistant" className="btn btn-primary btn-sm btn-block">
                <Sparkles size={14} /> Open the assistant
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div className="container">
            <div className="skeleton" style={{ height: 220 }} />
          </div>
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  )
}
