import type { AuthPayload, Dashboard, TaskSpec, User, Worker, Workload } from '../types'

let accessToken = ''
let refreshInFlight: Promise<AuthPayload | null> | null = null

export function setAccessToken(token: string) { accessToken = token }

async function refreshSession(): Promise<AuthPayload | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async response => response.ok ? await response.json() as AuthPayload : null)
      .catch(() => null)
      .finally(() => { refreshInFlight = null })
  }
  const result = await refreshInFlight
  if (result) accessToken = result.access_token
  return result
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers)
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(path, { ...init, headers, credentials: 'include' })
  if (response.status === 401 && retry && !path.startsWith('/api/auth/')) {
    const renewed = await refreshSession()
    if (renewed) return request<T>(path, init, false)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: unknown }
    const detail = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail.map(item => typeof item === 'object' && item !== null && 'msg' in item ? String(item.msg) : 'Check the highlighted information.').join(' · ') : ''
    throw new Error(detail || `Request failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export const api = {
  restoreSession: refreshSession,
  async register(name: string, email: string, password: string) {
    const result = await request<AuthPayload>('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) }, false)
    accessToken = result.access_token
    return result
  },
  async login(email: string, password: string) {
    const result = await request<AuthPayload>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }, false)
    accessToken = result.access_token
    return result
  },
  async logout() {
    try { await request<void>('/api/auth/logout', { method: 'POST' }, false) } finally { accessToken = '' }
  },
  me: () => request<User>('/api/auth/me'),
  workloadTypes: () => request<TaskSpec[]>('/api/workload-types'),
  dashboard: () => request<Dashboard>('/api/dashboard'),
  workers: () => request<Worker[]>('/api/workers'),
  workloads: (filters: { status?: string; task?: string } = {}) => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status_filter', filters.status)
    if (filters.task) params.set('task', filters.task)
    return request<Workload[]>(`/api/workloads${params.size ? `?${params}` : ''}`)
  },
  workload: (id: string) => request<Workload>(`/api/workloads/${id}`),
  submit: (taskType: string, file?: File, url = '', maxEdge = 1800) => {
    const body = new FormData()
    body.set('task_type', taskType)
    if (url) body.set('url', url)
    if (file) body.set('file', file)
    body.set('max_edge', String(maxEdge))
    return request<Workload>('/api/workloads', { method: 'POST', body })
  },
  remove: (id: string) => request<void>(`/api/workloads/${id}`, { method: 'DELETE' }),
  async artifact(id: string): Promise<Blob> {
    const doFetch = async () => fetch(`/api/workloads/${id}/artifact`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, credentials: 'include' })
    let response = await doFetch()
    if (response.status === 401) {
      const renewed = await refreshSession()
      if (renewed) response = await doFetch()
    }
    if (!response.ok) throw new Error('The artifact is not available yet.')
    return response.blob()
  },
}
