import { memo, useMemo } from 'react'
import { Brain, AlertTriangle, CheckCircle2, ShieldCheck, Loader2, IndianRupee } from 'lucide-react'
import { motion } from 'framer-motion'

interface Props {
  currentStep: 'predict' | 'warn' | 'confirm' | 'verified' | 'processing' | 'completed'
  dcsScore: number
  payoutAmount?: number
}

const STEPS = [
  { key: 'predict',    label: 'Predict',    description: 'Monitoring income conditions', icon: Brain },
  { key: 'warn',       label: 'Warn',       description: 'Income risk alert issued',     icon: AlertTriangle },
  { key: 'confirm',    label: 'Confirm',    description: 'Disruption verified',          icon: CheckCircle2 },
  { key: 'verified',   label: 'Verified',   description: 'Income loss claim validated',  icon: ShieldCheck },
  { key: 'processing', label: 'Processing', description: 'Income payout in progress',    icon: Loader2 },
  { key: 'completed',  label: 'Completed',  description: 'Income loss payout credited',  icon: IndianRupee },
] as const

export const ClaimPipelineTracker = memo(function ClaimPipelineTracker({ currentStep, dcsScore, payoutAmount }: Props) {
  const currentIndex = useMemo(() => STEPS.findIndex(s => s.key === currentStep), [currentStep])
  const progressPct  = useMemo(() => (currentIndex / (STEPS.length - 1)) * 100, [currentIndex])

  const activeStep = STEPS[currentIndex]
  const activeDescription =
    currentStep === 'completed' && payoutAmount != null
      ? `₹${payoutAmount.toLocaleString('en-IN')} income loss payout credited`
      : activeStep.description

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-semibold text-gray-900">Claim Status</h3>
          <p className="text-xs text-gray-500 mt-0.5">Real-time protection pipeline</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
          dcsScore >= 70 ? 'bg-red-100 text-red-700' :
          dcsScore >= 50 ? 'bg-yellow-100 text-yellow-700' :
          'bg-[#E6FAF1] text-[#06C167]'
        }`}>
          DCS {dcsScore}
        </div>
      </div>

      <div className="relative">
        {/* Background track */}
        <div className="absolute top-6 left-6 right-6 h-0.5 bg-gray-200" />
        {/* Filled track */}
        <motion.div
          className="absolute top-6 left-6 h-0.5 bg-[#06C167]"
          initial={{ width: 0 }}
          animate={{ width: `calc(${progressPct}% - 12px)` }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />

        <div className="relative grid grid-cols-6 gap-1">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            const completed = index < currentIndex
            const active = index === currentIndex
            const pending = index > currentIndex

            return (
              <div key={step.key} className="flex flex-col items-center text-center gap-2">
                <motion.div
                  animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                  transition={{ duration: 1.5, repeat: active ? Infinity : 0 }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                    completed ? 'bg-[#06C167] text-white shadow-sm' :
                    active    ? 'bg-[#06C167] text-white shadow-lg ring-4 ring-[#E6FAF1]' :
                                'bg-gray-100 text-gray-400'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${active && step.key === 'processing' ? 'animate-spin' : ''}`} />
                </motion.div>

                <p className={`text-xs font-semibold leading-tight ${
                  active ? 'text-[#06C167]' : completed ? 'text-gray-700' : 'text-gray-400'
                }`}>
                  {step.label}
                </p>

                <p className={`text-xs leading-tight ${
                  active ? 'text-gray-600' : pending ? 'text-gray-300' : 'text-gray-400'
                }`}>
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500">Current stage</span>
        <span className={`text-sm font-semibold ${
          currentStep === 'completed' ? 'text-[#06C167]' : 'text-gray-900'
        }`}>
          {activeStep.label} — {activeDescription}
        </span>
      </div>
    </div>
  )
})
