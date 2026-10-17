'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sparkles,
  Target,
} from 'lucide-react'
import type { EligibilityResult, Scheme, UserProfile } from '@/lib/types'
import { STATE_NAMES } from '@/lib/data/states'
import { EDUCATION_LABELS, OCCUPATION_LABELS } from '@/lib/eligibility'
import { useSession } from '@/components/SessionProvider'
import SchemeCard from '@/components/SchemeCard'
import { cn } from '@/lib/utils'

interface Step {
  id: string
  title: string
  blurb: string
  fields: Array<keyof UserProfile>
}

const STEPS: Step[] = [
  {
    id: 'place',
    title: 'Where you live',
    blurb: 'State schemes only apply to residents, so this decides a lot.',
    fields: ['state', 'residence'],
  },
  {
    id: 'you',
    title: 'About you',
    blurb: 'Many schemes are age, gender or category specific.',
    fields: ['age', 'gender', 'maritalStatus', 'caste', 'disability'],
  },
  {
    id: 'work',
    title: 'Work and income',
    blurb: 'Income limits decide eligibility for most welfare schemes.',
    fields: ['occupation', 'annualIncome', 'landHolding', 'education'],
  },
  {
    id: 'household',
    title: 'Your household',
    blurb: 'Used to check food, housing and insurance schemes.',
    fields: ['familySize', 'bpl', 'hasBankAccount', 'hasRationCard'],
  },
]

type Draft = Record<string, string | number | boolean | undefined>

export default function EligibilityWizard() {
  const { session, updateProfile, refresh } = useSession()
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<Draft>({})
  const [matches, setMatches] = useState<Array<{ scheme: Scheme; result: EligibilityResult }>>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!session) return
    setDraft((prev) => {
      if (Object.keys(prev).length > 0) return prev
      const seeded: Draft = {}
      for (const step of STEPS) {
        for (const field of step.fields) {
          const value = session.profile[field]
          if (value !== undefined && value !== null) seeded[field] = value as never
        }
      }
      return seeded
    })
  }, [session])

  const step = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1

  function setField(field: keyof UserProfile, value: Draft[string]) {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  async function finish() {
    setLoading(true)
    try {
      const payload: Partial<UserProfile> = {}
      for (const [key, value] of Object.entries(draft)) {
        if (value === undefined || value === '') continue
        ;(payload as Record<string, unknown>)[key] =
          key === 'age' || key === 'annualIncome' || key === 'familySize' || key === 'landHolding'
            ? Number(value)
            : value
      }
      await updateProfile(payload)

      const res = await fetch('/api/eligibility?limit=24')
      const data = (await res.json()) as {
        matches: Array<{ scheme: Scheme; result: EligibilityResult }>
      }
      setMatches(data.matches ?? [])
      setDone(true)
      await refresh()
    } finally {
      setLoading(false)
    }
  }

  const eligibleCount = useMemo(
    () =>
      matches.filter(
        (m) => m.result.verdict === 'eligible' || m.result.verdict === 'likely',
      ).length,
    [matches],
  )

  if (done) {
    return (
      <div className="page">
        <div className="container">
          <div className="card card-pad" style={{ marginBottom: 24 }}>
            <div className="row" style={{ gap: 12 }}>
              <span className="brand-mark" style={{ width: 40, height: 40 }}>
                <Target size={20} />
              </span>
              <div>
                <h1 className="section-title" style={{ fontSize: 24 }}>
                  {eligibleCount} schemes look like a match
                </h1>
                <p className="small muted">
                  Ranked by how well they fit what you told us. Open any scheme to see
                  exactly which conditions you meet, and to apply.
                </p>
              </div>
              <span className="spacer" />
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setDone(false)
                  setStepIndex(0)
                }}
              >
                <ArrowLeft size={15} /> Change answers
              </button>
            </div>
          </div>

          {matches.length === 0 ? (
            <div className="card empty">
              <p className="strong">No matches with those answers.</p>
              <p className="small muted">
                Try loosening an answer, or talk to the assistant which can explain
                trade-offs.
              </p>
            </div>
          ) : (
            <div className="grid grid-3">
              {matches.map((match) => (
                <SchemeCard
                  key={match.scheme.id}
                  scheme={match.scheme}
                  result={match.result}
                />
              ))}
            </div>
          )}

          <div className="card card-pad" style={{ marginTop: 24 }}>
            <div className="row row-between row-wrap" style={{ gap: 14 }}>
              <div>
                <div className="strong">Want the agent to apply for you?</div>
                <div className="small muted">
                  It will pull the required documents from DigiLocker, pre-fill the form
                  and submit it after you confirm.
                </div>
              </div>
              <a href="/assistant" className="btn btn-primary">
                <Sparkles size={16} /> Open the assistant
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="container container-narrow">
        <span className="eyebrow">Eligibility check</span>
        <h1 className="section-title">Four short steps</h1>
        <p className="lead" style={{ marginBottom: 24 }}>
          Nothing is sent to any department. This only runs the scheme rules against your
          answers, and you can change them at any time.
        </p>

        <div className="stepper">
          {STEPS.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                'step',
                index === stepIndex && 'active',
                index < stepIndex && 'done',
              )}
            >
              <span className="step-num">
                {index < stepIndex ? <CheckCircle2 size={12} /> : index + 1}
              </span>
              {item.title}
            </div>
          ))}
        </div>

        <div className="card card-pad">
          <h2 style={{ fontSize: 19, marginBottom: 4 }}>{step.title}</h2>
          <p className="small muted" style={{ marginBottom: 20 }}>
            {step.blurb}
          </p>

          <div className="grid grid-2">
            {step.fields.map((field) => (
              <FieldInput
                key={String(field)}
                field={field}
                value={draft[field as string]}
                onChange={setField}
              />
            ))}
          </div>

          <div className="divider" />

          <div className="row-between row-wrap">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
              disabled={stepIndex === 0}
            >
              <ArrowLeft size={15} /> Back
            </button>

            <div className="row" style={{ gap: 10 }}>
              <span className="tiny muted">
                Step {stepIndex + 1} of {STEPS.length}
              </span>
              {isLast ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={finish}
                  disabled={loading}
                >
                  {loading ? <Loader2 size={15} className="spinner" /> : <Target size={15} />}
                  Show my schemes
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setStepIndex((index) => index + 1)}
                >
                  Continue <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: keyof UserProfile
  value: string | number | boolean | undefined
  onChange: (field: keyof UserProfile, value: Draft[string]) => void
}) {
  const id = `field-${String(field)}`

  const label = (text: string) => (
    <label className="field-label" htmlFor={id}>
      {text}
    </label>
  )

  switch (field) {
    case 'state':
      return (
        <div className="field">
          {label('State / Union Territory')}
          <select
            id={id}
            className="select"
            value={String(value ?? '')}
            onChange={(event) => onChange(field, event.target.value)}
          >
            <option value="">Select your state</option>
            {STATE_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )

    case 'residence':
      return (
        <div className="field">
          {label('Do you live in a village or a city?')}
          <select
            id={id}
            className="select"
            value={String(value ?? '')}
            onChange={(event) => onChange(field, event.target.value)}
          >
            <option value="">Select</option>
            <option value="rural">Village / rural area</option>
            <option value="urban">City / town</option>
          </select>
        </div>
      )

    case 'gender':
      return (
        <div className="field">
          {label('Gender')}
          <select
            id={id}
            className="select"
            value={String(value ?? '')}
            onChange={(event) => onChange(field, event.target.value)}
          >
            <option value="">Select</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </div>
      )

    case 'maritalStatus':
      return (
        <div className="field">
          {label('Marital status')}
          <select
            id={id}
            className="select"
            value={String(value ?? '')}
            onChange={(event) => onChange(field, event.target.value)}
          >
            <option value="">Select</option>
            <option value="single">Unmarried</option>
            <option value="married">Married</option>
            <option value="widowed">Widowed</option>
            <option value="divorced">Divorced / separated</option>
          </select>
        </div>
      )

    case 'caste':
      return (
        <div className="field">
          {label('Social category')}
          <select
            id={id}
            className="select"
            value={String(value ?? '')}
            onChange={(event) => onChange(field, event.target.value)}
          >
            <option value="">Select</option>
            <option value="general">General</option>
            <option value="obc">OBC</option>
            <option value="sc">Scheduled Caste</option>
            <option value="st">Scheduled Tribe</option>
            <option value="ews">EWS</option>
          </select>
        </div>
      )

    case 'occupation':
      return (
        <div className="field">
          {label('What do you do for a living?')}
          <select
            id={id}
            className="select"
            value={String(value ?? '')}
            onChange={(event) => onChange(field, event.target.value)}
          >
            <option value="">Select</option>
            {Object.entries(OCCUPATION_LABELS).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </div>
      )

    case 'education':
      return (
        <div className="field">
          {label('Highest education')}
          <select
            id={id}
            className="select"
            value={String(value ?? '')}
            onChange={(event) => onChange(field, event.target.value)}
          >
            <option value="">Select</option>
            {Object.entries(EDUCATION_LABELS).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </div>
      )

    case 'age':
      return (
        <div className="field">
          {label('Age (years)')}
          <input
            id={id}
            className="input"
            type="number"
            min={0}
            max={120}
            value={value === undefined ? '' : String(value)}
            onChange={(event) => onChange(field, event.target.value)}
            placeholder="e.g. 34"
          />
        </div>
      )

    case 'annualIncome':
      return (
        <div className="field">
          {label('Annual family income (₹)')}
          <input
            id={id}
            className="input"
            type="number"
            min={0}
            step={5000}
            value={value === undefined ? '' : String(value)}
            onChange={(event) => onChange(field, event.target.value)}
            placeholder="e.g. 150000"
          />
        </div>
      )

    case 'landHolding':
      return (
        <div className="field">
          {label('Land holding (acres)')}
          <input
            id={id}
            className="input"
            type="number"
            min={0}
            step={0.1}
            value={value === undefined ? '' : String(value)}
            onChange={(event) => onChange(field, event.target.value)}
            placeholder="e.g. 1.5"
          />
        </div>
      )

    case 'familySize':
      return (
        <div className="field">
          {label('Family members')}
          <input
            id={id}
            className="input"
            type="number"
            min={1}
            max={30}
            value={value === undefined ? '' : String(value)}
            onChange={(event) => onChange(field, event.target.value)}
            placeholder="e.g. 5"
          />
        </div>
      )

    case 'disability':
    case 'bpl':
    case 'hasBankAccount':
    case 'hasRationCard': {
      const text = {
        disability: 'Is anyone in the household differently abled?',
        bpl: 'Do you have a BPL / priority household ration card?',
        hasBankAccount: 'Do you have a bank account?',
        hasRationCard: 'Do you have a ration card?',
      }[field as 'disability' | 'bpl' | 'hasBankAccount' | 'hasRationCard']

      return (
        <div className="field">
          {label(text)}
          <div className="row" style={{ gap: 8 }}>
            {[
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                className={cn('chip', value === option.value && 'active')}
                onClick={() => onChange(field, option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )
    }

    default:
      return null
  }
}
