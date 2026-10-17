'use client'

import {
  ArrowRight,
  BadgeCheck,
  IndianRupee,
  MapPin,
  Building2,
  CircleAlert,
  HelpCircle,
} from 'lucide-react'
import type { EligibilityResult, Scheme } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n/context'
import { TranslatableText } from '@/components/Voice'

const VERDICT_META: Record<
  EligibilityResult['verdict'],
  { label: string; className: string; icon: typeof BadgeCheck }
> = {
  eligible: { label: 'Eligible', className: 'badge badge-green', icon: BadgeCheck },
  likely: { label: 'Likely eligible', className: 'badge badge-blue', icon: BadgeCheck },
  need_info: { label: 'More info needed', className: 'badge badge-amber', icon: HelpCircle },
  not_eligible: { label: 'Not eligible', className: 'badge badge-red', icon: CircleAlert },
}

export default function SchemeCard({
  scheme,
  result,
  href,
}: {
  scheme: Scheme
  result?: EligibilityResult
  href?: string
}) {
  const { t } = useI18n()
  const target = href ?? `/schemes/${scheme.id}`
  const verdict = result ? VERDICT_META[result.verdict] : null
  const VerdictIcon = verdict?.icon

  return (
    <a
      href={target}
      className="card card-hover scheme-card"
      data-mitra="scheme-card"
      data-mitra-scheme={scheme.id}
    >
      <div className="scheme-card-top">
        <div style={{ minWidth: 0 }}>
          <div className="scheme-name">{scheme.name}</div>
          <div className="row row-wrap tiny muted" style={{ gap: 8, marginTop: 5 }}>
            <span className="row" style={{ gap: 4 }}>
              <MapPin size={11} />
              {scheme.state ?? 'All India'}
            </span>
            <span className="row" style={{ gap: 4 }}>
              <Building2 size={11} />
              {scheme.level === 'central' ? 'Central' : 'State'}
            </span>
          </div>
        </div>
        {verdict && VerdictIcon ? (
          <span className={verdict.className}>
            <VerdictIcon size={12} />
            {verdict.label}
          </span>
        ) : null}
      </div>

      <p className="scheme-summary">
        <TranslatableText text={scheme.summary} />
      </p>

      <div className="stack stack-sm">
        {scheme.benefits.slice(0, 2).map((benefit) => (
          <div className="benefit-line" key={benefit}>
            <IndianRupee size={13} className="muted" style={{ marginTop: 3, flex: 'none' }} />
            <span>
              <TranslatableText text={benefit} />
            </span>
          </div>
        ))}
      </div>

      <div className="row row-wrap" style={{ gap: 6 }}>
        {scheme.categories.slice(0, 2).map((category) => (
          <span className="badge" key={category}>
            {category}
          </span>
        ))}
        {scheme.documents.length > 0 ? (
          <span className="badge">
            {scheme.documents.length} doc{scheme.documents.length === 1 ? '' : 's'}
          </span>
        ) : null}
      </div>

      <div className="spacer" />

      <div className="row-between" style={{ marginTop: 4 }}>
        <span className="small strong row" style={{ gap: 5, color: 'var(--saffron-dark)' }}>
          View details <ArrowRight size={13} />
        </span>
        <span className="tiny muted">{t('action.check')}</span>
      </div>
    </a>
  )
}

export function VerdictBadge({ verdict }: { verdict: EligibilityResult['verdict'] }) {
  const meta = VERDICT_META[verdict]
  const Icon = meta.icon
  return (
    <span className={cn(meta.className)}>
      <Icon size={12} />
      {meta.label}
    </span>
  )
}

export function RuleList({ result }: { result: EligibilityResult }) {
  return (
    <div>
      {[...result.passed, ...result.unknown, ...result.failed].map((rule, index) => {
        const state = rule.passed && !rule.unknown ? 'pass' : rule.unknown ? 'unknown' : 'fail'
        return (
          <div className="rule" key={`${rule.criterion.label}-${index}`}>
            <span className={cn('rule-icon', `rule-${state}`)}>
              {state === 'pass' ? (
                <BadgeCheck size={15} />
              ) : state === 'unknown' ? (
                <HelpCircle size={15} />
              ) : (
                <CircleAlert size={15} />
              )}
            </span>
            <span>
              <span className="strong" style={{ display: 'block' }}>
                {rule.criterion.label}
              </span>
              {!rule.passed && !rule.unknown ? (
                <span className="small muted">{rule.reason}</span>
              ) : null}
              {rule.unknown && !rule.criterion.soft ? (
                <span className="small muted">{rule.reason}</span>
              ) : null}
              {rule.criterion.soft ? (
                <span className="small muted">Documented requirement — verify with the department.</span>
              ) : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}
