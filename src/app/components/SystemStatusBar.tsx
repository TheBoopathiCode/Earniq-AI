import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../context/AppContext'
import { PLATFORM_NAMES } from '../lib/types'
import { LanguageSwitcher } from './LanguageSwitcher'
import { SpeakButton } from './LanguageSwitcher'
import { usePollingEngine } from '../hooks/usePollingEngine'
import { motion, AnimatePresence } from 'framer-motion'
import { CloudRain, Wind, Thermometer, RefreshCw, Wifi, WifiOff } from 'lucide-react'

// ── Live weather + AQI for the status bar (same keys as ZoneRiskMap) ──────────
const OWM_KEY   = import.meta.env.VITE_OWM_KEY   as string
const AQICN_KEY = import.meta.env.VITE_AQICN_KEY as string

interface LiveWeather {
  rainMmHr:    number
  feelsLike:   number
  humidity:    number
  aqi:         number
  weatherMain: string
  fetchedAt:   string
  online:      boolean
}

async function fetchLiveWeather(lat: number, lon: number): Promise<LiveWeather> {
  const [owm, aqi] = await Promise.allSettled([
    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric`).then(r => r.json()),
    fetch(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${AQICN_KEY}`).then(r => r.json()),
  ])
  const w = owm.status === 'fulfilled' ? owm.value : null
  const a = aqi.status === 'fulfilled' ? aqi.value : null
  return {
    rainMmHr:    w?.rain?.['1h']        ?? 0,
    feelsLike:   w?.main?.feels_like    ?? 0,
    humidity:    w?.main?.humidity      ?? 0,
    aqi:         a?.data?.aqi           ?? 0,
    weatherMain: w?.weather?.[0]?.main  ?? '—',
    fetchedAt:   new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    online:      owm.status === 'fulfilled',
  }
}

// ── Animated number — smoothly counts to new value ───────────────────────────
function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    if (value === prev.current) return
    const diff  = value - prev.current
    const steps = 20
    const step  = diff / steps
    let i = 0
    const id = setInterval(() => {
      i++
      setDisplay(Math.round(prev.current + step * i))
      if (i >= steps) { clearInterval(id); setDisplay(value); prev.current = value }
    }, 30)
    return () => clearInterval(id)
  }, [value])

  return <span className={className}>{display}</span>
}

// ── DCS ring ──────────────────────────────────────────────────────────────────
function DcsRing({ dcs }: { dcs: number }) {
  const r   = 18
  const circ = 2 * Math.PI * r
  const pct  = dcs / 100
  const color = dcs >= 70 ? '#ef4444' : dcs >= 40 ? '#f59e0b' : '#06C167'

  return (
    <svg width="44" height="44" className="transform -rotate-90 flex-shrink-0">
      <circle cx="22" cy="22" r={r} stroke="#e5e7eb" strokeWidth="4" fill="none" />
      <motion.circle
        cx="22" cy="22" r={r}
        stroke={color} strokeWidth="4" fill="none"
        strokeLinecap="round"
        strokeDasharray={circ}
        animate={{ strokeDashoffset: circ - pct * circ }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </svg>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function SystemStatusBar() {
  const { worker }                    = useAppContext()
  const { t }                         = useTranslation()
  const { state: poll }               = usePollingEngine()
  const [weather, setWeather]         = useState<LiveWeather | null>(null)
  const [fetching, setFetching]       = useState(false)
  const prevStatusRef                 = useRef(poll.incomeStatus)
  const [flash, setFlash]             = useState(false)

  // Flash the bar when status changes
  useEffect(() => {
    if (poll.incomeStatus !== prevStatusRef.current) {
      prevStatusRef.current = poll.incomeStatus
      setFlash(true)
      setTimeout(() => setFlash(false), 1200)
    }
  }, [poll.incomeStatus])

  // Fetch live weather for worker's zone
  const loadWeather = async () => {
    if (!worker?.zone) return
    setFetching(true)
    const w = await fetchLiveWeather(worker.zone.lat, worker.zone.lon)
    setWeather(w)
    setFetching(false)
  }

  useEffect(() => {
    loadWeather()
    const id = setInterval(loadWeather, 15 * 60 * 1000) // 15 min
    return () => clearInterval(id)
  }, [worker?.zone?.id])

  const dcs         = poll.dcs
  const status      = poll.incomeStatus
  const dcsColor    = dcs >= 70 ? 'text-red-600' : dcs >= 40 ? 'text-yellow-600' : 'text-[#06C167]'
  const statusLabel = dcs >= 70 ? t('high_risk') : dcs >= 40 ? t('moderate') : t('stable')
  const barBg       = flash
    ? dcs >= 70 ? 'bg-red-50 border-red-200' : dcs >= 40 ? 'bg-yellow-50 border-yellow-200' : 'bg-[#E6FAF1] border-[#06C167]/20'
    : 'bg-white border-gray-200'
  const dotColor    = dcs >= 70 ? 'bg-red-500' : dcs >= 40 ? 'bg-yellow-500' : 'bg-[#06C167]'
  const sourceLabel = poll.dcsSource === 'live' ? '🟢 Live' : poll.dcsSource === 'demo' ? '🟡 Demo' : '⏳'

  return (
    <motion.header
      animate={{ backgroundColor: flash ? (dcs >= 70 ? '#fef2f2' : dcs >= 40 ? '#fefce8' : '#f0fdf4') : '#ffffff' }}
      transition={{ duration: 0.4 }}
      className={`border-b transition-colors px-3 sm:px-4 lg:px-6 py-2.5 ${barBg}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">

        {/* Left — worker identity */}
        <div className="flex items-center gap-3 flex-wrap pl-10 lg:pl-0 min-w-0">

          {/* Worker name + zone */}
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t('worker')}</p>
            <p className="font-semibold text-gray-900 text-sm truncate max-w-[110px] sm:max-w-[160px]">
              {worker?.name || worker?.phone || '—'}
            </p>
          </div>

          <div className="h-6 w-px bg-gray-200 hidden sm:block" />

          <div className="hidden sm:block min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t('zone')}</p>
            <p className="font-semibold text-gray-900 text-sm truncate max-w-[100px]">
              {worker?.zone?.name || '—'}
            </p>
          </div>

          <div className="h-6 w-px bg-gray-200 hidden md:block" />

          <div className="hidden md:block">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t('platform')}</p>
            <p className="font-semibold text-gray-900 text-sm">
              {worker ? PLATFORM_NAMES[worker.platform] : '—'}
            </p>
          </div>

          <div className="h-6 w-px bg-gray-200" />

          {/* Live status dot */}
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-60`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`} />
            </span>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t('live_status')}</p>
              <div className="flex items-center gap-1">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={statusLabel}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className={`font-semibold text-sm ${dcsColor}`}
                  >
                    {statusLabel}
                  </motion.p>
                </AnimatePresence>
                <SpeakButton text={statusLabel} />
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-gray-200 hidden sm:block" />

          {/* DCS ring + score */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="relative">
              <DcsRing dcs={dcs} />
              <div className="absolute inset-0 flex items-center justify-center">
                <AnimatedNumber
                  value={dcs}
                  className={`text-[11px] font-bold ${dcsColor}`}
                />
              </div>
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t('dcs_score')}</p>
              <p className="text-[10px] text-gray-400">{sourceLabel}</p>
            </div>
          </div>

          {/* Live weather signals */}
          {weather && (
            <>
              <div className="h-6 w-px bg-gray-200 hidden lg:block" />
              <div className="hidden lg:flex items-center gap-3">
                {weather.rainMmHr > 0 && (
                  <div className="flex items-center gap-1 text-blue-600">
                    <CloudRain className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold">{weather.rainMmHr.toFixed(1)}<span className="text-[9px] font-normal text-gray-400 ml-0.5">mm/hr</span></span>
                  </div>
                )}
                {weather.aqi > 0 && (
                  <div className={`flex items-center gap-1 ${weather.aqi > 300 ? 'text-red-600' : weather.aqi > 150 ? 'text-yellow-600' : 'text-gray-500'}`}>
                    <Wind className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold">AQI {weather.aqi}</span>
                  </div>
                )}
                {weather.feelsLike > 0 && (
                  <div className={`flex items-center gap-1 ${weather.feelsLike > 44 ? 'text-red-600' : weather.feelsLike > 38 ? 'text-orange-500' : 'text-gray-500'}`}>
                    <Thermometer className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold">{weather.feelsLike.toFixed(0)}°C</span>
                  </div>
                )}
                <div className="flex items-center gap-1 text-gray-400">
                  {weather.online ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-red-400" />}
                  <span className="text-[9px]">{weather.fetchedAt}</span>
                </div>
              </div>
            </>
          )}

          {/* Countdown to next poll */}
          <div className="hidden xl:flex items-center gap-1 text-gray-400">
            <RefreshCw className={`w-3 h-3 ${fetching ? 'animate-spin text-[#06C167]' : ''}`} />
            <span className="text-[9px]">next poll {poll.disruptionCountdown}s</span>
          </div>
        </div>

        {/* Right — language + refresh */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden lg:block"><LanguageSwitcher /></div>
          <button
            onClick={loadWeather}
            disabled={fetching}
            title="Refresh live data"
            className="p-1.5 text-gray-400 hover:text-[#06C167] hover:bg-[#E6FAF1] rounded-lg transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alert strip — only when DCS ≥ 70 */}
      <AnimatePresence>
        {dcs >= 70 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-[11px] text-red-700">
              <span className="relative flex h-2 w-2 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="font-semibold">Disruption active in {worker?.zone?.name || 'your zone'}</span>
              <span className="text-red-500">· DCS {dcs}/100 · Income protection triggered · Auto-claim processing</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
