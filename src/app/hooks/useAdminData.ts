import { useState, useEffect, useCallback, useRef } from 'react'

const BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000/api'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminKPIs {
  active_policies: number
  claims_today: number
  total_payouts: number
  avg_fraud_score: number
  weekly_premium_pool: number
  fraud_blocked_count: number
  loss_ratio: number
  loss_ratio_status: string
  approval_rate: number
}

export interface LossRatioWeek {
  week: string
  premium: number
  payouts: number
  ratio: number
}

export interface FraudBreakdown {
  name: string
  value: number
}

export interface ForecastDay {
  day: string
  date: string
  predicted: number
  actual: number | null
  is_historical: boolean
  confidence?: number
}

export interface ForecastData {
  chart_data: ForecastDay[]
  summary: {
    next_7_days_expected: number
    highest_risk_day: string | null
    model_accuracy_7day: string
    last_retrained: string
  }
}

export interface ZoneDcs {
  zone: string
  city: string
  dcs: number
  claims: number
}

export interface QueueClaim {
  id: string
  worker: string
  zone: string
  trigger: string
  dcs: number
  fraudScore: number
  amount: number
  status: string
  createdAt: string | null
}

export interface HighRiskZone {
  zone: string
  city: string
  risk_score: number
  workers: number
}

export interface PortfolioHealth {
  total_active_policies: number
  total_claims_processed: number
  approval_rate: number
  portfolio_loss_ratio: number
  loss_ratio_status: string
  weekly_premium_pool: number
  weekly_exposure: number
}

export interface AdminDashboardData {
  kpis: AdminKPIs
  loss_ratio_weeks: LossRatioWeek[]
  forecast: ForecastData
  fraud_breakdown: FraudBreakdown[]
  zones_dcs: ZoneDcs[]
  high_risk_zones: HighRiskZone[]
  portfolio_health: PortfolioHealth
  claims_queue: QueueClaim[]
  _cached: boolean
  _ts: string
}

export interface FraudAnalysis {
  claim_id: number
  overall_fraud_score: number
  decision: string
  processing_time_ms: number
  layers: {
    layer1_rules: { name: string; passed: boolean; checks: { name: string; passed: boolean }[] }
    layer2_gps: { name: string; passed: boolean; velocity_kmh: number; flags: string[] }
    layer3_ml: { name: string; passed: boolean; anomaly_score: number }
    weather_validity: { passed: boolean; flags: string[] }
    syndicate_check: { syndicate_score: number; action: string; message: string }
  }
}

// ── Main unified hook ─────────────────────────────────────────────────────────

export function useAdminDashboard(intervalMs = 10000) {
  const [data, setData]       = useState<AdminDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const prevRef               = useRef<string>('')
  const firstLoad             = useRef(true)

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/admin/dashboard`)
      if (!res.ok) throw new Error(`${res.status}`)
      const d: AdminDashboardData = await res.json()

      // Only re-render if data actually changed
      const str = JSON.stringify(d)
      if (str !== prevRef.current) {
        prevRef.current = str
        setData(d)
      }
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      if (firstLoad.current) {
        firstLoad.current = false
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetch_()
    const id = setInterval(fetch_, intervalMs)
    return () => clearInterval(id)
  }, [fetch_, intervalMs])

  return { data, loading, error }
}

// ── On-demand fraud analysis (only when user expands a claim) ─────────────────

export function useFraudAnalysis(claimId: number | null) {
  const [data, setData]       = useState<FraudAnalysis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!claimId) { setData(null); return }
    setLoading(true)
    fetch(`${BASE}/claims/fraud-analysis/${claimId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [claimId])

  return { data, loading }
}

// ── Legacy named exports — kept so existing components don't break ────────────
// These all read from the same unified hook data, zero extra fetches.

export function useAdminStats() {
  const { data, loading, error } = useAdminDashboard()
  return {
    data: data ? {
      active_policies:     data.kpis.active_policies,
      claims_today:        data.kpis.claims_today,
      total_payouts_today: data.kpis.total_payouts,
      avg_fraud_score:     data.kpis.avg_fraud_score,
      weekly_premium_pool: data.kpis.weekly_premium_pool,
      fraud_blocked_count: data.kpis.fraud_blocked_count,
    } : null,
    loading, error,
  }
}

export function useLossRatio() {
  const { data, loading, error } = useAdminDashboard()
  return { data: data?.loss_ratio_weeks ?? null, loading, error }
}

export function useFraudBreakdown() {
  const { data, loading, error } = useAdminDashboard()
  return { data: data?.fraud_breakdown ?? null, loading, error }
}

export function usePredictive() {
  const { data, loading, error } = useAdminDashboard()
  return {
    data: data ? {
      chart_data:                  data.forecast.chart_data,
      summary:                     data.forecast.summary,
      high_risk_zones_next_week:   data.high_risk_zones,
      portfolio_health:            data.portfolio_health,
    } : null,
    loading, error,
  }
}

export function useClaimsQueue() {
  const { data, loading, error } = useAdminDashboard()
  return { data: data?.claims_queue ?? null, loading, error }
}

export function useZonesDcs() {
  const { data, loading, error } = useAdminDashboard()
  return { data: data?.zones_dcs ?? null, loading, error }
}

// ── Worker search hook ────────────────────────────────────────────────────────
export interface WorkerSearchResult {
  id: string
  platform_worker_id: string
  name: string
  phone: string
  platform: string
  city: string
  zone: string
  risk_score: number
  weekly_premium: number
  policy_tier: string
  is_active: boolean
}

export async function searchWorkers(query: string): Promise<WorkerSearchResult[]> {
  const res = await fetch(`${BASE}/admin/workers/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) return []
  return res.json()
}
