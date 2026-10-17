/**
 * Runtime configuration + capability detection.
 *
 * The product is designed to run in three modes per subsystem:
 *
 *   LIVE      a key is present and the real API is called
 *   DEMO      no key: a faithful local simulator answers instead
 *
 * Nothing here throws when keys are missing - callers check `capabilities`.
 */

import { maskSecret } from '@/lib/utils'

function env(key: string, fallback = ''): string {
  const value = process.env[key]
  if (value === undefined || value === null) return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

const forceDemo = env('FORCE_DEMO_MODE') === '1'

export const config = {
  app: {
    name: 'YojanaMitra',
    tagline: 'Your AI saathi for every government scheme in India',
    url: env('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
    sessionSecret: env('SESSION_SECRET', 'dev-only-secret'),
  },
  gemini: {
    apiKey: env('GEMINI_API_KEY'),
    model: env('GEMINI_MODEL', 'gemini-flash-latest'),
    fallbackModels: env('GEMINI_FALLBACK_MODELS', 'gemini-3.8-flash,gemini-3.5-flash')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  sarvam: {
    apiKey: env('SARVAM_API_KEY'),
    baseUrl: 'https://api.sarvam.ai',
    translateModel: env('SARVAM_TRANSLATE_MODEL', 'sarvam-translate:v1'),
    sttModel: env('SARVAM_STT_MODEL', 'saaras:v3'),
    ttsModel: env('SARVAM_TTS_MODEL', 'bulbul:v3'),
    defaultSpeaker: env('SARVAM_DEFAULT_SPEAKER', 'priya'),
  },
  digilocker: {
    clientId: env('DIGILOCKER_CLIENT_ID'),
    clientSecret: env('DIGILOCKER_CLIENT_SECRET'),
    useSandbox: env('DIGILOCKER_USE_SANDBOX', 'true') !== 'false',
    prodBaseUrl: env(
      'DIGILOCKER_BASE_URL',
      'https://api.digilocker.gov.in/public/oauth2/1',
    ),
    sandboxBaseUrl: env(
      'DIGILOCKER_SANDBOX_BASE_URL',
      'https://sandbox.digilocker.gov.in/public/oauth2/1',
    ),
    redirectUri: env(
      'DIGILOCKER_REDIRECT_URI',
      'http://localhost:3000/api/digilocker/callback',
    ),
  },
} as const

export type CapabilityKey = 'gemini' | 'sarvam' | 'digilocker'

export interface Capability {
  live: boolean
  /** Why the capability is not live, for display in the UI. */
  reason?: string
}

export const capabilities: Record<CapabilityKey, Capability> = {
  gemini: forceDemo
    ? { live: false, reason: 'Demo mode forced (FORCE_DEMO_MODE=1)' }
    : config.gemini.apiKey
      ? { live: true }
      : { live: false, reason: 'GEMINI_API_KEY not set — using the local reasoning engine' },
  sarvam: forceDemo
    ? { live: false, reason: 'Demo mode forced (FORCE_DEMO_MODE=1)' }
    : config.sarvam.apiKey
      ? { live: true }
      : { live: false, reason: 'SARVAM_API_KEY not set — using the offline phrasebook' },
  digilocker: forceDemo
    ? { live: false, reason: 'Demo mode forced (FORCE_DEMO_MODE=1)' }
    : config.digilocker.clientId && config.digilocker.clientSecret
      ? { live: true }
      : { live: false, reason: 'DigiLocker client credentials not set — using the simulator' },
}

export function isLive(key: CapabilityKey): boolean {
  return capabilities[key].live
}

/** Safe summary for the /api/health route and the settings panel. */
export function capabilityReport() {
  return {
    app: config.app.name,
    gemini: {
      live: capabilities.gemini.live,
      model: config.gemini.model,
      key: maskSecret(config.gemini.apiKey),
      reason: capabilities.gemini.reason,
    },
    sarvam: {
      live: capabilities.sarvam.live,
      key: maskSecret(config.sarvam.apiKey),
      translateModel: config.sarvam.translateModel,
      sttModel: config.sarvam.sttModel,
      ttsModel: config.sarvam.ttsModel,
      reason: capabilities.sarvam.reason,
    },
    digilocker: {
      live: capabilities.digilocker.live,
      sandbox: config.digilocker.useSandbox,
      clientId: maskSecret(config.digilocker.clientId),
      baseUrl: config.digilocker.useSandbox
        ? config.digilocker.sandboxBaseUrl
        : config.digilocker.prodBaseUrl,
      reason: capabilities.digilocker.reason,
    },
  }
}

export function digilockerBaseUrl(): string {
  return config.digilocker.useSandbox
    ? config.digilocker.sandboxBaseUrl
    : config.digilocker.prodBaseUrl
}
