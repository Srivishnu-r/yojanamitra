'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  CircleDashed,
  FilePlus2,
  Loader2,
  Send,
  Wand2,
  ShieldCheck,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react'
import type { Application, ApplicationDocument } from '@/lib/types'
import { useSession } from '@/components/SessionProvider'
import { titleCase } from '@/lib/utils'

interface Props {
  schemeId: string
  schemeName: string
  applyUrl: string
  initialApplication?: Application
  recommendedFields: Array<{ key: string; label: string }>
}

export default function ApplyPanel({
  schemeId,
  schemeName,
  applyUrl,
  initialApplication,
  recommendedFields,
}: Props) {
  const { session, refresh } = useSession()
  const [application, setApplication] = useState<Application | undefined>(initialApplication)
  const [busy, setBusy] = useState<'start' | 'fill' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const digilockerConnected = session?.digilocker.connected ?? false

  async function start() {
    setBusy('start')
    setError(null)
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemeId }),
      })
      const data = (await res.json()) as { application?: Application; error?: string }
      if (!res.ok || !data.application) throw new Error(data.error ?? 'Could not start')
      setApplication(data.application)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  async function act(action: 'autofill' | 'submit') {
    if (!application) return
    setBusy(action === 'autofill' ? 'fill' : 'submit')
    setError(null)
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'submit' ? { action, confirm: true } : { action },
        ),
      })
      const data = (await res.json()) as {
        application?: Application
        error?: string
        missingDocuments?: string[]
      }
      if (!res.ok || !data.application) {
        throw new Error(
          data.missingDocuments?.length
            ? `${data.error}: ${data.missingDocuments.join(', ')}`
            : (data.error ?? 'Something went wrong'),
        )
      }
      setApplication(data.application)
      setConfirmOpen(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const missingRequired = (application?.documents ?? []).filter(
    (doc: ApplicationDocument) => doc.required && doc.status === 'missing',
  )

  const filledFields = application ? Object.entries(application.fields) : []

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="card-title" style={{ fontSize: 15 }}>
            Apply for this scheme
          </span>
          {application ? (
            <span
              className={
                application.status === 'submitted' || application.status === 'under_review'
                  ? 'badge badge-blue'
                  : application.status === 'ready'
                    ? 'badge badge-green'
                    : 'badge badge-amber'
              }
            >
              {titleCase(application.status)}
            </span>
          ) : null}
        </div>

        <div className="card-body" style={{ paddingTop: 16 }}>
          {!application ? (
            <>
              <p className="small muted" style={{ marginBottom: 14 }}>
                YojanaMitra can prepare the whole application: it attaches the required
                documents from DigiLocker, pre-fills the form and submits only after you
                confirm.
              </p>

              {!digilockerConnected ? (
                <div className="notice notice-warn" style={{ marginBottom: 14 }}>
                  <AlertTriangle size={15} style={{ flex: 'none', marginTop: 2 }} />
                  <span>
                    DigiLocker is not linked yet, so documents cannot be attached
                    automatically. Link it on the{' '}
                    <a href="/dashboard" style={{ textDecoration: 'underline' }}>
                      dashboard
                    </a>{' '}
                    first for the smoothest flow.
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={start}
                disabled={busy !== null}
              >
                {busy === 'start' ? (
                  <Loader2 size={15} className="spinner" />
                ) : (
                  <FilePlus2 size={15} />
                )}
                Prepare my application
              </button>

              <a
                className="btn btn-ghost btn-sm btn-block"
                href={applyUrl}
                target="_blank"
                rel="noreferrer noopener"
                style={{ marginTop: 8 }}
              >
                Apply on the official portal <ExternalLink size={13} />
              </a>
            </>
          ) : (
            <>
              {application.referenceNo ? (
                <div className="notice notice-ok" style={{ marginBottom: 14 }}>
                  <CheckCircle2 size={15} style={{ flex: 'none', marginTop: 2 }} />
                  <span>
                    Submitted{application.submittedByAgent ? ' by the agent' : ''}.
                    Acknowledgement <strong className="mono">{application.referenceNo}</strong>
                  </span>
                </div>
              ) : null}

              <div className="strong" style={{ fontSize: 13.5, marginBottom: 8 }}>
                Documents
              </div>
              <div className="stack stack-sm" style={{ marginBottom: 16 }}>
                {application.documents.map((doc) => (
                  <div
                    className="row small"
                    key={doc.id}
                    style={{ gap: 8, alignItems: 'flex-start' }}
                  >
                    {doc.status === 'attached' ? (
                      <CheckCircle2
                        size={15}
                        style={{ color: 'var(--green)', flex: 'none', marginTop: 2 }}
                      />
                    ) : (
                      <CircleDashed
                        size={15}
                        style={{ color: 'var(--warn)', flex: 'none', marginTop: 2 }}
                      />
                    )}
                    <span style={{ flex: 1 }}>
                      {doc.name}
                      {doc.issuedBy ? (
                        <span className="tiny muted" style={{ display: 'block' }}>
                          {doc.issuedBy}
                        </span>
                      ) : null}
                    </span>
                    <span className={doc.status === 'attached' ? 'badge badge-green' : 'badge badge-amber'}>
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>

              {missingRequired.length > 0 ? (
                <div className="notice notice-warn" style={{ marginBottom: 14 }}>
                  <AlertTriangle size={15} style={{ flex: 'none', marginTop: 2 }} />
                  <span>
                    {missingRequired.length} required document(s) are not in your
                    DigiLocker vault yet. Link DigiLocker or obtain them from the
                    department, then press <strong>Refresh form</strong>.
                  </span>
                </div>
              ) : null}

              <div className="strong" style={{ fontSize: 13.5, marginBottom: 8 }}>
                Pre-filled from your records ({filledFields.length} fields)
              </div>
              <div style={{ maxHeight: 210, overflowY: 'auto', marginBottom: 8 }}>
                {filledFields.length === 0 ? (
                  <p className="small muted">
                    Nothing could be pre-filled yet. Add your details in the assistant or
                    the eligibility check.
                  </p>
                ) : (
                  filledFields.map(([key, value]) => (
                    <div className="kv" key={key}>
                      <span className="kv-key">{titleCase(key)}</span>
                      <span className="kv-val">{value}</span>
                    </div>
                  ))
                )}
              </div>

              {application.status !== 'submitted' && application.status !== 'under_review' ? (
                <div className="stack stack-sm" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-block"
                    onClick={() => act('autofill')}
                    disabled={busy !== null}
                  >
                    {busy === 'fill' ? (
                      <Loader2 size={15} className="spinner-dark" />
                    ) : (
                      <Wand2 size={15} />
                    )}
                    Refresh form from DigiLocker
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={() => setConfirmOpen(true)}
                    disabled={busy !== null || missingRequired.length > 0}
                  >
                    <Send size={15} /> Submit on my behalf
                  </button>
                  {missingRequired.length > 0 ? (
                    <span className="tiny muted">
                      All required documents must be attached before submitting.
                    </span>
                  ) : null}
                </div>
              ) : (
                <a href="/dashboard" className="btn btn-outline btn-block" style={{ marginTop: 14 }}>
                  Track this application
                </a>
              )}
            </>
          )}

          {error ? (
            <div className="notice notice-danger" style={{ marginTop: 12 }}>
              <AlertTriangle size={15} style={{ flex: 'none', marginTop: 2 }} />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </div>

      {confirmOpen && application ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <span className="brand-mark" style={{ width: 30, height: 30 }}>
                <ShieldCheck size={16} />
              </span>
              <div>
                <div className="strong">Confirm submission</div>
                <div className="tiny muted">This is the final step</div>
              </div>
            </div>

            <div className="modal-body">
              <p className="small" style={{ marginBottom: 14 }}>
                The agent will submit this application to the department on your behalf.
              </p>

              <div className="kv">
                <span className="kv-key">Scheme</span>
                <span className="kv-val">{schemeName}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Documents attached</span>
                <span className="kv-val">
                  {application.documents.filter((d) => d.status === 'attached').length} of{' '}
                  {application.documents.length}
                </span>
              </div>
              <div className="kv">
                <span className="kv-key">Form fields</span>
                <span className="kv-val">{filledFields.length} populated</span>
              </div>

              {recommendedFields.length > 0 ? (
                <>
                  <div className="divider" />
                  <div className="small muted" style={{ marginBottom: 8 }}>
                    Please double-check these before submitting:
                  </div>
                  <div className="row row-wrap" style={{ gap: 6 }}>
                    {recommendedFields.map((field) => (
                      <span className="badge" key={field.key}>
                        {field.label}: {application.fields[field.key] ?? '—'}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}

              <div className="notice notice-info" style={{ marginTop: 16 }}>
                By confirming you declare that the information and documents are true.
              </div>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConfirmOpen(false)}
                disabled={busy !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => act('submit')}
                disabled={busy !== null}
              >
                {busy === 'submit' ? (
                  <Loader2 size={15} className="spinner" />
                ) : (
                  <Send size={15} />
                )}
                Confirm and submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
