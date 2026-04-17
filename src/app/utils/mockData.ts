/**
 * mockData.ts — SystemSimulator
 *
 * All data is now fetched from the backend API (/dashboard, /claims, /zones).
 * The simulator is kept as a thin event bus so existing subscribers don't break,
 * but it no longer generates any hardcoded values.
 */

export class SystemSimulator {
  private listeners: Array<() => void> = []
  private stateTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Notify subscribers every 30s so components can re-fetch from real API
    this.stateTimer = setInterval(() => this.notify(), 30000)
  }

  subscribe(callback: () => void) {
    this.listeners.push(callback)
    return () => { this.listeners = this.listeners.filter(l => l !== callback) }
  }

  private notify() { this.listeners.forEach(l => l()) }

  destroy() { if (this.stateTimer) clearInterval(this.stateTimer) }
}

export const systemSimulator = new SystemSimulator()
