import { useTranslation } from 'react-i18next'
import { useSpeak } from '../hooks/useVoice'
import { Volume2 } from 'lucide-react'

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'ta', label: 'தமிழ்' },
]

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {LANGS.map((lang, idx) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`px-2 py-1 text-xs font-semibold rounded-md transition-all ${
            i18n.language === lang.code
              ? 'bg-[#06C167] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {lang.label}
          {idx < LANGS.length - 1 && i18n.language !== lang.code && (
            <span className="sr-only"> | </span>
          )}
        </button>
      ))}
    </div>
  )
}

// Speak button — reads any text aloud in current language
export function SpeakButton({ text, className = '' }: { text: string; className?: string }) {
  const { speak } = useSpeak()
  return (
    <button
      onClick={() => speak(text)}
      title="Read aloud"
      className={`p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-[#06C167] transition-colors ${className}`}
    >
      <Volume2 className="w-3.5 h-3.5" />
    </button>
  )
}
