import { CheckCircle2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Payout } from '../../types/dashboard'
import { SpeakButton } from '../LanguageSwitcher'

export function PayoutBanner({ payout }: { payout: Payout }) {
  const [visible, setVisible] = useState(true)
  const { t } = useTranslation()
  if (!visible) return null

  const payoutText = `${t('payout_credited')} ₹${payout.amount.toLocaleString('en-IN')}`

  return (
    <div className="bg-gradient-to-r from-[#06C167] to-[#049150] text-white rounded-xl p-6 shadow-lg animate-in">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-bold">{t('payout_success')}</h3>
              <SpeakButton text={payoutText} className="text-white/70 hover:text-white hover:bg-white/20" />
            </div>
            <p className="text-sm opacity-90 mb-4">{t('payout_auto')}</p>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs opacity-75 mb-1">{t('payout_credited')}</p>
                <p className="text-2xl font-bold">₹{payout.amount.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-xs opacity-75 mb-1">{t('utr_number')}</p>
                <p className="font-mono text-sm">{payout.utr}</p>
              </div>
              <div>
                <p className="text-xs opacity-75 mb-1">{t('processed_at')}</p>
                <p className="text-sm">{new Date(payout.time).toLocaleTimeString('en-IN')}</p>
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => setVisible(false)} className="text-white hover:bg-white/20 p-1 rounded">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="mt-4 pt-4 border-t border-white/20">
        <p className="text-xs opacity-75">⚡ {t('processed_fast')}</p>
      </div>
    </div>
  )
}
