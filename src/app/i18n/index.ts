import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en.json'
import hi from './locales/hi.json'
import ta from './locales/ta.json'

// Auto-detect region → language
const getDefaultLang = () => {
  const nav = navigator.language || ''
  if (nav.startsWith('ta') || nav.includes('IN') && Intl.DateTimeFormat().resolvedOptions().timeZone === 'Asia/Kolkata') {
    // Rough Tamil Nadu detection — fallback to browser lang
  }
  if (nav.startsWith('hi')) return 'hi'
  if (nav.startsWith('ta')) return 'ta'
  return 'en'
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      ta: { translation: ta },
    },
    lng: getDefaultLang(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

export default i18n
