import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, AlertTriangle, CheckCircle2, ShieldCheck, Loader2, IndianRupee, Zap, Play, RotateCcw } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import { api } from '../../lib/api'

const TRIGGERS = [
  { key: 'rain',     label: 'Heavy Rain',      color: 'bg-blue-500',   dcs: 74 },
  { key: 'heat',     label: 'Extreme Heat',     color: 'bg-orange-500', dcs: 71 },
  { key: 'aqi',      label: 'Severe AQI',       color: 'bg-purple-500', dcs: 72 },
  { key: 'lockdown', label: 'Zone Lockdown',    color: 'bg-red-600',    dcs: 85 },
  { key: 'outage',   label: 'Platform Outage',  color: 'bg-gray-600',   dcs: 73 },
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

export function DemoPanel({ onClaimCreated, onDcsChange }: { onClaimCreated?: () => void; onDcsChange?: (dcs: number) => void }) {
  const { worker, policy } = useAppContext()
  const [dcsScore, setDcsScore] = useState(35)
  const [selectedTrigger, setSelectedTrigger] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('predict')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hourlyRate = 250
  const workingHours = worker?.workingHours ?? 8
  const expectedIncome = hourlyRate * workingHours
  const coverageCap = policy?.coverageCap ?? 1600

  // Auto-select trigger when DCS crosses 70
  useEffect(() => {
    if (dcsScore >= 70 && !selectedTrigger) setSelectedTrigger('rain')
  }, [dcsScore])

  const incomeLossPct = selectedTrigger === 'lockdown' || selectedTrigger === 'outage' ? 100
    : selectedTrigger === 'rain' ? 67
    : selectedTrigger === 'heat' ? 45
    : selectedTrigger === 'aqi'  ? 55 : 0

  const lossAmount   = Math.round(expectedIncome * incomeLossPct / 100)
  const payoutAmount = Math.min(lossAmount, coverageCap)
  const fraudScore   = 8

  const runDemo = async () => {
    if (!selectedTrigger || dcsScore < 70) return
    setRunning(true)
    setError('')
    setResult(null)

    // Animate through pipeline steps
    const stepDelay = [0, 800, 1600, 2400, 3200, 4200]
    STEPS.forEach((s, i) => {
      stepTimerRef.current = setTimeout(() => setStep(s), stepDelay[i])
    })

    // Call real API at step 3
    setTimeout(async () => {
      try {
        const res = await api.post<any>('/claims/simulate', { trigger_type: selectedTrigger })
        setResult(res)
        onClaimCreated?.()
      } catch (e: any) {
        setError(e.message || 'Simulation failed')
        setStep('predict')
        setRunning(false)
      }
    }, 2400)

    setTimeout(() => setRunning(false), 4500)
  }

  const reset = () => {
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current)
    setDcsScore(35)
    onDcsChange?.(35)
    setSelectedTrigger(null)
    setStep('predict')
    setRunning(false)
    setResult(null)
    setError('')
  }

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
        <button onClick={reset} className="text-gray-400 hover:text-white transition-colors">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

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
          <div className="grid grid-cols-2 gap-2">
            {TRIGGERS.map(t => {
              const covered = policy?.triggersActive?.includes(t.key) ?? false
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

        {/* Payout preview */}
        {selectedTrigger && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Payout Calculation</p>
            {[
              ['Expected Income',  `₹${expectedIncome.toLocaleString('en-IN')}`],
              ['Income Loss',      `${incomeLossPct}%`],
              ['Loss Amount',      `₹${lossAmount.toLocaleString('en-IN')}`],
              ['Coverage Cap',     `₹${coverageCap.toLocaleString('en-IN')}`],
              ['Fraud Score',      `${fraudScore}/100 ✓`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900">{value}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="font-bold text-gray-900">Payout</span>
              <span className="font-bold text-[#06C167] text-lg">₹{payoutAmount.toLocaleString('en-IN')}</span>
            </div>
          </motion.div>
        )}

        {/* Pipeline steps */}
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Claim Pipeline</p>
          <div className="space-y-2">
            {STEPS.map((s, i) => {
              const done    = i < stepIndex
              const active  = i === stepIndex
              const pending = i > stepIndex
              const icons = [Brain, AlertTriangle, CheckCircle2, ShieldCheck, Loader2, IndianRupee]
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

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-[#E6FAF1] border border-[#06C167]/30 rounded-xl p-4 text-center">
              <div className="text-2xl mb-1">🎉</div>
              <p className="font-bold text-[#06C167] text-lg">
                ₹{(result.payout?.amount ?? payoutAmount).toLocaleString('en-IN')} Credited!
              </p>
              <p className="text-xs text-gray-600 mt-1">UTR: {result.payout?.utr ?? 'RZPY' + Math.random().toString().slice(2,10)}</p>
              <p className="text-xs text-gray-500 mt-1">Fraud Score: {result.fraud_score ?? fraudScore}/100 — Auto Approved</p>
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
