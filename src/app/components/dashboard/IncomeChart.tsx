import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function IncomeChart({ data }: { data: Array<{ date: string; expected: number; actual: number }> }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Income Tracking</h3>
      <p className="text-xs text-gray-500 mb-6">Expected vs Actual (Last 7 Days)</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={v => `₹${v/1000}k`} />
          <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
            formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, '']} />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line type="monotone" dataKey="expected" stroke="#06C167" strokeWidth={2} name="Expected Income" dot={{ r: 4 }} />
          <Line type="monotone" dataKey="actual"   stroke="#049150" strokeWidth={2} name="Actual Income"   dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4">
        <div><p className="text-xs text-gray-600">Avg. Expected</p><p className="text-lg font-semibold text-[#06C167]">₹{Math.round(data.reduce((a,d) => a+d.expected,0)/data.length).toLocaleString('en-IN')}</p></div>
        <div><p className="text-xs text-gray-600">Avg. Actual</p><p className="text-lg font-semibold text-[#049150]">₹{Math.round(data.reduce((a,d) => a+d.actual,0)/data.length).toLocaleString('en-IN')}</p></div>
      </div>
    </div>
  )
}
