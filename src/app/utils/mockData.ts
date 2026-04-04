import type { DashWorker, IncomeHealth, AIInsight, ZoneRisk, SafeZoneAdvisory,
  ActiveClaim, ClaimHistoryItem, Payout, ZoneData } from '../types/dashboard'

export class SystemSimulator {
  private listeners: Array<() => void> = []
  private currentState: 'normal' | 'warning' | 'disruption' | 'claim' | 'payout' = 'normal'
  private stateTimer: ReturnType<typeof setInterval> | null = null

  constructor() { this.startSimulation() }

  subscribe(callback: () => void) {
    this.listeners.push(callback)
    return () => { this.listeners = this.listeners.filter(l => l !== callback) }
  }

  private notify() { this.listeners.forEach(l => l()) }

  private startSimulation() {
    this.stateTimer = setInterval(() => {
      const states = ['normal', 'warning', 'disruption', 'claim', 'payout'] as const
      const idx = states.indexOf(this.currentState)
      this.currentState = states[(idx + 1) % states.length]
      this.notify()
    }, 30000)
  }

  getCurrentState() { return this.currentState }

  getWorkerData(): DashWorker {
    return {
      name: 'Arjun Kumar', zone: 'Velachery',
      dcsScore: this.currentState === 'normal' ? 35 : this.currentState === 'warning' ? 62 : 85,
      status: this.currentState === 'disruption' ? 'idle' : 'active'
    }
  }

  getIncomeHealth(): IncomeHealth {
    switch (this.currentState) {
      case 'normal':   return { expected_income: 6200, actual_income: 6100, loss_pct: 1.6,  health_status: 'GREEN' }
      case 'warning':  return { expected_income: 6200, actual_income: 4800, loss_pct: 22.6, health_status: 'YELLOW' }
      default:         return { expected_income: 6200, actual_income: 1400, loss_pct: 77.4, health_status: 'RED' }
    }
  }

  getAIInsight(): AIInsight | null {
    if (this.currentState === 'normal') return null
    if (this.currentState === 'warning')
      return { prediction_window: '3 hours', risk_reason: 'Heavy rainfall expected in your zone. Risk level: HIGH', confidence: 87 }
    return { prediction_window: 'Active', risk_reason: 'Heavy rainfall confirmed in Velachery (18mm/hr). Income disruption detected.', confidence: 95 }
  }

  getZoneRisk(): ZoneRisk {
    if (this.currentState === 'normal')
      return { dcs_score: 35, signals: { weather: 20, aqi: 45, traffic: 30, govt: 0, worker_idle: 15 } }
    if (this.currentState === 'warning')
      return { dcs_score: 62, signals: { weather: 70, aqi: 55, traffic: 65, govt: 0, worker_idle: 35 } }
    return { dcs_score: 85, signals: { weather: 95, aqi: 78, traffic: 88, govt: 60, worker_idle: 72 } }
  }

  getSafeZoneAdvisory(): SafeZoneAdvisory | null {
    if (this.currentState !== 'warning') return null
    return { suggested_zone: 'Anna Nagar', distance: 8.2, expected_income: 1200,
      reason: 'Low DCS score (28), high order density, no weather alerts' }
  }

  getActiveClaim(): ActiveClaim | null {
    if (this.currentState !== 'claim' && this.currentState !== 'payout') return null
    return {
      claim_id: 'CLM-2026-04-003', trigger_type: 'rain',
      income_loss: 4800, payout_amount: 3840, fraud_score: 12,
      status: this.currentState === 'payout' ? 'PAID' : 'PROCESSING',
      created_at: new Date().toISOString()
    }
  }

  getPayout(): Payout | null {
    if (this.currentState !== 'payout') return null
    return { success: true, amount: 3840, utr: 'UTR224612345678', time: new Date().toISOString() }
  }

  getClaimHistory(): ClaimHistoryItem[] {
    return [
      { claim_id: 'CLM-2026-03-028', trigger: 'rain',     amount: 1440, status: 'PAID', date: '2026-03-28T14:30:00' },
      { claim_id: 'CLM-2026-03-15',  trigger: 'aqi',      amount: 720,  status: 'PAID', date: '2026-03-15T11:20:00' },
      { claim_id: 'CLM-2026-02-22',  trigger: 'platform', amount: 480,  status: 'PAID', date: '2026-02-22T19:45:00' },
      { claim_id: 'CLM-2026-02-10',  trigger: 'heat',     amount: 560,  status: 'PAID', date: '2026-02-10T15:10:00' },
    ]
  }

  getZoneHeatmap(): ZoneData[] {
    const base = [
      { zone: 'Velachery',  lat: 12.9716, lon: 80.2209 },
      { zone: 'T. Nagar',   lat: 13.0418, lon: 80.2341 },
      { zone: 'Anna Nagar', lat: 13.0878, lon: 80.2085 },
      { zone: 'Tambaram',   lat: 12.9249, lon: 80.1000 },
      { zone: 'OMR',        lat: 12.8956, lon: 80.2273 },
      { zone: 'Adambakkam', lat: 13.0067, lon: 80.2006 },
    ]
    if (this.currentState === 'normal')
      return base.map(z => ({ ...z, dcs_score: z.zone === 'Velachery' ? 35 : Math.floor(Math.random() * 40) + 20 }))
    if (this.currentState === 'warning')
      return base.map(z => ({ ...z, dcs_score: z.zone === 'Velachery' ? 62 : z.zone === 'Adambakkam' ? 58 : Math.floor(Math.random() * 40) + 20 }))
    return base.map(z => ({ ...z, dcs_score: z.zone === 'Velachery' ? 85 : z.zone === 'Adambakkam' ? 78 : z.zone === 'T. Nagar' ? 65 : Math.floor(Math.random() * 40) + 20 }))
  }

  getIncomeChartData() {
    const now = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now); date.setDate(date.getDate() - (6 - i))
      return {
        date: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        expected: 6200,
        actual: i === 4 ? 1400 : Math.round(6100 + Math.random() * 200)
      }
    })
  }

  destroy() { if (this.stateTimer) clearInterval(this.stateTimer) }
}

export const systemSimulator = new SystemSimulator()
