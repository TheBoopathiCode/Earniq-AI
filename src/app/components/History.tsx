import { useState, useEffect } from 'react'
import { Calendar, TrendingUp, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppContext } from '../context/AppContext'
import { api } from '../lib/api'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

export function History() {
  const { t } = useTranslation()
  const { worker, policy } = useAppContext()
  const [claims, setClaims] = useState<any[]>([])
  const [earnings, setEarnings] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const [claimsData, earningsData] = await Promise.all([
          api.get<any[]>('/claims'),
          api.get<any>('/earnings/summary'),
        ])
        setClaims(claimsData)
        setEarnings(earningsData)
      } catch { }
      finally { setLoading(false) }
    }
    fetch()
  }, [])

  const expectedWeekly = worker ? worker.workingHours * 250 : 2000
  const totalPayout    = claims.filter(c => c.status === 'paid' || c.status === 'PAID').reduce((s, c) => s + (c.payoutAmount || 0), 0)
  const totalPremium   = policy ? policy.weeklyPremium * 4 : 0
  const netProtection  = totalPayout - totalPremium

  // Build monthly chart from real claims
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const now = new Date()
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const label = months[d.getMonth()]
    const monthClaims = claims.filter(c => {
      const cd = new Date(c.createdAt)
      return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear()
    })
    const claimTotal = monthClaims.reduce((s, c) => s + (c.payoutAmount || 0), 0)
    return { month: label, income: expectedWeekly * 4, claims: claimTotal, premium: policy?.weeklyPremium ?? 0 }
  })

  // Weekly breakdown — last 4 weeks
  const weeklyBreakdown = Array.from({ length: 4 }, (_, i) => {
    const weekClaims = claims.filter(c => {
      const cd = new Date(c.createdAt)
      const diff = Math.floor((now.getTime() - cd.getTime()) / (7 * 24 * 60 * 60 * 1000))
      return diff === (3 - i)
    })
    const loss = weekClaims.reduce((s, c) => s + (c.lossAmount || 0), 0)
    return { week: `W${i + 1}`, expected: expectedWeekly, actual: Math.max(0, expectedWeekly - loss) }
  })

  const tooltipStyle = { backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-1">{t('history')}</h1>
          <p className="text-gray-600 text-sm">{t('weekly_earnings')} · {t('protected_income')} · {t('loss_prevented')}</p>
        </div>
        {loading && <RefreshCw className="w-5 h-5 animate-spin text-[#06C167]" />}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: t('total_income'),         value: `₹${(expectedWeekly * 24).toLocaleString('en-IN')}`, change: 'Last 6 months', icon: TrendingUp },
          { label: t('total_claims_received'), value: `₹${totalPayout.toLocaleString('en-IN')}`,          change: `${claims.length} claims`,  icon: Calendar },
          { label: t('total_premium_paid'),    value: `₹${totalPremium.toLocaleString('en-IN')}`,         change: `₹${policy?.weeklyPremium ?? 0}/week`, icon: Calendar },
          { label: t('net_protection'),        value: `₹${Math.abs(netProtection).toLocaleString('en-IN')}`, change: netProtection >= 0 ? 'Net gain' : 'Net cost', icon: TrendingUp },
        ].map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[#06C167]" />
                <p className="text-xs text-gray-600">{stat.label}</p>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-gray-900 mb-1">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.change}</p>
            </div>
          )
        })}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-1">{t('monthly_trends')}</h3>
        <p className="text-xs text-gray-500 mb-4">{t('weekly_earnings')} vs {t('total_claims_received')}</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={v => `₹${v/1000}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, '']} />
            <Bar dataKey="income" fill="#06C167" name={t('weekly_earnings')} />
            <Bar dataKey="claims" fill="#049150" name={t('total_claims_received')} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 lg:p-6">
        <h3 className="font-semibold text-gray-900 mb-1">{t('weekly_breakdown')}</h3>
        <p className="text-xs text-gray-500 mb-4">{t('expected_income')} vs {t('actual_income')}</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={weeklyBreakdown}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={v => `₹${v/1000}k`} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, '']} />
            <Line type="monotone" dataKey="expected" stroke="#06C167" strokeWidth={2} name={t('expected_income')} />
            <Line type="monotone" dataKey="actual"   stroke="#049150" strokeWidth={2} name={t('actual_income')} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
