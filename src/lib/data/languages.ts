import type { Language } from '@/lib/types'

/**
 * Languages supported by the Sarvam stack.
 *
 * - `sarvam-translate:v1` covers all 22 scheduled Indian languages + English.
 * - `saaras:v3` (STT) covers the same set, so voice input works everywhere.
 * - `bulbul:v3` (TTS) ships voices for English + 10 Indian languages, so
 *   `tts: false` entries let the UI hide the speaker button instead of
 *   producing a failed request.
 */
export const LANGUAGES: Language[] = [
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', tts: true },
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা', tts: true },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', tts: true },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', tts: true },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी', tts: true },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી', tts: true },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', tts: true },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം', tts: true },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', tts: true },
  { code: 'or-IN', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', tts: true },
  { code: 'as-IN', name: 'Assamese', nativeName: 'অসমীয়া', tts: false },
  { code: 'ur-IN', name: 'Urdu', nativeName: 'اُردُو', tts: false },
  { code: 'mai-IN', name: 'Maithili', nativeName: 'मैथिली', tts: false },
  { code: 'sat-IN', name: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', tts: false },
  { code: 'ks-IN', name: 'Kashmiri', nativeName: 'کٲشُر', tts: false },
  { code: 'ne-IN', name: 'Nepali', nativeName: 'नेपाली', tts: false },
  { code: 'kok-IN', name: 'Konkani', nativeName: 'कोंकणी', tts: false },
  { code: 'sd-IN', name: 'Sindhi', nativeName: 'سنڌي', tts: false },
  { code: 'doi-IN', name: 'Dogri', nativeName: 'डोगरी', tts: false },
  { code: 'mni-IN', name: 'Manipuri', nativeName: 'মৈতৈলোন্', tts: false },
  { code: 'brx-IN', name: 'Bodo', nativeName: 'बर’', tts: false },
  { code: 'sa-IN', name: 'Sanskrit', nativeName: 'संस्कृतम्', tts: false },
  { code: 'en-IN', name: 'English', nativeName: 'English', tts: true },
]

export const LANGUAGE_MAP: Record<string, Language> = Object.fromEntries(
  LANGUAGES.map((l) => [l.code, l]),
)

export function getLanguage(code: string): Language {
  return LANGUAGE_MAP[code] ?? LANGUAGE_MAP['en-IN']
}

export function languageName(code: string): string {
  return getLanguage(code).nativeName
}
