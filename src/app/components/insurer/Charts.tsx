import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const lossRatioData = [
  { day: 'Mon', ratio: 58 }, { day: 'Tue', ratio: 63 }, { day: 'Wed', ratio: 71 },
  { day: 'Thu', ratio: 55 }, { day: 'Fri', ratio: 68 }, { day: 'Sat', ratio: 74 },
  { day: 'Sun', ratio: 61 },
]

const claimForecastData = [
  { zone: 'Velachery', actual: 24, forecast: 28 },
  { zone: 'Tambaram', actual: 18, forecast: 22 },
  { zone: 'ITO Delhi', actual: 31, forecast: 35 },
  { zone: 'Kurla', actual: 14, forecast: 17 },
  { zone: 'Dharavi', actual: 20, forecast: 25 },
]

const tooltipStyle = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#f9fafb' }

export function Charts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <p className="text-sm font-semibold text-white mb-1">Loss Ratio — This Week</p>
        <p className="text-xs text-gray-500 mb-4">Daily payout / premium collected (%)</p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={lossRatioData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} domain={[40, 90]} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="ratio" stroke="#34d399" strokeWidth={2} dot={{ fill: '#34d399', r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700/50">
        <p className="text-sm font-semibold text-white mb-1">Claim Forecast by Zone</p>
        <p className="text-xs text-gray-500 mb-4">Actual vs ML-predicted claims</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={claimForecastData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="zone" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
            <Bar dataKey="actual" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            <Bar dataKey="forecast" fill="#a78bfa" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
