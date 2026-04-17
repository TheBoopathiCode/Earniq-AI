import { useState, useEffect, useRef, useCallback } from 'react'
import { BarChart2, Shield, AlertCircle, TrendingUp, LogOut, Menu, X, Activity, Bell, Search, User, MapPin, Phone, ChevronRight, Zap } from 'lucide-react'
import { InsurerDashboard } from './insurer/InsurerDashboard'
import { LiveClaimsQueue } from './insurer/LiveClaimsQueue'
import { FraudDetectionPanel } from './insurer/FraudDetectionPanel'
import { SimulationPanel } from './insurer/SimulationPanel'

const BASE = import.meta.env.VITE_API_URL as string || 'http://localhost:8000/api'

type AdminPage = 'overview' | 'claims' | 'fraud' | 'simulation'

// ── Notification types ────────────────────────────────────────────────────────
interface AdminNotification {
  id:        string
  type:      'claim' | 'fraud' | 'alert' | 'payout'
  title:     string
  body:      string
  time:      string
  read:      boolean
}

// ── Worker search result ──────────────────────────────────────────────────────
interface WorkerSearchResult {
  id:                 string
  platform_worker_id: string
  name:               string
  phone:              string
  platform:           string
  city:               string
  zone:               string
  risk_score:         number
  weekly_premium:     number
  policy_tier:        string
  is_active:          boolean
}

// ── useAdminNotifications — polls claims queue + fraud flags ──────────────────
function useAdminNotifications() {
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const seenRef = useRef<Set<string>>(new Set())

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/admin/dashboard`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) return
      const data = await res.json()

      const newNotes: AdminNotification[] = []
      const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

      // New claims in queue
      for (const claim of (data.claims_queue ?? [])) {
        const key = `claim-${claim.id}`
        if (!seenRef.current.has(key)) {
          seenRef.current.add(key)
          newNotes.push({
            id:    key,
            type:  claim.fraudScore >= 70 ? 'fraud' : 'claim',
            title: claim.fraudScore >= 70
              ? `🚨 Fraud flag — ${claim.id}`
              : `📋 New claim — ${claim.id}`,
            body:  `${claim.worker} · ${claim.zone} · ₹${(claim.amount ?? 0).toLocaleString('en-IN')} · Score ${claim.fraudScore}`,
            time:  now,
            read:  false,
          })
        }
      }

      // High-risk zone alerts
      for (const zone of (data.high_risk_zones ?? [])) {
        const key = `zone-${zone.zone}-${zone.risk_score}`
        if (!seenRef.current.has(key) && zone.risk_score >= 70) {
          seenRef.current.add(key)
          newNotes.push({
            id:    key,
            type:  'alert',
            title: `⚠️ High risk — ${zone.zone}`,
            body:  `${zone.city} · Risk ${zone.risk_score}/100 · ${zone.workers} workers affected`,
            time:  now,
            read:  false,
          })
        }
      }

      if (newNotes.length > 0) {
        setNotifications(prev => [...newNotes, ...prev].slice(0, 50))
      }
    } catch {}
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 10000)
    return () => clearInterval(id)
  }, [poll])

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  const unread = notifications.filter(n => !n.read).length

  return { notifications, unread, markAllRead }
}

// ── Worker Search ─────────────────────────────────────────────────────────────
function WorkerSearchBar() {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<WorkerSearchResult[]>([])
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState<WorkerSearchResult | null>(null)
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef                 = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`${BASE}/admin/workers/search?q=${encodeURIComponent(q)}`, {
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data: WorkerSearchResult[] = await res.json()
        setResults(data)
        setOpen(true)
      } else {
        // Backend not available — show empty state gracefully
        setResults([])
        setOpen(true)
      }
    } catch {
      setResults([])
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setSelected(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 350)
  }

  const riskColor = (score: number) =>
    score >= 70 ? 'text-red-600 bg-red-50' : score >= 40 ? 'text-yellow-600 bg-yellow-50' : 'text-green-600 bg-green-50'

  return (
    <div ref={wrapRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Search worker ID, name, phone…"
          className="w-full pl-9 pr-4 py-2 text-[12px] bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-gray-400">
              {loading ? 'Searching…' : `No workers found for "${query}"`}
            </div>
          ) : (
            results.map(w => (
              <button
                key={w.id}
                onClick={() => { setSelected(w); setOpen(false); setQuery(w.platform_worker_id) }}
                className="w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-bold text-gray-900 font-mono">{w.platform_worker_id}</span>
                      <span className="text-[11px] text-gray-600">{w.name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                      <Phone className="w-2.5 h-2.5" />{w.phone}
                      <MapPin className="w-2.5 h-2.5 ml-1" />{w.zone}, {w.city}
                      <span className="capitalize">{w.platform}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${riskColor(w.risk_score)}`}>
                      Risk {w.risk_score}
                    </span>
                    <span className="text-[10px] text-gray-400 capitalize">{w.policy_tier}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Selected worker detail card */}
      {selected && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-blue-200 rounded-xl shadow-xl z-50 p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-gray-900">{selected.name}</p>
                <p className="text-[10px] font-mono text-blue-600">{selected.platform_worker_id}</p>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {[
              ['Phone',    selected.phone],
              ['Platform', selected.platform],
              ['City',     selected.city],
              ['Zone',     selected.zone],
              ['Tier',     selected.policy_tier],
              ['Premium',  `₹${selected.weekly_premium}/wk`],
              ['Risk',     `${selected.risk_score}/100`],
              ['Status',   selected.is_active ? '✅ Active' : '❌ Inactive'],
            ].map(([label, value]) => (
              <div key={label} className="bg-gray-50 rounded-lg px-2.5 py-1.5">
                <p className="text-[10px] text-gray-400">{label}</p>
                <p className="font-medium text-gray-800 capitalize">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Notification Bell ─────────────────────────────────────────────────────────
function NotificationBell({ notifications, unread, markAllRead }: {
  notifications: AdminNotification[]
  unread: number
  markAllRead: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const typeColor = (type: AdminNotification['type']) => ({
    claim:  'bg-blue-100 text-blue-700',
    fraud:  'bg-red-100 text-red-700',
    alert:  'bg-yellow-100 text-yellow-700',
    payout: 'bg-green-100 text-green-700',
  }[type])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) markAllRead() }}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-4 h-4 text-gray-600" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-gray-900">Notifications</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <span className="text-[10px] bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded-full">
                  {unread} new
                </span>
              )}
              <button onClick={markAllRead} className="text-[10px] text-blue-500 hover:underline">
                Mark all read
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-gray-400">
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className={`px-4 py-3 transition-colors ${n.read ? 'bg-white' : 'bg-blue-50/40'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${typeColor(n.type)}`}>
                      {n.type.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-gray-800 leading-tight">{n.title}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{n.body}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
                    </div>
                    {!n.read && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-[10px] text-gray-400 text-center">
              Auto-refreshes every 10s · {notifications.length} total
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV = [
  { key: 'overview'   as AdminPage, label: 'Intelligence Center', icon: BarChart2 },
  { key: 'claims'     as AdminPage, label: 'Live Claims Queue',   icon: AlertCircle },
  { key: 'fraud'      as AdminPage, label: 'Fraud Detection',     icon: Shield },
  { key: 'simulation' as AdminPage, label: 'Simulation Mode',     icon: Zap },
]

function AdminSidebar({ page, setPage, onLogout, mobileOpen, setMobileOpen }: {
  page: AdminPage
  setPage: (p: AdminPage) => void
  onLogout: () => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}) {
  const Content = () => (
    <>
      <div className="px-4 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.jpeg" alt="EarnIQ" className="h-8 w-8 object-contain" />
          <div>
            <p className="text-sm font-bold text-gray-900">EarnIQ Admin</p>
            <p className="text-[10px] text-gray-400">Insurer Intelligence</p>
          </div>
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mx-4 mt-3 mb-2 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <Activity className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
        <div>
          <p className="text-[11px] font-semibold text-blue-700">Admin Session</p>
          <p className="text-[10px] text-blue-500">admin · Full access</p>
        </div>
        <span className="ml-auto flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-1.5 w-1.5 rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
        </span>
      </div>

      <nav className="flex-1 p-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Dashboards</p>
        <ul className="space-y-1">
          {NAV.map(item => {
            const Icon   = item.icon
            const active = page === item.key
            return (
              <li key={item.key}>
                <button
                  onClick={() => { setPage(item.key); setMobileOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {item.label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      <aside className="hidden lg:flex w-56 bg-white border-r border-gray-200 flex-col flex-shrink-0">
        <Content />
      </aside>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-sm"
      >
        <Menu className="w-5 h-5 text-gray-700" />
      </button>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-white flex flex-col shadow-xl">
            <Content />
          </aside>
        </div>
      )}
    </>
  )
}

// ── AdminApp ──────────────────────────────────────────────────────────────────
export function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [page, setPage]           = useState<AdminPage>('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const { notifications, unread, markAllRead } = useAdminNotifications()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <AdminSidebar
        page={page} setPage={setPage}
        onLogout={onLogout}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — search + notifications */}
        <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0 lg:pl-4 pl-14">
          <WorkerSearchBar />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell
              notifications={notifications}
              unread={unread}
              markAllRead={markAllRead}
            />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {page === 'overview' && <InsurerDashboard />}
          {page === 'claims' && (
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[18px] font-semibold text-gray-900">Live Claims Queue</p>
                <p className="text-[11px] text-gray-400">Real-time incoming claims with fraud scores</p>
              </div>
              <LiveClaimsQueue />
            </div>
          )}
          {page === 'fraud' && (
            <div className="p-4 space-y-4">
              <div>
                <p className="text-[18px] font-semibold text-gray-900">Fraud Detection</p>
                <p className="text-[11px] text-gray-400">GPS spoofing · weather mismatch · syndicate score</p>
              </div>
              <FraudDetectionPanel />
            </div>
          )}
          {page === 'simulation' && <SimulationPanel />}
        </main>
      </div>
    </div>
  )
}
