import { useState, useCallback, useRef } from 'react'
import i18n from '../i18n'

export function useSpeak() {
  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang =
      i18n.language === 'hi' ? 'hi-IN' :
      i18n.language === 'ta' ? 'ta-IN' : 'en-US'
    utterance.rate = 0.95
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  }, [])

  const stop = useCallback(() => { window.speechSynthesis?.cancel() }, [])
  return { speak, stop }
}

type VoiceCommandHandler = {
  onRain?: () => void
  onAqi?: () => void
  onTraffic?: () => void
  onClaim?: () => void
  onDashboard?: () => void
  onPolicy?: () => void
}

export function useVoiceCommands(handlers: VoiceCommandHandler) {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setError('Voice recognition not supported'); return }

    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => { setListening(true); setError(null) }
    recognition.onend = () => setListening(false)
    recognition.onerror = (e: any) => { setListening(false); setError(e.error) }
    recognition.onresult = (event: any) => {
      const cmd = event.results[0][0].transcript.toLowerCase()
      setTranscript(cmd)
      if (cmd.includes('rain') || cmd.includes('बारिश') || cmd.includes('மழை')) handlers.onRain?.()
      if (cmd.includes('aqi') || cmd.includes('air')) handlers.onAqi?.()
      if (cmd.includes('traffic') || cmd.includes('ट्रैफिक') || cmd.includes('போக்குவரத்து')) handlers.onTraffic?.()
      if (cmd.includes('claim') || cmd.includes('क्लेम') || cmd.includes('கோரிக்கை')) handlers.onClaim?.()
      if (cmd.includes('dashboard') || cmd.includes('डैशबोर्ड')) handlers.onDashboard?.()
      if (cmd.includes('policy') || cmd.includes('पॉलिसी') || cmd.includes('பாலிசி')) handlers.onPolicy?.()
    }
    recognition.start()
  }, [handlers])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, transcript, error, startListening, stopListening }
}
