import { memo, useMemo } from 'react'
import { FileText, CheckCircle, XCircle, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ClaimHistoryItem } from '../../types/dashboard'

export const ClaimHistoryList = memo(function ClaimHistoryList({ claims }: { claims: ClaimHistoryItem[] }) {
  const { t } = useTranslation()

  const triggerLabel = useMemo(() => (tr: string) => ({
    rain: t('heavy_rainfall'), heat: t('extreme_heat'), aqi: t('severe_aqi'),
    curfew: t('zone_lockdown'), platform: t('platform_outage')
  } as Record<string,string>)[tr] || tr, [t])

  const getStatusIcon = (s: string) =>
    s === 'PAID' ? <CheckCircle className="w-5 h-5 text-[#06C167]" /> :
    s === 'REJECTED' ? <XCircle className="w-5 h-5 text-red-600" /> :
    <Clock className="w-5 h-5 text-yellow-600" />

  const getStatusColor = (s: string) =>
    s === 'PAID' ? 'text-[#06C167] bg-[#E6FAF1]' :
    s === 'REJECTED' ? 'text-red-700 bg-red-50' : 'text-yellow-700 bg-yellow-50'

  const getStatusLabel = (s: string) =>
    s === 'PAID' ? t('payout_credited') :
    s === 'REJECTED' ? t('rejected') : t('pending')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="font-semibold text-gray-900 mb-1">{t('claim_history')}</h3>
      <p className="text-xs text-gray-500 mb-6">{t('claims')}</p>
      <div className="space-y-3">
        {claims.map(claim => (
          <div key={claim.claim_id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-4">
              <FileText className="w-5 h-5 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900">{triggerLabel(claim.trigger)}</p>
                <p className="text-xs text-gray-500">{claim.claim_id}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="font-semibold text-gray-900">₹{(claim.amount ?? 0).toLocaleString('en-IN')}</p>
                <p className="text-xs text-gray-500">{new Date(claim.date).toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'numeric' })}</p>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(claim.status)}
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(claim.status)}`}>
                  {getStatusLabel(claim.status)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {claims.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t('no_claims')}</p>
        </div>
      )}
    </div>
  )
})
