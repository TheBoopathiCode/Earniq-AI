import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, MicOff, X } from 'lucide-react'
import { useVoiceCommands } from '../hooks/useVoice'

export function VoiceCommandPanel() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [lastCmd, setLastCmd] = useState('')

  const { listening, transcript, error, startListening, stopListening } = useVoiceCommands({
    onRain: () => { setLastCmd('🌧 ' + t('simulate_rain')) },
    onAqi: () => { setLastCmd('💨 ' + t('simulate_aqi')) },
    onTraffic: () => { setLastCmd('🚗 ' + t('simulate_traffic')) },
    onClaim: () => setLastCmd('📋 ' + t('claims')),
    onDashboard: () => setLastCmd('📊 ' + t('dashboard')),
    onPolicy: () => setLastCmd('📄 ' + t('policy')),
  })

  return (
    <>
      {/* Floating mic button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-20 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
          listening ? 'bg-red-500 animate-pulse' : 'bg-[#06C167] hover:bg-[#049150]'
        } text-white`}
        title={t('voice_command')}
      >
        {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-36 right-6 z-50 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Mic className="w-4 h-4 text-[#06C167]" />
              {t('voice_command')}
            </h3>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-gray-500 mb-3">{t('say_command')}</p>

          {/* Status */}
          {listening && (
            <div className="flex items-center gap-2 text-sm text-red-500 mb-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {t('listening')}
            </div>
          )}
          {transcript && (
            <p className="text-xs text-gray-600 mb-2">
              Heard: <span className="font-medium text-gray-900">"{transcript}"</span>
            </p>
          )}
          {lastCmd && (
            <p className="text-xs text-[#06C167] font-medium mb-2">✓ {lastCmd}</p>
          )}
          {error && (
            <p className="text-xs text-red-500 mb-2">{error}</p>
          )}

          <button
            onClick={listening ? stopListening : startListening}
            className={`w-full py-2 rounded-lg text-sm font-semibold transition-all ${
              listening
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-[#06C167] hover:bg-[#049150] text-white'
            }`}
          >
            {listening ? (
              <span className="flex items-center justify-center gap-2"><MicOff className="w-4 h-4" /> Stop</span>
            ) : (
              <span className="flex items-center justify-center gap-2"><Mic className="w-4 h-4" /> {t('speak')}</span>
            )}
          </button>
        </div>
      )}
    </>
  )
}
