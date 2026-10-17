import { createHash, randomBytes } from 'node:crypto'
import type { CitizenDocument, UserProfile } from '@/lib/types'
import { config, digilockerBaseUrl, isLive } from '@/lib/config'
import { DOCUMENT_CATALOGUE } from '@/lib/data/documents'
import { fetchJson } from '@/lib/utils'

/**
 * DigiLocker (Meripehchaan) integration.
 *
 * Implements the partner OAuth 2.0 + PKCE flow described by the DigiLocker
 * developer API:
 *
 *   GET  {base}/authorize        -> consent screen
 *   POST {base}/token            -> exchange code for an access token
 *   GET  {base}/user             -> citizen profile
 *   GET  {base}/issued           -> list of issued documents
 *   GET  {base}/file/{uri}       -> download one document
 *
 * When `DIGILOCKER_CLIENT_ID` / `_SECRET` are not configured the module falls
 * back to a simulator that produces structurally identical records, so the
 * rest of the product needs no special-casing.
 */

export interface DigiLockerProfile {
  digilockerid: string
  name: string
  dob?: string
  gender?: string
  eaadhaar?: string
  mobile?: string
  email?: string
  reference_key?: string
}

export interface IssuedDocument {
  name: string
  type: string
  uri: string
  doctype: string
  issuer: string
  date: string
  /** DigiLocker sometimes nests a description. */
  description?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export function digilockerLive(): boolean {
  return isLive('digilocker')
}

/* -------------------------------------------------------------------------- */
/*  PKCE helpers                                                               */
/* -------------------------------------------------------------------------- */

function base64Url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function createOauthState(): string {
  return base64Url(randomBytes(16))
}

/* -------------------------------------------------------------------------- */
/*  Live OAuth flow                                                            */
/* -------------------------------------------------------------------------- */

export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.digilocker.clientId,
    redirect_uri: config.digilocker.redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope: 'openid',
  })
  return `${digilockerBaseUrl()}/authorize?${params.toString()}`
}

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  return fetchJson<TokenResponse>(`${digilockerBaseUrl()}/token`, {
    method: 'POST',
    timeoutMs: 20_000,
    label: 'DigiLocker token exchange',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: config.digilocker.clientId,
      client_secret: config.digilocker.clientSecret,
      redirect_uri: config.digilocker.redirectUri,
      code_verifier: codeVerifier,
    }).toString(),
  })
}

async function authorizedGet<T>(pathname: string, accessToken: string): Promise<T> {
  return fetchJson<T>(`${digilockerBaseUrl()}${pathname}`, {
    timeoutMs: 20_000,
    label: `DigiLocker ${pathname}`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  })
}

export async function fetchLiveProfile(accessToken: string): Promise<DigiLockerProfile> {
  return authorizedGet<DigiLockerProfile>('/user', accessToken)
}

interface IssuedResponse {
  items?: IssuedDocument[]
}

export async function fetchIssuedDocuments(
  accessToken: string,
): Promise<IssuedDocument[]> {
  const data = await authorizedGet<IssuedResponse>('/issued', accessToken)
  return data.items ?? []
}

export interface DownloadedDocument {
  content: string
  mimeType: string
}

export async function downloadDocument(
  accessToken: string,
  uri: string,
): Promise<DownloadedDocument> {
  const res = await fetch(`${digilockerBaseUrl()}/file/${encodeURIComponent(uri)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`DigiLocker file fetch failed (${res.status}) for ${uri}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const mimeType =
    res.headers.get('content-type') ??
    (uri.endsWith('.pdf') ? 'application/pdf' : 'application/xml')
  return { content: buffer.toString('base64'), mimeType }
}

/** Maps a DigiLocker DocType back onto our canonical document id. */
export function canonicalIdForType(docType?: string, fallbackName?: string): string {
  if (docType) {
    const upper = docType.toUpperCase()
    const byType = DOCUMENT_CATALOGUE.find(
      (d) => d.digilockerType.toUpperCase() === upper,
    )
    if (byType) return byType.id
  }
  if (fallbackName) {
    const lower = fallbackName.toLowerCase()
    const byName = DOCUMENT_CATALOGUE.find((d) =>
      lower.includes(d.name.toLowerCase().split(' ')[0]),
    )
    if (byName) return byName.id
  }
  return 'unknown'
}

/* -------------------------------------------------------------------------- */
/*  Simulator                                                                  */
/* -------------------------------------------------------------------------- */

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

function isoYearsFromNow(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function maskId(value: string, visible = 4): string {
  if (value.length <= visible) return value
  return `${'X'.repeat(value.length - visible)}${value.slice(-visible)}`
}

/**
 * Produces the documents a real DigiLocker account would typically hold for a
 * citizen with this profile, with consistent identifiers and extracted fields
 * so form pre-filling can be exercised end to end.
 */
export function simulateVault(profile: UserProfile): CitizenDocument[] {
  const now = new Date()
  const name = profile.name?.trim() || 'Demo Citizen'
  const state = profile.state || 'Delhi'
  const aadhaar = `2${Math.floor(100000000000 + Math.random() * 899999999999)}`
  const pan = `ABCDE${Math.floor(1000 + Math.random() * 8999)}F`
  const dob = profile.age
    ? new Date(
        now.getFullYear() - profile.age,
        now.getMonth(),
        Math.max(1, now.getDate()),
      )
        .toISOString()
        .slice(0, 10)
    : undefined

  const vault: CitizenDocument[] = [
    {
      id: 'sim_aadhaar',
      canonicalId: 'aadhaar',
      name: 'Aadhaar Card',
      issuer: 'UIDAI',
      docType: 'ADHAR',
      uri: 'in.gov.uidai-aadhar',
      issuedAt: isoDaysAgo(1800),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/xml',
      fields: {
        name,
        aadhaarNumber: maskId(aadhaar, 4),
        gender: profile.gender ?? 'female',
        dob: dob ?? '',
        address: `${state}, India`,
      },
    },
    {
      id: 'sim_pan',
      canonicalId: 'pan',
      name: 'PAN Card',
      issuer: 'Income Tax Department',
      docType: 'PANCR',
      uri: 'in.gov.incometax-pan',
      issuedAt: isoDaysAgo(1200),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/xml',
      fields: { name, panNumber: pan, dob: dob ?? '' },
    },
    {
      id: 'sim_income',
      canonicalId: 'income_certificate',
      name: 'Income Certificate',
      issuer: `${state} Revenue Department`,
      docType: 'INCMCT',
      uri: 'in.gov.revenue-income',
      issuedAt: isoDaysAgo(120),
      validUntil: isoYearsFromNow(1),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: {
        name,
        annualIncome: String(profile.annualIncome ?? 120000),
        issuedBy: `${state} Revenue Department`,
      },
    },
    {
      id: 'sim_domicile',
      canonicalId: 'domicile_certificate',
      name: 'Domicile Certificate',
      issuer: `${state} Revenue Department`,
      docType: 'DOMCIL',
      uri: 'in.gov.revenue-domicile',
      issuedAt: isoDaysAgo(400),
      validUntil: isoYearsFromNow(3),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: { name, state, district: profile.district ?? '' },
    },
    {
      id: 'sim_ration',
      canonicalId: 'ration_card',
      name: 'Ration Card',
      issuer: `${state} Food & Civil Supplies Department`,
      docType: 'RATCRD',
      uri: 'in.gov.fcs-ration',
      issuedAt: isoDaysAgo(900),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: {
        name,
        cardType: profile.bpl ? 'Antyodaya (AAY)' : 'Priority Household (PHH)',
        familySize: String(profile.familySize ?? 4),
      },
    },
    {
      id: 'sim_bank',
      canonicalId: 'bank_passbook',
      name: 'Bank Passbook',
      issuer: 'State Bank of India',
      docType: 'BANKPS',
      uri: 'in.gov.bank-passbook',
      issuedAt: isoDaysAgo(60),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: {
        name,
        accountNumber: maskId(String(Math.floor(1e10 + Math.random() * 8e10)), 4),
        ifsc: 'SBIN0001234',
        bank: 'State Bank of India',
      },
    },
    {
      id: 'sim_class12',
      canonicalId: 'class12_marksheet',
      name: 'Class XII Marksheet',
      issuer: 'Central Board of Secondary Education',
      docType: 'MKSHEET12',
      uri: 'in.gov.cbse-marksheet12',
      issuedAt: isoDaysAgo(1500),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: { name, board: 'CBSE', year: String(now.getFullYear() - 4), percentage: '78.4' },
    },
    {
      id: 'sim_land',
      canonicalId: 'land_record',
      name: 'Land Record (RoR)',
      issuer: `${state} Revenue Department`,
      docType: 'LAND',
      uri: 'in.gov.revenue-land',
      issuedAt: isoDaysAgo(300),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: {
        name,
        area: `${(profile.landHolding ?? 1.5).toFixed(2)} acres`,
        surveyNumber: `SY/${Math.floor(100 + Math.random() * 899)}`,
      },
    },
  ]

  if (profile.caste && profile.caste !== 'general') {
    vault.push({
      id: 'sim_caste',
      canonicalId: 'caste_certificate',
      name: 'Caste Certificate',
      issuer: `${state} Revenue Department`,
      docType: 'CSTCTF',
      uri: 'in.gov.revenue-caste',
      issuedAt: isoDaysAgo(700),
      validUntil: isoYearsFromNow(5),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: { name, category: profile.caste.toUpperCase(), state },
    })
  }

  if (profile.disability) {
    vault.push({
      id: 'sim_disability',
      canonicalId: 'disability_certificate',
      name: 'Disability Certificate (UDID)',
      issuer: 'Department of Empowerment of Persons with Disabilities',
      docType: 'DISABL',
      uri: 'in.gov.depwd-udid',
      issuedAt: isoDaysAgo(500),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: { name, udid: `UDID${Math.floor(100000 + Math.random() * 899999)}`, percentage: '60' },
    })
  }

  if (profile.occupation === 'farmer' || profile.occupation === 'agricultural_labour') {
    vault.push({
      id: 'sim_eshram',
      canonicalId: 'labour_card',
      name: 'e-Shram Card',
      issuer: 'Ministry of Labour & Employment',
      docType: 'LABOUR',
      uri: 'in.gov.eshram-card',
      issuedAt: isoDaysAgo(250),
      status: 'verified',
      source: 'simulator',
      mimeType: 'application/pdf',
      fields: { name, uan: maskId(String(Math.floor(1e11 + Math.random() * 8e11)), 4) },
    })
  }

  return vault
}

/* -------------------------------------------------------------------------- */
/*  Profile enrichment                                                         */
/* -------------------------------------------------------------------------- */

/** Fills in empty profile fields from verified document data. */
export function enrichProfileFromDocuments(
  profile: UserProfile,
  documents: CitizenDocument[],
): UserProfile {
  const next: UserProfile = { ...profile }
  const find = (canonicalId: string) =>
    documents.find((d) => d.canonicalId === canonicalId)

  const aadhaar = find('aadhaar')
  if (aadhaar) {
    if (!next.name && aadhaar.fields?.name) next.name = aadhaar.fields.name
    if (!next.gender && aadhaar.fields?.gender) {
      const g = aadhaar.fields.gender.toLowerCase()
      if (g === 'male' || g === 'female' || g === 'other') next.gender = g
    }
    if (!next.age && aadhaar.fields?.dob) {
      const dob = new Date(aadhaar.fields.dob)
      if (!Number.isNaN(dob.getTime())) {
        const years = Math.floor(
          (Date.now() - dob.getTime()) / (365.25 * 86_400_000),
        )
        if (years > 0 && years < 120) next.age = years
      }
    }
  }

  const income = find('income_certificate')
  if (!next.annualIncome && income?.fields?.annualIncome) {
    const value = Number(income.fields.annualIncome)
    if (Number.isFinite(value)) next.annualIncome = value
  }

  if (!next.state) {
    const domicile = find('domicile_certificate')
    if (domicile?.fields?.state) next.state = domicile.fields.state
  }

  if (!next.caste) {
    const caste = find('caste_certificate')
    if (caste?.fields?.category) {
      const value = caste.fields.category.toLowerCase()
      if (['sc', 'st', 'obc', 'general', 'ews'].includes(value)) {
        next.caste = value as UserProfile['caste']
      }
    }
  }

  const land = find('land_record')
  if (next.landHolding === undefined && land?.fields?.area) {
    const acres = Number.parseFloat(land.fields.area)
    if (Number.isFinite(acres)) next.landHolding = acres
  }

  if (next.hasRationCard === undefined) {
    next.hasRationCard = Boolean(find('ration_card'))
  }
  if (next.hasBankAccount === undefined) {
    next.hasBankAccount = Boolean(find('bank_passbook'))
  }
  if (next.disability === undefined) {
    next.disability = Boolean(find('disability_certificate'))
  }

  return next
}

/** Which required documents for a scheme are still missing from the vault. */
export function missingDocuments(
  requiredIds: string[],
  documents: CitizenDocument[],
): string[] {
  const held = new Set(documents.map((d) => d.canonicalId))
  return requiredIds.filter((id) => !held.has(id))
}
