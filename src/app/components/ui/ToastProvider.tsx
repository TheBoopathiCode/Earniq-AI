import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Navigation, IndianRupee, X, Bell } from 'lucide-react'

export type ToastType = 'payout' | 'claim' | 'advisory' | 'alert' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  body: string
  amount?: number
}

interface ToastCtx {
  fire: (t: Omit<Toast, 'id'>) => void
  requestPushPermission: () => void
  pushGranted: boolean
}

const Ctx = createContext<ToastCtx>({ fire: () => {}, requestPushPermission: () => {}, pushGranted: false })

const ICONS: Record<ToastType, React.ElementType> = {
  payout:   IndianRupee,
  claim:    AlertTriangle,
  advisory: Navigation,
  alert:    AlertTriangle,
  info:     Bell,
}

const COLORS: Record<ToastType, string> = {
  payout:   'bg-green-500',
  claim:    'bg-blue-500',
  advisory: 'bg-yellow-500',
  alert:    'bg-red-500',
  info:     'bg-gray-500',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.type]
  const color = COLORS[toast.type]

  useEffect(() => {
    const t = setTimeout(onDismiss, 5000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-80 max-w-[calc(100vw-2rem)]"
    >
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-800 leading-tight">{toast.title}</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{toast.body}</p>
      </div>
      <button onClick={onDismiss} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pushGranted, setPushGranted] = useState(false)
  const counterRef = useRef(0)

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setPushGranted(true)
    }
  }, [])

  const requestPushPermission = useCallback(async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setPushGranted(perm === 'granted')
  }, [])

  const fire = useCallback((t: Omit<Toast, 'id'>) => {
    const id = `toast-${++counterRef.current}`
    setToasts(prev => [...prev, { ...t, id }])

    // Also fire browser push notification if granted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(t.title, {
        body: t.body,
        icon: '/logo.jpeg',
        tag: id,
      })
    }
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <Ctx.Provider value={{ fire, requestPushPermission, pushGranted }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map(t => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onDismiss={() => dismiss(t.id)} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast() { return useContext(Ctx) }
