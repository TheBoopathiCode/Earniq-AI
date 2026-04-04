import { X, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../../context/AppContext'
import { PLATFORM_NAMES } from '../../lib/types'
import { SpeakButton } from '../LanguageSwitcher'

export function WelcomeBanner() {
  const [visible, setVisible] = useState(true)
  const { worker } = useAppContext()
  const { t } = useTranslation()
  if (!visible) return null

  const name = worker?.name || worker?.phone || 'there'
  const platform = worker ? PLATFORM_NAMES[worker.platform] : 'your platform'
  const zone = worker?.zone?.name || 'your zone'
  const welcomeText = `${t('welcome')}. ${platform} partner in ${zone}.`

  return (
    <div className="bg-gradient-to-r from-[#06C167] to-[#049150] text-white rounded-xl p-6 shadow-lg mb-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-bold">{t('welcome')}, {name}!</h3>
              <SpeakButton text={welcomeText} className="text-white/70 hover:text-white hover:bg-white/20" />
            </div>
            <p className="text-sm opacity-90 mb-1">
              <strong>{platform}</strong> partner in <strong>{zone}</strong>
            </p>

          </div>
        </div>
        <button onClick={() => setVisible(false)} className="text-white hover:bg-white/20 p-2 rounded transition-colors flex-shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between">
        <p className="text-xs opacity-75">💡 {t('say_command')}</p>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <span>Live System</span>
        </div>
      </div>
    </div>
  )
}
