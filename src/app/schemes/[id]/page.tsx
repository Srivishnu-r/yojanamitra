import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
  IndianRupee,
  MapPin,
  CircleDashed,
  Info,
} from 'lucide-react'
import { getScheme } from '@/lib/data/schemes'
import { getSession } from '@/lib/store'
import { evaluateScheme } from '@/lib/eligibility'
import { RuleList, VerdictBadge } from '@/components/SchemeCard'
import ApplyPanel from '@/components/ApplyPanel'
import { TranslatableText, SpeakButton } from '@/components/Voice'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const scheme = getScheme(id)
  if (!scheme) return { title: 'Scheme not found' }
  return {
    title: scheme.name,
    description: scheme.summary,
  }
}

export default async function SchemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const scheme = getScheme(id)
  if (!scheme) notFound()

  const session = await getSession()
  const eligibility = evaluateScheme(scheme, session.profile)
  const application = session.applications.find((a) => a.schemeId === scheme.id)

  const required = scheme.documents.filter((d) => d.required)
  const optional = scheme.documents.filter((d) => !d.required)
  const held = new Set(session.documents.map((d) => d.canonicalId))
  const missing = required.filter((d) => !held.has(d.id))

  return (
    <div className="page">
      <div className="container">
        <a href="/schemes" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
          <ArrowLeft size={14} /> All schemes
        </a>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.9fr) minmax(300px, 1fr)', gap: 24, alignItems: 'start' }}>
          {/* ------------------------------ main ------------------------------ */}
          <div className="stack stack-lg">
            <div className="card card-pad">
              <div className="row row-wrap" style={{ gap: 6, marginBottom: 12 }}>
                <span className="badge badge-saffron">
                  <Building2 size={11} />
                  {scheme.level === 'central' ? 'Central scheme' : `${scheme.state} scheme`}
                </span>
                {scheme.categories.map((category) => (
                  <span className="badge" key={category}>
                    {category}
                  </span>
                ))}
                <span className="badge badge-blue">
                  <VerdictIconFor verdict={eligibility.verdict} />
                </span>
              </div>

              <h1 style={{ fontSize: 'clamp(22px, 3vw, 30px)', marginBottom: scheme.nameHi ? 6 : 12 }}>
                {scheme.name}
              </h1>
              {scheme.nameHi ? (
                <p className="muted" style={{ marginBottom: 12 }}>
                  {scheme.nameHi}
                </p>
              ) : null}

              <p className="lead" style={{ fontSize: 16, marginBottom: 18 }}>
                <TranslatableText text={scheme.summary} />
              </p>

              <div className="row row-wrap" style={{ gap: 8 }}>
                <SpeakButton
                  text={`${scheme.name}. ${scheme.summary}. ${scheme.benefits.join('. ')}`}
                  label="Listen"
                />
                <a
                  className="btn btn-outline btn-sm"
                  href={scheme.applyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Official portal <ExternalLink size={13} />
                </a>
              </div>

              {scheme.ministry ? (
                <div className="row small muted" style={{ gap: 8, marginTop: 18 }}>
                  <Info size={14} />
                  Implemented by {scheme.ministry}
                </div>
              ) : null}
              {scheme.state ? (
                <div className="row small muted" style={{ gap: 8, marginTop: 6 }}>
                  <MapPin size={14} />
                  Available to residents of {scheme.state}
                </div>
              ) : null}
            </div>

            {/* benefits */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">What you get</span>
              </div>
              <div className="card-body">
                <div className="stack stack-sm">
                  {scheme.benefits.map((benefit) => (
                    <div className="row small" key={benefit} style={{ gap: 10, alignItems: 'flex-start' }}>
                      <IndianRupee
                        size={15}
                        style={{ color: 'var(--saffron-dark)', flex: 'none', marginTop: 3 }}
                      />
                      <span>
                        <TranslatableText text={benefit} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* eligibility */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">Your eligibility</span>
                <VerdictBadge verdict={eligibility.verdict} />
              </div>
              <div className="card-body" style={{ paddingTop: 12 }}>
                <p className="small muted" style={{ marginBottom: 14 }}>
                  {eligibility.summary}
                  {Object.keys(session.profile).length === 0
                    ? ' Fill in your profile in the assistant or the eligibility check for a personal verdict.'
                    : ''}
                </p>

                <div className="row" style={{ gap: 10, marginBottom: 16 }}>
                  <div className="meter" style={{ flex: 1 }}>
                    <div
                      className={
                        eligibility.verdict === 'eligible'
                          ? 'meter-fill meter-fill-green'
                          : 'meter-fill'
                      }
                      style={{ width: `${Math.round(eligibility.score * 100)}%` }}
                    />
                  </div>
                  <span className="small strong">{Math.round(eligibility.score * 100)}%</span>
                </div>

                <RuleList result={eligibility} />
              </div>
            </div>

            {/* documents */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">Documents needed</span>
                {missing.length > 0 ? (
                  <span className="badge badge-amber">{missing.length} missing</span>
                ) : required.length > 0 ? (
                  <span className="badge badge-green">All available</span>
                ) : (
                  <span className="badge">None required</span>
                )}
              </div>
              <div className="card-body" style={{ paddingTop: 14 }}>
                <div className="stack stack-sm">
                  {[...required, ...optional].map((doc) => {
                    const isHeld = held.has(doc.id)
                    return (
                      <div className="row small" key={doc.id} style={{ gap: 10, alignItems: 'flex-start' }}>
                        {isHeld ? (
                          <CheckCircle2
                            size={16}
                            style={{ color: 'var(--green)', flex: 'none', marginTop: 2 }}
                          />
                        ) : (
                          <CircleDashed
                            size={16}
                            style={{
                              color: doc.required ? 'var(--warn)' : 'var(--muted-2)',
                              flex: 'none',
                              marginTop: 2,
                            }}
                          />
                        )}
                        <span style={{ flex: 1 }}>
                          <span className="strong">{doc.name}</span>
                          {!doc.required ? (
                            <span className="tiny muted"> · optional</span>
                          ) : null}
                          <span className="tiny muted" style={{ display: 'block' }}>
                            {isHeld
                              ? 'Available in your DigiLocker vault'
                              : doc.required
                                ? 'Not in your vault yet — the agent can help fetch it'
                                : 'Helpful but not mandatory'}
                          </span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* steps */}
            <div className="card">
              <div className="card-head">
                <span className="card-title">How applying works</span>
              </div>
              <div className="card-body">
                <div className="timeline">
                  {scheme.applySteps.map((step, index) => (
                    <div className="timeline-item" key={step}>
                      <div className="timeline-label">
                        Step {index + 1}
                      </div>
                      <div className="timeline-detail">{step}</div>
                    </div>
                  ))}
                  <div className="timeline-item">
                    <div className="timeline-label">YojanaMitra does the paperwork</div>
                    <div className="timeline-detail">
                      The agent attaches your DigiLocker documents, fills the form and
                      submits it after you confirm.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ----------------------------- sidebar ---------------------------- */}
          <div className="side-panel" style={{ position: 'sticky', top: 88 }}>
            <ApplyPanel
              schemeId={scheme.id}
              schemeName={scheme.name}
              applyUrl={scheme.applyUrl}
              initialApplication={application}
              recommendedFields={[
                { key: 'fullName', label: 'Name' },
                { key: 'state', label: 'State' },
                { key: 'annualFamilyIncome', label: 'Income' },
                { key: 'bankAccountNumber', label: 'Bank a/c' },
              ]}
            />

            <div className="card card-pad">
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                <FileText size={16} className="muted" />
                <span className="strong" style={{ fontSize: 14 }}>
                  Scheme reference
                </span>
              </div>
              <div className="kv">
                <span className="kv-key">Scheme ID</span>
                <span className="kv-val mono">{scheme.id}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Level</span>
                <span className="kv-val">
                  {scheme.level === 'central' ? 'Central' : 'State'}
                </span>
              </div>
              <div className="kv">
                <span className="kv-key">Coverage</span>
                <span className="kv-val">{scheme.state ?? 'All India'}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Documents</span>
                <span className="kv-val">{scheme.documents.length}</span>
              </div>
              <div className="row small muted" style={{ gap: 8, marginTop: 12 }}>
                <CalendarDays size={14} />
                Always confirm deadlines on the official portal.
              </div>
            </div>

            <div className="card card-pad">
              <div className="row" style={{ gap: 8 }}>
                <a href="/assistant" className="btn btn-outline btn-sm btn-block">
                  Ask the assistant about this
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Small icon swapped in for the verdict chip in the header. */
function VerdictIconFor({ verdict }: { verdict: string }) {
  const label =
    verdict === 'eligible'
      ? 'You appear eligible'
      : verdict === 'likely'
        ? 'Likely eligible'
        : verdict === 'need_info'
          ? 'More info needed'
          : 'Not eligible'
  return <span style={{ fontSize: 11.5 }}>{label}</span>
}
