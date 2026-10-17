import type { SchemeDocument } from '@/lib/types'

/**
 * The canonical document catalogue.
 *
 * `digilockerType` mirrors the DocType codes returned by DigiLocker's
 * `/issued` endpoint, which is what lets the agent auto-attach a fetched
 * document to the right slot in an application.
 */
export interface CatalogueEntry {
  id: string
  name: string
  digilockerType: string
  /** Typical issuing authority, used for realistic display. */
  issuer: string
}

export const DOCUMENT_CATALOGUE: CatalogueEntry[] = [
  { id: 'aadhaar', name: 'Aadhaar Card', digilockerType: 'ADHAR', issuer: 'UIDAI' },
  { id: 'pan', name: 'PAN Card', digilockerType: 'PANCR', issuer: 'Income Tax Department' },
  { id: 'driving_licence', name: 'Driving Licence', digilockerType: 'DRVLC', issuer: 'Ministry of Road Transport & Highways' },
  { id: 'class10_marksheet', name: 'Class X Marksheet', digilockerType: 'MKSHEET', issuer: 'CBSE / State Board' },
  { id: 'class12_marksheet', name: 'Class XII Marksheet', digilockerType: 'MKSHEET12', issuer: 'CBSE / State Board' },
  { id: 'income_certificate', name: 'Income Certificate', digilockerType: 'INCMCT', issuer: 'Revenue Department' },
  { id: 'caste_certificate', name: 'Caste Certificate', digilockerType: 'CSTCTF', issuer: 'Revenue Department' },
  { id: 'domicile_certificate', name: 'Domicile Certificate', digilockerType: 'DOMCIL', issuer: 'Revenue Department' },
  { id: 'ration_card', name: 'Ration Card', digilockerType: 'RATCRD', issuer: 'Food & Civil Supplies Department' },
  { id: 'bank_passbook', name: 'Bank Passbook', digilockerType: 'BANKPS', issuer: 'Bank' },
  { id: 'land_record', name: 'Land Record (RoR / 7-12)', digilockerType: 'LAND', issuer: 'Revenue Department' },
  { id: 'disability_certificate', name: 'Disability Certificate (UDID)', digilockerType: 'DISABL', issuer: 'Department of Empowerment of Persons with Disabilities' },
  { id: 'birth_certificate', name: 'Birth Certificate', digilockerType: 'BRTHCR', issuer: 'Registrar of Births & Deaths' },
  { id: 'marriage_certificate', name: 'Marriage Certificate', digilockerType: 'MRGCRT', issuer: 'Registrar of Marriages' },
  { id: 'death_certificate', name: 'Death Certificate', digilockerType: 'DTHCRT', issuer: 'Registrar of Births & Deaths' },
  { id: 'voter_id', name: 'Voter ID (EPIC)', digilockerType: 'VOTER', issuer: 'Election Commission of India' },
  { id: 'labour_card', name: 'e-Shram / Labour Card', digilockerType: 'LABOUR', issuer: 'Ministry of Labour & Employment' },
  { id: 'student_id', name: 'Student ID / Bonafide Certificate', digilockerType: 'STUDID', issuer: 'Educational Institution' },
  { id: 'noc', name: 'No Objection Certificate', digilockerType: 'NOC', issuer: 'Concerned Authority' },
  { id: 'photograph', name: 'Passport Photograph', digilockerType: 'PHOTO', issuer: 'Self-attested' },
  { id: 'self_declaration', name: 'Self Declaration / Affidavit', digilockerType: 'SLFDCL', issuer: 'Self-attested' },
  { id: 'job_card', name: 'MGNREGA Job Card', digilockerType: 'JOBCRD', issuer: 'Ministry of Rural Development' },
  { id: 'udyam', name: 'Udyam Registration Certificate', digilockerType: 'UDYAM', issuer: 'Ministry of MSME' },
  { id: 'lease_deed', name: 'Lease / Rent Agreement', digilockerType: 'LEASE', issuer: 'Concerned Authority' },
  { id: 'fir_copy', name: 'FIR Copy', digilockerType: 'FIR', issuer: 'State Police' },
  { id: 'medical_certificate', name: 'Medical Certificate', digilockerType: 'MEDCRT', issuer: 'Government Hospital' },
  { id: 'death_of_husband', name: "Husband's Death Certificate", digilockerType: 'DTHCRT', issuer: 'Registrar of Births & Deaths' },
  { id: 'caste_validity', name: 'Caste Validity Certificate', digilockerType: 'CSTVAL', issuer: 'Caste Scrutiny Committee' },
  { id: 'electricity_bill', name: 'Electricity Bill', digilockerType: 'ELECBL', issuer: 'DISCOM' },
  { id: 'swasthya_sathi_card', name: 'Swasthya Sathi Card', digilockerType: 'SWSTH', issuer: 'Department of Health & Family Welfare' },
  { id: 'water_bill', name: 'Water Bill', digilockerType: 'WTRBL', issuer: 'Municipal Corporation' },
]

export const DOCUMENT_INDEX: Record<string, CatalogueEntry> = Object.fromEntries(
  DOCUMENT_CATALOGUE.map((d) => [d.id, d]),
)

function toSchemeDocument(id: string, required: boolean): SchemeDocument {
  const entry = DOCUMENT_INDEX[id]
  if (!entry) {
    // Unknown ids are surfaced as-is rather than silently dropped, so a typo
    // in a scheme definition is obvious in the UI instead of hiding a document.
    return { id, name: id, required }
  }
  return {
    id: entry.id,
    name: entry.name,
    digilockerType: entry.digilockerType,
    required,
  }
}

/** Required documents. `docs('aadhaar', 'income_certificate')` */
export function docs(...ids: string[]): SchemeDocument[] {
  return ids.map((id) => toSchemeDocument(id, true))
}

/** Optional / supporting documents, appended to the required pile. */
export function optionalDocs(...ids: string[]): SchemeDocument[] {
  return ids.map((id) => toSchemeDocument(id, false))
}

export function documentName(id: string): string {
  return DOCUMENT_INDEX[id]?.name ?? id
}
