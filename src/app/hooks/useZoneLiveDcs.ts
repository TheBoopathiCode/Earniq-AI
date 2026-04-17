import { useState, useEffect, useRef } from 'react'

const OWM_KEY   = import.meta.env.VITE_OWM_KEY   as string
const AQICN_KEY = import.meta.env.VITE_AQICN_KEY as string

export interface LiveZoneSignals {
  rain_mm:     number   // mm/hr from OWM
  feels_like:  number   // °C
  humidity:    number   // %
  aqi:         number   // AQICN composite
  wind_kmh:    number
  condition:   string   // e.g. "Rain", "Clear"
  dcs:         number   // computed 0–100
  source:      'live' | 'loading' | 'error'
  fetched_at:  string
}

// Same DCS formula as backend disruption_monitor() — weather + AQI signals only
// (traffic/govt/idle require backend data; not available client-side)
function computeDcs(rain: number, feelsLike: number, aqi: number): number {
  const rainSig    = Math.min(100, (rain / 15) * 100)
  const heatSig    = feelsLike > 44 ? 100 : feelsLike > 38 ? ((feelsLike - 38) / 6) * 60 : 0
  const weatherSig = Math.min(100, Math.max(rainSig, heatSig))
  const aqiSig     = aqi > 300 ? 100 : aqi > 200 ? 60 + ((aqi - 200) / 100) * 40
                   : aqi > 100 ? 30 + ((aqi - 100) / 100) * 30 : (aqi / 100) * 30
  return Math.round(Math.min(100, Math.max(0, weatherSig * 0.35 + aqiSig * 0.20)))
}

const LOADING: LiveZoneSignals = {
  rain_mm: 0, feels_like: 30, humidity: 60, aqi: 0,
  wind_kmh: 0, condition: '—', dcs: 0, source: 'loading', fetched_at: '',
}

export function useZoneLiveDcs(lat: number | null, lon: number | null) {
  const [signals, setSignals] = useState<LiveZoneSignals>(LOADING)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (lat === null || lon === null) {
      setSignals(LOADING)
      return
    }

    // Cancel any in-flight request for previous zone
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setSignals(prev => ({ ...prev, source: 'loading' }))

    async function fetch_signals() {
      try {
        const [owmRes, aqiRes] = await Promise.allSettled([
          fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric`,
            { signal: ctrl.signal }
          ).then(r => r.json()),
          fetch(
            `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${AQICN_KEY}`,
            { signal: ctrl.signal }
          ).then(r => r.json()),
        ])

        const owm = owmRes.status === 'fulfilled' ? owmRes.value : null
        const aqi = aqiRes.status === 'fulfilled' ? aqiRes.value  : null

        const rain_mm    = owm?.rain?.['1h'] ?? 0
        const feels_like = owm?.main?.feels_like ?? 30
        const humidity   = owm?.main?.humidity ?? 60
        const wind_kmh   = owm ? Math.round((owm.wind?.speed ?? 0) * 3.6) : 0
        const condition  = owm?.weather?.[0]?.main ?? '—'
        const aqi_val    = aqi?.data?.aqi ?? 0

        setSignals({
          rain_mm, feels_like, humidity, aqi: aqi_val,
          wind_kmh, condition,
          dcs:        computeDcs(rain_mm, feels_like, aqi_val),
          source:     'live',
          fetched_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        })
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        // Fallback: use neutral values when external APIs fail
        setSignals({
          rain_mm: 0, feels_like: 32, humidity: 65, aqi: 80,
          wind_kmh: 0, condition: '—',
          dcs:        computeDcs(0, 32, 80),
          source:     'error',
          fetched_at: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        })
      }
    }

    fetch_signals()
    return () => ctrl.abort()
  }, [lat, lon])

  return signals
}
