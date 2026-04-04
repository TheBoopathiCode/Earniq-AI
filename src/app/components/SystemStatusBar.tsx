import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../context/AppContext'
import { PLATFORM_NAMES } from '../lib/types'
import { LanguageSwitcher } from './LanguageSwitcher'
import { SpeakButton } from './LanguageSwitcher'

function getDcsFromZoneRisk(zoneRisk: number): number {
  const w = zoneRisk
  const signals = {
    weather:    w * 1.00,
    aqi:        w * 0.80,
    traffic:    w * 0.70,
    govtAlert:  w * 0.60,
    bioAlert:   w * 0.50,
    conflict:   w * 0.40,
    infraOutage:w * 0.30,
    workerIdle: w * 0.50,
  }
  return Math.round(
    signals.weather     * 0.25 +
    signals.aqi         * 0.15 +
    signals.traffic     * 0.10 +
    signals.govtAlert   * 0.15 +
    signals.workerIdle  * 0.05 +
    signals.bioAlert    * 0.15 +
    signals.conflict    * 0.10 +
    signals.infraOutage * 0.05
  )
}

export function SystemStatusBar() {
  const { worker } = useAppContext()
  const { t } = useTranslation()

  const zoneRisk = worker?.zone?.riskScore ?? 0
  const dcsScore = getDcsFromZoneRisk(zoneRisk)

  const statusColor = dcsScore >= 70 ? 'bg-red-500' : dcsScore >= 40 ? 'bg-yellow-500' : 'bg-[#06C167]'
  const statusText  = dcsScore >= 70 ? t('high_risk') : dcsScore >= 40 ? t('moderate') : t('stable')

  return (
    <header className="bg-white border-b border-gray-200 px-3 sm:px-4 lg:px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 flex-wrap pl-10 lg:pl-0 min-w-0">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">{t('worker')}</p>
            <p className="font-semibold text-gray-900 text-sm truncate max-w-[120px] sm:max-w-none">{worker?.name || worker?.phone || '—'}</p>
          </div>
          <div className="h-6 w-px bg-gray-200 hidden sm:block" />
          <div className="hidden sm:block">
            <p className="text-xs text-gray-500">{t('zone')}</p>
            <p className="font-semibold text-gray-900 text-sm">{worker?.zone?.name || '—'}</p>
          </div>
          <div className="h-6 w-px bg-gray-200 hidden md:block" />
          <div className="hidden md:block">
            <p className="text-xs text-gray-500">{t('platform')}</p>
            <p className="font-semibold text-gray-900 text-sm">{worker ? PLATFORM_NAMES[worker.platform] : '—'}</p>
          </div>
          <div className="h-6 w-px bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor} animate-pulse`} />
            <div>
              <p className="text-xs text-gray-500">{t('live_status')}</p>
              <div className="flex items-center gap-1">
                <p className="font-semibold text-gray-900 text-sm">{statusText}</p>
                <SpeakButton text={statusText} />
              </div>
            </div>
          </div>
          <div className="h-6 w-px bg-gray-200 hidden sm:block" />
          <div className="hidden sm:block">
            <p className="text-xs text-gray-500">{t('dcs_score')}</p>
            <p className={`font-semibold text-sm ${dcsScore >= 70 ? 'text-red-600' : dcsScore >= 40 ? 'text-yellow-600' : 'text-[#06C167]'}`}>
              {dcsScore}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden lg:block"><LanguageSwitcher /></div>
          <button className="relative p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg">
            <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            {dcsScore >= 40 && <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />}
          </button>
        </div>
      </div>
    </header>
  )
}
