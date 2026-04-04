import { TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { IncomeHealth } from '../../types/dashboard'
import { SpeakButton } from '../LanguageSwitcher'

export function IncomeHealthMeterCard({ incomeHealth }: { incomeHealth: IncomeHealth }) {
  const { expected_income, actual_income, loss_pct, health_status } = incomeHealth
  const { t } = useTranslation()

  const statusColor = health_status === 'GREEN' ? 'text-[#06C167] bg-[#E6FAF1] border-[#06C167]/30' :
    health_status === 'YELLOW' ? 'text-yellow-600 bg-yellow-50 border-yellow-200' : 'text-red-600 bg-red-50 border-red-200'
  const meterColor = health_status === 'GREEN' ? 'bg-[#06C167]' : health_status === 'YELLOW' ? 'bg-yellow-500' : 'bg-red-500'

  const statusLabel = health_status === 'GREEN' ? t('income_secure') :
    health_status === 'YELLOW' ? t('disruption_detected') : t('claim_processing')

  const statusMsg = health_status === 'GREEN' ? t('income_stable') :
    health_status === 'YELLOW' ? t('income_at_risk') : t('income_loss_detected')

  return (
    <div className={`bg-white border-2 rounded-xl p-4 sm:p-6 ${statusColor}`}>
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-gray-600">{t('income_health')}</h3>
          <div className="flex items-baseline gap-1 mt-1 flex-wrap">
            <span className="text-2xl sm:text-3xl font-bold">₹{actual_income.toLocaleString('en-IN')}</span>
            <span className="text-xs sm:text-sm text-gray-500">/ ₹{expected_income.toLocaleString('en-IN')}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <div className={`px-2 sm:px-4 py-1 sm:py-2 rounded-full font-bold text-xs sm:text-sm ${
            health_status === 'GREEN' ? 'bg-[#E6FAF1] text-[#06C167]' :
            health_status === 'YELLOW' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
            {statusLabel}
          </div>
          <SpeakButton text={`${statusLabel}. ${statusMsg}`} />
        </div>
      </div>
      <div className="mb-4">
        <div className="h-3 sm:h-4 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full ${meterColor} transition-all duration-500`} style={{ width: `${Math.max(0, 100 - loss_pct)}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs text-gray-600">{t('expected_income')}</p><p className="text-base sm:text-lg font-semibold">₹{expected_income.toLocaleString('en-IN')}</p></div>
        <div>
          <p className="text-xs text-gray-600">{t('actual_income')}</p>
          <div className="flex items-center gap-1">
            <p className="text-base sm:text-lg font-semibold">₹{actual_income.toLocaleString('en-IN')}</p>
            {loss_pct > 5 ? <TrendingDown className="w-4 h-4 text-red-500" /> : <TrendingUp className="w-4 h-4 text-[#06C167]" />}
          </div>
        </div>
        <div className="col-span-2"><p className="text-xs text-gray-600">{t('income_loss')}</p><p className="text-xl sm:text-2xl font-bold">{loss_pct.toFixed(1)}%</p></div>
      </div>
      <div className="mt-3 pt-3 border-t">
        <p className="text-xs sm:text-sm">{statusMsg}</p>
      </div>
    </div>
  )
}
