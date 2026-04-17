import { memo, useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../../context/AppContext'
import { PLATFORM_NAMES } from '../../lib/types'
import { SpeakButton } from '../LanguageSwitcher'

export const WelcomeBanner = memo(function WelcomeBanner() {
  const [visible, setVisible] = useState(true)
  const { worker } = useAppContext()
  const { t } = useTranslation()
  if (!visible) return null

  const name = worker?.name || worker?.phone || 'there'
  const platform = worker ? PLATFORM_NAMES[worker.platform] : 'your platform'
  const zone = worker?.zone?.name || 'your zone'
  const welcomeText = `${t('welcome')}. ${platform} partner in ${zone}.`

  return (
    <div className="bg-gradient-to-r from-[#06C167] to-[#049150] text-white rounded-xl p-4 sm:p-6 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-lg sm:text-xl font-bold truncate">{t('welcome')}, {name}!</h3>
              <SpeakButton text={welcomeText} className="text-white/70 hover:text-white hover:bg-white/20 flex-shrink-0" />
            </div>
            <p className="text-xs sm:text-sm opacity-90 truncate">
              <strong>{platform}</strong> partner in <strong>{zone}</strong>
            </p>
          </div>
        </div>
        <button onClick={() => setVisible(false)} className="text-white hover:bg-white/20 p-1.5 rounded transition-colors flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between gap-2">
        <p className="text-xs opacity-75 truncate">💡 {t('say_command')}</p>
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span>Live</span>
        </div>
      </div>
    </div>
  )
})
