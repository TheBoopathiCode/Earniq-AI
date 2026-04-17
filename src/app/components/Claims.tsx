import { useState, useEffect } from 'react'
import { Filter, Search, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'

const TRIGGER_LABELS: Record<string, string> = {
  rain:     'Heavy Rainfall',
  heat:     'Extreme Heat',
  aqi:      'Severe AQI',
  curfew:   'Zone Lockdown',
  platform: 'Platform Outage',
  pandemic: 'Pandemic Lockdown',
}

export function Claims() {
  const { t } = useTranslation()
  const [claims, setClaims] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchClaims = async () => {
    setLoading(true)
    try {
      const data = await api.get<any[]>('/claims')
      setClaims(data)
    } catch { setClaims([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchClaims() }, [])

  const filtered = claims.filter(c =>
    c.id?.toString().includes(search) ||
    c.trigger?.toLowerCase().includes(search.toLowerCase()) ||
    c.status?.toLowerCase().includes(search.toLowerCase())
  )

  const total    = claims.length
  const approved = claims.filter(c => ['paid','PAID'].includes(c.status)).length
  const pending  = claims.filter(c => ['approved','APPROVED','pending','PENDING'].includes(c.status)).length
  const rejected = claims.filter(c => ['rejected','REJECTED'].includes(c.status)).length

  const statusColor = (s: string) => {
    const st = s?.toUpperCase()
    if (st === 'PAID')     return 'bg-green-100 text-green-700'
    if (st === 'APPROVED') return 'bg-blue-100 text-blue-700'
    if (st === 'REJECTED') return 'bg-red-100 text-red-700'
    return 'bg-yellow-100 text-yellow-700'
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{t('claims')}</h1>
          <p className="text-gray-600 text-sm">{t('claim_history')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder={t('search_claims')} value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#06C167] focus:border-[#06C167] outline-none w-48" />
          </div>
          <button onClick={fetchClaims} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#06C167]' : 'text-gray-500'}`} />
          </button>
        </div>
      </div>

      {/* Scope disclaimer — always visible */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
        <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
        <div>
          <p className="text-sm font-semibold text-amber-800">Income Loss Coverage Only</p>
          <p className="text-xs text-amber-700 mt-0.5">
            EarnIQ pays for <strong>lost delivery hours and wages</strong> caused by external disruptions (weather, AQI, curfew, platform outage).
            Claims for vehicle repairs, medical bills, accidents, or personal emergencies are <strong>not covered</strong> and will be auto-rejected.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: t('total_claims'), value: total,    color: 'text-gray-900' },
          { label: t('approved'),     value: approved, color: 'text-[#06C167]' },
          { label: t('pending'),      value: pending,  color: 'text-yellow-600' },
          { label: t('rejected'),     value: rejected, color: 'text-red-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
            <p className="text-sm text-gray-600 mb-1">{stat.label}</p>
            <p className={`text-2xl lg:text-3xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
            <div className="w-5 h-5 border-2 border-[#06C167] border-t-transparent rounded-full animate-spin" />
            <span>Loading claims...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-1">No claims yet</p>
            <p className="text-sm">Use the Demo Panel on the dashboard to simulate a claim</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[t('claim_id'), t('trigger'), t('date'), t('amount'), t('fraud_score'), t('status')].map(h => (
                    <th key={h} className="text-left px-4 lg:px-6 py-3 text-xs font-medium text-gray-600 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map(claim => (
                  <tr key={claim.id} className="hover:bg-gray-50">
                    <td className="px-4 lg:px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">CLM-{String(claim.id).padStart(3,'0')}</td>
                    <td className="px-4 lg:px-6 py-4 text-sm text-gray-600">{TRIGGER_LABELS[claim.trigger] || claim.trigger}</td>
                    <td className="px-4 lg:px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {claim.createdAt ? new Date(claim.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 lg:px-6 py-4 text-sm font-semibold text-gray-900">
                      ₹{(claim.payoutAmount || claim.lossAmount || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <span className={`text-sm font-medium ${
                        (claim.fraudScore ?? 0) < 30 ? 'text-[#06C167]' :
                        (claim.fraudScore ?? 0) < 70 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {claim.fraudScore ?? 0}/100
                      </span>
                    </td>
                    <td className="px-4 lg:px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor(claim.status)}`}>
                        {claim.status?.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
