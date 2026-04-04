const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

function getToken(): string | null {
  return localStorage.getItem('earniq_token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Request failed')
  return data as T
}

export const api = {
  post: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  get: <T>(path: string): Promise<T> => request<T>(path),
}

export function saveAuth(token: string, worker: unknown, policy: unknown): void {
  localStorage.setItem('earniq_token', token)
  localStorage.setItem('earniq_worker', JSON.stringify(worker))
  localStorage.setItem('earniq_policy', JSON.stringify(policy))
}

export function clearAuth(): void {
  localStorage.removeItem('earniq_token')
  localStorage.removeItem('earniq_worker')
  localStorage.removeItem('earniq_policy')
}

export function getSavedWorker<T>(): T | null {
  const w = localStorage.getItem('earniq_worker')
  return w ? (JSON.parse(w) as T) : null
}

export function getSavedPolicy<T>(): T | null {
  const p = localStorage.getItem('earniq_policy')
  return p ? (JSON.parse(p) as T) : null
}

export function getSavedToken(): string | null {
  return localStorage.getItem('earniq_token')
}
