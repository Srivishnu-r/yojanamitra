'use client'

import { useState } from 'react'
import {
  FileText,
  Loader2,
  ShieldCheck,
  Unplug,
  Download,
  BadgeCheck,
  Info,
} from 'lucide-react'
import { useSession } from '@/components/SessionProvider'
import { formatDate } from '@/lib/utils'

interface AuthorizeResponse {
  mode: 'oauth' | 'simulator'
  url?: string
  message?: string
}

export default function DigiLockerPanel({ compact = false }: { compact?: boolean }) {
  const { session, refresh } = useSession()
  const [busy, setBusy] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const connected = session?.digilocker.connected ?? false
  const documents = session?.documents ?? []

  async function begin() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/digilocker/authorize')
      const data = (await res.json()) as AuthorizeResponse

      if (data.mode === 'oauth' && data.url) {
        // Real DigiLocker consent screen.
        window.location.href = data.url
        return
      }

      // No partner credentials: show the simulated consent screen.
      setNotice(data.message ?? null)
      setConsentOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function grantConsent() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/digilocker/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consent: true,
          name: session?.profile.name,
          state: session?.profile.state,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Could not connect DigiLocker')
      setConsentOpen(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function unlink() {
    setBusy(true)
    try {
      await fetch('/api/digilocker/documents', { method: 'DELETE' })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="row" style={{ gap: 9 }}>
            <ShieldCheck
              size={17}
              style={{ color: connected ? 'var(--green)' : 'var(--muted)' }}
            />
            <span className="card-title" style={{ fontSize: 15 }}>
              DigiLocker
            </span>
          </div>
          {connected ? (
            <span className="badge badge-green">
              <BadgeCheck size={11} /> Linked
            </span>
          ) : (
            <span className="badge">Not linked</span>
          )}
        </div>

        <div className="card-body" style={{ paddingTop: 16 }}>
          {!connected ? (
            <>
              <p className="small muted" style={{ marginBottom: 14 }}>
                Fetch your Aadhaar, PAN, income certificate, marksheets and land
                records directly from your DigiLocker. You will be asked to consent,
                and you can unlink at any time.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={begin}
                disabled={busy}
                data-mitra="digilocker-connect"
              >
                {busy ? <Loader2 size={15} className="spinner" /> : <ShieldCheck size={15} />}
                Connect DigiLocker
              </button>
            </>
          ) : (
            <>
              <div className="kv">
                <span className="kv-key">Account</span>
                <span className="kv-val">{session?.digilocker.name ?? 'Citizen'}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Method</span>
                <span className="kv-val">
                  {session?.digilocker.method === 'oauth'
                    ? 'DigiLocker OAuth'
                    : 'Simulated vault'}
                </span>
              </div>
              <div className="kv">
                <span className="kv-key">Linked</span>
                <span className="kv-val">{formatDate(session?.digilocker.linkedAt)}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Documents</span>
                <span className="kv-val">{documents.length}</span>
              </div>

              {!compact ? (
                <div className="stack stack-sm" style={{ marginTop: 14 }}>
                  {documents.map((doc) => (
                    <div className="doc-item" key={doc.id}>
                      <span className="doc-icon">
                        <FileText size={16} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="strong" style={{ fontSize: 13.5 }}>
                          {doc.name}
                        </div>
                        <div className="tiny muted">{doc.issuer}</div>
                      </div>
                      <a
                        className="icon-btn"
                        style={{ width: 32, height: 32 }}
                        href={`/api/digilocker/documents?id=${encodeURIComponent(doc.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open document"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="row row-wrap" style={{ gap: 6, marginTop: 12 }}>
                  {documents.slice(0, 6).map((doc) => (
                    <span className="badge" key={doc.id}>
                      {doc.name}
                    </span>
                  ))}
                  {documents.length > 6 ? (
                    <span className="badge">+{documents.length - 6}</span>
                  ) : null}
                </div>
              )}

              <button
                type="button"
                className="btn btn-ghost btn-sm btn-block"
                onClick={unlink}
                disabled={busy}
                style={{ marginTop: 14 }}
              >
                <Unplug size={14} /> Unlink DigiLocker
              </button>
            </>
          )}

          {error ? (
            <div className="notice notice-danger" style={{ marginTop: 12 }}>
              {error}
            </div>
          ) : null}
        </div>
      </div>

      {consentOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <span className="brand-mark" style={{ width: 30, height: 30 }}>
                <ShieldCheck size={16} />
              </span>
              <div>
                <div className="strong">DigiLocker consent</div>
                <div className="tiny muted">Simulated environment</div>
              </div>
            </div>

            <div className="modal-body">
              {notice ? (
                <div className="notice notice-info" style={{ marginBottom: 14 }}>
                  <Info size={15} style={{ flex: 'none', marginTop: 2 }} />
                  <span>{notice}</span>
                </div>
              ) : null}

              <p className="small" style={{ marginBottom: 12 }}>
                <strong>YojanaMitra</strong> is requesting access to:
              </p>
              <div className="stack stack-sm">
                {[
                  'Your name, date of birth and gender',
                  'Issued documents (Aadhaar, PAN, certificates, marksheets)',
                  'The document URIs needed to attach them to applications',
                ].map((item) => (
                  <div className="row small" key={item} style={{ gap: 8 }}>
                    <BadgeCheck size={14} style={{ color: 'var(--green)', flex: 'none' }} />
                    {item}
                  </div>
                ))}
              </div>

              <div className="notice notice-warn" style={{ marginTop: 16 }}>
                This is a simulated DigiLocker vault because partner credentials are not
                configured. The document structure matches the real API.
              </div>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setConsentOpen(false)}
                disabled={busy}
              >
                Deny
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={grantConsent}
                disabled={busy}
              >
                {busy ? <Loader2 size={15} className="spinner" /> : <ShieldCheck size={15} />}
                Allow access
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
