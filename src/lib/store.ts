import { promises as fs } from 'node:fs'
import path from 'node:path'
import { cookies } from 'next/headers'
import type {
  Application,
  ChatMessage,
  CitizenDocument,
  UserProfile,
} from '@/lib/types'
import { uid } from '@/lib/utils'
import { SESSION_COOKIE } from '@/lib/session-constants'

export { SESSION_COOKIE }

/**
 * Lightweight persistence.
 *
 * A single JSON document per session, cached in memory and written through to
 * `.data/sessions/`. That is enough for a single-node deployment and keeps the
 * project dependency-free; swapping in Postgres or Redis means reimplementing
 * only the four functions at the bottom of this file.
 */

export interface DigiLockerLink {
  connected: boolean
  method: 'oauth' | 'simulator' | null
  name?: string
  digilockerId?: string
  linkedAt?: string
  /** Never sent to the browser. */
  accessToken?: string
  refreshToken?: string
  expiresAt?: string
  /** PKCE verifier held between the authorize and callback legs. */
  pkceVerifier?: string
  /** Anti-CSRF state held between the authorize and callback legs. */
  oauthState?: string
}

export interface SessionState {
  id: string
  createdAt: string
  updatedAt: string
  profile: UserProfile
  documents: CitizenDocument[]
  applications: Application[]
  chat: ChatMessage[]
  digilocker: DigiLockerLink
  /** Accumulated token usage, for the settings panel. */
  usage: { geminiCalls: number; sarvamCalls: number }
}

const DATA_DIR = path.join(process.cwd(), '.data', 'sessions')
const cache = new Map<string, SessionState>()

function emptySession(id: string): SessionState {
  const now = new Date().toISOString()
  return {
    id,
    createdAt: now,
    updatedAt: now,
    profile: {},
    documents: [],
    applications: [],
    chat: [],
    digilocker: { connected: false, method: null },
    usage: { geminiCalls: 0, sarvamCalls: 0 },
  }
}

function sessionPath(id: string): string {
  // Guard against path traversal from a tampered cookie.
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '')
  return path.join(DATA_DIR, `${safe}.json`)
}

async function readFromDisk(id: string): Promise<SessionState | null> {
  try {
    const raw = await fs.readFile(sessionPath(id), 'utf8')
    return JSON.parse(raw) as SessionState
  } catch {
    return null
  }
}

async function writeToDisk(state: SessionState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(sessionPath(state.id), JSON.stringify(state, null, 2), 'utf8')
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

/** Reads the session id set by the middleware, or null if absent. */
export async function currentSessionId(): Promise<string | null> {
  const store = await cookies()
  return store.get(SESSION_COOKIE)?.value ?? null
}

export async function loadSession(id: string): Promise<SessionState> {
  const cached = cache.get(id)
  if (cached) return cached

  const fromDisk = await readFromDisk(id)
  const state = fromDisk ?? emptySession(id)
  cache.set(id, state)
  return state
}

export async function saveSession(state: SessionState): Promise<void> {
  state.updatedAt = new Date().toISOString()
  cache.set(state.id, state)
  try {
    await writeToDisk(state)
  } catch (error) {
    console.error('[store] failed to persist session', state.id, error)
  }
}

/** The session for the current request. Middleware guarantees an id exists. */
export async function getSession(): Promise<SessionState> {
  const id = (await currentSessionId()) ?? 'anonymous'
  return loadSession(id)
}

export async function updateSession(
  mutate: (state: SessionState) => void,
): Promise<SessionState> {
  const state = await getSession()
  mutate(state)
  await saveSession(state)
  return state
}

export function newId(prefix: string): string {
  return uid(prefix)
}
