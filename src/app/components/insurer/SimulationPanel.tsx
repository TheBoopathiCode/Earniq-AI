import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Square, Zap, Activity, Users, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ZONES } from '../../lib/types'

const BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:8000/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type TriggerType = 'rain' | 'aqi' | 'heat' | 'lockdown'
type Intensity   = 'low' | 'medium' | 'high'

interface SimStatus {
  active:        boolean
  type?:         TriggerType
  value?:        number
  zone_id?:      string
  intensity?:    Intensity
  duration_min?: number
  started_at?:   string
  time_left_sec?: number
  dcs?:          number
  signals?:      Record<string, number>
}

interface SimClaim {
  id:           string
  worker_id:    number
  worker_name:  string
  zone:         string
  trigger:      string
  dcs:          number
  fraud_score:  number
  p_param:      number
  p_income:     number
  payout:       number
  status:       string
  created_at:   string
  is_simulated: boolean
}

// ── Config ────────────────────────────────────────────────────────────────────

const TRIGGER_CONFIG: Record<TriggerType, {
  label: string; unit: string; min: number; max: number; default: number; emoji: string
}> = {
  rain:     { label: 'Heavy Rain',    unit: 'mm/hr', min: 5,   max: 50,  default: 18,  emoji: '🌧️' },
  aqi:      { label: 'Severe AQI',    unit: 'AQI',   min: 100, max: 500, default: 320, emoji: '😷' },
  heat:     { label: 'Extreme Heat',  unit: '°C',    min: 38,  max: 50,  default: 45,  emoji: '🌡️' },
  lockdown: { label: 'Zone Lockdown', unit: '%',     min: 50,  max: 100, default: 100, emoji: '🚫' },
}

const LIFECYCLE_STAGES = ['DETECTED', 'TRIGGERED', 'FRAUD_CHECK', 'CALCULATED', 'APPROVED', 'PAID']

const STAGE_COLOR: Record<string, string> = {
  DETECTED:   'bg-gray-100 text-gray-600',
  TRIGGERED:  'bg-yellow-100 text-yellow-700',
  FRAUD_CHECK:'bg-orange-100 text-orange-700',
  CALCULATED: 'bg-blue-100 text-blue-700',
  APPROVED:   'bg-green-100 text-green-700',
  PAID:       'bg-emerald-100 text-emerald-700',
}

// Flatten all zones for the selector
const ALL_ZONES = Object.values(ZONES).flat()

// ── DCS Meter ─────────────────────────────────────────────────────────────────

function DcsMeter({ dcs, active }: { dcs: number; active: boolean }) {
  const color = dcs >= 70 ? 'bg-red-500' : dcs >= 40 ? 'bg-yellow-400' : 'bg-green-400'
  const label = dcs >= 70 ? 'HIGH RISK' : dcs >= 40 ? 'MODERATE' : 'LOW RISK'
  const textColor = dcs >= 70 ? 'text-red-600' : dcs >= 40 ? 'text-yellow-600' : 'text-green-600'

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-gray-800">Disruption Confidence Score</p>
        {active && (
          <span className="flex items-center gap-1 text-[10px] text-red-600 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            LIVE SIM
          </span>
        )}
      </div>
      <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full transition-all duration-700', color)}
          style={{ width: `${Math.min(100, dcs)}%` }}
        />
        {/* Threshold line at 70 */}
        <div className="absolute top-0 bottom-0 w-px bg-red-400 opacity-60" style={{ left: '70%' }} />
      </div>
      <div className="flex items-end justify-between">
        <span className="text-[32px] font-bold text-gray-900 leading-none">
          {dcs.toFixed(0)}<span className="text-[14px] text-gray-400 font-normal">/100</span>
        </span>
        <span className={cn('text-[12px] font-bold px-2 py-1 rounded-lg', STAGE_COLOR[dcs >= 70 ? 'APPROVED' : 'DETECTED'], textColor)}>
          {label}
        </span>
      </div>
      {dcs >= 70 && (
        <p className="text-[11px] text-red-600 font-medium">
          ⚡ Trigger threshold crossed — auto-claims firing
        </p>
      )}
    </div>
  )
}

// ── Claim Row ─────────────────────────────────────────────────────────────────

function ClaimRow({ claim }: { claim: SimClaim }) {
  const stageIdx = LIFECYCLE_STAGES.indexOf(claim.status)

  return (
    <div className="border border-gray-100 rounded-xl p-3 space-y-2 bg-white">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-mono text-gray-400 flex-shrink-0">#{claim.worker_id}</span>
          <span className="text-[12px] font-semibold text-gray-800 truncate">{claim.worker_name}</span>
          <span className="text-[10px] text-gray-400 truncate">{claim.zone}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', STAGE_COLOR[claim.status] ?? 'bg-gray-100 text-gray-600')}>
            {claim.status}
          </span>
          {claim.status === 'PAID' && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          )}
        </div>
      </div>

      {/* Lifecycle progress bar */}
      <div className="flex gap-0.5">
        {LIFECYCLE_STAGES.map((s, i) => (
          <div
            key={s}
            className={cn(
              'flex-1 h-1 rounded-full transition-all duration-500',
              i <= stageIdx ? 'bg-emerald-400' : 'bg-gray-100'
            )}
          />
        ))}
      </div>

      {/* Payout breakdown with formula labels */}
      <div className="grid grid-cols-4 gap-1 text-[10px]">
        <div className="bg-gray-50 rounded px-1.5 py-1">
          <p className="text-gray-400">Trigger</p>
          <p className="font-semibold text-gray-700 uppercase">{claim.trigger}</p>
        </div>
        <div className="bg-gray-50 rounded px-1.5 py-1">
          <p className="text-gray-400">DCS</p>
          <p className="font-semibold text-red-600">{claim.dcs}</p>
        </div>
        <div className="bg-gray-50 rounded px-1.5 py-1">
          <p className="text-gray-400">Fraud</p>
          <p className="font-semibold text-green-600">{claim.fraud_score.toFixed(0)}/100</p>
        </div>
        <div className="bg-emerald-50 rounded px-1.5 py-1">
          <p className="text-gray-400">P_final</p>
          <p className="font-bold text-emerald-700">₹{claim.payout.toFixed(0)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <div className="bg-blue-50 rounded px-1.5 py-1">
          <p className="text-gray-400">P_param = rate×hrs</p>
          <p className="font-semibold text-blue-700">₹{claim.p_param.toFixed(0)}</p>
        </div>
        <div className="bg-purple-50 rounded px-1.5 py-1">
          <p className="text-gray-400">P_income = λ×loss×M</p>
          <p className="font-semibold text-purple-700">₹{claim.p_income.toFixed(0)}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function SimulationPanel() {
  const [triggerType, setTriggerType] = useState<TriggerType>('rain')
  const [value, setValue]             = useState(18)
  const [duration, setDuration]       = useState(30)
  const [zoneId, setZoneId]           = useState('ch-vel')
  const [intensity, setIntensity]     = useState<Intensity>('high')
  const [loading, setLoading]         = useState(false)
  const [status, setStatus]           = useState<SimStatus>({ active: false })
  const [claims, setClaims]           = useState<SimClaim[]>([])
  const pollRef                       = useRef<ReturnType<typeof setInterval> | null>(null)

  const cfg = TRIGGER_CONFIG[triggerType]

  // Reset value when trigger type changes
  useEffect(() => {
    setValue(TRIGGER_CONFIG[triggerType].default)
  }, [triggerType])

  const pollStatus = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        fetch(`${BASE}/simulation/status`).then(r => r.json()),
        fetch(`${BASE}/simulation/claims`).then(r => r.json()),
      ])
      setStatus(s)
      setClaims(c)
    } catch {}
  }, [])

  // Poll every 2s when active
  useEffect(() => {
    pollStatus()
    pollRef.current = setInterval(pollStatus, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pollStatus])

  const handleStart = async () => {
    setLoading(true)
    try {
      await fetch(`${BASE}/simulation/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: triggerType, value, duration_minutes: duration,
          zone_id: zoneId, intensity,
        }),
      })
      await pollStatus()
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      await fetch(`${BASE}/simulation/stop`, { method: 'POST' })
      await pollStatus()
    } finally {
      setLoading(false)
    }
  }

  const selectedZone = ALL_ZONES.find(z => z.id === zoneId)
  const dcs          = status.active ? (status.dcs ?? 0) : 0
  const timeLeft     = status.time_left_sec ?? 0
  const affectedCount = claims.length

  return (
    <div className="min-h-screen bg-gray-50 p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[18px] font-semibold text-gray-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Simulation Mode
          </p>
          <p className="text-[11px] text-gray-400">
            Trigger fake disruptions · visualise full claim lifecycle · tagged is_simulated=true
          </p>
        </div>
        {status.active && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[12px] font-semibold text-red-700">
              {status.type?.toUpperCase()} ACTIVE · {Math.floor(timeLeft / 60)}m {timeLeft % 60}s left
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Controls ── */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
            <p className="text-[13px] font-semibold text-gray-800">Simulation Controls</p>

            {/* Trigger type */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-500 font-medium">Trigger Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(TRIGGER_CONFIG) as TriggerType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setTriggerType(t)}
                    disabled={status.active}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-[12px] font-medium transition-all',
                      triggerType === t
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300',
                      status.active && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span>{TRIGGER_CONFIG[t].emoji}</span>
                    {TRIGGER_CONFIG[t].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Value */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-[11px] text-gray-500 font-medium">
                  {cfg.label} Value
                </label>
                <span className="text-[12px] font-bold text-gray-800">
                  {value} {cfg.unit}
                </span>
              </div>
              <input
                type="range"
                min={cfg.min} max={cfg.max} value={value}
                onChange={e => setValue(Number(e.target.value))}
                disabled={status.active}
                className="w-full accent-blue-500 disabled:opacity-50"
              />
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>{cfg.min} {cfg.unit}</span>
                <span>{cfg.max} {cfg.unit}</span>
              </div>
            </div>

            {/* Duration */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-[11px] text-gray-500 font-medium">Duration</label>
                <span className="text-[12px] font-bold text-gray-800">{duration} min</span>
              </div>
              <input
                type="range"
                min={1} max={120} value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                disabled={status.active}
                className="w-full accent-blue-500 disabled:opacity-50"
              />
            </div>

            {/* Zone */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-500 font-medium">Zone</label>
              <select
                value={zoneId}
                onChange={e => setZoneId(e.target.value)}
                disabled={status.active}
                className="w-full text-[12px] border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
              >
                {ALL_ZONES.map(z => (
                  <option key={z.id} value={z.id}>
                    {z.name} ({z.city}) — Risk {z.riskScore}
                  </option>
                ))}
              </select>
            </div>

            {/* Intensity */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-gray-500 font-medium">Intensity</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as Intensity[]).map(i => (
                  <button
                    key={i}
                    onClick={() => setIntensity(i)}
                    disabled={status.active}
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-[11px] font-semibold border-2 transition-all capitalize',
                      intensity === i
                        ? i === 'high'   ? 'border-red-500 bg-red-50 text-red-700'
                        : i === 'medium' ? 'border-yellow-500 bg-yellow-50 text-yellow-700'
                        :                  'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300',
                      status.active && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            {/* Start / Stop */}
            {!status.active ? (
              <button
                onClick={handleStart}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-[13px] transition-colors disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {loading ? 'Starting…' : `Start ${cfg.emoji} Simulation`}
              </button>
            ) : (
              <button
                onClick={handleStop}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl text-[13px] transition-colors disabled:opacity-50"
              >
                <Square className="w-4 h-4" />
                {loading ? 'Stopping…' : 'Stop Simulation'}
              </button>
            )}

            {/* Safety notice */}
            <p className="text-[10px] text-gray-400 text-center">
              All simulated claims tagged <code className="bg-gray-100 px-1 rounded">is_simulated=true</code> · no BCR impact
            </p>
          </div>

          {/* Live stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
              <Activity className="w-4 h-4 text-blue-500 mx-auto mb-1" />
              <p className="text-[22px] font-bold text-gray-900">{dcs.toFixed(0)}</p>
              <p className="text-[10px] text-gray-400">DCS Score</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-3 text-center">
              <Users className="w-4 h-4 text-purple-500 mx-auto mb-1" />
              <p className="text-[22px] font-bold text-gray-900">{affectedCount}</p>
              <p className="text-[10px] text-gray-400">Workers Affected</p>
            </div>
          </div>

          {/* Active trigger badge */}
          {status.active && (
            <div className={cn(
              'rounded-xl border-2 p-3 text-center',
              dcs >= 70 ? 'border-red-300 bg-red-50' : 'border-yellow-300 bg-yellow-50'
            )}>
              <p className={cn('text-[14px] font-bold', dcs >= 70 ? 'text-red-700' : 'text-yellow-700')}>
                {cfg.emoji} {cfg.label.toUpperCase()} ACTIVE
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {value} {cfg.unit} · {selectedZone?.name} · {intensity}
              </p>
              {dcs >= 70 && (
                <p className="text-[11px] text-red-600 font-semibold mt-1">
                  ⚡ Auto-claims firing
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Right: DCS + claim feed ── */}
        <div className="lg:col-span-2 space-y-4">
          <DcsMeter dcs={dcs} active={status.active} />

          {/* Signal breakdown */}
          {status.active && status.signals && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-[12px] font-semibold text-gray-700 mb-3">DCS Signal Breakdown</p>
              <div className="space-y-2">
                {[
                  { key: 'weather',    label: 'Weather',     weight: '35%' },
                  { key: 'aqi',        label: 'AQI',         weight: '20%' },
                  { key: 'traffic',    label: 'Traffic',     weight: '15%' },
                  { key: 'govtAlert',  label: 'Govt Alert',  weight: '20%' },
                  { key: 'workerIdle', label: 'Worker Idle', weight: '10%' },
                ].map(s => {
                  const v = status.signals![s.key] ?? 0
                  return (
                    <div key={s.key} className="flex items-center gap-3">
                      <span className="text-[11px] text-gray-500 w-20 flex-shrink-0">{s.label}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all duration-500',
                            v >= 70 ? 'bg-red-400' : v >= 40 ? 'bg-yellow-400' : 'bg-green-400'
                          )}
                          style={{ width: `${v}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-gray-600 w-8 text-right">{v.toFixed(0)}</span>
                      <span className="text-[10px] text-gray-400 w-6">{s.weight}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Claim feed */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-gray-800">
                Live Claim Feed
                {claims.length > 0 && (
                  <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                    {claims.length}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <Clock className="w-3 h-3" />
                auto-refresh 2s
              </div>
            </div>

            {claims.length === 0 ? (
              <div className="py-12 text-center">
                <Zap className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-[12px] text-gray-400">
                  {status.active
                    ? dcs >= 70
                      ? 'Claims firing — waiting for workers in zone…'
                      : `DCS at ${dcs.toFixed(0)} — needs ≥70 to trigger claims`
                    : 'Start a simulation to see the claim lifecycle'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {claims.map(c => (
                  <ClaimRow key={c.id} claim={c} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
