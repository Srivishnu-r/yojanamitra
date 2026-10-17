/**
 * Core domain types for YojanaMitra AI.
 *
 * The whole app is driven by this small, explicit vocabulary so that the
 * scheme catalogue, the eligibility engine, the agent tools and the UI all
 * speak the same language.
 */

/* -------------------------------------------------------------------------- */
/*  Schemes                                                                    */
/* -------------------------------------------------------------------------- */

export type SchemeLevel = 'central' | 'state'

export type SchemeCategory =
  | 'Agriculture'
  | 'Health'
  | 'Housing'
  | 'Education'
  | 'Women & Child'
  | 'Employment & Skill'
  | 'Social Security'
  | 'Financial Inclusion'
  | 'Business & MSME'
  | 'Energy'
  | 'Food & Nutrition'
  | 'Water & Sanitation'
  | 'Disability'

export const SCHEME_CATEGORIES: SchemeCategory[] = [
  'Agriculture',
  'Health',
  'Housing',
  'Education',
  'Women & Child',
  'Employment & Skill',
  'Social Security',
  'Financial Inclusion',
  'Business & MSME',
  'Energy',
  'Food & Nutrition',
  'Water & Sanitation',
  'Disability',
]

/** A single machine-checkable eligibility rule. */
export type EligibilityField =
  | 'age'
  | 'gender'
  | 'state'
  | 'caste'
  | 'annualIncome'
  | 'occupation'
  | 'landHolding'
  | 'education'
  | 'disability'
  | 'bpl'
  | 'maritalStatus'
  | 'employmentStatus'
  | 'residence'
  | 'familySize'
  | 'hasBankAccount'
  | 'hasRationCard'

export type EligibilityOp =
  | 'gte'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'in'
  | 'notIn'
  | 'between'
  | 'truthy'

export interface Criterion {
  field: EligibilityField
  op: EligibilityOp
  value: number | string | boolean | string[] | [number, number]
  /** Human readable explanation shown to the citizen. */
  label: string
  /**
   * Strict rules are hard blockers: failing one means the applicant is
   * ineligible even if every other rule passes.
   */
  strict?: boolean
  /**
   * A documented requirement that cannot be derived from the profile
   * (e.g. "the applicant must be a girl child"). Shown to the citizen but
   * never counted as a blocker or against the score.
   */
  soft?: boolean
}

export interface SchemeDocument {
  /** Canonical document id, e.g. `aadhaar`, `income_certificate`. */
  id: string
  name: string
  /** Hint used to auto-match a document coming back from DigiLocker. */
  digilockerType?: string
  required: boolean
}

export interface Scheme {
  id: string
  name: string
  /** Native-script name, used for the language toggle in listings. */
  nameHi?: string
  level: SchemeLevel
  /** State/UT name when `level === 'state'`. */
  state?: string
  ministry?: string
  categories: SchemeCategory[]
  summary: string
  benefits: string[]
  eligibility: Criterion[]
  documents: SchemeDocument[]
  applyUrl: string
  applySteps: string[]
  tags: string[]
  /** Rough popularity used to order the default browse view. */
  popularity?: number
}

/* -------------------------------------------------------------------------- */
/*  Citizen profile                                                            */
/* -------------------------------------------------------------------------- */

export type Gender = 'male' | 'female' | 'other'
export type Caste = 'general' | 'obc' | 'sc' | 'st' | 'ews'
export type Occupation =
  | 'farmer'
  | 'agricultural_labour'
  | 'student'
  | 'labourer'
  | 'street_vendor'
  | 'artisan'
  | 'business'
  | 'salaried'
  | 'unemployed'
  | 'homemaker'
  | 'retired'
  | 'other'
export type Education =
  | 'none'
  | 'primary'
  | 'class10'
  | 'class12'
  | 'iti'
  | 'diploma'
  | 'graduate'
  | 'postgraduate'
export type MaritalStatus = 'single' | 'married' | 'widowed' | 'divorced'
export type EmploymentStatus =
  | 'employed'
  | 'unemployed'
  | 'self_employed'
  | 'student'
export type Residence = 'rural' | 'urban'

export interface UserProfile {
  name?: string
  age?: number
  gender?: Gender
  state?: string
  district?: string
  caste?: Caste
  annualIncome?: number
  occupation?: Occupation
  /** Land holding in acres. */
  landHolding?: number
  education?: Education
  disability?: boolean
  /** Below Poverty Line / priority household. */
  bpl?: boolean
  maritalStatus?: MaritalStatus
  employmentStatus?: EmploymentStatus
  residence?: Residence
  familySize?: number
  hasBankAccount?: boolean
  hasRationCard?: boolean
}

/* -------------------------------------------------------------------------- */
/*  Eligibility results                                                        */
/* -------------------------------------------------------------------------- */

export interface RuleResult {
  criterion: Criterion
  passed: boolean
  /** Short reason, e.g. "Your age 22 is below the minimum age 60". */
  reason: string
  /** True when the field needed to decide was missing. */
  unknown: boolean
}

export type EligibilityVerdict = 'eligible' | 'likely' | 'not_eligible' | 'need_info'

export interface EligibilityResult {
  schemeId: string
  schemeName: string
  verdict: EligibilityVerdict
  /** 0..1 share of rules satisfied. */
  score: number
  passed: RuleResult[]
  failed: RuleResult[]
  unknown: RuleResult[]
  missingFields: EligibilityField[]
  documents: SchemeDocument[]
  summary: string
}

/* -------------------------------------------------------------------------- */
/*  Documents (DigiLocker)                                                     */
/* -------------------------------------------------------------------------- */

export type DocumentStatus = 'verified' | 'available' | 'expired' | 'missing'

export interface CitizenDocument {
  /** Stable key within the citizen's vault. */
  id: string
  /** Canonical document id used by schemes (`aadhaar`, `income_certificate`…). */
  canonicalId: string
  name: string
  issuer: string
  /** Raw DigiLocker URI. */
  uri?: string
  docType?: string
  issuedAt?: string
  validUntil?: string
  status: DocumentStatus
  /** Issuer XML/PDF payload, base64 encoded. */
  content?: string
  mimeType?: string
  /** Fields extracted for pre-filling forms. */
  fields?: Record<string, string>
  /** Where the record came from. */
  source: 'digilocker' | 'simulator' | 'upload'
}

/* -------------------------------------------------------------------------- */
/*  Applications                                                               */
/* -------------------------------------------------------------------------- */

export type ApplicationStatus =
  | 'draft'
  | 'docs_pending'
  | 'ready'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'

export interface ApplicationDocument {
  id: string
  name: string
  required: boolean
  status: 'attached' | 'missing'
  /** Linked citizen document. */
  documentId?: string
  issuedBy?: string
}

export interface TimelineEntry {
  at: string
  label: string
  detail?: string
  actor: 'citizen' | 'agent' | 'department'
}

export interface Application {
  id: string
  schemeId: string
  schemeName: string
  schemeLevel: SchemeLevel
  state?: string
  referenceNo?: string
  status: ApplicationStatus
  createdAt: string
  updatedAt: string
  documents: ApplicationDocument[]
  /** Pre-filled form values, keyed by field name. */
  fields: Record<string, string>
  timeline: TimelineEntry[]
  /** Set when the agent submitted on the citizen's behalf. */
  submittedByAgent?: boolean
}

/* -------------------------------------------------------------------------- */
/*  Chat / agent                                                               */
/* -------------------------------------------------------------------------- */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  /** Language the message was authored in. */
  lang?: string
  /** Translation of the content, if requested. */
  translation?: { lang: string; text: string }
}

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'tool'; id: string; name: string; label: string; args: Record<string, unknown> }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; summary: string; data?: unknown }
  | { type: 'text'; delta: string }
  | { type: 'schemes'; schemes: string[] }
  | { type: 'profile'; profile: UserProfile }
  | { type: 'application'; application: Application }
  | { type: 'error'; message: string }
  | { type: 'done'; engine: 'gemini' | 'local' }

/* -------------------------------------------------------------------------- */
/*  Languages                                                                  */
/* -------------------------------------------------------------------------- */

export interface Language {
  /** BCP-47 code used by Sarvam, e.g. `hi-IN`. */
  code: string
  name: string
  nativeName: string
  /** Whether Sarvam Bulbul TTS has a voice for this language. */
  tts: boolean
}
