import { MapPin } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import { ZONES, CITY_NAMES } from '../../lib/types'
import type { ZoneData } from '../../types/dashboard'

export function ZoneHeatmap({ zones, workerZone }: { zones: ZoneData[]; workerZone: string }) {
  const { worker } = useAppContext()

  // Filter zones by worker's city using the canonical ZONES data
  const cityKey = worker?.city
  const cityZones = cityKey ? ZONES[cityKey] : null
  const cityName = cityKey ? CITY_NAMES[cityKey] : 'Your City'

  // Use live dcs_score only — no riskScore fallback
  const displayZones: ZoneData[] = cityZones
    ? cityZones.map(z => {
        const live = zones.find(d => d.zone === z.name)
        return {
          zone: z.name,
          dcs_score: live?.dcs_score ?? 0,
          lat: z.lat,
          lon: z.lon,
        }
      })
    : zones

  const zoneColor = (dcs: number) =>
    dcs >= 70 ? 'bg-red-500 text-white' :
    dcs >= 40 ? 'bg-yellow-500 text-gray-900' :
    'bg-[#06C167] text-white'

  const isUserZone = (name: string) => name === (worker?.zone?.name || workerZone)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Zone Intelligence Heatmap</h3>
      <p className="text-xs text-gray-500 mb-6">Real-time zone risk scores across {cityName}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {displayZones.map(zone => (
          <div key={zone.zone}
            className={`${
              zoneColor(zone.dcs_score)
            } rounded-lg p-4 transition-all duration-300 hover:scale-105 cursor-pointer ${
              isUserZone(zone.zone)
                ? 'ring-4 ring-blue-400 ring-offset-2 shadow-lg scale-105'
                : ''
            }`}>
            <div className="flex items-start justify-between mb-2">
              <MapPin className="w-4 h-4" />
              {isUserZone(zone.zone) && <div className="w-2 h-2 bg-white rounded-full animate-pulse" />}
            </div>
            <p className="font-semibold text-sm mb-1">{zone.zone}</p>
            <p className="text-2xl font-bold">{zone.dcs_score}</p>
            <p className="text-xs opacity-75 mt-1">
              {zone.dcs_score >= 70 ? 'High Risk' : zone.dcs_score >= 40 ? 'Moderate' : 'Safe'}
            </p>
            {isUserZone(zone.zone) && (
              <p className="text-xs font-bold mt-1 opacity-90">Your Zone</p>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 pt-4 border-t flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          {[['bg-[#06C167]','Safe (0-39)'],['bg-yellow-500','Moderate (40-69)'],['bg-red-500','High Risk (70+)']].map(([c,l]) => (
            <div key={l} className="flex items-center gap-2">
              <div className={`w-3 h-3 ${c} rounded`} />
              <span className="text-gray-600">{l}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-400 rounded ring-2 ring-white ring-offset-1" />
          <span className="text-gray-600">Your Zone</span>
        </div>
      </div>
    </div>
  )
}
