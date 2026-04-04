import { createContext, useContext, useState } from 'react'
import type { Worker, Policy } from '../lib/types'

interface AppContextValue {
  worker: Worker | null
  policy: Policy | null
  setWorker: (w: Worker | null) => void
  setPolicy: (p: Policy | null) => void
  unreadClaims: number
  addUnreadClaim: () => void
  clearUnreadClaims: () => void
}

const AppContext = createContext<AppContextValue>({
  worker: null, policy: null,
  setWorker: () => {}, setPolicy: () => {},
  unreadClaims: 0, addUnreadClaim: () => {}, clearUnreadClaims: () => {}
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [worker, setWorker] = useState<Worker | null>(null)
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [unreadClaims, setUnreadClaims] = useState(0)
  return (
    <AppContext.Provider value={{
      worker, policy, setWorker, setPolicy,
      unreadClaims,
      addUnreadClaim: () => setUnreadClaims(n => n + 1),
      clearUnreadClaims: () => setUnreadClaims(0)
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext() { return useContext(AppContext) }
