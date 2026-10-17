import type {
  Criterion,
  Education,
  EligibilityField,
  EligibilityResult,
  EligibilityVerdict,
  RuleResult,
  Scheme,
  UserProfile,
} from '@/lib/types'
import { ALL_SCHEMES } from '@/lib/data/schemes'
import { formatINR } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Value normalisation                                                        */
/* -------------------------------------------------------------------------- */

const EDUCATION_ORDER: Record<Education, number> = {
  none: 0,
  primary: 1,
  class10: 2,
  class12: 3,
  iti: 3,
  diploma: 4,
  graduate: 5,
  postgraduate: 6,
}

export const EDUCATION_LABELS: Record<Education, string> = {
  none: 'No formal schooling',
  primary: 'Primary (up to Class V)',
  class10: 'Class X passed',
  class12: 'Class XII passed',
  iti: 'ITI / Vocational',
  diploma: 'Diploma',
  graduate: 'Graduate',
  postgraduate: 'Post-graduate',
}

export const OCCUPATION_LABELS: Record<string, string> = {
  farmer: 'Farmer / cultivator',
  agricultural_labour: 'Agricultural labourer',
  student: 'Student',
  labourer: 'Daily wage labourer',
  street_vendor: 'Street vendor / hawker',
  artisan: 'Artisan / craftsperson',
  business: 'Business / self-employed',
  salaried: 'Salaried employee',
  unemployed: 'Unemployed',
  homemaker: 'Homemaker',
  retired: 'Retired',
  other: 'Other',
}

export const FIELD_LABELS: Record<EligibilityField, string> = {
  age: 'Age',
  gender: 'Gender',
  state: 'State / UT',
  caste: 'Social category',
  annualIncome: 'Annual family income',
  occupation: 'Occupation',
  landHolding: 'Land holding (acres)',
  education: 'Education',
  disability: 'Disability status',
  bpl: 'BPL / priority household',
  maritalStatus: 'Marital status',
  employmentStatus: 'Employment status',
  residence: 'Area of residence',
  familySize: 'Family size',
  hasBankAccount: 'Bank account',
  hasRationCard: 'Ration card',
}

/** Fields worth asking the citizen for, in the order we should ask. */
export const PROFILE_FIELD_ORDER: EligibilityField[] = [
  'state',
  'age',
  'gender',
  'caste',
  'annualIncome',
  'occupation',
  'residence',
  'education',
  'landHolding',
  'maritalStatus',
  'disability',
  'bpl',
  'familySize',
  'hasBankAccount',
  'hasRationCard',
  'employmentStatus',
]

function readField(
  profile: UserProfile,
  field: EligibilityField,
): number | string | boolean | undefined {
  switch (field) {
    case 'age':
      return profile.age
    case 'gender':
      return profile.gender
    case 'state':
      return profile.state
    case 'caste':
      return profile.caste
    case 'annualIncome':
      return profile.annualIncome
    case 'occupation':
      return profile.occupation
    case 'landHolding':
      return profile.landHolding
    case 'education':
      return profile.education
    case 'disability':
      return profile.disability
    case 'bpl':
      return profile.bpl
    case 'maritalStatus':
      return profile.maritalStatus
    case 'employmentStatus':
      return profile.employmentStatus
    case 'residence':
      return profile.residence
    case 'familySize':
      return profile.familySize
    case 'hasBankAccount':
      return profile.hasBankAccount
    case 'hasRationCard':
      return profile.hasRationCard
    default:
      return undefined
  }
}

function describeActual(
  field: EligibilityField,
  actual: number | string | boolean,
): string {
  if (field === 'annualIncome' && typeof actual === 'number') {
    return formatINR(actual)
  }
  if (field === 'age' && typeof actual === 'number') return `${actual} years`
  if (field === 'landHolding' && typeof actual === 'number') {
    return `${actual} acres`
  }
  if (field === 'education' && typeof actual === 'string') {
    return EDUCATION_LABELS[actual as Education] ?? actual
  }
  if (field === 'occupation' && typeof actual === 'string') {
    return OCCUPATION_LABELS[actual] ?? actual.replace(/_/g, ' ')
  }
  if (typeof actual === 'boolean') return actual ? 'yes' : 'no'
  return String(actual).replace(/_/g, ' ')
}

function describeExpected(criterion: Criterion): string {
  const { field, op, value } = criterion
  if (op === 'between' && Array.isArray(value)) {
    const [min, max] = value as [number, number]
    if (field === 'age') return `age between ${min} and ${max}`
    return `a value between ${min} and ${max}`
  }
  if (op === 'lte' && field === 'annualIncome' && typeof value === 'number') {
    return `income at or below ${formatINR(value)}`
  }
  if (op === 'gte' && field === 'age') return `age ${value} or above`
  if (op === 'lte' && field === 'age') return `age ${value} or below`
  if (op === 'lte' && field === 'landHolding') return `land holding up to ${value} acres`
  if (op === 'gte' && field === 'education') {
    return `education of ${EDUCATION_LABELS[value as Education] ?? value} or above`
  }
  if (op === 'in' && Array.isArray(value)) {
    return value
      .map((v) => OCCUPATION_LABELS[String(v)] ?? String(v).toUpperCase())
      .join(' or ')
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return String(value)
}

/* -------------------------------------------------------------------------- */
/*  Single rule evaluation                                                     */
/* -------------------------------------------------------------------------- */

function evaluateCriterion(criterion: Criterion, profile: UserProfile): RuleResult {
  const { field, op, value } = criterion

  const actual = readField(profile, field)

  // Requirements we cannot machine-check: report but never fail.
  if (criterion.soft || op === 'truthy') {
    return { criterion, passed: true, unknown: true, reason: criterion.label }
  }

  if (actual === undefined || actual === null) {
    return {
      criterion,
      passed: false,
      unknown: true,
      reason: `We still need your ${FIELD_LABELS[field]?.toLowerCase() ?? field} to check this.`,
    }
  }

  let passed = false
  switch (op) {
    case 'gte':
      if (field === 'education') {
        passed =
          EDUCATION_ORDER[actual as Education] >= EDUCATION_ORDER[value as Education]
      } else {
        passed = Number(actual) >= Number(value)
      }
      break
    case 'lte':
      passed = Number(actual) <= Number(value)
      break
    case 'eq':
      passed = actual === value
      break
    case 'neq':
      passed = actual !== value
      break
    case 'in':
      passed = Array.isArray(value) && (value as unknown[]).includes(actual)
      break
    case 'notIn':
      passed = Array.isArray(value) && !(value as unknown[]).includes(actual)
      break
    case 'between': {
      const [min, max] = value as [number, number]
      passed = Number(actual) >= min && Number(actual) <= max
      break
    }
    default:
      passed = false
  }

  const reason = passed
    ? `${criterion.label} — you meet this.`
    : `You do not meet this: ${criterion.label}. Your ${FIELD_LABELS[field]?.toLowerCase() ?? field} is ${describeActual(field, actual)}, but the scheme needs ${describeExpected(criterion)}.`

  return { criterion, passed, unknown: false, reason }
}

/* -------------------------------------------------------------------------- */
/*  Scheme level evaluation                                                    */
/* -------------------------------------------------------------------------- */

export function evaluateScheme(scheme: Scheme, profile: UserProfile): EligibilityResult {
  const results = scheme.eligibility.map((criterion) =>
    evaluateCriterion(criterion, profile),
  )

  const passed = results.filter((r) => r.passed && !r.unknown && !r.criterion.soft)
  const failed = results.filter((r) => !r.passed && !r.unknown && !r.criterion.soft)
  const unknown = results.filter((r) => r.unknown && !r.criterion.soft)

  const decidable = passed.length + failed.length
  const score = decidable === 0 ? 0.5 : passed.length / decidable

  const strictFailures = failed.filter((r) => r.criterion.strict)

  let verdict: EligibilityVerdict
  if (strictFailures.length > 0) {
    verdict = 'not_eligible'
  } else if (unknown.length > 0) {
    verdict = 'need_info'
  } else if (failed.length === 0) {
    verdict = 'eligible'
  } else if (score >= 0.6) {
    verdict = 'likely'
  } else {
    verdict = 'not_eligible'
  }

  const missingFields = Array.from(
    new Set(unknown.map((r) => r.criterion.field)),
  )

  return {
    schemeId: scheme.id,
    schemeName: scheme.name,
    verdict,
    score,
    passed,
    failed,
    unknown,
    missingFields,
    documents: scheme.documents,
    summary: buildSummary(scheme.name, verdict, failed, unknown),
  }
}

function buildSummary(
  name: string,
  verdict: EligibilityVerdict,
  failed: RuleResult[],
  unknown: RuleResult[],
): string {
  switch (verdict) {
    case 'eligible':
      return `You appear to meet every condition for ${name}.`
    case 'likely':
      return `You meet most conditions for ${name}, but ${failed.length} requirement${
        failed.length === 1 ? '' : 's'
      } may not be satisfied.`
    case 'need_info':
      return `We need ${unknown.length} more detail${
        unknown.length === 1 ? '' : 's'
      } to confirm your eligibility for ${name}.`
    default:
      return `You do not currently meet the core requirements for ${name}.`
  }
}

/* -------------------------------------------------------------------------- */
/*  Matching across the whole catalogue                                        */
/* -------------------------------------------------------------------------- */

export interface MatchOptions {
  /** Minimum verdict to include in the results. */
  minScore?: number
  limit?: number
}

export interface SchemeMatch {
  scheme: Scheme
  result: EligibilityResult
}

export function matchSchemes(
  profile: UserProfile,
  options: MatchOptions = {},
): SchemeMatch[] {
  const { minScore = 0.5, limit = 30 } = options

  const usable = ALL_SCHEMES.filter((scheme) => {
    // A state scheme is only relevant to a citizen of that state; if we don't
    // know the state yet, show it but the engine will report need_info.
    if (scheme.level === 'state' && profile.state && scheme.state !== profile.state) {
      return false
    }
    return true
  })

  const scored = usable.map((scheme) => ({
    scheme,
    result: evaluateScheme(scheme, profile),
  }))

  const rank: Record<EligibilityVerdict, number> = {
    eligible: 3,
    likely: 2,
    need_info: 1,
    not_eligible: 0,
  }

  return scored
    .filter(
      (item) =>
        item.result.verdict !== 'not_eligible' && item.result.score >= minScore,
    )
    .sort((a, b) => {
      const byVerdict = rank[b.result.verdict] - rank[a.result.verdict]
      if (byVerdict !== 0) return byVerdict
      const byScore = b.result.score - a.result.score
      if (byScore !== 0) return byScore
      return (b.scheme.popularity ?? 0) - (a.scheme.popularity ?? 0)
    })
    .slice(0, limit)
}

/**
 * The single highest-value question to ask next: the field that appears in the
 * most still-undecided rules across the schemes we are trying to match.
 */
export function nextBestQuestion(profile: UserProfile): EligibilityField | null {
  const counts = new Map<EligibilityField, number>()

  for (const scheme of ALL_SCHEMES) {
    if (scheme.level === 'state' && profile.state && scheme.state !== profile.state) {
      continue
    }
    for (const criterion of scheme.eligibility) {
      if (criterion.soft) continue
      if (readField(profile, criterion.field) === undefined) {
        counts.set(criterion.field, (counts.get(criterion.field) ?? 0) + 1)
      }
    }
  }

  let best: EligibilityField | null = null
  let bestCount = 0
  for (const field of PROFILE_FIELD_ORDER) {
    const count = counts.get(field) ?? 0
    if (count > bestCount) {
      best = field
      bestCount = count
    }
  }
  return best
}

export function profileCompleteness(profile: UserProfile): number {
  const tracked: EligibilityField[] = [
    'state',
    'age',
    'gender',
    'caste',
    'annualIncome',
    'occupation',
    'residence',
  ]
  const known = tracked.filter((f) => readField(profile, f) !== undefined).length
  return known / tracked.length
}
