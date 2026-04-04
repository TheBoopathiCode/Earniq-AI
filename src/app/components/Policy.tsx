import { CheckCircle, Shield, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../context/AppContext'
import { TRIGGER_DETAILS, CITY_NAMES } from '../lib/types'
import { SpeakButton } from './LanguageSwitcher'

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
  const { policy, worker } = useAppContext()
  const { t } = useTranslation()

  const tier          = policy?.tier?.toUpperCase() || '—'
  const weeklyPremium = policy?.weeklyPremium || 0
  const coverageCap   = policy?.coverageCap || 0
  const validFrom     = policy?.validFrom  ? new Date(policy.validFrom).toLocaleDateString('en-IN',  { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const validUntil    = policy?.validUntil ? new Date(policy.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const renewal       = getRenewalCountdown(policy?.validUntil ?? null)
  const isExpiringSoon = policy?.validUntil && (new Date(policy.validUntil).getTime() - Date.now()) < 2 * 24 * 60 * 60 * 1000

  const policySpeak = `${t('policy_status')} ${t('active')}. ${t('weekly_premium')} ₹${weeklyPremium}. ${t('coverage_cap')} ₹${coverageCap}.`

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{t('policy')}</h1>
          <p className="text-gray-600 text-sm">{t('weekly_premium')} · {t('coverage_cap')} · {t('active_triggers')}</p>
        </div>
        <SpeakButton text={policySpeak} />
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
            {(policy?.triggersActive || []).map(trigger => {
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
    </div>
  )
}
