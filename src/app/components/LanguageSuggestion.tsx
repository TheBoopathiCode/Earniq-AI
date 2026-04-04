import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

export function LanguageSuggestion() {
  const { i18n } = useTranslation()
  const [show, setShow] = useState(false)
  const [suggested, setSuggested] = useState<{ code: string; label: string; native: string } | null>(null)

  useEffect(() => {
    const nav = navigator.language || ''
    const already = localStorage.getItem('earniq_lang_prompted')
    if (already) return

    if (nav.startsWith('ta') && i18n.language !== 'ta') {
      setSuggested({ code: 'ta', label: 'Tamil', native: 'தமிழில் பார்க்கவும்?' })
      setShow(true)
    } else if (nav.startsWith('hi') && i18n.language !== 'hi') {
      setSuggested({ code: 'hi', label: 'Hindi', native: 'हिंदी में देखें?' })
      setShow(true)
    }
  }, [i18n.language])

  if (!show || !suggested) return null

  const accept = () => {
    i18n.changeLanguage(suggested.code)
    localStorage.setItem('earniq_lang_prompted', '1')
    setShow(false)
  }
  const dismiss = () => {
    localStorage.setItem('earniq_lang_prompted', '1')
    setShow(false)
  }

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-white border border-[#06C167]/30 rounded-xl shadow-xl px-5 py-4 flex items-center gap-4 animate-in">
      <div>
        <p className="text-sm font-semibold text-gray-900">{suggested.native}</p>
        <p className="text-xs text-gray-500">Switch to {suggested.label}?</p>
      </div>
      <button onClick={accept} className="px-3 py-1.5 bg-[#06C167] text-white text-xs font-semibold rounded-lg hover:bg-[#049150]">
        Yes
      </button>
      <button onClick={dismiss} className="text-gray-400 hover:text-gray-600">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
