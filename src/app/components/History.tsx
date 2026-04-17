import { useState, useEffect } from 'react'
import { Calendar, TrendingUp, RefreshCw, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'

export function History() {
  const { t } = useTranslation()
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  const load = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<any>('/earnings/history')
      setData(res)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const summary = data?.summary ?? {}
  const monthly = data?.monthly ?? []
  const weekly  = data?.weekly  ?? []

  const tooltipStyle = {
    backgroundColor: 'white', border: '1px solid #e5e7eb',
    borderRadius: '8px', fontSize: '12px',
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24 gap-3 text-gray-500">
      <div className="w-5 h-5 border-2 border-[#06C167] border-t-transparent rounded-full animate-spin" />
      <span>Loading history…</span>
    </div>
  )

  if (error) return (
    <div className="p-6 text-center text-red-500">
      <p className="font-medium">Failed to load history</p>
      <button onClick={load} className="mt-3 text-sm text-[#06C167] underline">Retry</button>
    </div>
  )

  const totalExpected = monthly.reduce((s: number, m: any) => s + (m.expected ?? 0), 0)

  const kpis = [
    {
      label: t('total_income'),
      value: `₹${totalExpected.toLocaleString('en-IN')}`,
      sub:   'ML baseline · last 6 months',
      icon:  TrendingUp,
      color: 'text-gray-900',
    },
    {
      label: t('total_claims_received'),
      value: `₹${(summary.total_payout ?? 0).toLocaleString('en-IN')}`,
      sub:   `${summary.paid_claims ?? 0} paid claims`,
      icon:  ShieldCheck,
      color: 'text-gray-900',
    },
    {
      label: t('total_premium_paid'),
      value: `₹${(summary.total_premium ?? 0).toLocaleString('en-IN')}`,
      sub:   `₹${summary.weekly_premium ?? 0}/week`,
      icon:  Calendar,
      color: 'text-gray-900',
    },
    {
      label: t('net_protection'),
      value: `₹${Math.abs(summary.net_protection ?? 0).toLocaleString('en-IN')}`,
      sub:   (summary.net_protection ?? 0) >= 0 ? 'Net gain' : 'Net cost',
      icon:  TrendingUp,
      color: (summary.net_protection ?? 0) >= 0 ? 'text-[#06C167]' : 'text-red-500',
    },
  ]

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{t('history')}</h1>
          <p className="text-gray-600 text-sm">
            {t('weekly_earnings')} · {t('protected_income')} · {t('loss_prevented')}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-[#06C167]' : 'text-gray-400'}`} />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#06C167]" />
                <p className="text-xs text-gray-600">{k.label}</p>
              </div>
              <p className={`text-xl lg:text-2xl font-bold mb-1 ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-500">{k.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Monthly bar chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-1">{t('monthly_trends')}</h3>
        <p className="text-xs text-gray-500 mb-4">
          ML expected income vs claim payouts vs premium paid · last 6 months
        </p>
        {monthly.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No monthly data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af"
                tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number, n: string) => [
                  `₹${v.toLocaleString('en-IN')}`,
                  n === 'expected' ? 'Expected Income' : n === 'claims' ? 'Claim Payouts' : 'Premium Paid',
                ]} />
              <Legend wrapperStyle={{ fontSize: 11 }}
                formatter={v =>
                  v === 'expected' ? 'Expected Income' :
                  v === 'claims'   ? 'Claim Payouts'   : 'Premium Paid'} />
              <Bar dataKey="expected" fill="#06C167" name="expected" radius={[3, 3, 0, 0]} />
              <Bar dataKey="claims"   fill="#049150" name="claims"   radius={[3, 3, 0, 0]} />
              <Bar dataKey="premium"  fill="#d1fae5" name="premium"  radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Weekly line chart + table */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
        <h3 className="font-semibold text-gray-900 mb-1">{t('weekly_breakdown')}</h3>
        <p className="text-xs text-gray-500 mb-4">
          {t('expected_income')} vs {t('actual_income')} · last 4 weeks
        </p>
        {weekly.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No weekly data yet</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weekly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af"
                  tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={tooltipStyle}
                  formatter={(v: number, n: string) => [
                    `₹${v.toLocaleString('en-IN')}`,
                    n === 'expected' ? 'Expected' : 'Actual',
                  ]} />
                <Legend wrapperStyle={{ fontSize: 11 }}
                  formatter={v => v === 'expected' ? 'Expected Income' : 'Actual Income'} />
                <Line type="monotone" dataKey="expected" stroke="#06C167" strokeWidth={2} name="expected" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="actual"   stroke="#f59e0b" strokeWidth={2} name="actual"   dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Week', 'Expected', 'Actual', 'Loss', 'Claims'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weekly.map((w: any) => (
                    <tr key={w.week} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 px-3 font-medium text-gray-700">
                        {w.week} <span className="text-xs text-gray-400 font-normal">{w.label}</span>
                      </td>
                      <td className="py-2 px-3 text-gray-600">₹{(w.expected ?? 0).toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 font-semibold text-gray-900">₹{(w.actual ?? 0).toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-red-500">
                        {(w.loss ?? 0) > 0 ? `−₹${w.loss.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          w.claims > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'
                        }`}>
                          {w.claims} claim{w.claims !== 1 ? 's' : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
