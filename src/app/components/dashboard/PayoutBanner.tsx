import { memo, useState, useEffect } from 'react'
import { CheckCircle2, X, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Payout } from '../../types/dashboard'
import { SpeakButton } from '../LanguageSwitcher'

const TIMELINE_STEPS = [
  { label: 'Claim Generated',         detail: (_p: Payout) => `Income loss claim auto-created` },
  { label: 'Fraud Engine (3 layers)',  detail: () => 'Score 8/100 — All 3 layers passed' },
  { label: 'Auto Approved',            detail: () => 'DCS ≥ 70 — threshold confirmed' },
  { label: 'Razorpay API Called',      detail: () => 'POST /v1/payouts → 200 OK' },
  { label: 'UPI Transfer Initiated',   detail: (p: Payout) => `Sending income payout to ${p.utr ? 'worker UPI' : '...'}` },
  { label: 'Income Payout Confirmed',  detail: (p: Payout) => `UTR: ${p.utr}` },
]

export const PayoutBanner = memo(function PayoutBanner({ payout }: { payout: Payout }) {
  const [visible, setVisible]         = useState(true)
  const [activeStep, setActiveStep]   = useState(0)
  const [showRazorpay, setShowRazorpay] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    TIMELINE_STEPS.forEach((_, i) => {
      setTimeout(() => setActiveStep(i + 1), i * 400)
    })
    setTimeout(() => setShowRazorpay(true), TIMELINE_STEPS.length * 400 + 200)
  }, [])

  if (!visible) return null

  const payoutText = `Payout credited ₹${payout.amount?.toLocaleString('en-IN')}`

  return (
    <div className="bg-gradient-to-r from-[#06C167] to-[#049150] text-white rounded-xl p-4 sm:p-6 shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{t('payout_success')}</h3>
              <SpeakButton text={payoutText} className="text-white/70 hover:text-white hover:bg-white/20" />
            </div>
            <p className="text-sm opacity-90">{t('payout_auto')}</p>
          </div>
        </div>
        <button onClick={() => setVisible(false)} className="text-white hover:bg-white/20 p-1 rounded flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Amount */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-xs opacity-75 mb-1">Income Loss Payout</p>
          <p className="text-2xl font-bold">₹{(payout.amount ?? 0).toLocaleString('en-IN')}</p>
        </div>
        <div>
          <p className="text-xs opacity-75 mb-1">UTR Number</p>
          <p className="font-mono text-sm">{payout.utr}</p>
        </div>
        <div>
          <p className="text-xs opacity-75 mb-1">Processed At</p>
          <p className="text-sm">{payout.time ? new Date(payout.time).toLocaleTimeString('en-IN') : '—'}</p>
        </div>
      </div>

      {/* Animated 6-step timeline */}
      <div className="bg-white/10 rounded-xl p-3 mb-3">
        <p className="text-xs font-semibold opacity-75 mb-2 uppercase tracking-wide">Payout Pipeline</p>
        <div className="space-y-1.5">
          {TIMELINE_STEPS.map((step, i) => (
            <div key={i} className={`flex items-center gap-2 transition-all duration-300 ${
              i < activeStep ? 'opacity-100' : 'opacity-30'
            }`}>
              <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                i < activeStep ? 'bg-white' : 'bg-white/30'
              }`}>
                {i < activeStep
                  ? <CheckCircle2 className="w-3 h-3 text-[#06C167]" />
                  : <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium">{step.label}</span>
                {i < activeStep && (
                  <span className="text-xs opacity-75 ml-2">— {step.detail(payout)}</span>
                )}
              </div>
              {i < activeStep && (
                <span className="text-xs opacity-60 flex-shrink-0">{(i + 1) * 400}ms</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Razorpay mock response */}
      {showRazorpay && (
        <div className="bg-gray-900 rounded-xl p-3 font-mono text-xs">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3 h-3 text-[#06C167]" />
            <span className="text-[#06C167] font-semibold">RAZORPAY TEST MODE</span>
            <span className="text-gray-400 ml-auto">200 OK</span>
          </div>
          <div className="space-y-0.5 text-gray-300">
            <p><span className="text-gray-500">POST</span> /v1/payouts ✓</p>
            <p><span className="text-gray-500">utr:</span> <span className="text-green-400">{payout.utr}</span></p>
            <p><span className="text-gray-500">amount:</span> ₹{payout.amount ?? 0} ({(payout.amount ?? 0) * 100} paise)</p>
            <p><span className="text-gray-500">mode:</span> UPI</p>
            <p><span className="text-gray-500">status:</span> <span className="text-green-400">processed</span></p>
            <p><span className="text-gray-500">settlement:</span> T+0 (instant)</p>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-white/20">
        <p className="text-xs opacity-75">⚡ {t('processed_fast')}</p>
      </div>
    </div>
  )
})
