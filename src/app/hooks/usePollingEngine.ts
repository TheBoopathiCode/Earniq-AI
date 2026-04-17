import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '../components/ui/ToastProvider'
import { useAppContext } from '../context/AppContext'

// ── Real API keys from .env ──────────────────────────────────────────────────
const OWM_KEY   = import.meta.env.VITE_OWM_KEY   as string
const AQICN_KEY = import.meta.env.VITE_AQICN_KEY as string

// ── DCS formula — identical to ZoneRiskMap and backend disruption_monitor() ──
function computeDcs(rainMmHr: number, feelsLike: number, aqi: number, zoneRisk: number): number {
  const rainSig   = Math.min(100, (rainMmHr / 15) * 100)
  const heatSig   = feelsLike > 44 ? 100 : feelsLike > 38 ? ((feelsLike - 38) / 6) * 60 : 0
  const weatherSig = Math.min(100, Math.max(rainSig, heatSig))
  const aqiSig    = aqi > 300 ? 100 : aqi > 200 ? 60 + ((aqi - 200) / 100) * 40 : aqi > 100 ? 30 + ((aqi - 100) / 100) * 30 : (aqi / 100) * 30
  const trafficSig = zoneRisk * 0.8
  const govtSig    = zoneRisk * 0.5
  const idleSig    = zoneRisk * 0.6
  return Math.round(Math.min(100, Math.max(0,
    weatherSig * 0.35 + aqiSig * 0.20 + trafficSig * 0.15 + govtSig * 0.20 + idleSig * 0.10
  )))
}

async function fetchLiveDcs(lat: number, lon: number, zoneRisk: number): Promise<number> {
  const [owmRes, aqiRes] = await Promise.allSettled([
    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OWM_KEY}&units=metric`).then(r => r.json()),
    fetch(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${AQICN_KEY}`).then(r => r.json()),
  ])
  const rain      = owmRes.status === 'fulfilled' ? (owmRes.value.rain?.['1h'] ?? 0) : 0
  const feelsLike = owmRes.status === 'fulfilled' ? (owmRes.value.main?.feels_like ?? 30) : 30
  const aqi       = aqiRes.status === 'fulfilled' ? (aqiRes.value.data?.aqi ?? 0) : 0
  return computeDcs(rain, feelsLike, aqi, zoneRisk)
}

// ── Polling intervals (seconds) — matches README spec ────────────────────────
const DISRUPTION_INTERVAL = 15   // 15 min in prod → 15s for demo visibility
const INCOME_INTERVAL     = 10
const SYNDICATE_INTERVAL  = 5

function nowStr() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export interface PollingState {
  dcs: number
  incomeStatus: 'GREEN' | 'YELLOW' | 'RED'
  syndicateScore: number
  disruptionCountdown: number
  incomeCountdown: number
  syndicateCountdown: number
  disruptionLastRun: string
  incomeLastRun: string
  syndicateLastRun: string
  disruptionPollCount: number
  incomePollCount: number
  syndicatePollCount: number
  scenario: string | null
  dcsSource: 'live' | 'demo' | 'loading'
}

export function usePollingEngine(externalDcs?: number | null) {
  const { fire }   = useToast()
  const { worker } = useAppContext()

  const [state, setState] = useState<PollingState>({
    dcs: 0,
    incomeStatus: 'GREEN',
    syndicateScore: 0,
    disruptionCountdown: DISRUPTION_INTERVAL,
    incomeCountdown: INCOME_INTERVAL,
    syndicateCountdown: SYNDICATE_INTERVAL,
    disruptionLastRun: nowStr(),
    incomeLastRun: nowStr(),
    syndicateLastRun: nowStr(),
    disruptionPollCount: 0,
    incomePollCount: 0,
    syndicatePollCount: 0,
    scenario: null,
    dcsSource: 'loading',
  })

  const prevStatusRef    = useRef<'GREEN' | 'YELLOW' | 'RED'>('GREEN')
  const claimFiredRef    = useRef(false)
  const advisoryFiredRef = useRef(false)

  // ── Fetch real DCS from live APIs for worker's zone ───────────────────────
  const fetchRealDcs = useCallback(async () => {
    if (externalDcs !== null && externalDcs !== undefined) return
    if (!worker?.zone) return
    try {
      const dcs = await fetchLiveDcs(worker.zone.lat, worker.zone.lon, worker.zone.riskScore)
      setState(prev => ({
        ...prev,
        dcs,
        dcsSource: 'live',
        disruptionLastRun: nowStr(),
        disruptionPollCount: prev.disruptionPollCount + 1,
      }))
    } catch {
      // keep previous value on network error
    }
  }, [worker, externalDcs])

  // Initial fetch + 15-min poll (matches disruption_monitor interval)
  useEffect(() => {
    fetchRealDcs()
    const id = setInterval(fetchRealDcs, DISRUPTION_INTERVAL * 1000)
    return () => clearInterval(id)
  }, [fetchRealDcs])

  // ── Countdown timers — single interval, one re-render per second ──────────
  useEffect(() => {
    const id = setInterval(() => {
      setState(prev => {
        const disruptionCountdown = prev.disruptionCountdown <= 1 ? DISRUPTION_INTERVAL : prev.disruptionCountdown - 1
        const incomeNext          = prev.incomeCountdown <= 1
        const syndicateNext       = prev.syndicateCountdown <= 1
        return {
          ...prev,
          disruptionCountdown,
          incomeCountdown:      incomeNext    ? INCOME_INTERVAL     : prev.incomeCountdown - 1,
          syndicateCountdown:   syndicateNext ? SYNDICATE_INTERVAL  : prev.syndicateCountdown - 1,
          incomeLastRun:        incomeNext    ? nowStr()            : prev.incomeLastRun,
          syndicateLastRun:     syndicateNext ? nowStr()            : prev.syndicateLastRun,
          incomePollCount:      incomeNext    ? prev.incomePollCount + 1    : prev.incomePollCount,
          syndicatePollCount:   syndicateNext ? prev.syndicatePollCount + 1 : prev.syndicatePollCount,
        }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Sync external DCS override (demo panel) ───────────────────────────────
  useEffect(() => {
    if (externalDcs !== null && externalDcs !== undefined) {
      setState(prev => ({ ...prev, dcs: externalDcs, dcsSource: 'demo' }))
    }
  }, [externalDcs])

  // ── Derive income status + fire toasts on transitions ────────────────────
  useEffect(() => {
    const dcs    = state.dcs
    const status: 'GREEN' | 'YELLOW' | 'RED' = dcs >= 70 ? 'RED' : dcs >= 40 ? 'YELLOW' : 'GREEN'

    if (status !== prevStatusRef.current) {
      setState(prev => ({ ...prev, incomeStatus: status }))

      if (status === 'YELLOW' && prevStatusRef.current === 'GREEN' && !advisoryFiredRef.current) {
        advisoryFiredRef.current = true
        fire({
          type: 'advisory',
          title: 'Safe Zone Advisory',
          body: `DCS ${dcs} · Income at risk · Move to a lower-risk zone to protect earnings`,
        })
      }

      if (status === 'RED' && !claimFiredRef.current) {
        claimFiredRef.current = true
        fire({
          type: 'claim',
          title: 'Claim Auto-Generated',
          body: `DCS ${dcs} · Income loss >40% · Fraud engine running — payout in 90s`,
        })
      }

      if (status === 'GREEN') {
        claimFiredRef.current    = false
        advisoryFiredRef.current = false
      }

      prevStatusRef.current = status
    }
  }, [state.dcs, fire])

  const firePayout = useCallback((amount: number, utr: string) => {
    fire({
      type: 'payout',
      title: `₹${amount.toLocaleString('en-IN')} sent to your UPI`,
      body: `UTR: ${utr} · Razorpay processed · T+0 settlement`,
      amount,
    })
  }, [fire])

  return { state, firePayout }
}
