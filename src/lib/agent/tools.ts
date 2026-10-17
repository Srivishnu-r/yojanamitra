import type { Application, CitizenDocument, UserProfile } from '@/lib/types'
import type { FunctionDeclaration } from '@/lib/gemini'
import type { SessionState } from '@/lib/store'
import { searchSchemes, getScheme, ALL_SCHEMES } from '@/lib/data/schemes'
import { evaluateScheme, matchSchemes, nextBestQuestion } from '@/lib/eligibility'
import {
  enrichProfileFromDocuments,
  simulateVault,
  digilockerLive,
  fetchLiveProfile,
  fetchIssuedDocuments,
  canonicalIdForType,
} from '@/lib/digilocker'
import {
  autofillApplication,
  createApplication,
  missingRequiredDocuments,
  submitApplication,
} from '@/lib/applications'
import { synthesize, translate, sarvamLive, SarvamError } from '@/lib/sarvam'
import { formatINR, titleCase } from '@/lib/utils'

export interface ToolContext {
  session: SessionState
}

export interface ToolResult {
  ok: boolean
  /** One-line description shown in the assistant's activity feed. */
  summary: string
  /** Structured payload handed back to the model. */
  data?: Record<string, unknown>
}

export interface ToolDefinition {
  name: string
  /** Short human label for the activity feed. */
  label: string
  description: string
  declaration: FunctionDeclaration
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function num(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function str(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const s = String(value).trim()
  return s.length > 0 ? s : undefined
}

function bool(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  const s = String(value).toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(s)) return true
  if (['false', 'no', 'n', '0'].includes(s)) return false
  return undefined
}

const GENDERS = ['male', 'female', 'other']
const CASTES = ['general', 'obc', 'sc', 'st', 'ews']
const EDUCATIONS = [
  'none',
  'primary',
  'class10',
  'class12',
  'iti',
  'diploma',
  'graduate',
  'postgraduate',
]
const OCCUPATIONS = [
  'farmer',
  'agricultural_labour',
  'student',
  'labourer',
  'street_vendor',
  'artisan',
  'business',
  'salaried',
  'unemployed',
  'homemaker',
  'retired',
  'other',
]
const RESIDENCES = ['rural', 'urban']
const MARITAL = ['single', 'married', 'widowed', 'divorced']
const EMPLOYMENT = ['employed', 'unemployed', 'self_employed', 'student']

function compactScheme(schemeId: string) {
  const scheme = getScheme(schemeId)
  if (!scheme) return null
  return {
    id: scheme.id,
    name: scheme.name,
    level: scheme.level,
    state: scheme.state ?? null,
    categories: scheme.categories,
    summary: scheme.summary,
    benefits: scheme.benefits,
    applyUrl: scheme.applyUrl,
  }
}

/* -------------------------------------------------------------------------- */
/*  Tool declarations                                                          */
/* -------------------------------------------------------------------------- */

export const TOOLS: ToolDefinition[] = [
  /* ------------------------------- discovery ------------------------------ */
  {
    name: 'search_schemes',
    label: 'Searching the scheme catalogue',
    description:
      'Search Indian government schemes by free text and filters. Use this to find schemes matching the citizen\'s situation, occupation, need or state.',
    declaration: {
      name: 'search_schemes',
      description:
        'Search the government scheme catalogue by keyword, state, category or level. Returns matching schemes with ids you can pass to other tools.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'STRING',
            description:
              'Free text such as "pension for widows", "solar subsidy", "student scholarship", "farm loan".',
          },
          state: {
            type: 'STRING',
            description:
              'Indian state or union territory name, e.g. "Karnataka". Also returns central schemes.',
          },
          category: {
            type: 'STRING',
            description:
              'One of: Agriculture, Health, Housing, Education, Women & Child, Employment & Skill, Social Security, Financial Inclusion, Business & MSME, Energy, Food & Nutrition, Water & Sanitation, Disability.',
          },
          level: {
            type: 'STRING',
            description: 'Either "central" or "state".',
          },
          limit: { type: 'INTEGER', description: 'Maximum results, default 8.' },
        },
      },
    },
    async execute(args) {
      const results = searchSchemes({
        text: str(args.query) ?? '',
        state: str(args.state) ?? str(args.state_name),
        category: str(args.category) as never,
        level: str(args.level) as never,
        limit: num(args.limit) ?? 8,
      })

      return {
        ok: true,
        summary: `Found ${results.length} scheme${results.length === 1 ? '' : 's'}`,
        data: {
          count: results.length,
          schemes: results.map((s) => ({
            id: s.id,
            name: s.name,
            level: s.level,
            state: s.state ?? null,
            categories: s.categories,
            summary: s.summary,
          })),
        },
      }
    },
  },

  {
    name: 'get_scheme_details',
    label: 'Reading scheme details',
    description:
      'Fetch the full detail of one scheme: benefits, every eligibility condition, required documents and the application steps.',
    declaration: {
      name: 'get_scheme_details',
      description:
        'Get complete details for a single scheme by id, including all eligibility conditions, required documents and application steps.',
      parameters: {
        type: 'object',
        properties: {
          scheme_id: { type: 'STRING', description: 'The scheme id from search_schemes.' },
        },
        required: ['scheme_id'],
      },
    },
    async execute(args) {
      const scheme = getScheme(str(args.scheme_id) ?? '')
      if (!scheme) {
        return { ok: false, summary: `No scheme found with id "${args.scheme_id}"` }
      }
      return {
        ok: true,
        summary: `Loaded ${scheme.name}`,
        data: {
          ...compactScheme(scheme.id),
          ministry: scheme.ministry ?? null,
          tags: scheme.tags,
          eligibility: scheme.eligibility.map((c) => c.label),
          hardRequirements: scheme.eligibility
            .filter((c) => c.strict)
            .map((c) => c.label),
          softRequirements: scheme.eligibility
            .filter((c) => c.soft)
            .map((c) => c.label),
          requiredDocuments: scheme.documents
            .filter((d) => d.required)
            .map((d) => ({ id: d.id, name: d.name })),
          optionalDocuments: scheme.documents
            .filter((d) => !d.required)
            .map((d) => ({ id: d.id, name: d.name })),
          applySteps: scheme.applySteps,
        },
      }
    },
  },

  /* ------------------------------ eligibility ----------------------------- */
  {
    name: 'check_eligibility',
    label: 'Checking eligibility',
    description:
      'Evaluate the citizen\'s eligibility. With a scheme_id it checks that scheme; without one it ranks every scheme they could qualify for.',
    declaration: {
      name: 'check_eligibility',
      description:
        'Check eligibility against the citizen profile. Pass scheme_id to test one scheme, or omit it to rank all matching schemes.',
      parameters: {
        type: 'object',
        properties: {
          scheme_id: {
            type: 'STRING',
            description: 'Optional. Scheme id to test. Omit to rank all schemes.',
          },
        },
      },
    },
    async execute(args, ctx) {
      const schemeId = str(args.scheme_id)

      if (schemeId) {
        const scheme = getScheme(schemeId)
        if (!scheme) {
          return { ok: false, summary: `No scheme found with id "${schemeId}"` }
        }
        const result = evaluateScheme(scheme, ctx.session.profile)
        return {
          ok: true,
          summary: `Verdict for ${scheme.name}: ${result.verdict.replace('_', ' ')}`,
          data: {
            schemeId: scheme.id,
            schemeName: scheme.name,
            verdict: result.verdict,
            confidence: Math.round(result.score * 100),
            metConditions: result.passed.map((r) => r.criterion.label),
            failedConditions: result.failed.map((r) => r.reason),
            needsInfo: result.unknown.map((r) => r.criterion.label),
            missingProfileFields: result.missingFields,
            requiredDocuments: result.documents
              .filter((d) => d.required)
              .map((d) => d.name),
          },
        }
      }

      const matches = matchSchemes(ctx.session.profile, { limit: 10 })
      return {
        ok: true,
        summary: `Ranked ${matches.length} schemes by fit`,
        data: {
          profileCompleteness: ctx.session.profile,
          nextBestQuestion: nextBestQuestion(ctx.session.profile),
          matches: matches.map((m) => ({
            schemeId: m.scheme.id,
            schemeName: m.scheme.name,
            level: m.scheme.level,
            state: m.scheme.state ?? null,
            verdict: m.result.verdict,
            confidence: Math.round(m.result.score * 100),
            blockedBy: m.result.failed.map((r) => r.criterion.label),
            missingInfo: m.result.missingFields,
          })),
        },
      }
    },
  },

  /* -------------------------------- profile ------------------------------- */
  {
    name: 'update_profile',
    label: 'Updating your profile',
    description:
      'Save facts the citizen has told you: age, gender, state, income, occupation, caste, land holding and so on. Call this whenever you learn something new.',
    declaration: {
      name: 'update_profile',
      description:
        'Save or update citizen profile fields. Only pass the fields you actually learned. This drives eligibility matching.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'STRING', description: 'Full name.' },
          age: { type: 'INTEGER', description: 'Age in years.' },
          gender: { type: 'STRING', description: `One of: ${GENDERS.join(', ')}.` },
          state: { type: 'STRING', description: 'State or union territory of residence.' },
          district: { type: 'STRING', description: 'District.' },
          caste: { type: 'STRING', description: `One of: ${CASTES.join(', ')}.` },
          annual_income: { type: 'INTEGER', description: 'Annual family income in rupees.' },
          occupation: { type: 'STRING', description: `One of: ${OCCUPATIONS.join(', ')}.` },
          land_holding: { type: 'NUMBER', description: 'Land holding in acres.' },
          education: { type: 'STRING', description: `One of: ${EDUCATIONS.join(', ')}.` },
          disability: { type: 'BOOLEAN', description: 'Has a certified disability.' },
          bpl: { type: 'BOOLEAN', description: 'Below Poverty Line / priority household.' },
          marital_status: { type: 'STRING', description: `One of: ${MARITAL.join(', ')}.` },
          employment_status: { type: 'STRING', description: `One of: ${EMPLOYMENT.join(', ')}.` },
          residence: { type: 'STRING', description: `One of: ${RESIDENCES.join(', ')}.` },
          family_size: { type: 'INTEGER', description: 'Number of family members.' },
          has_bank_account: { type: 'BOOLEAN', description: 'Holds a bank account.' },
          has_ration_card: { type: 'BOOLEAN', description: 'Holds a ration card.' },
        },
      },
    },
    async execute(args, ctx) {
      const profile = ctx.session.profile
      const updated: string[] = []

      const set = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => {
        if (value === undefined) return
        profile[key] = value
        updated.push(titleCase(String(key)))
      }

      set('name', str(args.name))
      set('age', num(args.age))
      set(
        'gender',
        GENDERS.includes(String(args.gender)) ? (args.gender as UserProfile['gender']) : undefined,
      )
      set('state', str(args.state))
      set('district', str(args.district))
      set('caste', CASTES.includes(String(args.caste)) ? (args.caste as UserProfile['caste']) : undefined)
      set('annualIncome', num(args.annual_income))
      set(
        'occupation',
        OCCUPATIONS.includes(String(args.occupation))
          ? (args.occupation as UserProfile['occupation'])
          : undefined,
      )
      set('landHolding', num(args.land_holding))
      set(
        'education',
        EDUCATIONS.includes(String(args.education))
          ? (args.education as UserProfile['education'])
          : undefined,
      )
      set('disability', bool(args.disability))
      set('bpl', bool(args.bpl))
      set(
        'maritalStatus',
        MARITAL.includes(String(args.marital_status))
          ? (args.marital_status as UserProfile['maritalStatus'])
          : undefined,
      )
      set(
        'employmentStatus',
        EMPLOYMENT.includes(String(args.employment_status))
          ? (args.employment_status as UserProfile['employmentStatus'])
          : undefined,
      )
      set(
        'residence',
        RESIDENCES.includes(String(args.residence))
          ? (args.residence as UserProfile['residence'])
          : undefined,
      )
      set('familySize', num(args.family_size))
      set('hasBankAccount', bool(args.has_bank_account))
      set('hasRationCard', bool(args.has_ration_card))

      if (updated.length === 0) {
        return {
          ok: false,
          summary: 'No valid profile fields were provided',
        }
      }

      return {
        ok: true,
        summary: `Saved ${updated.length} detail${updated.length === 1 ? '' : 's'}: ${updated.join(', ')}`,
        data: {
          saved: profile,
          nextBestQuestion: nextBestQuestion(profile),
        },
      }
    },
  },

  {
    name: 'get_my_profile',
    label: 'Reading your profile',
    description:
      'Read everything currently known about the citizen and which missing detail would improve matching the most.',
    declaration: {
      name: 'get_my_profile',
      description:
        'Return the citizen profile currently on record, plus the single most valuable missing field to ask about next.',
      parameters: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      return {
        ok: true,
        summary: 'Loaded your profile',
        data: {
          profile: ctx.session.profile,
          nextBestQuestion: nextBestQuestion(ctx.session.profile),
          digilockerConnected: ctx.session.digilocker.connected,
          documentCount: ctx.session.documents.length,
        },
      }
    },
  },

  /* ------------------------------- documents ------------------------------ */
  {
    name: 'list_my_documents',
    label: 'Checking your DigiLocker',
    description:
      'List the documents already fetched from DigiLocker, so you know which documents can be attached to an application.',
    declaration: {
      name: 'list_my_documents',
      description:
        'List the citizen documents already available from DigiLocker, with the canonical document ids.',
      parameters: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      return {
        ok: true,
        summary: `${ctx.session.documents.length} document(s) in the vault`,
        data: {
          connected: ctx.session.digilocker.connected,
          method: ctx.session.digilocker.method,
          documents: ctx.session.documents.map((d) => ({
            id: d.id,
            canonicalId: d.canonicalId,
            name: d.name,
            issuer: d.issuer,
            status: d.status,
            issuedAt: d.issuedAt ?? null,
          })),
        },
      }
    },
  },

  {
    name: 'fetch_digilocker_documents',
    label: 'Fetching documents from DigiLocker',
    description:
      'Connect to DigiLocker and pull the citizen\'s issued documents (Aadhaar, PAN, income certificate, marksheets and so on) so they can be attached to applications without any uploads.',
    declaration: {
      name: 'fetch_digilocker_documents',
      description:
        'Connect to the citizen\'s DigiLocker and fetch their issued documents into the vault. Call this before starting an application so documents can be auto-attached. Requires the citizen to have consented.',
      parameters: {
        type: 'object',
        properties: {
          consented: {
            type: 'BOOLEAN',
            description:
              'Set true only after the citizen has agreed to share their DigiLocker documents.',
          },
        },
      },
    },
    async execute(args, ctx) {
      if (bool(args.consented) !== true) {
        return {
          ok: false,
          summary: 'Waiting for the citizen to consent to DigiLocker access',
          data: {
            needsConsent: true,
            message:
              'Ask the citizen for permission to read their DigiLocker documents before calling this tool again with consented=true.',
          },
        }
      }

      let documents: CitizenDocument[]
      let identity = ctx.session.profile.name

      if (digilockerLive() && ctx.session.digilocker.accessToken) {
        const [profile, issued] = await Promise.all([
          fetchLiveProfile(ctx.session.digilocker.accessToken),
          fetchIssuedDocuments(ctx.session.digilocker.accessToken),
        ])
        identity = profile.name
        documents = issued.map((item, index) => {
          const canonicalId = canonicalIdForType(item.doctype, item.name)
          return {
            id: `dl_${index}_${canonicalId}`,
            canonicalId,
            name: item.name,
            issuer: item.issuer,
            uri: item.uri,
            docType: item.doctype,
            issuedAt: item.date,
            status: 'verified' as const,
            source: 'digilocker' as const,
          }
        })
      } else {
        documents = simulateVault(ctx.session.profile)
      }

      // Merge: keep any document already in the vault, add the new ones.
      const byKey = new Map<string, CitizenDocument>()
      for (const doc of [...ctx.session.documents, ...documents]) {
        byKey.set(doc.canonicalId, doc)
      }
      ctx.session.documents = Array.from(byKey.values())
      ctx.session.profile = enrichProfileFromDocuments(
        ctx.session.profile,
        ctx.session.documents,
      )
      ctx.session.digilocker = {
        ...ctx.session.digilocker,
        connected: true,
        method: digilockerLive() ? 'oauth' : 'simulator',
        name: identity,
        linkedAt: new Date().toISOString(),
      }

      return {
        ok: true,
        summary: `Fetched ${documents.length} document(s) from DigiLocker`,
        data: {
          method: ctx.session.digilocker.method,
          documents: ctx.session.documents.map((d) => ({
            canonicalId: d.canonicalId,
            name: d.name,
            issuer: d.issuer,
          })),
          profileImprovedWith: ctx.session.profile,
        },
      }
    },
  },

  /* ------------------------------ applications ---------------------------- */
  {
    name: 'start_application',
    label: 'Starting an application',
    description:
      'Open a new application for a scheme. This builds the document checklist, checks which documents are already in DigiLocker, and pre-fills the form.',
    declaration: {
      name: 'start_application',
      description:
        'Create a draft application for a scheme, pre-filling the form from the profile and DigiLocker records and listing which documents are missing.',
      parameters: {
        type: 'object',
        properties: {
          scheme_id: { type: 'STRING', description: 'The scheme id to apply for.' },
        },
        required: ['scheme_id'],
      },
    },
    async execute(args, ctx) {
      const scheme = getScheme(str(args.scheme_id) ?? '')
      if (!scheme) {
        return { ok: false, summary: `No scheme found with id "${args.scheme_id}"` }
      }

      const existing = ctx.session.applications.find(
        (a) => a.schemeId === scheme.id && a.status !== 'rejected',
      )
      if (existing) {
        return {
          ok: true,
          summary: `An application for ${scheme.name} already exists`,
          data: {
            applicationId: existing.id,
            status: existing.status,
            referenceNo: existing.referenceNo ?? null,
            alreadyStarted: true,
          },
        }
      }

      const application = createApplication(
        scheme,
        ctx.session.profile,
        ctx.session.documents,
        'agent',
      )
      ctx.session.applications.push(application)

      const missing = missingRequiredDocuments(application)

      return {
        ok: true,
        summary: `Started application for ${scheme.name}`,
        data: {
          applicationId: application.id,
          status: application.status,
          filledFields: Object.keys(application.fields).length,
          attachedDocuments: application.documents.filter((d) => d.status === 'attached').length,
          missingDocuments: missing.map((d) => ({ id: d.id, name: d.name })),
          missingCount: missing.length,
          nextStep:
            missing.length > 0
              ? `Fetch the missing documents from DigiLocker, or ask the citizen to obtain them.`
              : 'All documents are attached. Confirm with the citizen and then submit.',
        },
      }
    },
  },

  {
    name: 'autofill_application',
    label: 'Auto-filling the form',
    description:
      'Re-run auto-fill on a draft application to pick up newly fetched documents or profile details.',
    declaration: {
      name: 'autofill_application',
      description:
        'Re-populate an existing application form from the latest profile and DigiLocker documents.',
      parameters: {
        type: 'object',
        properties: {
          application_id: { type: 'STRING', description: 'The application id.' },
        },
        required: ['application_id'],
      },
    },
    async execute(args, ctx) {
      const id = str(args.application_id) ?? ''
      const index = ctx.session.applications.findIndex((a) => a.id === id)
      if (index === -1) {
        return { ok: false, summary: `No application found with id "${id}"` }
      }
      const application = ctx.session.applications[index]
      const scheme = getScheme(application.schemeId)
      if (!scheme) {
        return { ok: false, summary: `Scheme ${application.schemeId} is missing from the catalogue` }
      }

      const updated = autofillApplication(
        application,
        scheme,
        ctx.session.profile,
        ctx.session.documents,
      )
      ctx.session.applications[index] = updated
      const missing = missingRequiredDocuments(updated)

      return {
        ok: true,
        summary: `Filled ${Object.keys(updated.fields).length} fields, ${missing.length} document(s) still missing`,
        data: {
          applicationId: updated.id,
          status: updated.status,
          fields: updated.fields,
          missingDocuments: missing.map((d) => d.name),
        },
      }
    },
  },

  {
    name: 'submit_application',
    label: 'Submitting the application',
    description:
      'Submit a ready application on the citizen\'s behalf. This is irreversible, so it must only be called after explicit confirmation.',
    declaration: {
      name: 'submit_application',
      description:
        'Submit a prepared application on the citizen\'s behalf. Only call with confirm=true after the citizen has explicitly agreed in the conversation.',
      parameters: {
        type: 'object',
        properties: {
          application_id: { type: 'STRING', description: 'The application id to submit.' },
          confirm: {
            type: 'BOOLEAN',
            description:
              'Must be true. Set this only after the citizen has explicitly said to go ahead.',
          },
        },
        required: ['application_id', 'confirm'],
      },
    },
    async execute(args, ctx) {
      const id = str(args.application_id) ?? ''
      const index = ctx.session.applications.findIndex((a) => a.id === id)
      if (index === -1) {
        return { ok: false, summary: `No application found with id "${id}"` }
      }

      const application = ctx.session.applications[index]
      const missing = missingRequiredDocuments(application)
      if (missing.length > 0) {
        return {
          ok: false,
          summary: `Cannot submit: ${missing.length} required document(s) are missing`,
          data: { missingDocuments: missing.map((d) => d.name) },
        }
      }

      if (bool(args.confirm) !== true) {
        return {
          ok: false,
          summary: 'Confirmation required before submitting',
          data: {
            needsConfirmation: true,
            applicationId: application.id,
            schemeName: application.schemeName,
            documentCount: application.documents.length,
            message:
              'Ask the citizen to confirm submission, then call this tool again with confirm=true.',
          },
        }
      }

      const submitted = submitApplication(application, { actor: 'agent' })
      ctx.session.applications[index] = submitted

      return {
        ok: true,
        summary: `Submitted ${submitted.schemeName} — reference ${submitted.referenceNo}`,
        data: {
          applicationId: submitted.id,
          schemeName: submitted.schemeName,
          referenceNo: submitted.referenceNo,
          status: submitted.status,
          submittedByAgent: true,
        },
      }
    },
  },

  {
    name: 'list_applications',
    label: 'Checking your applications',
    description: 'List every application with its status, so you can tell the citizen what is pending.',
    declaration: {
      name: 'list_applications',
      description: 'List all applications with their current status and reference numbers.',
      parameters: { type: 'object', properties: {} },
    },
    async execute(_args, ctx) {
      return {
        ok: true,
        summary: `${ctx.session.applications.length} application(s) on record`,
        data: {
          applications: ctx.session.applications.map((a: Application) => ({
            applicationId: a.id,
            schemeName: a.schemeName,
            status: a.status,
            referenceNo: a.referenceNo ?? null,
            missingDocuments: missingRequiredDocuments(a).map((d) => d.name),
            updatedAt: a.updatedAt,
          })),
        },
      }
    },
  },

  /* -------------------------------- utility ------------------------------- */
  {
    name: 'translate_text',
    label: 'Translating the answer',
    description: 'Translate a short piece of text into an Indian language using Sarvam.',
    declaration: {
      name: 'translate_text',
      description:
        'Translate text into an Indian language code such as hi-IN, ta-IN, bn-IN, mr-IN, te-IN. Use for the final answer when the citizen prefers another language.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'STRING', description: 'The text to translate.' },
          target_language: {
            type: 'STRING',
            description: 'Target language code, e.g. "hi-IN".',
          },
        },
        required: ['text', 'target_language'],
      },
    },
    async execute(args) {
      const text = str(args.text) ?? ''
      const target = str(args.target_language) ?? 'hi-IN'
      if (!sarvamLive()) {
        return {
          ok: false,
          summary: 'Sarvam is not configured, so translation is unavailable',
        }
      }
      try {
        const translated = await translate(text, { targetLanguage: target })
        return { ok: true, summary: `Translated into ${target}`, data: { translated, target } }
      } catch (error) {
        const message = error instanceof SarvamError ? error.message : String(error)
        return { ok: false, summary: `Translation failed: ${message}` }
      }
    },
  },

  {
    name: 'speak_text',
    label: 'Generating audio',
    description:
      'Convert a short answer into speech in an Indian language so the citizen can listen instead of read.',
    declaration: {
      name: 'speak_text',
      description:
        'Produce audio for a short piece of text using Sarvam Bulbul. Returns a confirmation; the app plays the audio to the citizen.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'STRING', description: 'Text to speak. Keep it short.' },
          target_language: {
            type: 'STRING',
            description: 'Language code, e.g. "hi-IN".',
          },
        },
        required: ['text', 'target_language'],
      },
    },
    async execute(args) {
      if (!sarvamLive()) {
        return { ok: false, summary: 'Sarvam is not configured, so audio is unavailable' }
      }
      try {
        const result = await synthesize(str(args.text) ?? '', {
          languageCode: str(args.target_language) ?? 'hi-IN',
        })
        return {
          ok: true,
          summary: 'Audio generated',
          data: { bytes: Math.round((result.audio.length * 3) / 4), mimeType: result.mimeType },
        }
      } catch (error) {
        const message = error instanceof SarvamError ? error.message : String(error)
        return { ok: false, summary: `Speech generation failed: ${message}` }
      }
    },
  },
]

export const TOOL_MAP: Record<string, ToolDefinition> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
)

export const TOOL_DECLARATIONS: FunctionDeclaration[] = TOOLS.map((t) => t.declaration)

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = TOOL_MAP[name]
  if (!tool) {
    return { ok: false, summary: `Unknown tool "${name}"` }
  }
  try {
    return await tool.execute(args, ctx)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[agent] tool ${name} failed:`, message)
    return { ok: false, summary: `Tool ${name} failed: ${message}` }
  }
}

/** Catalogue size, surfaced in the system prompt so the model knows the scope. */
export const CATALOGUE_SIZE = ALL_SCHEMES.length

export { formatINR }
