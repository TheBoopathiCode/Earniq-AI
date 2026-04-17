import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react'
import { useAppContext } from '../context/AppContext'
import { api } from '../lib/api'
import { IncomeHealthMeterCard } from './dashboard/IncomeHealthMeterCard'
import { AIInsightCard } from './dashboard/AIInsightCard'
import { ZoneRiskCard } from './dashboard/ZoneRiskCard'
import { SignalBreakdownPanel } from './dashboard/SignalBreakdownPanel'
import { IncomeChart } from './dashboard/IncomeChart'
import { SafeZoneAdvisoryCard } from './dashboard/SafeZoneAdvisoryCard'
import { EarningsProtectionCard } from './dashboard/EarningsProtectionCard'
import { ActiveClaimCard } from './dashboard/ActiveClaimCard'
import { ClaimPipelineTracker } from './dashboard/ClaimPipelineTracker'
import { PayoutBanner } from './dashboard/PayoutBanner'
import { WelcomeBanner } from './dashboard/WelcomeBanner'
import { DemoPanel } from './dashboard/DemoPanel'
import { LiveMonitorPanel } from './dashboard/LiveMonitorPanel'
import { usePollingEngine } from '../hooks/usePollingEngine'
import { useToast } from './ui/ToastProvider'
import type {
  IncomeHealth, AIInsight, ZoneRisk, SafeZoneAdvisory,
  ActiveClaim, Payout, ClaimHistoryItem, ZoneData,
} from '../types/dashboard'

// Lazy-load heavy below-fold components
const ZoneHeatmap      = lazy(() => import('./dashboard/ZoneHeatmap').then(m => ({ default: m.ZoneHeatmap })))
const ZoneRiskMap      = lazy(() => import('./dashboard/ZoneRiskMap').then(m => ({ default: m.ZoneRiskMap })))
const ClaimHistoryList = lazy(() => import('./dashboard/ClaimHistoryList').then(m => ({ default: m.ClaimHistoryList })))

// ── Defaults (stable references — never recreated) ────────────────────────────
const DEFAULT_INCOME: IncomeHealth = { expected_income: 0, actual_income: 0, loss_pct: 0, health_status: 'GREEN' }
const DEFAULT_ZONE_RISK: ZoneRisk  = { dcs_score: 0, signals: { weather: 0, aqi: 0, traffic: 0, govt: 0, worker_idle: 0 } }
const POLL_INTERVAL        = 30_000
const POLL_INTERVAL_ACTIVE = 15_000

// ── Skeletons ─────────────────────────────────────────────────────────────────
function Sk({ h = 'h-6', w = 'w-full', r = 'rounded' }: { h?: string; w?: string; r?: string }) {
  return <div className={`${h} ${w} ${r} bg-gray-100 animate-pulse`} />
}

function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 space-y-3">
      <Sk h="h-4" w="w-32" />
      <Sk h="h-10" w="w-24" r="rounded-lg" />
      <Sk h="h-3" w="w-48" />
      <Sk h="h-2" w="w-full" r="rounded-full" />
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6">
      <Sk h="h-4" w="w-40" />
      <Sk h="h-[200px]" r="rounded-lg mt-4" />
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
      {[0,1,2,3].map(i => (
        <div key={i} className="flex justify-between items-center py-1">
          <Sk h="h-3" w="w-28" />
          <Sk h="h-5" w="w-16" r="rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard() {
  const { addUnreadClaim, worker } = useAppContext()
  const prevClaimRef  = useRef<string | null>(null)
  const prevPayoutRef = useRef<string | null>(null)
  const prevDataRef   = useRef<string>('')
  const [demoDcs, setDemoDcs] = useState<number | null>(null)
  const { state: pollState, firePayout } = usePollingEngine(demoDcs)
  const { requestPushPermission, pushGranted } = useToast()

  const [incomeHealth, setIncomeHealth]             = useState<IncomeHealth>(DEFAULT_INCOME)
  const [zoneRisk, setZoneRisk]                     = useState<ZoneRisk>(DEFAULT_ZONE_RISK)
  const [aiInsight, setAiInsight]                   = useState<AIInsight | null>(null)
  const [safeZone, setSafeZone]                     = useState<SafeZoneAdvisory | null>(null)
  const [activeClaim, setActiveClaim]               = useState<ActiveClaim | null>(null)
  const [payout, setPayout]                         = useState<Payout | null>(null)
  const [claimHistory, setClaimHistory]             = useState<ClaimHistoryItem[]>([])
  const [zoneData, setZoneData]                     = useState<ZoneData[]>([])
  const [earningsProtection, setEarningsProtection] = useState<any>(null)
  const [loading, setLoading]                       = useState(true)
  const [incomeStatus, setIncomeStatus]             = useState<'GREEN' | 'YELLOW' | 'RED'>('GREEN')

  // ── Payout toast ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (payout?.utr && payout.utr !== prevPayoutRef.current) {
      prevPayoutRef.current = payout.utr
      firePayout(payout.amount, payout.utr)
    }
  }, [payout, firePayout])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async (silent = false) => {
    try {
      const data = await api.get<any>('/dashboard')

      const hash = JSON.stringify({
        dcs:    data.dcs_score,
        income: data.income_health,
        claim:  data.active_claim?.claim_id,
        payout: data.payout?.utr,
      })
      if (hash === prevDataRef.current) return
      prevDataRef.current = hash

      setIncomeHealth(data.income_health)
      setIncomeStatus(data.income_health?.health_status ?? 'GREEN')
      setZoneRisk({
        dcs_score: data.dcs_score,
        signals:   data.zone_risk_detail?.signals ?? DEFAULT_ZONE_RISK.signals,
      })
      setAiInsight(data.ai_insight ?? null)
      setSafeZone(data.safe_zone_advisory ?? null)
      setPayout(data.payout ?? null)
      setClaimHistory(data.claim_history ?? [])
      setZoneData(data.zone_heatmap ?? [])
      setEarningsProtection(data.earnings_protection ?? null)

      const newClaim = data.active_claim ?? null
      if (newClaim && newClaim.claim_id !== prevClaimRef.current) {
        prevClaimRef.current = newClaim.claim_id
        addUnreadClaim()
      }
      setActiveClaim(newClaim)
    } catch {
      // keep existing state on error
    } finally {
      if (!silent) setLoading(false)
    }
  }, [addUnreadClaim])

  // ── Adaptive polling ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchDashboard()
    const interval = incomeStatus !== 'GREEN' ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL
    const id = setInterval(() => fetchDashboard(true), interval)
    return () => clearInterval(id)
  }, [fetchDashboard, incomeStatus])

  // ── Pause polling when tab hidden ─────────────────────────────────────────
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchDashboard(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchDashboard])

  // ── Stable callback for DemoPanel ─────────────────────────────────────────
  const handleClaimCreated = useCallback(() => fetchDashboard(), [fetchDashboard])

  // ── Memoised derived values ───────────────────────────────────────────────
  const activeDcs = useMemo(() =>
    demoDcs !== null ? demoDcs : pollState.dcs > 0 ? pollState.dcs : zoneRisk.dcs_score
  , [demoDcs, pollState.dcs, zoneRisk.dcs_score])

  const displayZoneRisk = useMemo((): ZoneRisk => ({
    dcs_score: activeDcs,
    signals: demoDcs !== null
      ? {
          weather:     Math.round(activeDcs * 0.90),
          aqi:         Math.round(activeDcs * 0.65),
          traffic:     Math.round(activeDcs * 0.55),
          govt:        Math.round(activeDcs * 0.30),
          worker_idle: Math.round(activeDcs * 0.45),
        }
      : pollState.dcs > 0
        ? (zoneRisk.signals.weather > 0 || zoneRisk.signals.aqi > 0
            ? zoneRisk.signals
            : {
                weather:     Math.round(activeDcs * 0.90),
                aqi:         Math.round(activeDcs * 0.65),
                traffic:     Math.round(activeDcs * 0.55),
                govt:        Math.round(activeDcs * 0.30),
                worker_idle: Math.round(activeDcs * 0.45),
              })
        : zoneRisk.signals,
  }), [activeDcs, demoDcs, pollState.dcs, zoneRisk.signals])

  const displayIncome = useMemo((): IncomeHealth =>
    activeDcs !== zoneRisk.dcs_score || demoDcs !== null
      ? {
          expected_income: incomeHealth.expected_income || 2000,
          actual_income: activeDcs >= 70
            ? Math.round((incomeHealth.expected_income || 2000) * (1 - Math.min(90, activeDcs) / 100))
            : activeDcs >= 40
            ? Math.round((incomeHealth.expected_income || 2000) * (1 - activeDcs * 0.4 / 100))
            : incomeHealth.expected_income || 2000,
          loss_pct:      activeDcs >= 70 ? Math.min(90, activeDcs) : activeDcs >= 40 ? activeDcs * 0.4 : 0,
          health_status: activeDcs >= 70 ? 'RED' : activeDcs >= 40 ? 'YELLOW' : 'GREEN',
        }
      : incomeHealth
  , [activeDcs, demoDcs, incomeHealth, zoneRisk.dcs_score])

  const incomeChartData = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      return {
        date:     date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
        expected: incomeHealth.expected_income || 2000,
        actual:   i === 6 ? incomeHealth.actual_income : incomeHealth.expected_income,
      }
    })
  , [incomeHealth.expected_income, incomeHealth.actual_income])

  const claimStep = useMemo(() =>
    !activeClaim                              ? 'predict'
    : activeClaim.status === 'PROCESSING'     ? 'processing'
    : activeClaim.status === 'VERIFIED'       ? 'verified'
    : activeClaim.status === 'PAID'           ? 'completed'
    : activeClaim.status === 'APPROVED'       ? 'verified'
    : 'confirm'
  , [activeClaim])

  const workerZoneName = useMemo(() => worker?.zone?.name ?? '', [worker?.zone?.name])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col xl:flex-row gap-4 p-3 sm:p-4 lg:p-6 min-h-screen">

      {/* Left — main content */}
      <div className="flex-1 min-w-0 space-y-4">

        <WelcomeBanner />

        {payout && <PayoutBanner payout={payout} />}

        {/* Critical above-fold: income + AI insight */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loading
            ? <><CardSkeleton /><CardSkeleton /></>
            : <>
                <IncomeHealthMeterCard incomeHealth={displayIncome} />
                {aiInsight && <AIInsightCard insight={aiInsight} />}
              </>}
        </div>

        {/* Earnings protection */}
        {loading
          ? <RowSkeleton />
          : earningsProtection && <EarningsProtectionCard data={earningsProtection} />}

        {/* Zone risk + signals */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loading
            ? <><CardSkeleton /><CardSkeleton /></>
            : <>
                <ZoneRiskCard zoneRisk={displayZoneRisk} />
                <SignalBreakdownPanel signals={displayZoneRisk.signals} />
              </>}
        </div>

        {/* Income chart + safe zone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {loading
            ? <><ChartSkeleton /><CardSkeleton /></>
            : <>
                <IncomeChart data={incomeChartData} />
                {safeZone && <SafeZoneAdvisoryCard advisory={safeZone} />}
              </>}
        </div>

        {/* Below-fold — lazy loaded */}
        <Suspense fallback={<ChartSkeleton />}>
          <ZoneHeatmap zones={zoneData} workerZone={workerZoneName} />
        </Suspense>

        <Suspense fallback={<ChartSkeleton />}>
          <ZoneRiskMap />
        </Suspense>

        {!loading && (
          <ClaimPipelineTracker
            currentStep={claimStep as any}
            dcsScore={displayZoneRisk.dcs_score}
            payoutAmount={activeClaim?.payout_amount ?? undefined}
          />
        )}

        {!loading && activeClaim && <ActiveClaimCard claim={activeClaim} />}

        <Suspense fallback={<RowSkeleton />}>
          <ClaimHistoryList claims={claimHistory} />
        </Suspense>

      </div>

      {/* Right — sticky sidebar */}
      <div className="w-full xl:w-80 xl:flex-shrink-0">
        <div className="xl:sticky xl:top-6 space-y-4">
          {!pushGranted && (
            <button
              onClick={requestPushPermission}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-50 border border-blue-200 rounded-xl text-[12px] text-blue-700 font-medium hover:bg-blue-100 transition-colors"
            >
              🔔 Enable push notifications
            </button>
          )}
          <LiveMonitorPanel state={pollState} />
          <DemoPanel onClaimCreated={handleClaimCreated} onDcsChange={setDemoDcs} />
        </div>
      </div>

    </div>
  )
}
