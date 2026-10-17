'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Application, ChatMessage, CitizenDocument, UserProfile } from '@/lib/types'

export interface CapabilityInfo {
  live: boolean
  reason?: string
  [key: string]: unknown
}

export interface SessionSnapshot {
  id: string
  profile: UserProfile
  documents: CitizenDocument[]
  applications: Application[]
  chat: ChatMessage[]
  digilocker: {
    connected: boolean
    method: 'oauth' | 'simulator' | null
    name?: string
    linkedAt?: string
  }
  capabilities: {
    gemini: CapabilityInfo
    sarvam: CapabilityInfo
    digilocker: CapabilityInfo
  }
}

interface SessionValue {
  session: SessionSnapshot | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>
  reset: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/session', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Session request failed (${res.status})`)
      const data = (await res.json()) as SessionSnapshot
      setSession(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateProfile = useCallback(
    async (patch: Partial<UserProfile>) => {
      // Optimistic update, then reconcile with the server.
      setSession((prev) =>
        prev ? { ...prev, profile: { ...prev.profile, ...patch } } : prev,
      )
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      await refresh()
    },
    [refresh],
  )

  const reset = useCallback(async () => {
    await fetch('/api/session', { method: 'DELETE' })
    await refresh()
  }, [refresh])

  const value = useMemo<SessionValue>(
    () => ({ session, loading, error, refresh, updateProfile, reset }),
    [session, loading, error, refresh, updateProfile, reset],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
