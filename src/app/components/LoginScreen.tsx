import { useState } from 'react'
import { Shield, Phone, Lock, ArrowRight, ChevronLeft } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card'
import { api, saveAuth } from '../lib/api'
import type { Worker, Policy } from '../lib/types'

interface Props {
  onSuccess: (worker: Worker, policy: Policy) => void
  onBack: () => void
  onRegister: () => void
}

export function LoginScreen({ onSuccess, onBack, onRegister }: Props) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
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
        </CardHeader>
        <CardContent className="space-y-5">
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
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
            <p className="text-xs text-gray-500">Default password: earniq2026</p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</div>
          )}

          <Button
            onClick={handleLogin}
            disabled={phone.length !== 10 || !password || isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
            {!isLoading && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button onClick={onRegister} className="text-sm text-[#06C167] font-medium hover:underline">
              New user? Register
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
