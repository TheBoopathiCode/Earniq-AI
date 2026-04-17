import { memo, useCallback } from 'react'
import { MapPin, Navigation, TrendingUp } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import type { SafeZoneAdvisory } from '../../types/dashboard'

export const SafeZoneAdvisoryCard = memo(function SafeZoneAdvisoryCard({ advisory }: { advisory: SafeZoneAdvisory }) {
  const { worker } = useAppContext()

  const handleGetDirections = useCallback(() => {
    // Coordinates come from the advisory itself (backend-provided) or fall back to name search
    const destLat: number | null = (advisory as any).lat ?? null
    const destLon: number | null = (advisory as any).lon ?? null

    if (destLat && destLon) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const { latitude, longitude } = pos.coords
            window.open(
              `https://www.google.com/maps/dir/${latitude},${longitude}/${destLat},${destLon}`,
              '_blank'
            )
          },
          () => {
            window.open(
              `https://www.google.com/maps/search/?api=1&query=${destLat},${destLon}`,
              '_blank'
            )
          }
        )
      } else {
        window.open(
          `https://www.google.com/maps/search/?api=1&query=${destLat},${destLon}`,
          '_blank'
        )
      }
    } else {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(advisory.suggested_zone)}`,
        '_blank'
      )
    }
  }, [worker?.city, advisory.suggested_zone])

  return (
    <div className="bg-gradient-to-br from-[#06C167] to-[#049150] text-white rounded-xl p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Navigation className="w-6 h-6" />
          <h3 className="font-semibold">Safe Zone Advisory</h3>
        </div>
        <div className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium">PREVENTION</div>
      </div>
      <div className="space-y-4">
        <div>
          <p className="text-sm opacity-90 mb-1">Suggested Zone</p>
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            <p className="text-2xl font-bold">{advisory.suggested_zone}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm opacity-90 mb-1">Distance</p>
            <p className="text-xl font-bold">{advisory.distance} km</p>
          </div>
          <div>
            <p className="text-sm opacity-90 mb-1">Expected Earnings</p>
            <div className="flex items-center gap-1">
              <p className="text-xl font-bold">₹{(advisory.expected_income ?? 0).toLocaleString('en-IN')}</p>
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm opacity-90 mb-1">Why this zone?</p>
          <p className="text-sm">{advisory.reason}</p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-white/20">
        <button
          onClick={handleGetDirections}
          className="w-full bg-white text-[#06C167] py-3 rounded-lg font-semibold hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
        >
          <Navigation className="w-4 h-4" />
          Get Directions
        </button>
      </div>
    </div>
  )
})
