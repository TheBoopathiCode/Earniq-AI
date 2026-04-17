import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { useState } from 'react'
import { SpeakButton } from '../LanguageSwitcher'
import { usePollingEngine } from '../../hooks/usePollingEngine'

export function SystemStateIndicator() {
  const { t } = useTranslation()
  const { state } = usePollingEngine()
  const [showTooltip, setShowTooltip] = useState(false)

  // Derive display state from live DCS + income status
  const currentState =
    state.incomeStatus === 'RED'    ? 'disruption' :
    state.incomeStatus === 'YELLOW' ? 'warning'    : 'normal'

  const stateInfo = ({
    normal:     { label: t('income_secure'),       color: 'bg-[#06C167]',  description: t('income_stable'),        icon: '🟢' },
    warning:    { label: t('disruption_detected'), color: 'bg-yellow-500', description: t('income_at_risk'),       icon: '🟡' },
    disruption: { label: t('disruption_detected'), color: 'bg-red-500',    description: t('income_loss_detected'), icon: '🔴' },
  } as Record<string, { label: string; color: string; description: string; icon: string }>)[currentState]
    || { label: 'Monitoring', color: 'bg-gray-500', description: 'Fetching live data…', icon: '⚪' }

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <div className="relative">
        <div className={`${stateInfo.color} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3`}>
          <span className="text-2xl">{stateInfo.icon}</span>
          <div>
            <p className="font-bold text-sm">{t('system_state')}: {stateInfo.label}</p>
            <p className="text-xs opacity-90">
              DCS {state.dcs} · {state.dcsSource === 'live' ? '🟢 Live API' : state.dcsSource === 'demo' ? '🟡 Demo' : '⏳ Loading'}
            </p>
          </div>
          <SpeakButton text={`${stateInfo.label}. ${stateInfo.description}`} className="text-white/70 hover:text-white hover:bg-white/20" />
          <button
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            className="ml-1 p-1 hover:bg-white/20 rounded transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
        {showTooltip && (
          <div className="absolute bottom-full right-0 mb-2 w-72 bg-gray-900 text-white text-xs p-4 rounded-lg shadow-xl">
            <p className="font-semibold mb-2">Real-Time System Behavior</p>
            <p className="mb-2">DCS is computed live from OpenWeatherMap + AQICN for your zone. Refreshes every 15 minutes.</p>
            <p className="text-gray-300">{t('say_command')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
