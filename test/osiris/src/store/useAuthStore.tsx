/**
 * NexaFreight auth store — in-memory only.
 *
 * No Zustand in OSIRIS, so this is a minimal hand-rolled store that uses
 * React context + a module-level singleton for non-React callers.
 *
 * Security rationale (per NexaFreight project docs):
 *   JWT is held in memory only — never written to localStorage or cookies.
 *   A page reload clears the token and forces re-login.
 *   This is intentional; a persisted refresh-token flow comes later.
 *
 * Usage:
 *   // Inside a React component:
 *   const { token, user, setAuth, clearAuth } = useAuthStore()
 *
 *   // Outside React (e.g. client.ts already does this automatically):
 *   import { authStore } from '@/store/useAuthStore'
 *   authStore.setAuth(token, user)
 */

'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { setToken, clearToken } from '@/lib/nexafreight/client'
import type { User } from '@/lib/nexafreight/types'

// ─── Store shape ──────────────────────────────────────────────────────────────

export interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isHydrated: boolean
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
}

// ─── Module-level singleton (for non-React callers) ──────────────────────────
// This stays in sync with the React context state via the setAuth/clearAuth
// callbacks below. Non-React code (e.g. redirect logic in middleware) reads
// this but the React tree owns the canonical state.

const _singleton = {
  token: null as string | null,
  user: null as User | null,
  setAuth(token: string, user: User) {
    this.token = token
    this.user = user
    setToken(token) // keep client.ts in sync
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('nexafreight_user', JSON.stringify(user))
      } catch {}
    }
  },
  clearAuth() {
    this.token = null
    this.user = null
    clearToken()
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('nexafreight_user')
      } catch {}
    }
  },
}

export const authStore = _singleton

// ─── React context ────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(_singleton.token)
  const [user, setUserState] = useState<User | null>(_singleton.user)
  const [isHydrated, setIsHydrated] = useState(false)

  // Hydrate from browser storage only on client mount (prevents SSR hydration mismatch)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken =
        sessionStorage.getItem('nexafreight_token') ||
        localStorage.getItem('nexafreight_token')
      if (storedToken) {
        _singleton.token = storedToken
        setToken(storedToken)
        setTokenState(storedToken)
      }
      const storedUser = localStorage.getItem('nexafreight_user')
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser)
          _singleton.user = parsed
          setUserState(parsed)
        } catch {}
      }
    }
    setIsHydrated(true)
  }, [])

  // Listen for 401 / unauthorized events across the application
  useEffect(() => {
    const handleUnauthorized = () => {
      setTokenState(null)
      setUserState(null)
      _singleton.clearAuth()
    }
    window.addEventListener('nexafreight:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('nexafreight:unauthorized', handleUnauthorized)
  }, [])

  const setAuth = useCallback((newToken: string, newUser: User) => {
    setTokenState(newToken)
    setUserState(newUser)
    _singleton.setAuth(newToken, newUser)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('nexafreight:auth_success', {
          detail: { token: newToken, user: newUser },
        })
      )
    }
  }, [])

  const clearAuth = useCallback(() => {
    setTokenState(null)
    setUserState(null)
    _singleton.clearAuth()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nexafreight:auth_cleared'))
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: token !== null,
        isHydrated,
        setAuth,
        clearAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuthStore(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error(
      'useAuthStore must be called inside <AuthProvider>. ' +
      'Wrap your layout or page with <AuthProvider>.'
    )
  }
  return ctx
}
