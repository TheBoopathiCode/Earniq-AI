import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { IndianRupee, CheckCircle2, Zap, Smartphone, Wifi } from 'lucide-react'

interface Props {
  amount: number
  utr: string
  upiId?: string
  triggerType: string
  onDismiss?: () => void
  payoutBreakdown?: {
    pParam: number; pIncome: number; lambda: number; M: number
    grossLoss: number; deductible: number; effectiveLoss: number; triggerMax: number
  }
}

const TRIGGER_LABELS: Record<string, string> = {
  rain:     'Heavy Rainfall',
  heat:     'Extreme Heat',
  aqi:      'Severe AQI',
  curfew:   'Zone Lockdown',
  platform: 'Platform Outage',
  pandemic: 'Pandemic Lockdown',
}

const STEPS = [
  { label: 'Fraud score verified',       detail: 'Score < 30 — auto-approve threshold',  ms: 0 },
  { label: 'Razorpay API called',         detail: 'POST /v1/payouts → 200 OK',            ms: 420 },
  { label: 'UPI transfer initiated',      detail: 'Mode: UPI · Purpose: insurance_claim', ms: 900 },
  { label: 'Bank processing',             detail: 'NPCI routing · T+0 settlement',        ms: 1500 },
  { label: 'Payment confirmed',           detail: 'UTR generated · credited to UPI',      ms: 2200 },
]

export function PayoutSimulator({ amount, utr, upiId = 'worker@upi', triggerType, onDismiss, payoutBreakdown }: Props) {
  const [step, setStep] = useState(-1)
  const [done, setDone] = useState(false)
  const [showCode, setShowCode] = useState(false)

  useEffect(() => {
    STEPS.forEach((s, i) => {
      setTimeout(() => setStep(i), s.ms)
    })
    setTimeout(() => { setDone(true); setShowCode(true) }, 2800)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden"
    >
      {/* Phone mockup header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-gray-400" />
          <span className="text-[12px] text-gray-300 font-mono">UPI Payout — Test Mode</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5 text-green-400" />
          <span className="text-[10px] text-green-400">RAZORPAY</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Amount display */}
        <div className="text-center py-3">
          <AnimatePresence>
            {done ? (
              <motion.div key="done" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-[28px] font-bold text-green-600">₹{amount.toLocaleString('en-IN')}</p>
                <p className="text-[12px] text-gray-500 mt-1">Credited to your UPI account</p>
              </motion.div>
            ) : (
              <motion.div key="loading" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-2">
                  <IndianRupee className="w-7 h-7 text-blue-500 animate-pulse" />
                </div>
                <p className="text-[28px] font-bold text-gray-800">₹{amount.toLocaleString('en-IN')}</p>
                <p className="text-[12px] text-gray-400 mt-1">Processing payout…</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Step timeline */}
        <div className="space-y-2">
          {STEPS.map((s, i) => {
            const active   = step === i
            const complete = step > i
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0.3 }}
                animate={{ opacity: complete || active ? 1 : 0.3 }}
                className="flex items-start gap-3"
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                  complete ? 'bg-green-500' : active ? 'bg-blue-500 ring-2 ring-blue-100' : 'bg-gray-100'
                }`}>
                  {complete
                    ? <CheckCircle2 className="w-3 h-3 text-white" />
                    : active
                    ? <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    : <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />}
                </div>
                <div>
                  <p className={`text-[12px] font-medium ${complete ? 'text-gray-700' : active ? 'text-blue-600' : 'text-gray-300'}`}>
                    {s.label}
                  </p>
                  {(complete || active) && (
                    <p className="text-[10px] text-gray-400">{s.detail}</p>
                  )}
                </div>
                {complete && (
                  <span className="ml-auto text-[10px] text-gray-300 flex-shrink-0">{s.ms}ms</span>
                )}
              </motion.div>
            )
          })}
        </div>

        {/* Razorpay mock response */}
        <AnimatePresence>
          {showCode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="bg-gray-950 rounded-lg p-3 font-mono text-[11px] overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3 h-3 text-green-400" />
                <span className="text-green-400 font-semibold">RAZORPAY TEST MODE · 200 OK</span>
              </div>
              <div className="space-y-0.5 text-gray-300">
                <p><span className="text-gray-500">trigger:</span>  <span className="text-yellow-300">{TRIGGER_LABELS[triggerType] || triggerType}</span></p>
                <p><span className="text-gray-500">amount:</span>   ₹{amount} <span className="text-gray-500">({amount * 100} paise)</span></p>
                {payoutBreakdown && (<>
                  <p className="text-gray-600 mt-1"># hybrid payout formula</p>
                  <p><span className="text-gray-500">gross_loss:</span>     ₹{payoutBreakdown.grossLoss}</p>
                  <p><span className="text-gray-500">deductible:</span>     ₹{payoutBreakdown.deductible}</p>
                  <p><span className="text-gray-500">effective_loss:</span> ₹{payoutBreakdown.effectiveLoss}</p>
                  <p><span className="text-gray-500">λ:</span>              {payoutBreakdown.lambda} <span className="text-gray-600">(BCR≤0.70)</span></p>
                  <p><span className="text-gray-500">M:</span>              {payoutBreakdown.M} <span className="text-gray-600">(0.6+DCS/180)</span></p>
                  <p><span className="text-gray-500">P_income:</span>       ₹{payoutBreakdown.pIncome}</p>
                  <p><span className="text-gray-500">P_param:</span>        ₹{payoutBreakdown.pParam}</p>
                  <p><span className="text-gray-500">trigger_max:</span>    ₹{payoutBreakdown.triggerMax}</p>
                  <p><span className="text-gray-500">P_final:</span>        <span className="text-green-300">₹{amount}</span> <span className="text-gray-600">(min(max(P_param,P_income),cap))</span></p>
                </>)}
                <p className="mt-1"><span className="text-gray-500">upi_id:</span>   <span className="text-blue-300">{upiId}</span></p>
                <p><span className="text-gray-500">utr:</span>      <span className="text-green-300">{utr}</span></p>
                <p><span className="text-gray-500">mode:</span>     UPI</p>
                <p><span className="text-gray-500">status:</span>   <span className="text-green-400">processed</span></p>
                <p><span className="text-gray-500">settlement:</span> T+0 (instant)</p>
                <p><span className="text-gray-500">time:</span>     {new Date().toLocaleTimeString('en-IN')}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* UTR + dismiss */}
        {done && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div>
              <p className="text-[10px] text-gray-400">UTR Reference</p>
              <p className="text-[12px] font-mono font-semibold text-gray-700">{utr}</p>
            </div>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-[12px] text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-3 py-1"
              >
                Dismiss
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
