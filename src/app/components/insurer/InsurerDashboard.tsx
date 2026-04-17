import { lazy, Suspense, memo, useRef } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell, Legend,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { LiveMonitorPanel } from '../dashboard/LiveMonitorPanel'
import { usePollingEngine } from '../../hooks/usePollingEngine'
import { useAdminDashboard, useLossRatio, usePredictive, useZonesDcs, useFraudBreakdown, useAdminStats } from '../../hooks/useAdminData'
import type { AdminDashboardData } from '../../hooks/useAdminData'

// Lazy-load heavy panels — only fetched when rendered
const LiveClaimsQueue   = lazy(() => import('./LiveClaimsQueue').then(m => ({ default: m.LiveClaimsQueue })))
const FraudDetectionPanel = lazy(() => import('./FraudDetectionPanel').then(m => ({ default: m.FraudDetectionPanel })))

// ── Design tokens ─────────────────────────────────────────────────────────────
const card = 'bg-white border border-gray-200 rounded-xl p-4'
const lbl  = 'text-[11px] text-gray-400'

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ h = 'h-6', w = 'w-full', rounded = 'rounded' }: { h?: string; w?: string; rounded?: string }) {
  return <div className={`${h} ${w} ${rounded} bg-gray-100 animate-pulse`} />
}

function KPISkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={card}>
          <Skeleton h="h-3" w="w-24" />
          <Skeleton h="h-8" w="w-20" rounded="rounded mt-2" />
          <Skeleton h="h-2" w="w-16" rounded="rounded mt-1" />
        </div>
      ))}
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className={card}>
      <Skeleton h="h-4" w="w-40" />
      <Skeleton h="h-[200px]" rounded="rounded-lg mt-4" />
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className={card}>
      <Skeleton h="h-4" w="w-32" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center py-1.5">
            <Skeleton h="h-3" w="w-24" />
            <Skeleton h="h-5" w="w-12" rounded="rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className={`${card} space-y-3`}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="border border-gray-100 rounded-lg p-3">
          <Skeleton h="h-3" w="w-32" />
          <Skeleton h="h-2" w="w-48" rounded="rounded mt-2" />
          <Skeleton h="h-1.5" rounded="rounded-full mt-2" />
        </div>
      ))}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ color, children }: { color: 'green' | 'yellow' | 'red' | 'blue'; children: React.ReactNode }) {
  const map = { green: 'bg-green-50 text-green-700', yellow: 'bg-yellow-50 text-yellow-700', red: 'bg-red-50 text-red-700', blue: 'bg-blue-50 text-blue-700' }
  return <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${map[color]}`}>{children}</span>
}

// ── KPI Bar — reads from unified data ─────────────────────────────────────────
const KPIBar = memo(function KPIBar({ data }: { data: AdminDashboardData | null }) {
  if (!data) return <KPISkeleton />

  const { kpis, fraud_breakdown } = data
  const rejected = fraud_breakdown.find(f => f.name === 'Auto-Rejected')?.value ?? 0

  const items = [
    { title: 'Active Policies',   value: kpis.active_policies.toLocaleString('en-IN'),          color: 'text-gray-900',   sub: null },
    { title: 'Weekly Premium',    value: `₹${Math.round(kpis.weekly_premium_pool).toLocaleString('en-IN')}`, color: 'text-gray-900', sub: null },
    { title: 'Payouts This Week', value: `₹${Math.round(kpis.total_payouts).toLocaleString('en-IN')}`,       color: 'text-yellow-600', sub: null },
    { title: 'Loss Ratio',        value: `${kpis.loss_ratio}%`,                                  color: kpis.loss_ratio_status === 'healthy' ? 'text-green-600' : kpis.loss_ratio_status === 'warning' ? 'text-yellow-600' : 'text-red-600', sub: 'target <80%' },
    { title: 'Fraud Blocked',     value: `${kpis.fraud_blocked_count} claims`,                   color: 'text-green-600',  sub: `${rejected}% auto-rejected` },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(k => (
        <div key={k.title} className={card}>
          <p className={lbl}>{k.title}</p>
          <p className={`text-[24px] font-semibold mt-1 ${k.color}`}>{k.value}</p>
          {k.sub && <p className={`${lbl} mt-0.5`}>{k.sub}</p>}
        </div>
      ))}
    </div>
  )
})

// ── Loss Ratio Chart ──────────────────────────────────────────────────────────
const LossRatioChart = memo(function LossRatioChart({ data }: { data: AdminDashboardData | null }) {
  if (!data) return <ChartSkeleton />
  const chartData = data.loss_ratio_weeks.map(w => ({ w: w.week, v: w.ratio }))

  return (
    <div className={card}>
      <p className="text-[13px] font-semibold text-gray-800 mb-1">Loss ratio trend</p>
      <p className={`${lbl} mb-3`}>Weekly payout / premium (%)</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="w" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '0.5px solid #e5e7eb' }}
            formatter={(v: number) => [`${v}%`, 'Loss Ratio']} />
          <ReferenceLine y={80} stroke="#ef4444" strokeDasharray="5 3"
            label={{ value: 'target', position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }} />
          <Line type="monotone" dataKey="v" strokeWidth={2} stroke="#60a5fa"
            dot={(props: any) => {
              const { cx, cy, payload } = props
              return <circle key={payload.w} cx={cx} cy={cy} r={4}
                fill={payload.v > 80 ? '#ef4444' : '#60a5fa'} stroke="white" strokeWidth={1.5} />
            }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
})

// ── Zone Table ────────────────────────────────────────────────────────────────
const ZoneTable = memo(function ZoneTable({ data }: { data: AdminDashboardData | null }) {
  if (!data) return <TableSkeleton />
  const zones    = data.zones_dcs.slice(0, 8)
  const highRisk = zones.filter(z => z.dcs >= 70)
  const color    = (dcs: number): 'red' | 'yellow' | 'green' => dcs >= 70 ? 'red' : dcs >= 40 ? 'yellow' : 'green'

  return (
    <div className={card}>
      <p className="text-[13px] font-semibold text-gray-800 mb-3">Zone DCS — live</p>
      <table className="w-full">
        <tbody>
          {zones.map(z => (
            <tr key={z.zone} className="border-b border-gray-50 last:border-0">
              <td className="text-[13px] text-gray-700 py-1.5">{z.zone}</td>
              <td className="py-1.5 text-[11px] text-gray-400">{z.city}</td>
              <td className="py-1.5 text-right"><Badge color={color(z.dcs)}>{z.dcs}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
      {highRisk.length > 0 && (
        <p className="text-[11px] text-red-500 mt-3 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          {highRisk.map(z => z.zone).join(', ')} above trigger threshold
        </p>
      )}
    </div>
  )
})

// ── Forecast Chart ────────────────────────────────────────────────────────────
const ForecastChart = memo(function ForecastChart({ data }: { data: AdminDashboardData | null }) {
  if (!data) return <ChartSkeleton />
  const chartData = data.forecast.chart_data.map(d => ({
    d: `${d.day} ${d.date}`, predicted: d.predicted, actual: d.actual,
  }))
  const { summary } = data.forecast

  return (
    <div className={card}>
      <p className="text-[13px] font-semibold text-gray-800 mb-1">Predictive claim forecast</p>
      <p className={`${lbl} mb-2`}>XGBoost · accuracy {summary.model_accuracy_7day} · retrained {summary.last_retrained}</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="d" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '0.5px solid #e5e7eb' }} />
          <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]}>
            {chartData.map((_, i) => <Cell key={i} fill="#60a5fa" />)}
          </Bar>
          <Bar dataKey="predicted" name="Predicted" radius={[3, 3, 0, 0]}>
            {chartData.map((e, i) => <Cell key={i} fill={e.predicted >= 10 ? '#ef4444' : '#a5b4fc'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 pt-2 border-t border-gray-50">
        <div><p className={lbl}>Next 7 days</p><p className="text-[13px] font-semibold text-gray-800">{summary.next_7_days_expected} claims</p></div>
        <div><p className={lbl}>Highest risk</p><p className="text-[13px] font-semibold text-red-600">{summary.highest_risk_day ?? '—'}</p></div>
      </div>
    </div>
  )
})

// ── Risk Alerts ───────────────────────────────────────────────────────────────
const RiskAlerts = memo(function RiskAlerts({ data }: { data: AdminDashboardData | null }) {
  if (!data) return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map(i => <div key={i} className={`${card} h-16`}><Skeleton h="h-3" w="w-40" /><Skeleton h="h-2" w="w-full" rounded="rounded mt-2" /></div>)}
    </div>
  )

  type C = 'red' | 'yellow' | 'blue'
  const bg    = { red: 'bg-red-50 border-red-200', yellow: 'bg-yellow-50 border-yellow-200', blue: 'bg-blue-50 border-blue-200' }
  const title = { red: 'text-red-700', yellow: 'text-yellow-700', blue: 'text-blue-700' }
  const body  = { red: 'text-red-600', yellow: 'text-yellow-600', blue: 'text-blue-600' }

  const zones  = data.high_risk_zones
  const health = data.portfolio_health

  const alerts: { color: C; t: string; d: string }[] = [
    ...(zones[0] ? [{ color: 'red' as C, t: `High risk — ${zones[0].zone}, ${zones[0].city}`, d: `Risk ${zones[0].risk_score}/100 · ${zones[0].workers} workers` }] : []),
    ...(zones[1] ? [{ color: 'yellow' as C, t: `Watch — ${zones[1].zone}, ${zones[1].city}`, d: `Risk ${zones[1].risk_score}/100 · ${zones[1].workers} workers` }] : []),
    { color: 'blue' as C, t: `Portfolio loss ratio: ${health.portfolio_loss_ratio}%`, d: `${health.loss_ratio_status} · ${health.total_claims_processed} claims · ${health.approval_rate}% approved` },
  ]

  return (
    <div className="flex flex-col gap-3">
      {alerts.map((a, i) => (
        <div key={i} className={`rounded-xl border p-3 ${bg[a.color]}`}>
          <p className={`text-[13px] font-semibold ${title[a.color]}`}>{a.t}</p>
          <p className={`text-[11px] mt-1 ${body[a.color]}`}>{a.d}</p>
        </div>
      ))}
    </div>
  )
})

// ── Premium vs Payout ─────────────────────────────────────────────────────────
const PremiumPayoutChart = memo(function PremiumPayoutChart({ data }: { data: AdminDashboardData | null }) {
  if (!data) return <ChartSkeleton />
  const chartData = data.loss_ratio_weeks.map(w => ({ w: w.week, premium: w.premium, payout: w.payouts }))

  return (
    <div className={card}>
      <p className="text-[13px] font-semibold text-gray-800 mb-3">Premium vs payout</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="w" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
            tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '0.5px solid #e5e7eb' }}
            formatter={(v: number, n: string) => [`₹${v.toLocaleString('en-IN')}`, n === 'premium' ? 'Premium' : 'Payout']} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#6b7280' }} formatter={v => v === 'premium' ? 'Premium' : 'Payout'} />
          <Bar dataKey="premium" fill="#60a5fa" radius={[3, 3, 0, 0]} />
          <Bar dataKey="payout"  fill="#fb7185" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
})

// ── Fraud Summary ─────────────────────────────────────────────────────────────
const FraudSummary = memo(function FraudSummary({ data }: { data: AdminDashboardData | null }) {
  if (!data) return <TableSkeleton />

  const { kpis, fraud_breakdown, zones_dcs } = data
  const approved = fraud_breakdown.find(f => f.name === 'Auto-Approved')?.value ?? 0
  const review   = fraud_breakdown.find(f => f.name === 'Manual Review')?.value  ?? 0
  const rejected = fraud_breakdown.find(f => f.name === 'Auto-Rejected')?.value  ?? 0
  const total    = kpis.claims_today
  const maxDcs   = zones_dcs.length ? Math.max(...zones_dcs.map(z => z.dcs)) : 0

  const rows = [
    { label: 'Auto-approved (<30)',    value: `${Math.round(approved / 100 * total)} claims`, color: 'text-green-600' },
    { label: 'Insurer review (30–69)', value: `${Math.round(review   / 100 * total)} claims`, color: 'text-yellow-600' },
    { label: 'Auto-rejected (>70)',    value: `${Math.round(rejected / 100 * total)} claims`, color: 'text-red-600' },
    { label: 'Avg fraud score',        value: `${kpis.avg_fraud_score}/100`,                  color: 'text-gray-700' },
  ]

  return (
    <div className={card}>
      <p className="text-[13px] font-semibold text-gray-800 mb-3">Fraud summary</p>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.label} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
            <span className={lbl}>{r.label}</span>
            <span className={`text-[13px] font-medium ${r.color}`}>{r.value}</span>
          </div>
        ))}
        <div className="flex justify-between items-center py-1 border-b border-gray-50">
          <span className={lbl}>Max zone DCS</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-gray-700">{maxDcs.toFixed(0)}</span>
            <Badge color={maxDcs >= 70 ? 'red' : maxDcs >= 40 ? 'yellow' : 'green'}>
              {maxDcs >= 70 ? 'Alert' : maxDcs >= 40 ? 'Watch' : 'Clear'}
            </Badge>
          </div>
        </div>
        <div className="flex justify-between items-center py-1">
          <span className={lbl}>Approval rate</span>
          <span className="text-[13px] font-medium text-green-600">{approved}%</span>
        </div>
      </div>
    </div>
  )
})

// ── Main ──────────────────────────────────────────────────────────────────────

export function InsurerDashboard() {
  const { data, loading, error } = useAdminDashboard(10000)
  const { state: pollState }     = usePollingEngine(null)
  const tsRef                    = useRef(new Date().toLocaleTimeString('en-IN'))

  // Update timestamp only when data changes, not on every render
  if (data?._ts) {
    tsRef.current = new Date(data._ts).toLocaleTimeString('en-IN')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[18px] font-semibold text-gray-900">Insurer Intelligence Center</p>
          <p className={lbl}>
            {loading ? 'Loading…' : error ? `Error: ${error}` : `Live · updated ${tsRef.current} · ${data?._cached ? 'cached' : 'fresh'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading
            ? <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            : <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>}
          <span className={`text-[11px] font-medium ${loading ? 'text-yellow-600' : 'text-green-600'}`}>
            {loading ? 'Loading' : 'Live'}
          </span>
        </div>
      </div>

      {/* S1 — KPIs */}
      <KPIBar data={data} />

      {/* S2 — Loss ratio + zones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><LossRatioChart data={data} /></div>
        <ZoneTable data={data} />
      </div>

      {/* S3 — Forecast + alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2"><ForecastChart data={data} /></div>
        <RiskAlerts data={data} />
      </div>

      {/* S4 — Premium/payout + monitor + fraud */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PremiumPayoutChart data={data} />
        <LiveMonitorPanel state={pollState} />
        <FraudSummary data={data} />
      </div>

      {/* S5 — Lazy-loaded heavy panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Suspense fallback={<PanelSkeleton />}>
          <LiveClaimsQueue />
        </Suspense>
        <Suspense fallback={<PanelSkeleton />}>
          <FraudDetectionPanel />
        </Suspense>
      </div>

    </div>
  )
}
