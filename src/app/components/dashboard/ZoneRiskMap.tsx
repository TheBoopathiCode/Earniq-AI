import { useEffect, useRef, useState } from 'react'
import { useAppContext } from '../../context/AppContext'
import { ZONES, CITY_NAMES } from '../../lib/types'
import type { City, Zone } from '../../lib/types'

let leafletCssInjected = false
function injectLeafletCss() {
  if (leafletCssInjected) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
  document.head.appendChild(link)
  leafletCssInjected = true
}

const CITY_CENTERS: Record<City, [number, number]> = {
  chennai:   [13.0827, 80.2707],
  delhi:     [28.6139, 77.2090],
  mumbai:    [19.0760, 72.8777],
  hyderabad: [17.3850, 78.4867],
  kolkata:   [22.5726, 88.3639],
}

const CITIES: City[] = ['chennai', 'delhi', 'mumbai', 'hyderabad', 'kolkata']

// Same formula as backend get_background_dcs and SystemStatusBar
function calcDcs(zoneRisk: number): number {
  const w = zoneRisk
  return Math.round(
    w * 1.00 * 0.25 +
    w * 0.80 * 0.15 +
    w * 0.70 * 0.10 +
    w * 0.60 * 0.15 +
    w * 0.50 * 0.05 +
    w * 0.50 * 0.15 +
    w * 0.40 * 0.10 +
    w * 0.30 * 0.05
  )
}

function getRiskColor(dcs: number): string {
  if (dcs >= 70) return '#ef4444'
  if (dcs >= 40) return '#f59e0b'
  return '#06C167'
}

function getRiskLabel(dcs: number): string {
  if (dcs >= 70) return 'High Risk'
  if (dcs >= 40) return 'Moderate'
  return 'Safe'
}

function getRiskBg(dcs: number): string {
  if (dcs >= 70) return 'bg-red-100 text-red-700 border-red-200'
  if (dcs >= 40) return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-[#E6FAF1] text-[#06C167] border-[#06C167]/30'
}

export function ZoneRiskMap() {
  const { worker } = useAppContext()
  const mapRef = useRef<any>(null)
  const mapInstanceRef = useRef<any>(null)
  const circlesRef = useRef<any[]>([])
  const [selectedCity, setSelectedCity] = useState<City>(worker?.city || 'chennai')
  const [hoveredZone, setHoveredZone] = useState<Zone | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // When worker logs in, switch to their city
  useEffect(() => {
    if (worker?.city) setSelectedCity(worker.city)
  }, [worker?.city])

  useEffect(() => {
    injectLeafletCss()
    if (!mapRef.current) return

    import('leaflet').then(L => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }

      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current, {
        center: CITY_CENTERS[selectedCity],
        zoom: 12,
        zoomControl: true,
        scrollWheelZoom: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map)

      mapInstanceRef.current = map
      circlesRef.current = []
      setMapReady(true)

      ZONES[selectedCity].forEach(zone => {
        const dcs = calcDcs(zone.riskScore)
        const color = getRiskColor(dcs)
        const radius = dcs >= 70 ? 900 : dcs >= 40 ? 700 : 500
        const isWorker = worker?.zone?.id === zone.id

        const circle = L.circle([zone.lat, zone.lon], {
          color, fillColor: color, fillOpacity: 0.35, weight: 2.5, radius,
        }).addTo(map)

        // Pulse ring for high risk
        if (dcs >= 70) {
          L.circle([zone.lat, zone.lon], {
            color, fillColor: 'transparent', fillOpacity: 0,
            weight: 1.5, radius: radius * 1.5, dashArray: '6 4', opacity: 0.5,
          }).addTo(map)
        }

        // Worker zone ring
        if (isWorker) {
          L.circle([zone.lat, zone.lon], {
            color: '#2563eb', fillColor: 'transparent', fillOpacity: 0,
            weight: 3, radius: radius * 1.8, dashArray: '8 4',
          }).addTo(map)
        }

        circle.bindPopup(`
          <div style="font-family:Inter,sans-serif;min-width:160px;padding:4px">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px">${zone.name}</div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${CITY_NAMES[zone.city]}</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <div style="width:10px;height:10px;border-radius:50%;background:${color}"></div>
              <span style="font-size:12px;font-weight:600;color:${color}">${getRiskLabel(dcs)}</span>
            </div>
            <div style="font-size:12px">Zone Risk: <strong>${zone.riskScore}</strong></div>
            <div style="font-size:12px">DCS Score: <strong>${dcs}</strong></div>
            ${isWorker ? '<div style="font-size:11px;color:#2563eb;font-weight:700;margin-top:4px">📍 Your Zone</div>' : ''}
          </div>
        `, { maxWidth: 200 })

        circle.on('mouseover', () => { circle.setStyle({ fillOpacity: 0.6, weight: 3.5 }); setHoveredZone(zone) })
        circle.on('mouseout',  () => { circle.setStyle({ fillOpacity: 0.35, weight: 2.5 }); setHoveredZone(null) })

        circlesRef.current.push(circle)
      })

      // Pan to worker zone
      if (worker?.zone) {
        const wz = ZONES[selectedCity].find(z => z.id === worker.zone.id)
        if (wz) setTimeout(() => map.setView([wz.lat, wz.lon], 13), 300)
      }

      // Force map to recalculate size after render
      setTimeout(() => map.invalidateSize(), 100)
    })

    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }
    }
  }, [selectedCity, worker])

  const currentZones = ZONES[selectedCity]

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-lg">🗺️</span> Zone Risk Map
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">DCS-based disruption confidence by zone</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
          {CITIES.map(city => (
            <button key={city} onClick={() => setSelectedCity(city)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                selectedCity === city ? 'bg-[#06C167] text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}>
              {CITY_NAMES[city].split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div ref={mapRef} style={{ height: '380px', width: '100%', minHeight: '380px', display: 'block' }} />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <div className="w-4 h-4 border-2 border-[#06C167] border-t-transparent rounded-full animate-spin" />
              Loading map...
            </div>
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow-md border border-gray-200 px-3 py-2">
          <p className="text-xs font-semibold text-gray-700 mb-2">DCS Level</p>
          <div className="space-y-1.5">
            {[
              { dot: 'bg-[#06C167]', label: 'Safe (0–39)' },
              { dot: 'bg-amber-500',  label: 'Moderate (40–69)' },
              { dot: 'bg-red-500',    label: 'High Risk (70+)' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${item.dot}`} />
                <span className="text-xs text-gray-600">{item.label}</span>
              </div>
            ))}
            {worker && (
              <div className="flex items-center gap-2 pt-1 border-t border-gray-100 mt-1">
                <div className="w-3 h-3 rounded-full border-2 border-blue-600 bg-transparent" />
                <span className="text-xs text-blue-600 font-medium">Your Zone</span>
              </div>
            )}
          </div>
        </div>

        <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 bg-white/95 backdrop-blur rounded-full px-3 py-1.5 shadow border border-gray-200">
          <div className="w-2 h-2 bg-[#06C167] rounded-full animate-pulse" />
          <span className="text-xs font-medium text-gray-700">Live</span>
        </div>
      </div>

      <div className="px-6 py-4 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {CITY_NAMES[selectedCity]} — All Zones
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {currentZones.map(zone => {
            const dcs = calcDcs(zone.riskScore)
            const isWorkerZone = worker?.zone?.id === zone.id
            return (
              <div key={zone.id}
                onClick={() => mapInstanceRef.current?.setView([zone.lat, zone.lon], 14)}
                className={`rounded-lg border p-3 cursor-pointer transition-all hover:scale-105 ${
                  isWorkerZone ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300' : getRiskBg(dcs)
                }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold truncate">{zone.name}</span>
                  {isWorkerZone && <span className="text-xs">📍</span>}
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getRiskColor(dcs) }} />
                  <span className="text-lg font-bold">{dcs}</span>
                </div>
                <p className="text-xs opacity-75 mt-0.5">{getRiskLabel(dcs)}</p>
                <p className="text-xs opacity-50 mt-0.5">Risk: {zone.riskScore}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
