import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, Shield, Clock, TrendingUp, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../context/AppContext'
import { TRIGGER_DETAILS, CITY_NAMES } from '../lib/types'
import { SpeakButton } from './LanguageSwitcher'
import { api } from '../lib/api'

function getRenewalCountdown(validUntil: string | Date | null): string {
  if (!validUntil) return '—'
  const diff = new Date(validUntil).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const days  = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `Renews in ${days} day${days > 1 ? 's' : ''}`
  return `Renews in ${hours} hour${hours > 1 ? 's' : ''}`
}

export function Policy() {
  const { policy: ctxPolicy, worker } = useAppContext()
  const { t } = useTranslation()
  const [livePolicy, setLivePolicy] = useState<any>(null)
  const [breakdown, setBreakdown]   = useState<any>(null)
  const [loading, setLoading]       = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get<any>('/auth/me').catch(() => null),
      api.get<any>('/premium/breakdown').catch(() => null),
    ]).then(([auth, bd]) => {
      if (auth?.policy) setLivePolicy(auth.policy)
      if (bd) setBreakdown(bd)
    }).finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const policy = livePolicy ?? ctxPolicy

  const tier          = policy?.tier?.toUpperCase() || '—'
  const weeklyPremium = policy?.weeklyPremium || 0
  const coverageCap   = policy?.coverageCap || 0
  const validFrom     = policy?.validFrom  ? new Date(policy.validFrom).toLocaleDateString('en-IN',  { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const validUntil    = policy?.validUntil ? new Date(policy.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const renewal       = getRenewalCountdown(policy?.validUntil ?? null)
  const isExpiringSoon = policy?.validUntil && (new Date(policy.validUntil).getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000

  // Use backend breakdown if available, otherwise null (no local computation)
  const bd = breakdown

  const policySpeak = `${t('policy_status')} ${t('active')}. ${t('weekly_premium')} ₹${weeklyPremium}. ${t('coverage_cap')} ₹${coverageCap}.`

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{t('policy')}</h1>
          <p className="text-gray-600 text-sm">{t('weekly_premium')} · {t('coverage_cap')} · {t('active_triggers')}</p>
        </div>
        <SpeakButton text={policySpeak} />
        <button onClick={refresh} className="ml-auto p-2 rounded-lg hover:bg-gray-100">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#06C167]' : 'text-gray-400'}`} />
        </button>
      </div>

      {/* Renewal countdown banner */}
      {policy && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-4 ${
          isExpiringSoon ? 'bg-yellow-50 border border-yellow-200' : 'bg-[#E6FAF1] border border-[#06C167]/20'
        }`}>
          <Clock className={`w-4 h-4 flex-shrink-0 ${isExpiringSoon ? 'text-yellow-600' : 'text-[#06C167]'}`} />
          <span className={`text-sm font-medium ${isExpiringSoon ? 'text-yellow-700' : 'text-[#06C167]'}`}>
            {renewal}
          </span>
          <span className="text-xs text-gray-500 ml-auto">Valid until {validUntil}</span>
        </div>
      )}

      <div className="bg-gradient-to-br from-[#06C167] to-[#049150] text-white rounded-xl p-6 lg:p-8 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-sm opacity-90 mb-1">{t('policy_status')}</p>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6" />
              <p className="text-2xl font-bold">{policy ? t('active') : '—'}</p>
            </div>
          </div>
          <div className="px-4 py-2 bg-white/20 rounded-full text-sm font-medium">
            {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 lg:gap-6">
          <div><p className="text-xs lg:text-sm opacity-75 mb-1">{t('weekly_premium')}</p><p className="text-2xl lg:text-3xl font-bold">₹{weeklyPremium}</p></div>
          <div><p className="text-xs lg:text-sm opacity-75 mb-1">{t('coverage_cap')}</p><p className="text-2xl lg:text-3xl font-bold">₹{coverageCap.toLocaleString('en-IN')}</p></div>
          <div><p className="text-xs lg:text-sm opacity-75 mb-1">{t('coverage_tier')}</p><p className="text-2xl lg:text-3xl font-bold">{tier}</p></div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/20 flex items-center gap-2">
          <span className="text-xs bg-white/20 text-white px-3 py-1 rounded-full font-medium">
            💰 Income Loss Only · No health · No accident · No vehicle
          </span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">{t('coverage_tier')}</h3>
        <div className="space-y-0">
          {[
            { label: t('tier'),         value: tier },
            { label: 'Policy Period',   value: `${validFrom} – ${validUntil}` },
            { label: t('auto_renewal'), value: t('enabled'), valueClass: 'text-[#06C167]' },
            { label: t('upi_payout'),   value: worker?.upiId || '—' },
            { label: t('zone'),         value: worker ? `${worker.zone.name}, ${CITY_NAMES[worker.city]}` : '—' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-3 border-b last:border-b-0">
              <span className="text-gray-600 text-sm">{row.label}</span>
              <span className={`font-semibold text-gray-900 text-sm ${(row as any).valueClass || ''}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">{t('active_triggers')}</h3>
        {(policy?.triggersActive || []).length === 0 ? (
          <p className="text-sm text-gray-500">No active triggers</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(policy?.triggersActive || []).map((trigger: string) => {
              const detail = TRIGGER_DETAILS[trigger as keyof typeof TRIGGER_DETAILS]
              return (
                <div key={trigger} className="flex items-start gap-3 p-3 bg-[#E6FAF1] rounded-lg border border-[#06C167]/20">
                  <Shield className="w-4 h-4 text-[#06C167] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{detail?.name || trigger}</p>
                    {detail && <p className="text-xs text-gray-500 mt-0.5">{detail.threshold}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Explicit exclusions — legally required scope boundary */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 lg:p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-red-500 text-base">🚫</span>
          <h3 className="font-semibold text-red-800 text-sm">What is NOT Covered</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { icon: '🚑', label: 'Medical bills or hospitalisation' },
            { icon: '🩺', label: 'Accident injuries or disability' },
            { icon: '🛜', label: 'Vehicle repair or damage' },
            { icon: '🔧', label: 'Bike/scooter maintenance costs' },
            { icon: '🏠', label: 'Personal or family emergencies' },
            { icon: '💳', label: 'Voluntary income reduction' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs text-red-700">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-red-600 mt-3 pt-3 border-t border-red-200">
          This policy covers <strong>lost delivery income only</strong> — wages you could not earn because an external disruption (weather, AQI, curfew, platform outage) prevented you from working.
        </p>
      </div>

      {policy?.aiInsight && (
        <div className="bg-[#E6FAF1] border border-[#06C167]/30 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 bg-[#06C167] rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-[#06C167]">{t('ai_insight')}</p>
              <SpeakButton text={policy.aiInsight} />
            </div>
            <p className="text-sm text-gray-700">{policy.aiInsight}</p>
          </div>
        </div>
      )}

      {/* ML Dynamic Pricing Breakdown — backend-driven, no hardcoded values */}
      {bd && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900">AI Dynamic Pricing — Income Loss Model</h3>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">XGBoost ML</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Every factor below measures your <strong>income loss exposure only</strong>. No vehicle, health, or accident risk is priced here.
          </p>

          {/* Factor multiplier bars */}
          <div className="space-y-2 mb-4">
            {([
              { label: 'Zone Risk → income disruption freq.',  key: 'zone_multiplier',   max: 2.33 },
              { label: 'Flood History → lost delivery hours',  key: 'flood_factor',      max: 1.45 },
              { label: 'AQI Baseline → pollution income loss', key: 'aqi_factor',         max: 1.28 },
              { label: 'Heat Days → heat income loss days',    key: 'heat_factor',        max: 1.15 },
              { label: 'Platform → outdoor income exposure',   key: 'platform_factor',   max: 1.10 },
              { label: 'Claim History → income loss freq.',    key: 'claim_factor',      max: 1.80 },
              { label: 'Consistency → income loss discount',   key: 'consistency_bonus', max: 1.00 },
            ] as const).map(f => {
              const value     = bd.factors?.[f.key] ?? 1
              const pct       = Math.min(100, (value / f.max) * 100)
              const isGood    = value < 1.0
              const isNeutral = Math.abs(value - 1.0) < 0.02
              const barColor  = isNeutral ? 'bg-gray-300' : isGood ? 'bg-[#06C167]' : 'bg-red-400'
              return (
                <div key={f.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{f.label}</span>
                    <span className={`font-semibold ${isNeutral ? 'text-gray-500' : isGood ? 'text-[#06C167]' : 'text-red-500'}`}>
                      {value.toFixed(2)}×{!isNeutral && <span className="ml-1">{isGood ? '↓' : '↑'}</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Per-factor rupee breakdown */}
          {bd.breakdown?.length > 0 && (
            <div className="space-y-1.5 mb-4 pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Adjustments</p>
              {bd.breakdown.map((f: any) => (
                <div key={f.label} className="flex justify-between items-center text-xs">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <span>{f.type === 'discount' ? '🟢' : '🔴'}</span>{f.label}
                    <span className="text-gray-400">({f.value})</span>
                  </span>
                  <span className={`font-semibold ${f.type === 'discount' ? 'text-[#06C167]' : 'text-red-500'}`}>
                    {f.impact}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Summary row */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400">Base income-loss actuarial rate</p>
              <p className="text-sm font-medium text-gray-700">
                ₹{bd.base_rate} × {((bd.actuarial_loading ?? 0.035) * 100).toFixed(1)}% of weekly income
              </p>
            </div>
            {bd.savings > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-400">You save vs max</p>
                <p className="text-sm font-bold text-[#06C167]">
                  ₹{bd.savings}/week ({bd.savings_pct}% off)
                </p>
              </div>
            )}
          </div>

          {/* AI insight from backend */}
          {(bd.ai_insight || bd.live_ai_insight) && (
            <div className="mt-3 bg-[#E6FAF1] border border-[#06C167]/20 rounded-lg p-3 flex gap-2">
              <span className="text-xs font-bold text-[#06C167] flex-shrink-0 mt-0.5">AI</span>
              <p className="text-xs text-gray-600 leading-relaxed">{bd.live_ai_insight || bd.ai_insight}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
