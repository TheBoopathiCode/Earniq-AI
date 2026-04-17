import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import type { City, Zone } from '../lib/types'

// Shape returned by GET /api/zones
interface ApiZone {
  id:               string
  name:             string
  city:             string
  riskScore:        number
  lat:              number
  lon:              number
  currentDcs:       number
  activeDisruption: boolean
}

export interface LiveZone extends Zone {
  currentDcs:       number
  activeDisruption: boolean
}

export type ZonesByCity = Record<City, LiveZone[]>

const POLL_INTERVAL  = 30_000
const MAX_RETRIES    = 3
const RETRY_DELAY_MS = 2000

function toZonesByCity(apiZones: ApiZone[]): ZonesByCity {
  const map = {} as ZonesByCity
  for (const z of apiZones) {
    const city = z.city.toLowerCase() as City
    if (!map[city]) map[city] = []
    map[city].push({
      id:               z.id,
      name:             z.name,
      city,
      riskScore:        z.riskScore,
      lat:              z.lat,
      lon:              z.lon,
      currentDcs:       z.currentDcs ?? 0,
      activeDisruption: z.activeDisruption ?? false,
    })
  }
  return map
}

export function useZones() {
  const [zones, setZones]         = useState<ZonesByCity>({} as ZonesByCity)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)
  const [lastFetch, setLastFetch] = useState<string | null>(null)
  const mountedRef                = useRef(true)
  const retryRef                  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchZones = useCallback(async (silent = false, attempt = 0) => {
    if (!silent) setLoading(true)
    try {
      const data = await Promise.race([
        api.get<ApiZone[]>('/zones'),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ])
      if (!mountedRef.current) return
      if (data && data.length > 0) {
        setZones(toZonesByCity(data))
        setError(false)
        setLastFetch(new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        }))
      }
      // Always clear loading AFTER setting zones so components never see
      // loading=false + empty zones at the same time
      if (mountedRef.current) setLoading(false)
    } catch (e: unknown) {
      if (!mountedRef.current) return
      if (e instanceof Error && e.name === 'AbortError') return
      console.error(`Zones API error (attempt ${attempt + 1}):`, e)
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt)
        retryRef.current = setTimeout(() => {
          if (mountedRef.current) fetchZones(true, attempt + 1)
        }, delay)
        // Keep loading=true while retrying so UI shows spinner not error
      } else {
        setError(true)
        if (mountedRef.current) setLoading(false)
      }
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchZones()
    return () => {
      mountedRef.current = false
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [fetchZones])

  // 30s polling
  useEffect(() => {
    const id = setInterval(() => fetchZones(true), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchZones])

  return { zones, loading, error, lastFetch, refetch: fetchZones }
}
