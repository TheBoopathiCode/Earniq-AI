import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Clock, XCircle, MapPin, Cloud, Shield, ChevronDown, ChevronUp, AlertTriangle, RefreshCw } from 'lucide-react'
import { useClaimsQueue, useFraudAnalysis } from '../../hooks/useAdminData'
import { useToast } from '../ui/ToastProvider'

const TRIGGER_LABELS: Record<string, string> = {
  rain: 'Heavy Rain', heat: 'Extreme Heat', aqi: 'Severe AQI',
  lockdown: 'Zone Lockdown', outage: 'Platform Outage', pandemic: 'Pandemic',
}

const STATUS_STYLE: Record<string, { bg: string; icon: typeof CheckCircle2; label: string }> = {
  paid:     { bg: 'bg-green-50 text-green-700',  icon: CheckCircle2, label: 'Auto-approved' },
  approved: { bg: 'bg-green-50 text-green-700',  icon: CheckCircle2, label: 'Approved' },
  pending:  { bg: 'bg-yellow-50 text-yellow-700', icon: Clock,        label: 'Pending' },
  review:   { bg: 'bg-yellow-50 text-yellow-700', icon: Clock,        label: 'In review' },
  rejected: { bg: 'bg-red-50 text-red-700',       icon: XCircle,      label: 'Auto-rejected' },
}

const scoreColor = (s: number) => s < 30 ? 'text-green-600' : s < 70 ? 'text-yellow-600' : 'text-red-600'

function LayerDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="text-[10px] text-gray-500">{label}</span>
    </div>
  )
}

function FraudDetail({ claimId }: { claimId: number }) {
  const { data, loading } = useFraudAnalysis(claimId)

  if (loading) return (
    <div className="flex items-center gap-2 py-3 px-1">
      <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      <span className="text-[11px] text-gray-400">Loading fraud analysis…</span>
    </div>
  )

  if (!data) return (
    <p className="text-[11px] text-gray-400 py-2">Fraud analysis unavailable for this claim.</p>
  )

  const l1 = data.layers.layer1_rules
  const l2 = data.layers.layer2_gps
  const l3 = data.layers.layer3_ml
  const syn = data.layers.syndicate_check
  const wx  = data.layers.weather_validity

  return (
    <div className="space-y-2 mt-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Fraud score',     value: `${data.overall_fraud_score}/100`, ok: data.overall_fraud_score < 30 },
          { label: 'GPS velocity',    value: `${l2.velocity_kmh} km/h`,         ok: l2.passed },
          { label: 'Syndicate score', value: `${syn.syndicate_score}`,           ok: syn.action === 'CLEAR' },
          { label: 'ML anomaly',      value: `${(l3.anomaly_score * 100).toFixed(1)}%`, ok: l3.passed },
        ].map(row => (
          <div key={row.label} className="bg-white rounded-lg p-2.5 border border-gray-100">
            <p className="text-[10px] text-gray-400">{row.label}</p>
            <p className={`text-[13px] font-semibold mt-0.5 ${row.ok ? 'text-gray-700' : 'text-red-600'}`}>{row.value}</p>
          </div>
        ))}
      </div>

      {/* Layer flags */}
      {[...l2.flags, ...wx.flags].length > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-lg p-2.5">
          <p className="text-[11px] font-semibold text-red-700 mb-1">Fraud flags:</p>
          {[...l2.flags, ...wx.flags].map((f, i) => (
            <p key={i} className="text-[11px] text-red-600">• {f}</p>
          ))}
        </div>
      )}

      {/* Layer 1 checks */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
        {l1.checks.map(c => (
          <div key={c.name} className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.passed ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-[10px] text-gray-500">{c.name}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-gray-400">
        Decision: <span className="font-semibold text-gray-600">{data.decision.replace('_', ' ')}</span>
        · processed in {data.processing_time_ms}ms
        · {syn.message}
      </p>
    </div>
  )
}

export function LiveClaimsQueue() {
  const { data: claims, loading, error } = useClaimsQueue()
  const [expanded, setExpanded] = useState<string | null>(null)
  const { fire } = useToast()
  const prevCountRef = useRef(0)

  // Fire toast when new claims arrive
  useEffect(() => {
    const count = claims?.length ?? 0
    if (count > prevCountRef.current && prevCountRef.current > 0) {
      fire({ type: 'claim', title: 'New claim in queue', body: `${count - prevCountRef.current} new claim(s) arrived` })
    }
    prevCountRef.current = count
  }, [claims?.length, fire])

  // Extract numeric ID for fraud analysis
  const expandedNumericId = expanded
    ? parseInt(expanded.replace(/\D/g, ''), 10) || null
    : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <p className="text-[13px] font-semibold text-gray-800">Live Claims Queue</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />}
          <span className="text-[11px] text-gray-400">{claims?.length ?? 0} claims · auto-refresh 5s</span>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
          <p className="text-[11px] text-red-600">Backend error: {error} — retrying…</p>
        </div>
      )}

      {!claims?.length && !loading && (
        <div className="px-4 py-8 text-center text-[12px] text-gray-400">No claims in queue</div>
      )}

      <div className="divide-y divide-gray-50">
        {(claims ?? []).map(c => {
          const style = STATUS_STYLE[c.status] ?? STATUS_STYLE['pending']
          const Icon  = style.icon
          const isOpen = expanded === c.id
          const fraudOk = c.fraudScore < 30
          const gpsOk   = c.fraudScore < 50
          const mlOk    = c.fraudScore < 70

          return (
            <div key={c.id}>
              <button
                onClick={() => setExpanded(isOpen ? null : c.id)}
                className="w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold text-gray-700">{c.id}</span>
                      <span className="text-[11px] text-gray-400">{c.worker}</span>
                      <span className="text-[11px] text-gray-400">·</span>
                      <span className="text-[11px] text-gray-500">{c.zone}</span>
                      <span className="text-[11px] text-gray-400">·</span>
                      <span className="text-[11px] text-gray-500">{TRIGGER_LABELS[c.trigger] ?? c.trigger}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <LayerDot ok={gpsOk}   label="GPS" />
                      <LayerDot ok={fraudOk}  label="Rules" />
                      <LayerDot ok={mlOk}     label="ML" />
                      <span className="text-[10px] text-gray-400">DCS {c.dcs}</span>
                      {!gpsOk && (
                        <span className="text-[10px] text-red-500 flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" /> Fraud flag
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[12px] font-semibold text-gray-800">
                        ₹{(c.amount ?? 0).toLocaleString('en-IN')}
                      </p>
                      <p className={`text-[11px] font-medium ${scoreColor(c.fraudScore)}`}>
                        Score {c.fraudScore}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium flex items-center gap-1 ${style.bg}`}>
                      <Icon className="w-3 h-3" />{style.label}
                    </span>
                    {isOpen
                      ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                      : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
                  <FraudDetail claimId={expandedNumericId!} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
