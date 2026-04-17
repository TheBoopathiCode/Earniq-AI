/**
 * Worker Notification Center
 *
 * Notification segregation:
 *   WORKER-ONLY:  payout_credited, claim_approved, claim_rejected, policy_renewed,
 *                 safe_zone_advisory, income_warning, premium_deducted
 *   ADMIN-ONLY:   fraud_flag, syndicate_alert, loss_ratio_breach, zone_lockdown_admin
 *   BOTH:         disruption_confirmed, platform_outage, high_dcs_alert
 */

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react'
import { Bell, X, CheckCircle2, AlertTriangle, IndianRupee, Navigation, Shield, RefreshCw, Info } from 'lucide-react'
import { useAppContext } from '../../context/AppContext'
import { useToast } from '../ui/ToastProvider'

// ── Types ─────────────────────────────────────────────────────────────────────
export type WorkerNotifType =
  | 'payout_credited'       // WORKER only
  | 'claim_approved'        // WORKER only
  | 'claim_rejected'        // WORKER only
  | 'policy_renewed'        // WORKER only
  | 'premium_deducted'      // WORKER only
  | 'safe_zone_advisory'    // WORKER only
  | 'income_warning'        // WORKER only
  | 'disruption_confirmed'  // BOTH
  | 'platform_outage'       // BOTH
  | 'high_dcs_alert'        // BOTH

export interface WorkerNotification {
  id:        string
  type:      WorkerNotifType
  title:     string
  body:      string
  time:      string
  read:      boolean
  amount?:   number
  claimId?:  string
}

// ── Context — so Dashboard can push notifications in ─────────────────────────
interface NotifCtx {
  push: (n: Omit<WorkerNotification, 'id' | 'time' | 'read'>) => void
  unread: number
  clearUnread: () => void
}
const WorkerNotifContext = createContext<NotifCtx>({ push: () => {}, unread: 0, clearUnread: () => {} })
export function useWorkerNotif() { return useContext(WorkerNotifContext) }

export function WorkerNotifProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<WorkerNotification[]>([])
  const counterRef = useRef(0)
  const { fire } = useToast()
  const { worker, policy } = useAppContext()
  const seenRef = useRef<Set<string>>(new Set())

  const push = useCallback((n: Omit<WorkerNotification, 'id' | 'time' | 'read'>) => {
    const id = `wn-${++counterRef.current}-${Date.now()}`
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    setNotifications(prev => [{ ...n, id, time, read: false }, ...prev].slice(0, 50))
    // Also fire toast
    fire({ type: n.type === 'payout_credited' ? 'payout' : n.type === 'safe_zone_advisory' ? 'advisory' : n.type === 'claim_rejected' ? 'alert' : 'info', title: n.title, body: n.body, amount: n.amount })
  }, [fire])

  const clearUnread = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [])

  const unread = notifications.filter(n => !n.read).length

  // Poll backend for worker-specific notifications
  const BASE = import.meta.env.VITE_API_URL as string || '/api'
  const pollWorkerNotifs = useCallback(async () => {
    if (!worker?.id) return
    try {
      const res = await fetch(`${BASE}/workers/${worker.id}/notifications`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('earniq_token')}` }
      })
      if (!res.ok) return  // endpoint not implemented yet — silent fail
      const data: Array<{ id: string; type: WorkerNotifType; title: string; body: string; amount?: number; claim_id?: string }> = await res.json()
      for (const n of data) {
        if (!seenRef.current.has(n.id)) {
          seenRef.current.add(n.id)
          push({ type: n.type, title: n.title, body: n.body, amount: n.amount, claimId: n.claim_id })
        }
      }
    } catch {
      // backend not available or endpoint not implemented — silent fail
    }
  }, [worker?.id, push, BASE])

  // Poll backend for real notifications every 30s
  useEffect(() => {
    pollWorkerNotifs()
    const id = setInterval(pollWorkerNotifs, 30000)
    return () => clearInterval(id)
  }, [pollWorkerNotifs])

  return (
    <WorkerNotifContext.Provider value={{ push, unread, clearUnread }}>
      {children}
      <WorkerNotifBell notifications={notifications} unread={unread} onOpen={clearUnread} />
    </WorkerNotifContext.Provider>
  )
}

// ── Notification Bell UI ──────────────────────────────────────────────────────
const TYPE_META: Record<WorkerNotifType, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  payout_credited:     { icon: IndianRupee,   color: 'text-green-600',  bg: 'bg-green-100',  label: 'Payout' },
  claim_approved:      { icon: CheckCircle2,  color: 'text-green-600',  bg: 'bg-green-100',  label: 'Claim' },
  claim_rejected:      { icon: X,             color: 'text-red-600',    bg: 'bg-red-100',    label: 'Rejected' },
  policy_renewed:      { icon: Shield,        color: 'text-blue-600',   bg: 'bg-blue-100',   label: 'Policy' },
  premium_deducted:    { icon: IndianRupee,   color: 'text-gray-600',   bg: 'bg-gray-100',   label: 'Premium' },
  safe_zone_advisory:  { icon: Navigation,    color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Advisory' },
  income_warning:      { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Warning' },
  disruption_confirmed:{ icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-100',    label: 'Disruption' },
  platform_outage:     { icon: Info,          color: 'text-orange-600', bg: 'bg-orange-100', label: 'Outage' },
  high_dcs_alert:      { icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-100',    label: 'DCS Alert' },
}

function WorkerNotifBell({ notifications, unread, onOpen }: {
  notifications: WorkerNotification[]
  unread: number
  onOpen: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="fixed top-3 right-4 z-[9998]">
      <button
        onClick={() => { setOpen(o => !o); if (!open) onOpen() }}
        className="relative p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
      >
        <Bell className="w-4 h-4 text-gray-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-gray-900">Notifications</p>
            <div className="flex items-center gap-2">
              {unread > 0 && <span className="text-[10px] bg-red-100 text-red-600 font-semibold px-1.5 py-0.5 rounded-full">{unread} new</span>}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-gray-400">No notifications yet</div>
            ) : (
              notifications.map(n => {
                const meta = TYPE_META[n.type]
                const Icon = meta.icon
                return (
                  <div key={n.id} className={`px-4 py-3 ${n.read ? 'bg-white' : 'bg-[#E6FAF1]/40'}`}>
                    <div className="flex items-start gap-2.5">
                      <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${meta.bg} ${meta.color}`}>{meta.label}</span>
                          {!n.read && <div className="w-1.5 h-1.5 bg-[#06C167] rounded-full" />}
                        </div>
                        <p className="text-[12px] font-semibold text-gray-800 leading-tight">{n.title}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{n.body}</p>
                        {n.amount && <p className="text-[12px] font-bold text-[#06C167] mt-1">₹{n.amount.toLocaleString('en-IN')}</p>}
                        <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
            <p className="text-[10px] text-gray-400 text-center">Worker notifications only · auto-refreshes every 30s</p>
          </div>
        </div>
      )}
    </div>
  )
}
