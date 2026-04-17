import { useState, useEffect } from 'react'
import { RefreshCw, Activity, Shield } from 'lucide-react'

const workers = [
  { name: 'disruption_monitor', icon: RefreshCw, freq: 'Every 15 min', interval: 900, color: 'text-emerald-400' },
  { name: 'income_tracker', icon: Activity, freq: 'Every 10 min', interval: 600, color: 'text-blue-400' },
  { name: 'syndicate_detector', icon: Shield, freq: 'Every 5 min', interval: 300, color: 'text-purple-400' },
]

function CountdownTimer({ interval }: { interval: number }) {
  const [secs, setSecs] = useState(() => Math.floor(Math.random() * interval))

  useEffect(() => {
    const id = setInterval(() => setSecs(s => s <= 1 ? interval : s - 1), 1000)
    return () => clearInterval(id)
  }, [interval])

  const pct = ((interval - secs) / interval) * 100

  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Next poll in</span>
        <span className="text-gray-300 font-mono">{secs}s</span>
      </div>
      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function AutomationPanel() {
  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50 h-full">
      <p className="text-sm font-semibold text-white mb-1">Automation Monitor</p>
      <p className="text-xs text-gray-500 mb-4">Celery background workers</p>
      <div className="space-y-4">
        {workers.map((w) => (
          <div key={w.name} className="bg-gray-900/60 rounded-lg p-3 border border-gray-700/40">
            <div className="flex items-center gap-2 mb-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <w.icon className={`h-3.5 w-3.5 ${w.color}`} />
              <span className="text-xs font-mono text-gray-200">{w.name}</span>
            </div>
            <p className="text-xs text-gray-500 ml-4">{w.freq}</p>
            <CountdownTimer interval={w.interval} />
          </div>
        ))}
      </div>

      <div className="mt-4 bg-gray-900/60 rounded-lg p-3 border border-gray-700/40">
        <p className="text-xs font-semibold text-gray-400 mb-2">Zone Risk Snapshot</p>
        {[
          { zone: 'Velachery', dcs: 74, color: 'bg-red-500' },
          { zone: 'ITO Delhi', dcs: 61, color: 'bg-amber-500' },
          { zone: 'Kurla', dcs: 38, color: 'bg-emerald-500' },
        ].map((z) => (
          <div key={z.zone} className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400 w-20">{z.zone}</span>
            <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full ${z.color} rounded-full`} style={{ width: `${z.dcs}%` }} />
            </div>
            <span className="text-xs font-mono text-gray-300 w-8 text-right">{z.dcs}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
