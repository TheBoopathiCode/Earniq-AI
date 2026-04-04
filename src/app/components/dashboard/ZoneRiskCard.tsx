import { AlertTriangle, Shield } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import type { ZoneRisk } from '../../types/dashboard'

export function ZoneRiskCard({ zoneRisk }: { zoneRisk: ZoneRisk }) {
  const { worker } = useAppContext()
  const { dcs_score } = zoneRisk
  const risk = dcs_score >= 70 ? { label: 'HIGH',     color: 'text-red-600 bg-red-50 border-red-200' }
             : dcs_score >= 40 ? { label: 'MODERATE', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' }
             :                   { label: 'LOW',       color: 'text-[#06C167] bg-[#E6FAF1] border-[#06C167]/30' }
  const strokeColor = dcs_score >= 70 ? 'stroke-red-500' : dcs_score >= 40 ? 'stroke-yellow-500' : 'stroke-[#06C167]'
  const radius = 60; const circumference = 2 * Math.PI * radius; const progress = (dcs_score / 100) * circumference

  return (
    <div className={`bg-white border-2 rounded-xl p-6 ${risk.color}`}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-sm font-medium text-gray-600">Disruption Confidence Score</h3>
          <p className="text-xs text-gray-500 mt-1">Multi-source intelligence engine</p>
        </div>
        {dcs_score >= 70 ? <AlertTriangle className="w-6 h-6 text-red-500" /> : <Shield className="w-6 h-6 text-[#06C167]" />}
      </div>
      <div className="flex items-center justify-between">
        <div className="relative">
          <svg width="140" height="140" className="transform -rotate-90">
            <circle cx="70" cy="70" r={radius} className="stroke-gray-200" strokeWidth="12" fill="none" />
            <circle cx="70" cy="70" r={radius} className={`${strokeColor} transition-all duration-500`}
              strokeWidth="12" fill="none" strokeDasharray={circumference} strokeDashoffset={circumference - progress} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center"><div className="text-4xl font-bold">{dcs_score}</div><div className="text-xs text-gray-500">/ 100</div></div>
          </div>
        </div>
        <div className="flex-1 ml-8 space-y-3">
          <div>
            <p className="text-sm text-gray-600">Risk Level</p>
            <p className={`text-2xl font-bold ${dcs_score >= 70 ? 'text-red-600' : dcs_score >= 50 ? 'text-yellow-600' : 'text-[#06C167]'}`}>{risk.label}</p>
          </div>
          <div><p className="text-sm text-gray-600">Zone</p><p className="text-lg font-semibold">{worker?.zone?.name ?? '—'}</p></div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-gray-600">
          {dcs_score >= 70 && '🔴 Disruption confirmed. Automatic claim processing activated.'}
          {dcs_score >= 40 && dcs_score < 70 && '⚠ Elevated risk detected. Monitoring income levels.'}
          {dcs_score < 40 && '✓ Zone conditions normal. No action required.'}
        </p>
      </div>
    </div>
  )
}
