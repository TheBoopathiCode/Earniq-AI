import { memo, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const TOOLTIP_STYLE = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }
const LEGEND_STYLE  = { fontSize: '12px' }
const tooltipFormatter = (v: number) => [`₹${v.toLocaleString('en-IN')}`, '']
const yTickFormatter   = (v: number) => `₹${v / 1000}k`

export const IncomeChart = memo(function IncomeChart({ data }: { data: Array<{ date: string; expected: number; actual: number }> }) {
  const { avgExpected, avgActual } = useMemo(() => {
    if (!data.length) return { avgExpected: 0, avgActual: 0 }
    const sum = data.reduce((a, d) => ({ e: a.e + (d.expected ?? 0), a: a.a + (d.actual ?? 0) }), { e: 0, a: 0 })
    return {
      avgExpected: Math.round(sum.e / data.length),
      avgActual:   Math.round(sum.a / data.length),
    }
  }, [data])
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Income Tracking</h3>
      <p className="text-xs text-gray-500 mb-6">Expected vs Actual (Last 7 Days)</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={yTickFormatter} />
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipFormatter} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Line type="monotone" dataKey="expected" stroke="#06C167" strokeWidth={2} name="Expected Income" dot={{ r: 4 }} />
          <Line type="monotone" dataKey="actual"   stroke="#049150" strokeWidth={2} name="Actual Income"   dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
        <div><p className="text-xs text-gray-600">Avg. Expected</p><p className="text-lg font-semibold text-[#06C167]">₹{avgExpected.toLocaleString('en-IN')}</p></div>
        <div><p className="text-xs text-gray-600">Avg. Actual</p><p className="text-lg font-semibold text-[#049150]">₹{avgActual.toLocaleString('en-IN')}</p></div>
      </div>
    </div>
  )
})
