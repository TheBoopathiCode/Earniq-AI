import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, AlertTriangle, CheckCircle2, ShieldCheck, Loader2, IndianRupee, Zap, Play, RotateCcw, BookOpen, FastForward, X } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import { api } from '../../lib/api'
import { calculateMLPremium } from '../../lib/store'
import { FraudAnalysisPanel } from './FraudAnalysisPanel'
import { PayoutSimulator } from './PayoutSimulator'
import { useToast } from '../ui/ToastProvider'

const TRIGGERS = [
  { key: 'rain',     label: 'Heavy Rain',      color: 'bg-blue-500',   dcs: 74 },
  { key: 'heat',     label: 'Extreme Heat',     color: 'bg-orange-500', dcs: 71 },
  { key: 'aqi',      label: 'Severe AQI',       color: 'bg-purple-500', dcs: 72 },
  { key: 'curfew',   label: 'Zone Lockdown',    color: 'bg-red-600',    dcs: 85 },
  { key: 'platform', label: 'Platform Outage',  color: 'bg-gray-600',   dcs: 73 },
]

const STEPS = ['predict', 'warn', 'confirm', 'verified', 'processing', 'completed'] as const
type Step = typeof STEPS[number]

const STEP_LABELS: Record<Step, string> = {
  predict:    'Monitoring...',
  warn:       'Risk Alert Issued',
  confirm:    'Disruption Verified',
  verified:   'Claim Validated',
  processing: 'Processing Payout',
  completed:  'Amount Credited',
}

const LOSS_PCT: Record<string, number> = {
  rain: 67, heat: 45, aqi: 55, curfew: 100, platform: 100,
}

// Trigger config mirrors premium_engine.py TRIGGER_CONFIG
const TRIGGER_CFG: Record<string, { hours: number; max: number }> = {
  rain:     { hours: 1.5, max: 400 },
  heat:     { hours: 2.0, max: 300 },
  aqi:      { hours: 2.0, max: 350 },
  curfew:   { hours: 8.0, max: 800 },
  platform: { hours: 1.5, max: 300 },
}

// Mirrors premium_engine.py compute_payout exactly
function computeHybridPayout(params: {
  hourlyRate: number; workingHours: number; lossPct: number
  dcs: number; bcr: number; trigger: string; coverageCap: number
}) {
  const { hourlyRate, workingHours, lossPct, dcs, bcr, trigger, coverageCap } = params
  const cfg = TRIGGER_CFG[trigger] ?? { hours: 1.5, max: 400 }
  const grossLoss     = Math.round(hourlyRate * workingHours * (lossPct / 100))
  const deductible    = 50
  const effectiveLoss = Math.max(0, grossLoss - deductible)
  const lambda        = bcr <= 0.70 ? 0.60 : bcr <= 0.85 ? 0.50 : bcr < 1.00 ? 0.40 : 0.30
  const M             = parseFloat((0.6 + dcs / 180).toFixed(4))
  const pIncome       = Math.round(lambda * effectiveLoss * M)
  const pParam        = Math.round(Math.min(hourlyRate * cfg.hours, cfg.max))
  const pFinal        = Math.min(Math.max(pParam, pIncome), cfg.max, coverageCap)
  return { grossLoss, deductible, effectiveLoss, lambda, M, pIncome, pParam, pFinal, triggerMax: cfg.max }
}

export function DemoPanel({ onClaimCreated, onDcsChange }: { onClaimCreated?: () => void; onDcsChange?: (dcs: number) => void }) {
  const { worker, policy } = useAppContext()
  const { fire } = useToast()
  const [dcsScore, setDcsScore] = useState(35)
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('predict')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showScript, setShowScript] = useState(false)

  const runQuickDemo = () => {
    if (running) return
    reset()
    const trigger = 'rain'
    const dcs = 74
    setTimeout(() => {
      setSelectedTrigger(trigger)
      setDcsScore(dcs)
      onDcsChange?.(dcs)
    }, 500)
    setTimeout(() => runDemoWith(trigger, dcs), 1000)
  }

  // Derive expected income from worker profile — same formula as store.ts
  const avgOrders      = worker?.avgOrders ?? 15
  const workingHours   = worker?.workingHours ?? 8
  const premiumData = useMemo(() => calculateMLPremium({
    zoneId:        worker?.zone?.id ?? '',
    zoneRiskScore: worker?.zone?.riskScore ?? 0,
    platform:      worker?.platform ?? 'zomato',
    vehicleType:   worker?.vehicle_type ?? 'bike',
    avgOrders,
    workingHours,
  }), [worker?.zone?.id, worker?.zone?.riskScore, worker?.platform, worker?.vehicle_type, avgOrders, workingHours])
  const { weeklyIncome, dailyIncome, perEventCap } = premiumData
  const weeklyCap    = policy?.coverageCap ?? 1200
  const effectiveCap = policy ? Math.min(dailyIncome, weeklyCap) : perEventCap

  const hourlyRate = Math.round(dailyIncome / Math.max(workingHours, 1))

  const payoutCalc = useMemo(() => {
    const pct = LOSS_PCT[selectedTrigger ?? ''] ?? 0
    if (!pct) return null
    return computeHybridPayout({
      hourlyRate,
      workingHours,
      lossPct: pct,
      dcs: dcsScore,
      bcr: 0,
      trigger: selectedTrigger ?? 'rain',
      coverageCap: effectiveCap,
    })
  }, [selectedTrigger, hourlyRate, workingHours, dcsScore, effectiveCap])

  const incomeLossPct = LOSS_PCT[selectedTrigger ?? ''] ?? 0
  const payoutAmount  = payoutCalc?.pFinal ?? 0
  const fraudScore    = 8

  // Auto-select trigger when DCS crosses 70
  useEffect(() => {
    if (dcsScore >= 70 && !selectedTrigger) setSelectedTrigger('rain')
  }, [dcsScore, selectedTrigger])

  // Fire advisory / alert toasts on DCS transitions
  const prevDcsRef = useRef(0)
  useEffect(() => {
    const prev = prevDcsRef.current
    prevDcsRef.current = dcsScore
    if (dcsScore >= 40 && prev < 40)
      fire({ type: 'advisory', title: 'Safe Zone Advisory', body: 'Income at risk · Adyar zone has 3× demand — consider moving now' })
    if (dcsScore >= 70 && prev < 70)
      fire({ type: 'alert', title: 'Disruption Confirmed — DCS 70+', body: 'Auto-claim threshold crossed · Fraud engine activated' })
  }, [dcsScore, fire])

  const runDemoWith = async (trigger: string, dcs: number) => {
    if (dcs < 70) return
    setRunning(true)
    setError('')
    setResult(null)

    const stepDelay = [0, 800, 1600, 2400, 3200, 4200]
    STEPS.forEach((s, i) => {
      stepTimerRef.current = setTimeout(() => setStep(s), stepDelay[i])
    })

    setTimeout(async () => {
      try {
        const res = await api.post<any>('/claims/simulate', { trigger_type: trigger })
        setResult(res)
        onClaimCreated?.()
        fire({ type: 'claim', title: 'Claim Auto-Generated', body: `DCS ${dcs} · Fraud engine running — 3 layers` })
        if (res.payout?.success) {
          const amt = res.payout.amount ?? 0
          setTimeout(() => fire({
            type: 'payout',
            title: `₹${amt.toLocaleString('en-IN')} sent to your UPI`,
            body: `UTR: ${res.payout.utr} · Razorpay processed · T+0`,
          }), 2000)
        }
      } catch (e: any) {
        setError(e.message || 'Simulation failed')
        setStep('predict')
        setRunning(false)
      }
    }, 2400)

    setTimeout(() => setRunning(false), 4500)
  }

  const runDemo = useCallback(async () => {
    if (!selectedTrigger || dcsScore < 70) return
    runDemoWith(selectedTrigger, dcsScore)
  }, [selectedTrigger, dcsScore, running])

  const reset = useCallback(() => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
    setDcsScore(35)
    onDcsChange?.(35)
    setSelectedTrigger(null)
    setStep('predict')
    setRunning(false)
    setResult(null)
    setError('')
  }, [onDcsChange])

  const stepIndex = STEPS.indexOf(step)
  const dcsColor = dcsScore >= 70 ? 'text-red-600' : dcsScore >= 40 ? 'text-yellow-600' : 'text-[#06C167]'
  const dcsBarColor = dcsScore >= 70 ? 'bg-red-500' : dcsScore >= 40 ? 'bg-yellow-500' : 'bg-[#06C167]'

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#06C167]" />
          <span className="text-white font-semibold text-sm">Live Demo — Auto Claim Engine</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowScript(s => !s)} title="Demo Script" className="text-gray-400 hover:text-white transition-colors">
            <BookOpen className="w-4 h-4" />
          </button>
          <button onClick={runQuickDemo} disabled={running} title="Quick Demo" className="text-gray-400 hover:text-yellow-400 transition-colors">
            <FastForward className="w-4 h-4" />
          </button>
          <button onClick={reset} title="Reset" className="text-gray-400 hover:text-white transition-colors">
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Demo Script Overlay */}
      <AnimatePresence>
        {showScript && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-4 bg-gray-900 rounded-xl p-4 text-xs font-mono">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#06C167] font-semibold">5-Minute Demo Script</span>
              <button onClick={() => setShowScript(false)} className="text-gray-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {[
              ['0:00–0:30', 'Baseline — Income GREEN, DCS = 32'],
              ['0:30–1:30', 'Click Rain → DCS climbs to 74'],
              ['1:30–2:30', 'Income meter → RED, auto-claim fires'],
              ['2:30–3:30', 'Fraud engine → score 8/100 → approved'],
              ['3:30–4:00', 'Payout banner → UTR number visible'],
              ['4:00–4:30', 'Switch to Delhi AQI trigger'],
              ['4:30–5:00', 'Admin dashboard → loss ratios'],
            ].map(([time, desc]) => (
              <div key={time} className="flex gap-2 mb-1.5">
                <span className="text-yellow-400 flex-shrink-0">{time}</span>
                <span className="text-gray-300">{desc}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-5 space-y-5">

        {/* DCS Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">DCS Score</span>
            <span className={`text-2xl font-bold ${dcsColor}`}>{dcsScore}</span>
          </div>
          <input
            type="range" min={0} max={100} value={dcsScore}
            onChange={e => { const v = Number(e.target.value); setDcsScore(v); onDcsChange?.(v) }}
            disabled={running}
            className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#06C167]"
          />
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              className={`h-full ${dcsBarColor} rounded-full`}
              animate={{ width: `${dcsScore}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>Safe</span><span>Moderate</span><span>High Risk</span>
          </div>
          {dcsScore >= 70 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3" />
              DCS ≥ 70 — Auto-claim threshold crossed!
            </motion.div>
          )}
        </div>

        {/* Trigger selector */}
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Select Trigger</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {TRIGGERS.map(t => {
              const covered = policy?.triggersActive?.includes(t.key as any) ?? false
              return (
                <button key={t.key}
                  onClick={() => { setSelectedTrigger(t.key); setDcsScore(t.dcs) }}
                  disabled={running}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                    selectedTrigger === t.key
                      ? 'border-[#06C167] bg-[#E6FAF1] text-[#06C167]'
                      : covered
                      ? 'border-gray-200 hover:border-[#06C167]/50 text-gray-700'
                      : 'border-gray-100 text-gray-300 cursor-not-allowed'
                  }`}>
                  <div className={`w-2 h-2 rounded-full ${covered ? t.color : 'bg-gray-300'}`} />
                  {t.label}
                  {!covered && <span className="ml-auto text-xs">🔒</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Payout preview — hybrid parametric formula */}
        {selectedTrigger && payoutCalc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-gray-50 rounded-xl p-4 space-y-1.5 text-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Hybrid Payout Formula</p>
            {[
              ['Hourly Rate',                `₹${hourlyRate}/hr`],
              ['Working Hours',              `${workingHours}h`],
              ['Income Loss %',              `${incomeLossPct}%`],
              ['Gross Loss',                 `₹${hourlyRate} × ${workingHours}h × ${incomeLossPct}% = ₹${payoutCalc.grossLoss}`],
              ['Deductible',                 `−₹${payoutCalc.deductible}`],
              ['Effective Loss',             `₹${payoutCalc.effectiveLoss}`],
              ['λ (BCR ≤ 0.70)',             `${payoutCalc.lambda}`],
              ['M = 0.6 + DCS/180',          `0.6 + ${dcsScore}/180 = ${payoutCalc.M}`],
              ['P_income = λ × eff_loss × M',`${payoutCalc.lambda} × ₹${payoutCalc.effectiveLoss} × ${payoutCalc.M} = ₹${payoutCalc.pIncome}`],
              ['P_param = rate × hours',     `₹${hourlyRate} × ${TRIGGER_CFG[selectedTrigger]?.hours}h = ₹${payoutCalc.pParam}`],
              ['Coverage Cap',               `₹${effectiveCap}`],
              ['Fraud Score',                `${fraudScore}/100 ✓`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-gray-400 text-xs">{label}</span>
                <span className="font-medium text-gray-800 text-xs text-right">{value}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-gray-200 mt-2">
              <span className="font-bold text-gray-900 text-xs">P_final = min(max(P_param, P_income), cap)</span>
              <span className="font-bold text-[#06C167] text-lg">₹{payoutAmount.toLocaleString('en-IN')}</span>
            </div>
          </motion.div>
        )}

        {/* Pipeline steps */}
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Claim Pipeline</p>
          <div className="space-y-2">
            {STEPS.map((s, i) => {
              const done   = i < stepIndex
              const active = i === stepIndex
              const icons  = [Brain, AlertTriangle, CheckCircle2, ShieldCheck, Loader2, IndianRupee]
              const Icon = icons[i]
              return (
                <div key={s} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                  active  ? 'bg-[#E6FAF1] border border-[#06C167]/30' :
                  done    ? 'bg-gray-50' : ''
                }`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    done    ? 'bg-[#06C167] text-white' :
                    active  ? 'bg-[#06C167] text-white ring-2 ring-[#E6FAF1]' :
                              'bg-gray-100 text-gray-400'
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${active && s === 'processing' ? 'animate-spin' : ''}`} />
                  </div>
                  <span className={`text-xs font-medium ${
                    active ? 'text-[#06C167]' : done ? 'text-gray-700' : 'text-gray-400'
                  }`}>{STEP_LABELS[s]}</span>
                  {done && <CheckCircle2 className="w-3.5 h-3.5 text-[#06C167] ml-auto" />}
                  {active && running && <div className="w-3.5 h-3.5 border-2 border-[#06C167] border-t-transparent rounded-full animate-spin ml-auto" />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Fraud analysis + payout simulator after claim */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              {result.fraud_layers && (
                <FraudAnalysisPanel
                  fraudScore={result.fraud_score ?? fraudScore}
                  fraudDecision={result.fraud_decision ?? 'auto_approve'}
                  layers={{
                    rules: result.fraud_layers.rules ?? { passed: true, checks: [] },
                    gps:   result.fraud_layers.gps   ?? { passed: true, velocity: 18, dwellTime: 45 },
                    ml:    result.fraud_layers.ml    ?? { passed: true, anomalyScore: 0.08, features: [] },
                  }}
                  syndicateScore={result.syndicate_score ?? 8}
                  processingMs={1847}
                />
              )}
              {result.payout?.success && (
                <PayoutSimulator
                  amount={result.payout.amount ?? payoutAmount}
                  utr={result.payout.utr ?? ('RZPY' + Math.random().toString().slice(2, 10))}
                  upiId={worker?.upiId}
                  triggerType={selectedTrigger ?? 'rain'}
                  onDismiss={reset}
                  payoutBreakdown={payoutCalc ? {
                    pParam:        payoutCalc.pParam,
                    pIncome:       payoutCalc.pIncome,
                    lambda:        payoutCalc.lambda,
                    M:             payoutCalc.M,
                    grossLoss:     payoutCalc.grossLoss,
                    deductible:    payoutCalc.deductible,
                    effectiveLoss: payoutCalc.effectiveLoss,
                    triggerMax:    payoutCalc.triggerMax,
                  } : undefined}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
        )}

        {/* Run button */}
        <button
          onClick={runDemo}
          disabled={running || !selectedTrigger || dcsScore < 70}
          className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            running || !selectedTrigger || dcsScore < 70
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-[#06C167] text-white hover:bg-[#049150] shadow-lg shadow-[#06C167]/20'
          }`}>
          {running ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
          ) : (
            <><Play className="w-4 h-4" /> Simulate Auto Claim</>
          )}
        </button>
        {dcsScore < 70 && !running && (
          <p className="text-xs text-center text-gray-400">Slide DCS to 70+ or select a trigger to activate</p>
        )}
      </div>
    </div>
  )
}
