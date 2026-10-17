import type { Criterion, Education } from '@/lib/types'

/**
 * Readable constructors for eligibility rules.
 *
 * Scheme definitions read like prose:
 *
 *   eligibility: [ c.ageMin(18), c.incomeMax(250000), c.state('Karnataka') ]
 *
 * `strict` marks a rule that disqualifies outright. Everything else is
 * treated as a soft scoring signal, which is how the engine can say
 * "likely eligible, confirm 2 details" instead of a hard yes/no.
 */

type Without<T> = Omit<T, never>

function rule(criterion: Criterion): Criterion {
  return criterion
}

export const c = {
  ageMin: (years: number): Criterion =>
    rule({
      field: 'age',
      op: 'gte',
      value: years,
      label: `Applicant must be at least ${years} years old`,
      strict: true,
    }),

  ageMax: (years: number): Criterion =>
    rule({
      field: 'age',
      op: 'lte',
      value: years,
      label: `Applicant must be ${years} years old or younger`,
      strict: true,
    }),

  ageBetween: (min: number, max: number): Criterion =>
    rule({
      field: 'age',
      op: 'between',
      value: [min, max],
      label: `Applicant must be between ${min} and ${max} years old`,
      strict: true,
    }),

  gender: (value: 'male' | 'female' | 'other'): Criterion =>
    rule({
      field: 'gender',
      op: 'eq',
      value,
      label: `Open to ${value === 'female' ? 'women' : value === 'male' ? 'men' : 'all genders'} applicants`,
      strict: true,
    }),

  state: (state: string): Criterion =>
    rule({
      field: 'state',
      op: 'eq',
      value: state,
      label: `Applicant must be a resident of ${state}`,
      strict: true,
    }),

  casteIn: (values: string[]): Criterion =>
    rule({
      field: 'caste',
      op: 'in',
      value: values,
      label: `For ${values
        .map((v) => v.toUpperCase())
        .join(' / ')} applicants`,
    }),

  incomeMax: (rupees: number, strict = true): Criterion =>
    rule({
      field: 'annualIncome',
      op: 'lte',
      value: rupees,
      label: `Annual family income must not exceed ₹${new Intl.NumberFormat('en-IN').format(rupees)}`,
      strict,
    }),

  occupationIn: (values: string[], strict = true): Criterion =>
    rule({
      field: 'occupation',
      op: 'in',
      value: values,
      label: `Applicable to ${values
        .map((v) => v.replace(/_/g, ' '))
        .join(', ')}`,
      strict,
    }),

  landMax: (acres: number): Criterion =>
    rule({
      field: 'landHolding',
      op: 'lte',
      value: acres,
      label: `Land holding must not exceed ${acres} acres`,
      strict: true,
    }),

  educationMin: (level: Education): Criterion =>
    rule({
      field: 'education',
      op: 'gte',
      value: level,
      label: `Minimum education: ${level.replace(/(\d+)/, ' $1').replace(/^./, (m) => m.toUpperCase())}`,
    }),

  disability: (): Criterion =>
    rule({
      field: 'disability',
      op: 'eq',
      value: true,
      label: 'Applicant must have a certified disability (40% or more)',
      strict: true,
    }),

  bpl: (): Criterion =>
    rule({
      field: 'bpl',
      op: 'eq',
      value: true,
      label: 'Household must be Below Poverty Line / priority category (NFSA)',
      strict: true,
    }),

  maritalIn: (values: string[]): Criterion =>
    rule({
      field: 'maritalStatus',
      op: 'in',
      value: values,
      label: `Applicable to ${values.map((v) => `${v} applicants`).join(' and ')}`,
    }),

  residence: (value: 'rural' | 'urban'): Criterion =>
    rule({
      field: 'residence',
      op: 'eq',
      value,
      label: `Applicant must reside in a ${value} area`,
      strict: true,
    }),

  employmentIn: (values: string[]): Criterion =>
    rule({
      field: 'employmentStatus',
      op: 'in',
      value: values,
      label: `Applicable to ${values.map((v) => v.replace(/_/g, ' ')).join(', ')} applicants`,
    }),

  familyMax: (size: number): Criterion =>
    rule({
      field: 'familySize',
      op: 'lte',
      value: size,
      label: `Family size up to ${size} members`,
    }),

  bankAccount: (): Criterion =>
    rule({
      field: 'hasBankAccount',
      op: 'eq',
      value: true,
      label: 'Applicant must hold a bank account (Aadhaar-linked preferred)',
      strict: true,
    }),

  rationCard: (): Criterion =>
    rule({
      field: 'hasRationCard',
      op: 'eq',
      value: true,
      label: 'Household must hold a valid ration card',
      strict: true,
    }),

  /** A requirement that is real but not machine-checkable from the profile. */
  soft: (label: string): Criterion =>
    rule({ field: 'age', op: 'truthy', value: true, label, soft: true }),
} satisfies Record<string, (...args: never[]) => Criterion>

export type CriterionBuilder = Without<typeof c>
