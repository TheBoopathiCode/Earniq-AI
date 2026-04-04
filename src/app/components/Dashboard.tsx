import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { api } from '../lib/api'
import { IncomeHealthMeterCard } from './dashboard/IncomeHealthMeterCard'
import { AIInsightCard } from './dashboard/AIInsightCard'
import { ZoneRiskCard } from './dashboard/ZoneRiskCard'
import { SignalBreakdownPanel } from './dashboard/SignalBreakdownPanel'
import { IncomeChart } from './dashboard/IncomeChart'
import { SafeZoneAdvisoryCard } from './dashboard/SafeZoneAdvisoryCard'
import { ZoneHeatmap } from './dashboard/ZoneHeatmap'
import { ZoneRiskMap } from './dashboard/ZoneRiskMap'
import { ActiveClaimCard } from './dashboard/ActiveClaimCard'
import { ClaimPipelineTracker } from './dashboard/ClaimPipelineTracker'
import { PayoutBanner } from './dashboard/PayoutBanner'
import { WelcomeBanner } from './dashboard/WelcomeBanner'
import { DemoPanel } from './dashboard/DemoPanel'
import { ClaimHistoryList } from './dashboard/ClaimHistoryList'
import type { IncomeHealth, AIInsight, ZoneRisk, SafeZoneAdvisory, ActiveClaim, Payout, ClaimHistoryItem, ZoneData } from '../types/dashboard'

const DEFAULT_INCOME: IncomeHealth = { expected_income: 0, actual_income: 0, loss_pct: 0, health_status: 'GREEN' }
const DEFAULT_ZONE_RISK: ZoneRisk = { dcs_score: 0, signals: { weather: 0, aqi: 0, traffic: 0, govt: 0, worker_idle: 0 } }

export function Dashboard() {
  const { addUnreadClaim, worker } = useAppContext()
  const prevClaimRef = useRef<string | null>(null)

  const [incomeHealth, setIncomeHealth] = useState<IncomeHealth>(DEFAULT_INCOME)
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null)
  const [zoneRisk, setZoneRisk] = useState<ZoneRisk>(DEFAULT_ZONE_RISK)
  const [safeZone, setSafeZone] = useState<SafeZoneAdvisory | null>(null)
  const [activeClaim, setActiveClaim] = useState<ActiveClaim | null>(null)
  const [payout, setPayout] = useState<Payout | null>(null)
  const [claimHistory, setClaimHistory] = useState<ClaimHistoryItem[]>([])
  const [zoneData, setZoneData] = useState<ZoneData[]>([])
  const [loading, setLoading] = useState(true)
  const [demoDcs, setDemoDcs] = useState<number | null>(null)

  // Merge demo DCS override into displayed data
  const displayZoneRisk: ZoneRisk = demoDcs !== null
    ? {
        dcs_score: demoDcs,
        signals: {
          weather:    Math.round(demoDcs * 1.00),
          aqi:        Math.round(demoDcs * 0.80),
          traffic:    Math.round(demoDcs * 0.70),
          govt:       Math.round(demoDcs * 0.60),
          worker_idle:Math.round(demoDcs * 0.50),
        }
      }
    : zoneRisk

  const displayIncome: IncomeHealth = demoDcs !== null
    ? {
        expected_income: incomeHealth.expected_income || 2000,
        actual_income: demoDcs >= 70
          ? Math.round((incomeHealth.expected_income || 2000) * (1 - Math.min(90, demoDcs) / 100))
          : demoDcs >= 40
          ? Math.round((incomeHealth.expected_income || 2000) * (1 - demoDcs * 0.4 / 100))
          : incomeHealth.expected_income || 2000,
        loss_pct: demoDcs >= 70 ? Math.min(90, demoDcs) : demoDcs >= 40 ? demoDcs * 0.4 : 0,
        health_status: demoDcs >= 70 ? 'RED' : demoDcs >= 40 ? 'YELLOW' : 'GREEN',
      }
    : incomeHealth

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await api.get<any>('/dashboard')

      setIncomeHealth(data.income_health)

      setZoneRisk({
        dcs_score: data.dcs_score,
        signals: data.zone_risk_detail?.signals ?? DEFAULT_ZONE_RISK.signals,
      })

      setAiInsight(data.ai_insight ?? null)
      setSafeZone(data.safe_zone_advisory ?? null)
      setPayout(data.payout ?? null)
      setClaimHistory(data.claim_history ?? [])
      setZoneData(data.zone_heatmap ?? [])

      const newClaim = data.active_claim ?? null
      if (newClaim && newClaim.claim_id !== prevClaimRef.current) {
        prevClaimRef.current = newClaim.claim_id
        addUnreadClaim()
      }
      setActiveClaim(newClaim)
    } catch {
      // no token / not logged in — keep defaults
    } finally {
      setLoading(false)
    }
  }, [addUnreadClaim])

  useEffect(() => {
    fetchDashboard()
    // Poll every 60 seconds for fresh data
    const interval = setInterval(fetchDashboard, 60000)
    return () => clearInterval(interval)
  }, [fetchDashboard])

  // Derive chart data from zone risk (no simulator)
  const incomeChartData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    const isToday = i === 6
    return {
      date: date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      expected: incomeHealth.expected_income || 2000,
      actual: isToday ? incomeHealth.actual_income : incomeHealth.expected_income,
    }
  })

  const claimStep = !activeClaim ? 'predict'
    : activeClaim.status === 'PROCESSING' ? 'processing'
    : activeClaim.status === 'VERIFIED'   ? 'verified'
    : activeClaim.status === 'PAID'       ? 'completed'
    : activeClaim.status === 'APPROVED'   ? 'verified'
    : 'confirm'

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <div className="w-5 h-5 border-2 border-[#06C167] border-t-transparent rounded-full animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 p-4 lg:p-6 min-h-screen">
      {/* Left — main dashboard */}
      <div className="flex-1 min-w-0 space-y-6">
        <WelcomeBanner />
        {payout && <PayoutBanner payout={payout} />}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IncomeHealthMeterCard incomeHealth={displayIncome} />
          {aiInsight && <AIInsightCard insight={aiInsight} />}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ZoneRiskCard zoneRisk={displayZoneRisk} />
          <SignalBreakdownPanel signals={displayZoneRisk.signals} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IncomeChart data={incomeChartData} />
          {safeZone && <SafeZoneAdvisoryCard advisory={safeZone} />}
        </div>
        <ZoneHeatmap zones={zoneData} workerZone={worker?.zone?.name ?? ''} />
        <ZoneRiskMap />
        <ClaimPipelineTracker
          currentStep={claimStep as any}
          dcsScore={displayZoneRisk.dcs_score}
          payoutAmount={activeClaim?.payout_amount}
        />
        {activeClaim && <ActiveClaimCard claim={activeClaim} />}
        <ClaimHistoryList claims={claimHistory} />
      </div>

      {/* Right — demo panel (sticky on desktop, normal flow on mobile) */}
      <div className="w-full xl:w-80 xl:flex-shrink-0">
        <div className="xl:sticky xl:top-6">
          <DemoPanel onClaimCreated={fetchDashboard} onDcsChange={setDemoDcs} />
        </div>
      </div>
    </div>
  )
}
