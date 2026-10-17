/** All 28 states and 8 union territories, with their dominant languages. */

export interface StateInfo {
  name: string
  /** Official / most widely used Sarvam language codes for the region. */
  languages: string[]
}

export const STATES: StateInfo[] = [
  { name: 'Andhra Pradesh', languages: ['te-IN', 'ur-IN', 'en-IN'] },
  { name: 'Arunachal Pradesh', languages: ['en-IN', 'hi-IN'] },
  { name: 'Assam', languages: ['as-IN', 'bn-IN', 'brx-IN'] },
  { name: 'Bihar', languages: ['hi-IN', 'mai-IN', 'ur-IN'] },
  { name: 'Chhattisgarh', languages: ['hi-IN'] },
  { name: 'Goa', languages: ['kok-IN', 'mr-IN', 'en-IN'] },
  { name: 'Gujarat', languages: ['gu-IN', 'hi-IN'] },
  { name: 'Haryana', languages: ['hi-IN', 'pa-IN'] },
  { name: 'Himachal Pradesh', languages: ['hi-IN', 'doi-IN'] },
  { name: 'Jharkhand', languages: ['hi-IN', 'sat-IN'] },
  { name: 'Karnataka', languages: ['kn-IN', 'ur-IN'] },
  { name: 'Kerala', languages: ['ml-IN', 'en-IN'] },
  { name: 'Madhya Pradesh', languages: ['hi-IN'] },
  { name: 'Maharashtra', languages: ['mr-IN', 'hi-IN', 'ur-IN'] },
  { name: 'Manipur', languages: ['mni-IN', 'en-IN'] },
  { name: 'Meghalaya', languages: ['en-IN'] },
  { name: 'Mizoram', languages: ['en-IN'] },
  { name: 'Nagaland', languages: ['en-IN'] },
  { name: 'Odisha', languages: ['or-IN', 'hi-IN'] },
  { name: 'Punjab', languages: ['pa-IN', 'hi-IN'] },
  { name: 'Rajasthan', languages: ['hi-IN'] },
  { name: 'Sikkim', languages: ['ne-IN', 'en-IN'] },
  { name: 'Tamil Nadu', languages: ['ta-IN', 'en-IN'] },
  { name: 'Telangana', languages: ['te-IN', 'ur-IN'] },
  { name: 'Tripura', languages: ['bn-IN', 'en-IN'] },
  { name: 'Uttar Pradesh', languages: ['hi-IN', 'ur-IN'] },
  { name: 'Uttarakhand', languages: ['hi-IN'] },
  { name: 'West Bengal', languages: ['bn-IN', 'hi-IN'] },
  { name: 'Andaman and Nicobar Islands', languages: ['bn-IN', 'ta-IN', 'en-IN'] },
  { name: 'Chandigarh', languages: ['hi-IN', 'pa-IN'] },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', languages: ['gu-IN', 'hi-IN'] },
  { name: 'Delhi', languages: ['hi-IN', 'pa-IN', 'ur-IN'] },
  { name: 'Jammu and Kashmir', languages: ['ur-IN', 'ks-IN', 'doi-IN'] },
  { name: 'Ladakh', languages: ['ur-IN', 'hi-IN'] },
  { name: 'Lakshadweep', languages: ['ml-IN', 'en-IN'] },
  { name: 'Puducherry', languages: ['ta-IN', 'en-IN'] },
]

export const STATE_NAMES: string[] = STATES.map((s) => s.name)

export const STATE_MAP: Record<string, StateInfo> = Object.fromEntries(
  STATES.map((s) => [s.name, s]),
)

export function stateLanguages(state?: string): string[] {
  if (!state) return ['hi-IN', 'en-IN']
  return STATE_MAP[state]?.languages ?? ['hi-IN', 'en-IN']
}

