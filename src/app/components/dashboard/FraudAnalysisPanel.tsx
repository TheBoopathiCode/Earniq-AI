import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, MapPin, Cloud, Users, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

interface FraudLayers {
  rules: { passed: boolean; checks: { name: string; passed: boolean }[] }
  gps:   { passed: boolean; velocity: number; dwellTime: number }
  ml:    { passed: boolean; anomalyScore: number; features: string[] }
}

interface Props {
  fraudScore: number
  fraudDecision: string
  layers: FraudLayers
  syndicateScore: number
  processingMs?: number
}

const LAYER_META = [
  { key: 'rules', icon: Shield,   label: 'Layer 1 — Rule-Based Checks',       sub: '5 deterministic checks · instant' },
  { key: 'gps',   icon: MapPin,   label: 'Layer 2 — GPS Velocity Validation', sub: 'Haversine distance · trajectory check' },
  { key: 'ml',    icon: Cloud,    label: 'Layer 3 — Isolation Forest ML',     sub: '8-week personal baseline · anomaly score' },
]

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  )
}

export function FraudAnalysisPanel({ fraudScore, fraudDecision, layers, syndicateScore, processingMs = 1847 }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(0)

  useEffect(() => {
    // Reveal layers one by one
    const timers = [0, 600, 1400].map((delay, i) =>
      setTimeout(() => setRevealed(i + 1), delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const scoreColor = fraudScore < 30 ? 'bg-green-500' : fraudScore < 70 ? 'bg-yellow-500' : 'bg-red-500'
  const scoreText  = fraudScore < 30 ? 'text-green-600' : fraudScore < 70 ? 'text-yellow-600' : 'text-red-600'
  const decisionBg = fraudDecision === 'auto_approve' ? 'bg-green-50 border-green-200 text-green-700'
    : fraudDecision === 'review' ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
    : 'bg-red-50 border-red-200 text-red-700'
  const decisionLabel = fraudDecision === 'auto_approve' ? '✓ Auto-Approved — Payout initiated'
    : fraudDecision === 'review' ? '⏳ Sent to insurer review queue'
    : '✗ Auto-Rejected — Fraud detected'

  const layerData = [
    {
      key: 'rules', passed: layers.rules.passed,
      detail: (
        <div className="space-y-1 mt-2">
          {layers.rules.checks.map(c => (
            <div key={c.name} className="flex items-center gap-2 text-[11px]">
              {c.passed
                ? <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                : <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />}
              <span className={c.passed ? 'text-gray-600' : 'text-red-600'}>{c.name}</span>
            </div>
          ))}
        </div>
      )
    },
    {
      key: 'gps', passed: layers.gps.passed,
      detail: (
        <div className="space-y-1 mt-2 text-[11px] text-gray-600">
          <div className="flex justify-between"><span>Velocity</span><span className="font-mono">{layers.gps.velocity} km/h</span></div>
          <div className="flex justify-between"><span>Max allowed</span><span className="font-mono">120 km/h</span></div>
          <div className="flex justify-between"><span>Zone dwell time</span><span className="font-mono">{layers.gps.dwellTime} min</span></div>
          <div className="flex justify-between"><span>Trajectory check</span><span className="text-green-600 font-medium">Passed</span></div>
          <div className="flex justify-between"><span>Accel signature</span><span className="text-green-600 font-medium">Genuine pattern</span></div>
        </div>
      )
    },
    {
      key: 'ml', passed: layers.ml.passed,
      detail: (
        <div className="space-y-1.5 mt-2">
          <div className="flex justify-between text-[11px] text-gray-600 mb-1">
            <span>Anomaly score</span>
            <span className="font-mono text-green-600">{(layers.ml.anomalyScore * 100).toFixed(1)}%</span>
          </div>
          <ScoreBar score={layers.ml.anomalyScore * 100} color="bg-green-400" />
          <p className="text-[10px] text-gray-400 mt-1">Isolation Forest · contamination=0.05 · 100 estimators</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {layers.ml.features.map(f => (
              <span key={f} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{f}</span>
            ))}
          </div>
        </div>
      )
    },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-gray-600" />
          <span className="text-[13px] font-semibold text-gray-800">Fraud Engine — 3-Layer Analysis</span>
        </div>
        <span className="text-[11px] text-gray-400">{processingMs}ms total</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Score + decision */}
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 text-center">
            <p className={`text-[28px] font-bold ${scoreText}`}>{fraudScore}</p>
            <p className="text-[10px] text-gray-400">/ 100</p>
          </div>
          <div className="flex-1">
            <ScoreBar score={fraudScore} color={scoreColor} />
            <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
              <span>0 — Safe</span><span>30 — Review</span><span>70 — Reject</span>
            </div>
          </div>
        </div>

        <div className={`rounded-lg border px-3 py-2 text-[12px] font-medium ${decisionBg}`}>
          {decisionLabel}
        </div>

        {/* 3 layers */}
        <div className="space-y-2">
          {LAYER_META.map((meta, i) => {
            const layer = layerData[i]
            const isVisible = revealed > i
            const isOpen = expanded === meta.key
            return (
              <AnimatePresence key={meta.key}>
                {isVisible && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border border-gray-100 rounded-lg overflow-hidden"
                  >
                    <button
                      onClick={() => setExpanded(isOpen ? null : meta.key)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${layer.passed ? 'bg-green-100' : 'bg-red-100'}`}>
                        {layer.passed
                          ? <CheckCircle2 className="w-3 h-3 text-green-600" />
                          : <XCircle className="w-3 h-3 text-red-600" />}
                      </div>
                      <meta.icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 text-left">
                        <p className="text-[12px] font-medium text-gray-700">{meta.label}</p>
                        <p className="text-[10px] text-gray-400">{meta.sub}</p>
                      </div>
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 border-t border-gray-50">
                            {layer.detail}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            )
          })}
        </div>

        {/* Syndicate score */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] text-gray-500">Syndicate Score (ring fraud)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-gray-700">{syndicateScore}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              syndicateScore < 30 ? 'bg-green-50 text-green-700' :
              syndicateScore < 60 ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-700'
            }`}>
              {syndicateScore < 30 ? 'No ring' : syndicateScore < 60 ? 'Soft freeze' : 'Zone lock'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
