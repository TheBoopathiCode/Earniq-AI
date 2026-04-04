import { Cloud, Wind, Car, AlertOctagon, Users } from 'lucide-react'

interface Props { signals: { weather: number; aqi: number; traffic: number; govt: number; worker_idle: number } }

export function SignalBreakdownPanel({ signals }: Props) {
  const signalData = [
    { label: 'Weather',       value: signals.weather,     weight: 35, icon: Cloud },
    { label: 'Air Quality',   value: signals.aqi,         weight: 20, icon: Wind },
    { label: 'Traffic',       value: signals.traffic,     weight: 15, icon: Car },
    { label: 'Govt Alerts',   value: signals.govt,        weight: 20, icon: AlertOctagon },
    { label: 'Worker Idle %', value: signals.worker_idle, weight: 10, icon: Users },
  ]
  const barColor = (v: number) => v >= 70 ? 'bg-red-500' : v >= 50 ? 'bg-yellow-500' : 'bg-[#06C167]'

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
}
