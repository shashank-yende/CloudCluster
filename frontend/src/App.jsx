import { useState, useEffect, useCallback } from 'react'
import AuthPage from './components/AuthPage'
import Dashboard from './components/Dashboard'
import { apiFetch } from './api'
import './index.css'

export default function App() {
  const [user, setUser] = useState(() => {
    if (!localStorage.getItem('cc_token')) return null
    const saved = localStorage.getItem('cc_user')
    if (!saved) return null
    try { return JSON.parse(saved) } catch { return null }
  })
  const [authReady, setAuthReady] = useState(() => !localStorage.getItem('cc_token'))
  const [theme, setTheme] = useState(() => localStorage.getItem('cc_theme') === 'light' ? 'light' : 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('cc_theme', theme)
  }, [theme])

  useEffect(() => {
    if (!localStorage.getItem('cc_token')) return undefined
    let cancelled = false
    apiFetch('/api/auth/me')
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (cancelled) return
        if (data?.user) {
          setUser(data.user)
          localStorage.setItem('cc_user', JSON.stringify(data.user))
        } else {
          setUser(null)
          localStorage.removeItem('cc_user')
          localStorage.removeItem('cc_token')
        }
      })
      .catch(error => console.error('Unable to validate the saved session:', error))
      .finally(() => { if (!cancelled) setAuthReady(true) })
    return () => { cancelled = true }
  }, [])

  const handleLogin = (userData, token) => {
    setUser(userData)
    localStorage.setItem('cc_user', JSON.stringify(userData))
    localStorage.setItem('cc_token', token)
    setAuthReady(true)
  }

  const handleLogout = useCallback(async () => {
    try {
      if (localStorage.getItem('cc_token')) await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Unable to revoke the session on the server:', error)
    } finally {
      setUser(null)
      localStorage.removeItem('cc_user')
      localStorage.removeItem('cc_token')
      setAuthReady(true)
    }
  }, [])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  if (!authReady) return <main className="authChecking"><span />Checking your secure workspace…</main>
  if (!user) return <AuthPage onLogin={handleLogin} />
  return <Dashboard user={user} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
}
