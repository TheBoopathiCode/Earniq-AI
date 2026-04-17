import { memo } from 'react'
import { Shield, CheckCircle2, XCircle, Clock, TrendingUp } from 'lucide-react'

const TRIGGER_LABELS: Record<string, string> = {
  rain:     'Heavy Rainfall',
  heat:     'Extreme Heat',
  aqi:      'Severe AQI',
  curfew:   'Zone Lockdown',
  platform: 'Platform Outage',
  pandemic: 'Pandemic Lockdown',
}

interface Props {
  data: {
    current_week: {
      premium_paid: number; coverage_active: boolean; coverage_cap: number
      tier: string; valid_until: string; days_remaining: number
      triggers_covered: string[]; triggers_not_covered: string[]
    }
    all_time: {
      total_premium_paid: number; total_protected: number; total_claims: number
      claims_approved: number; income_protected_pct: number; roi: number
    }
    next_renewal: { date: string; estimated_premium: number; ai_forecast: string }
  }
}

export const EarningsProtectionCard = memo(function EarningsProtectionCard({ data }: Props) {
  const { current_week, all_time, next_renewal } = data

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-[#E6FAF1] to-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-[#06C167]" />
          <span className="font-semibold text-gray-900 text-sm">Earnings Protection</span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
          current_week.coverage_active ? 'bg-[#E6FAF1] text-[#06C167]' : 'bg-red-100 text-red-600'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${current_week.coverage_active ? 'bg-[#06C167] animate-pulse' : 'bg-red-500'}`} />
          {current_week.coverage_active ? 'ACTIVE' : 'INACTIVE'}
        </div>
      </div>

      {/* Stats grid */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500">Weekly Premium</p>
          <p className="text-xl font-bold text-gray-900">₹{current_week.premium_paid}</p>
          <p className="text-xs text-gray-400 capitalize">{current_week.tier} plan</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Max Income Payout / Week</p>
          <p className="text-xl font-bold text-gray-900">₹{current_week.coverage_cap.toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-400">per disruption event</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Total Income Protected</p>
          <p className="text-xl font-bold text-[#06C167]">₹{(all_time.total_protected ?? 0).toLocaleString('en-IN')}</p>
          <p className="text-xs text-gray-400">{all_time.total_claims} income-loss claims</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Your ROI</p>
          <p className={`text-xl font-bold ${all_time.roi >= 0 ? 'text-[#06C167]' : 'text-red-600'}`}>
            {all_time.roi >= 0 ? '+' : ''}{all_time.roi}%
          </p>
          <p className="text-xs text-gray-400">on premiums paid</p>
        </div>
      </div>

      {/* Triggers */}
      <div className="px-4 pb-3">
        <p className="text-xs text-gray-500 mb-2">Covered triggers</p>
        <div className="flex flex-wrap gap-1.5">
          {current_week.triggers_covered.map(t => (
            <span key={t} className="flex items-center gap-1 text-xs bg-[#E6FAF1] text-[#06C167] px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" />{TRIGGER_LABELS[t]}
            </span>
          ))}
          {current_week.triggers_not_covered.map(t => (
            <span key={t} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">
              <XCircle className="w-3 h-3" />{TRIGGER_LABELS[t]}
            </span>
          ))}
        </div>
      </div>

      {/* Renewal */}
      <div className="mx-4 mb-4 flex items-start gap-2 bg-[#E6FAF1] rounded-lg p-3">
        <Clock className="w-4 h-4 text-[#06C167] flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-900">
            Renews {next_renewal.date} · ₹{next_renewal.estimated_premium}/week income-loss premium
          </p>
          {next_renewal.ai_forecast && (
            <p className="text-xs text-gray-600 mt-0.5 truncate">{next_renewal.ai_forecast}</p>
          )}
        </div>
      </div>
    </div>
  )
})
