export type HealthStatus = 'GREEN' | 'YELLOW' | 'RED'
export type DashClaimStatus = 'PROCESSING' | 'VERIFIED' | 'APPROVED' | 'PAID' | 'REJECTED'
export type DashTriggerType = 'rain' | 'heat' | 'aqi' | 'curfew' | 'platform'

export interface DashWorker {
  name: string; zone: string; dcsScore: number; status: 'active' | 'idle' | 'offline'
}

export interface IncomeHealth {
  expected_income: number; actual_income: number; loss_pct: number; health_status: HealthStatus
}

export interface AIInsight {
  prediction_window: string; risk_reason: string; confidence: number
}

export interface ZoneRisk {
  dcs_score: number
  signals: { weather: number; aqi: number; traffic: number; govt: number; worker_idle: number }
}

export interface SafeZoneAdvisory {
  suggested_zone: string; distance: number; expected_income: number; reason: string
}

export interface ActiveClaim {
  claim_id: string; trigger_type: DashTriggerType; income_loss: number | null
  payout_amount: number | null; fraud_score: number | null; status: DashClaimStatus; created_at: string
}

export interface ClaimHistoryItem {
  claim_id: string; trigger: DashTriggerType; amount: number; status: DashClaimStatus; date: string
}

export interface Payout { success: boolean; amount: number; utr: string; time: string }

export interface ZoneData { zone: string; dcs_score: number; lat: number; lon: number }
