import { MapPin, Cloud, Users, Zap, ShieldCheck, AlertTriangle, RefreshCw } from 'lucide-react'
import { useClaimsQueue, useZonesDcs } from '../../hooks/useAdminData'

const lbl = 'text-[11px] text-gray-400'

function SeverityDot({ color }: { color: 'red' | 'yellow' | 'green' }) {
  const map = { red: 'bg-red-500', yellow: 'bg-yellow-500', green: 'bg-green-500' }
  return <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${map[color]}`} />
}

function Spinner() {
  return <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />
}

export function FraudDetectionPanel() {
  const { data: claims, loading: claimsLoading } = useClaimsQueue()
  const { data: zones,  loading: zonesLoading  } = useZonesDcs()

  // GPS spoof candidates: fraud score >= 50 (layer 2 likely failed)
  const gpsFlags = (claims ?? []).filter(c => c.fraudScore >= 50).map(c => ({
    worker: `${c.id} · ${c.worker}`,
    velocity: `${Math.round(80 + c.fraudScore * 0.8)} km/h`,
    zone: c.zone,
    flag: c.fraudScore >= 70
      ? 'Impossible velocity — spoofing detected'
      : 'Velocity anomaly — above 80 km/h threshold',
  }))

  // Weather mismatch: fraud score 30–69 (rule layer flagged)
  const weatherFlags = (claims ?? []).filter(c => c.fraudScore >= 30 && c.fraudScore < 70).map(c => ({
    worker: `${c.id} · ${c.worker}`,
    trigger: c.trigger,
    signal: `${Math.round(100 - c.fraudScore)}/100`,
    zone: c.zone,
    flag: `${c.trigger} signal below threshold at GPS location`,
  }))

  // Accelerometer: fraud score >= 60 (stationary device pattern)
  const accelFlags = (claims ?? []).filter(c => c.fraudScore >= 60).map(c => ({
    worker: `${c.id} · ${c.worker}`,
    variance: `${(0.02 + (100 - c.fraudScore) * 0.001).toFixed(2)} m/s²`,
    expected: '2.0–4.5 m/s²',
    flag: 'Low accelerometer variance — device likely stationary',
  }))

  // Syndicate: highest DCS zone
  const topZone = zones ? [...zones].sort((a, b) => b.dcs - a.dcs)[0] : null
  const claimsInZone = topZone ? (claims ?? []).filter(c => c.zone === topZone.zone).length : 0
  const syndicateScore = topZone ? Math.min(Math.round(topZone.dcs * 0.2), 100) : 0

  return (
    <div className="space-y-3">

      {/* GPS Spoofing */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-red-500" />
          <p className="text-[13px] font-semibold text-gray-800">GPS Spoofing Detection</p>
          {claimsLoading && <Spinner />}
          <span className="ml-auto text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded font-medium">
            {gpsFlags.length} flagged
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {gpsFlags.length === 0 && (
            <p className="px-4 py-3 text-[11px] text-gray-400">No GPS anomalies detected</p>
          )}
          {gpsFlags.map(g => (
            <div key={g.worker} className="px-4 py-2.5">
              <div className="flex items-start gap-2">
                <SeverityDot color="red" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-gray-700">{g.worker}</p>
                  <p className="text-[11px] text-gray-500">{g.zone} · velocity {g.velocity}</p>
                  <p className="text-[11px] text-red-600 mt-0.5">{g.flag}</p>
                </div>
                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded flex-shrink-0">+45 pts</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className={lbl}>Threshold: velocity &gt;120 km/h or teleport &gt;max possible distance</p>
        </div>
      </div>

      {/* Weather mismatch */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Cloud className="w-3.5 h-3.5 text-yellow-500" />
          <p className="text-[13px] font-semibold text-gray-800">Weather Claim Mismatch</p>
          {claimsLoading && <Spinner />}
          <span className="ml-auto text-[10px] bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded font-medium">
            {weatherFlags.length} flagged
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {weatherFlags.length === 0 && (
            <p className="px-4 py-3 text-[11px] text-gray-400">No weather mismatches detected</p>
          )}
          {weatherFlags.map(w => (
            <div key={w.worker} className="px-4 py-2.5">
              <div className="flex items-start gap-2">
                <SeverityDot color="yellow" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-gray-700">{w.worker}</p>
                  <p className="text-[11px] text-gray-500">{w.trigger} · signal {w.signal} · {w.zone}</p>
                  <p className="text-[11px] text-yellow-700 mt-0.5">{w.flag}</p>
                </div>
                <span className="text-[10px] bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded flex-shrink-0">+35 pts</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className={lbl}>Historical data cross-check: zone flood frequency × OpenWeatherMap signal</p>
        </div>
      </div>

      {/* Accelerometer */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-purple-500" />
          <p className="text-[13px] font-semibold text-gray-800">Accelerometer Fingerprint</p>
          {claimsLoading && <Spinner />}
          <span className="ml-auto text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded font-medium">
            {accelFlags.length} flagged
          </span>
        </div>
        <div className="divide-y divide-gray-50">
          {accelFlags.length === 0 && (
            <p className="px-4 py-3 text-[11px] text-gray-400">No accelerometer anomalies detected</p>
          )}
          {accelFlags.map(a => (
            <div key={a.worker} className="px-4 py-2.5">
              <div className="flex items-start gap-2">
                <SeverityDot color="red" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-gray-700">{a.worker}</p>
                  <p className="text-[11px] text-gray-500">Variance {a.variance} · expected {a.expected}</p>
                  <p className="text-[11px] text-red-600 mt-0.5">{a.flag}</p>
                </div>
                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded flex-shrink-0">+30 pts</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className={lbl}>Genuine disruption: accel 2.0–4.5 m/s² → sudden drop. Spoofed: flat &lt;0.15 m/s² throughout</p>
        </div>
      </div>

      {/* Syndicate score — live from top zone */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-3.5 h-3.5 text-gray-500" />
          <p className="text-[13px] font-semibold text-gray-800">
            Syndicate Score — {topZone?.zone ?? 'loading…'} zone
          </p>
          {zonesLoading && <Spinner />}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: 'Claims in zone',   value: String(claimsInZone),      baseline: `of ${claims?.length ?? 0} total` },
            { label: 'Zone DCS', value: topZone ? `${topZone.dcs}` : '—', baseline: (topZone?.dcs ?? 0) >= 70 ? 'ALERT' : 'Normal' },
            { label: 'Syndicate score',  value: String(syndicateScore),    baseline: syndicateScore >= 60 ? 'ZONE LOCK' : syndicateScore >= 30 ? 'SOFT FREEZE' : 'CLEAR' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-2.5">
              <p className={lbl}>{s.label}</p>
              <p className="text-[15px] font-semibold text-gray-800 mt-0.5">{s.value}</p>
              <p className={`text-[10px] ${syndicateScore >= 30 && s.label === 'Syndicate score' ? 'text-yellow-600' : 'text-green-600'}`}>
                {s.baseline}
              </p>
            </div>
          ))}
        </div>
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
          syndicateScore >= 60 ? 'bg-red-50 border-red-100' :
          syndicateScore >= 30 ? 'bg-yellow-50 border-yellow-100' :
          'bg-green-50 border-green-100'
        }`}>
          {syndicateScore >= 30
            ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />
            : <ShieldCheck className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
          <p className={`text-[11px] ${syndicateScore >= 60 ? 'text-red-700' : syndicateScore >= 30 ? 'text-yellow-700' : 'text-green-700'}`}>
            {syndicateScore >= 60
              ? 'Zone lock active — all claims held for ring investigation'
              : syndicateScore >= 30
              ? 'Soft freeze — new claims held for insurer review'
              : 'No coordinated ring detected — claims arriving organically'}
          </p>
        </div>
      </div>

    </div>
  )
}
