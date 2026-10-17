import type {
  Application,
  ApplicationDocument,
  ApplicationStatus,
  CitizenDocument,
  Scheme,
  SchemeDocument,
  UserProfile,
} from '@/lib/types'
import { uid } from '@/lib/utils'
import { EDUCATION_LABELS, OCCUPATION_LABELS } from '@/lib/eligibility'

/** Builds the document checklist for a scheme against the citizen's vault. */
export function buildChecklist(
  scheme: Scheme,
  documents: CitizenDocument[],
): ApplicationDocument[] {
  return scheme.documents.map((required: SchemeDocument) => {
    const held = documents.find((d) => d.canonicalId === required.id)
    return {
      id: required.id,
      name: required.name,
      required: required.required,
      status: held ? 'attached' : 'missing',
      documentId: held?.id,
      issuedBy: held?.issuer,
    }
  })
}

/**
 * Pre-fills form values from the citizen profile and their verified documents.
 * Document values win over profile values, because they are issuer-verified.
 */
export function buildFormFields(
  scheme: Scheme,
  profile: UserProfile,
  documents: CitizenDocument[],
): Record<string, string> {
  const fields: Record<string, string> = {}

  const docField = (canonicalId: string, key: string): string | undefined => {
    const doc = documents.find((d) => d.canonicalId === canonicalId)
    return doc?.fields?.[key]
  }

  const put = (key: string, value?: string) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      fields[key] = String(value)
    }
  }

  put('fullName', profile.name ?? docField('aadhaar', 'name'))
  put(
    'gender',
    profile.gender ??
      docField('aadhaar', 'gender')?.toLowerCase(),
  )
  put('dateOfBirth', docField('aadhaar', 'dob'))
  put('age', profile.age !== undefined ? String(profile.age) : undefined)
  put('aadhaarNumber', docField('aadhaar', 'aadhaarNumber'))
  put('panNumber', docField('pan', 'panNumber'))
  put('mobile', docField('aadhaar', 'mobile'))
  put('address', docField('aadhaar', 'address'))
  put('state', profile.state ?? docField('domicile_certificate', 'state'))
  put('district', profile.district ?? docField('domicile_certificate', 'district'))
  put('socialCategory', profile.caste?.toUpperCase() ?? docField('caste_certificate', 'category'))
  put(
    'annualFamilyIncome',
    profile.annualIncome !== undefined
      ? String(profile.annualIncome)
      : docField('income_certificate', 'annualIncome'),
  )
  put(
    'occupation',
    profile.occupation ? OCCUPATION_LABELS[profile.occupation] ?? profile.occupation : undefined,
  )
  put(
    'education',
    profile.education ? EDUCATION_LABELS[profile.education] : undefined,
  )
  put(
    'landHoldingAcres',
    profile.landHolding !== undefined
      ? String(profile.landHolding)
      : docField('land_record', 'area'),
  )
  put('bankAccountNumber', docField('bank_passbook', 'accountNumber'))
  put('bankName', docField('bank_passbook', 'bank'))
  put('ifsc', docField('bank_passbook', 'ifsc'))
  put('rationCardType', docField('ration_card', 'cardType'))
  put('householdSize', profile.familySize !== undefined ? String(profile.familySize) : undefined)
  put('maritalStatus', profile.maritalStatus)
  put('residenceType', profile.residence)
  put('disabilityStatus', profile.disability ? 'Yes' : undefined)
  put('schemeName', scheme.name)
  put('schemeLevel', scheme.level === 'central' ? 'Central' : `State (${scheme.state})`)

  return fields
}

export function deriveStatus(checklist: ApplicationDocument[]): ApplicationStatus {
  const missingRequired = checklist.some(
    (d) => d.required && d.status === 'missing',
  )
  return missingRequired ? 'docs_pending' : 'ready'
}

export function createApplication(
  scheme: Scheme,
  profile: UserProfile,
  documents: CitizenDocument[],
  actor: 'citizen' | 'agent' = 'agent',
): Application {
  const now = new Date().toISOString()
  const checklist = buildChecklist(scheme, documents)
  const status = deriveStatus(checklist)

  return {
    id: uid('app'),
    schemeId: scheme.id,
    schemeName: scheme.name,
    schemeLevel: scheme.level,
    state: scheme.state,
    status,
    createdAt: now,
    updatedAt: now,
    documents: checklist,
    fields: buildFormFields(scheme, profile, documents),
    timeline: [
      {
        at: now,
        label: 'Application started',
        detail:
          actor === 'agent'
            ? 'Drafted by the YojanaMitra agent from your verified profile and DigiLocker documents.'
            : 'Started by you.',
        actor,
      },
      {
        at: now,
        label:
          status === 'ready'
            ? 'All required documents attached'
            : `${checklist.filter((d) => d.required && d.status === 'missing').length} document(s) still required`,
        actor: 'agent',
      },
    ],
  }
}

export function autofillApplication(
  application: Application,
  scheme: Scheme,
  profile: UserProfile,
  documents: CitizenDocument[],
): Application {
  const now = new Date().toISOString()
  const checklist = buildChecklist(scheme, documents)
  const fields = buildFormFields(scheme, profile, documents)
  const reused = Object.keys(application.fields).length
  const added = Object.keys(fields).length

  return {
    ...application,
    documents: checklist,
    fields,
    status: application.status === 'submitted' ? application.status : deriveStatus(checklist),
    updatedAt: now,
    timeline: [
      ...application.timeline,
      {
        at: now,
        label: 'Form auto-filled',
        detail:
          reused > 0
            ? `${added} fields populated (${added - reused} newly discovered) from your profile and DigiLocker records.`
            : `${added} fields populated from your profile and DigiLocker records.`,
        actor: 'agent',
      },
    ],
  }
}

export interface SubmitOptions {
  referencePrefix?: string
  actor?: 'agent' | 'citizen'
}

export function submitApplication(
  application: Application,
  options: SubmitOptions = {},
): Application {
  const { referencePrefix = 'YM', actor = 'agent' } = options
  const now = new Date().toISOString()
  const reference = `${referencePrefix}-${new Date().getFullYear()}-${Math.floor(
    100000 + Math.random() * 899999,
  )}`

  return {
    ...application,
    status: 'submitted',
    referenceNo: application.referenceNo ?? reference,
    submittedByAgent: actor === 'agent',
    updatedAt: now,
    timeline: [
      ...application.timeline,
      {
        at: now,
        label: 'Submitted',
        detail:
          actor === 'agent'
            ? `Submitted by the YojanaMitra agent on your behalf. Acknowledgement ${reference}.`
            : `Submitted by you. Acknowledgement ${reference}.`,
        actor,
      },
      {
        at: now,
        label: 'Under review',
        detail: 'The department will verify your documents and decide on the application.',
        actor: 'department',
      },
    ],
  }
}

export function applicationProgress(application: Application): number {
  const stage: Record<ApplicationStatus, number> = {
    draft: 0.15,
    docs_pending: 0.35,
    ready: 0.55,
    submitted: 0.75,
    under_review: 0.85,
    approved: 1,
    rejected: 1,
  }
  return stage[application.status]
}

export function missingRequiredDocuments(application: Application): ApplicationDocument[] {
  return application.documents.filter((d) => d.required && d.status === 'missing')
}
