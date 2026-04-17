import { memo, useMemo } from 'react'
import { Cloud, Wind, Car, AlertOctagon, Users } from 'lucide-react'

interface Props { signals: { weather: number; aqi: number; traffic: number; govt: number; worker_idle: number } }

const SIGNAL_META = [
  { label: 'Weather',       weight: 35, icon: Cloud,        key: 'weather' as const },
  { label: 'Air Quality',   weight: 20, icon: Wind,         key: 'aqi' as const },
  { label: 'Traffic',       weight: 15, icon: Car,          key: 'traffic' as const },
  { label: 'Govt Alerts',   weight: 20, icon: AlertOctagon, key: 'govt' as const },
  { label: 'Worker Idle %', weight: 10, icon: Users,        key: 'worker_idle' as const },
]

const barColor = (v: number) => v >= 70 ? 'bg-red-500' : v >= 50 ? 'bg-yellow-500' : 'bg-[#06C167]'

export const SignalBreakdownPanel = memo(function SignalBreakdownPanel({ signals }: Props) {
  const signalData = useMemo(() =>
    SIGNAL_META.map(s => ({ ...s, value: signals[s.key] }))
  , [signals.weather, signals.aqi, signals.traffic, signals.govt, signals.worker_idle])

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Signal Breakdown</h3>
      <p className="text-xs text-gray-500 mb-6">DCS calculation components</p>
      <div className="space-y-4">
        {signalData.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2"><Icon className="w-4 h-4 text-gray-600" /><span className="text-sm font-medium text-gray-700">{s.label}</span><span className="text-xs text-gray-500">({s.weight}%)</span></div>
                <span className="text-sm font-bold text-gray-900">{s.value}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${barColor(s.value)} transition-all duration-500`} style={{ width: `${s.value}%` }} />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
})
