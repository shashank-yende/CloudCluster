import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setAccessToken } from './lib/api'
import { AuthContext, type AuthValue } from './auth-context'
import type { User } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    api.restoreSession().then(payload => {
      if (payload) {
        setAccessToken(payload.access_token)
        if (active) setUser(payload.user)
      }
    }).finally(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])
  const value = useMemo<AuthValue>(() => ({
    user, ready,
    async signIn(email, password) { const payload = await api.login(email, password); setUser(payload.user) },
    async signUp(name, email, password) { const payload = await api.register(name, email, password); setUser(payload.user) },
    async signOut() { try { await api.logout() } finally { setUser(null) } },
  }), [user, ready])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
