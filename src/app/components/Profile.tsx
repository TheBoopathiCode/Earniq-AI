import { User, MapPin, Briefcase, Phone, CreditCard, Shield, Star } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../context/AppContext'
import { PLATFORM_NAMES, CITY_NAMES } from '../lib/types'
import { api } from '../lib/api'

export function Profile() {
  const { worker, policy } = useAppContext()
  const { t } = useTranslation()
  const [earnings, setEarnings] = useState<any>(null)
  const [claimCount, setClaimCount] = useState(0)

  useEffect(() => {
    Promise.all([
      api.get<any>('/earnings/summary').catch(() => null),
      api.get<any[]>('/claims').catch(() => []),
    ]).then(([e, c]) => {
      setEarnings(e)
      setClaimCount(Array.isArray(c) ? c.length : 0)
    })
  }, [])

  const name        = worker?.name || 'Gig Worker'
  const phone       = worker?.phone ? `+91 ${worker.phone}` : '—'
  const platform    = worker ? PLATFORM_NAMES[worker.platform] : '—'
  const location    = worker ? `${CITY_NAMES[worker.city]} — ${worker.zone.name}` : '—'
  const upiId       = worker?.upiId || '—'
  const memberSince = worker?.createdAt ? new Date(worker.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'
  const tierLabel   = policy ? `${policy.tier.charAt(0).toUpperCase()}${policy.tier.slice(1)} ${t('tier')}` : '—'
  const weeklyEarnings = worker ? worker.workingHours * 250 : 0

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{t('profile')}</h1>
        <p className="text-gray-600 text-sm">{t('personal_info')} · {t('payment_details')}</p>
      </div>

      {/* Hero card */}
      <div className="bg-gradient-to-r from-[#06C167] to-[#049150] text-white rounded-xl p-6 lg:p-8 mb-6">
        <div className="flex items-center gap-4 lg:gap-6">
          <div className="w-16 h-16 lg:w-24 lg:h-24 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-8 h-8 lg:w-12 lg:h-12" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl lg:text-2xl font-bold mb-1 truncate">{name}</h2>
            <p className="opacity-90 mb-2 text-sm">{platform} Partner</p>
            <div className="flex flex-wrap items-center gap-3 text-xs lg:text-sm">
              <div className="flex items-center gap-1"><Shield className="w-3 h-3 lg:w-4 lg:h-4" /><span>{t('member_since')} {memberSince}</span></div>
              <div className="flex items-center gap-1"><CreditCard className="w-3 h-3 lg:w-4 lg:h-4" /><span>{tierLabel}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Weekly Earnings', value: `₹${weeklyEarnings.toLocaleString('en-IN')}`, icon: CreditCard },
          { label: 'Total Claims',    value: claimCount.toString(),                          icon: Shield },
          { label: 'Protected',       value: `₹${(earnings?.protected_income || 0).toLocaleString('en-IN')}`, icon: Star },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 lg:p-4 text-center">
              <Icon className="w-4 h-4 text-[#06C167] mx-auto mb-1" />
              <p className="text-lg lg:text-xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Personal info */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">{t('personal_info')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: t('full_name'),    value: name,     icon: User },
            { label: t('phone_number'), value: phone,    icon: Phone },
            { label: t('platform'),     value: platform, icon: Briefcase },
            { label: t('location'),     value: location, icon: MapPin },
          ].map(field => {
            const Icon = field.icon
            return (
              <div key={field.label}>
                <label className="text-xs text-gray-600 mb-1 block">{field.label}</label>
                <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg">
                  <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-900 text-sm truncate">{field.value}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
        <h3 className="font-semibold text-gray-900 mb-4">{t('payment_details')}</h3>
        <div className="flex items-center gap-3 p-4 bg-[#E6FAF1] rounded-lg border border-[#06C167]/20">
          <div className="w-10 h-10 bg-[#06C167] rounded-full flex items-center justify-center flex-shrink-0">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-600">{t('upi_payout')}</p>
            <p className="font-semibold text-gray-900 truncate">{upiId}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
