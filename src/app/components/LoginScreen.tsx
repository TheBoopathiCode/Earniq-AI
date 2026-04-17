import { useState } from 'react'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { api, saveAuth } from '../lib/api'
import type { Worker, Policy } from '../lib/types'

interface Props {
  onSuccess: (worker: Worker, policy: Policy) => void
  onAdminSuccess: () => void
  onBack: () => void
  onRegister: () => void
}

export function LoginScreen({ onSuccess, onAdminSuccess, onBack, onRegister }: Props) {
  const [tab, setTab] = useState<'worker' | 'admin'>('worker')

  // worker state
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // admin state
  const [adminUser, setAdminUser] = useState('')
  const [adminPass, setAdminPass] = useState('')
  const [adminError, setAdminError] = useState('')

  const handleWorkerLogin = async () => {
    if (phone.length !== 10 || !password) return
    setIsLoading(true)
    setError('')
    try {
      const res = await api.post<{ access_token: string; worker: Worker; policy: Policy }>('/auth/login', {
        phone, password
      })
      saveAuth(res.access_token, res.worker, res.policy)
      onSuccess(res.worker, res.policy)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAdminLogin = () => {
    setAdminError('')
    if (adminUser === 'admin' && adminPass === 'earniq2026') {
      onAdminSuccess()
    } else {
      setAdminError('Invalid admin credentials')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="EarnIQ" className="h-10 w-10 object-contain" />
            <div>
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>Sign in to your EarnIQ account</CardDescription>
            </div>
          </div>
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-gray-200 p-1 gap-1">
            {(['worker', 'admin'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); setAdminError('') }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t ? 'bg-[#06C167] text-white' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'worker' ? 'Delivery Partner' : 'Insurer Admin'}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {tab === 'worker' ? (
            <>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <div className="flex gap-2">
                  <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-100 px-3 text-sm">+91</div>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleWorkerLogin()}
                />
                <p className="text-xs text-gray-500">Default password: earniq2026</p>
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>}
              <Button
                onClick={handleWorkerLogin}
                disabled={phone.length !== 10 || !password || isLoading}
                className="w-full" size="lg"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
                {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                <p className="text-xs text-blue-700 font-medium">Insurer Intelligence Center</p>
                <p className="text-xs text-blue-600 mt-0.5">Access live claims, fraud alerts, and zone analytics</p>
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input
                  placeholder="admin"
                  value={adminUser}
                  onChange={e => setAdminUser(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  placeholder="Enter admin password"
                  value={adminPass}
                  onChange={e => setAdminPass(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                />
                <p className="text-xs text-gray-500">Demo credentials: admin / earniq2026</p>
              </div>
              {adminError && <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{adminError}</div>}
              <Button
                onClick={handleAdminLogin}
                disabled={!adminUser || !adminPass}
                className="w-full bg-blue-600 hover:bg-blue-700" size="lg"
              >
                Access Admin Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            {tab === 'worker' && (
              <button onClick={onRegister} className="text-sm text-[#06C167] font-medium hover:underline">
                New user? Register
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
