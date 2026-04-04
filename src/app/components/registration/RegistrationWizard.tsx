import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Progress } from '../ui/progress'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp'
import { Slider } from '../ui/slider'
import { MapPin, CheckCircle2, ChevronRight, ChevronLeft, Shield, Zap, TrendingUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useTranslation } from 'react-i18next'
import type { Platform, City, Zone, RegistrationStep } from '../../lib/types'
import { ZONES, PLATFORM_NAMES, CITY_NAMES } from '../../lib/types'
import { calculatePremium, getTierFromPremium } from '../../lib/store'
import { api, saveAuth } from '../../lib/api'
import type { Worker, Policy } from '../../lib/types'

// Same DCS formula used across the entire app
function calcDcs(zoneRisk: number, workingHours: number, avgOrders: number): number {
  // Adjust zone risk based on worker profile
  let adjustedRisk = zoneRisk
  if (workingHours >= 10) adjustedRisk += 5
  if (workingHours >= 12) adjustedRisk += 5
  if (avgOrders >= 20) adjustedRisk += 3
  if (avgOrders >= 25) adjustedRisk += 3
  adjustedRisk = Math.min(100, adjustedRisk)

  return Math.round(
    adjustedRisk * 1.00 * 0.25 +
    adjustedRisk * 0.80 * 0.15 +
    adjustedRisk * 0.70 * 0.10 +
    adjustedRisk * 0.60 * 0.15 +
    adjustedRisk * 0.50 * 0.05 +
    adjustedRisk * 0.50 * 0.15 +
    adjustedRisk * 0.40 * 0.10 +
    adjustedRisk * 0.30 * 0.05
  )
}

const PLATFORMS: Platform[] = ['zomato', 'swiggy', 'zepto', 'amazon']
const CITIES: City[] = ['chennai', 'delhi', 'mumbai', 'hyderabad', 'kolkata']

interface Props {
  onComplete: (data: {
    phone: string; platform: Platform; city: City; zone: Zone
    workingHours: number; avgOrders: number; upiId: string
    riskScore: number; premium: number
  }) => void
}

export function RegistrationWizard({ onComplete }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState<RegistrationStep>(1)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [city, setCity] = useState<City | null>(null)
  const [zone, setZone] = useState<Zone | null>(null)
  const [workingHours, setWorkingHours] = useState(8)
  const [avgOrders, setAvgOrders] = useState(15)
  const [upiId, setUpiId] = useState('')
  const [isAnimating, setIsAnimating] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState('')

  // DCS score — same formula as backend and dashboard
  const dcsScore = zone ? calcDcs(zone.riskScore, workingHours, avgOrders) : 0
  const dcsLabel = dcsScore >= 70 ? 'High Risk' : dcsScore >= 40 ? 'Moderate Risk' : 'Low Risk'
  const dcsColor = dcsScore >= 70 ? 'bg-red-500' : dcsScore >= 40 ? 'bg-yellow-500' : 'bg-[#06C167]'
  const dcsBadge = dcsScore >= 70 ? 'bg-red-100 text-red-700' : dcsScore >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'

  const handleSendOtp = () => { if (phone.length === 10 && name.trim().length >= 2) setOtpSent(true) }
  const handleVerifyOtp = () => { if (otp.length === 6) { setOtpVerified(true); setTimeout(() => setStep(2), 500) } }
  const handleComplete = async () => {
    if (platform && city && zone && upiId) {
      setIsLoading(true)
      setApiError('')
      try {
        const response = await api.post<{ access_token: string; worker: Worker; policy: Policy }>('/auth/register', {
          phone, password: 'earniq2026', platform, city,
          zone_id: zone.id, avg_orders: avgOrders, working_hours: workingHours, upi_id: upiId, name: name.trim()
        })
        saveAuth(response.access_token, response.worker, response.policy)
        onComplete({ phone, platform, city, zone, workingHours, avgOrders, upiId, riskScore: dcsScore, premium: response.policy.weeklyPremium })
      } catch (error: unknown) {
        setApiError(error instanceof Error ? error.message : 'Registration failed. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }
  }
  const canProceed = () => {
    switch (step) {
      case 1: return otpVerified && name.trim().length >= 2
      case 2: return platform !== null && city !== null && zone !== null
      case 3: return workingHours > 0 && avgOrders > 0
      case 4: return upiId.includes('@')
      default: return false
    }
  }
  const premiumData = zone ? calculatePremium(zone.riskScore) : null

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="EarnIQ" className="h-10 w-10 object-contain" />
            <div>
              <CardTitle className="text-xl">EarnIQ</CardTitle>
              <CardDescription>{t('activate_policy')}</CardDescription>
            </div>
          </div>
          <Progress value={(step / 4) * 100} />
          <div className="flex justify-between text-xs text-gray-500">
            {['Verify', 'Platform', 'Profile', 'Payout'].map((label, i) => (
              <span key={label} className={cn(step >= i + 1 && 'text-[#06C167] font-medium')}>{label}</span>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" type="text" placeholder="Arjun Kumar" value={name}
                    onChange={e => setName(e.target.value)}
                    disabled={otpSent} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t('phone_number_label')}</Label>
                  <div className="flex gap-2">
                    <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-100 px-3 text-sm">+91</div>
                    <Input id="phone" type="tel" placeholder="9876543210" value={phone}
                      onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      disabled={otpSent} className="flex-1" />
                    {!otpSent && (
                      <Button onClick={handleSendOtp} disabled={phone.length !== 10 || name.trim().length < 2}>{t('send_otp')}</Button>
                    )}
                  </div>
                </div>
                {otpSent && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('enter_otp')}</Label>
                      <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={otpVerified}>
                        <InputOTPGroup>
                          {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                        </InputOTPGroup>
                      </InputOTP>
                      <p className="text-xs text-gray-500">{t('any_6_digits')}</p>
                    </div>
                    {!otpVerified && (
                      <Button onClick={handleVerifyOtp} disabled={otp.length !== 6} className="w-full">{t('verify_otp')}</Button>
                    )}
                    {otpVerified && (
                      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2 text-[#06C167]">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">{t('phone_verified')}</span>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="space-y-3">
                  <Label>{t('select_platform')}</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {PLATFORMS.map(p => (
                      <button key={p} onClick={() => setPlatform(p)}
                        className={cn('flex items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all',
                          platform === p ? 'border-[#06C167] bg-[#E6FAF1]' : 'border-gray-200 hover:border-[#06C167]/50')}>
                        <span className="font-medium">{PLATFORM_NAMES[p]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>{t('select_city')}</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {CITIES.map(c => (
                      <button key={c} onClick={() => { setCity(c); setZone(null) }}
                        className={cn('flex items-center justify-center gap-2 rounded-lg border-2 p-3 transition-all text-sm',
                          city === c ? 'border-[#06C167] bg-[#E6FAF1]' : 'border-gray-200 hover:border-[#06C167]/50')}>
                        <MapPin className="h-4 w-4" /><span>{CITY_NAMES[c]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {city && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <Label>{t('select_zone')}</Label>
                    <div className="grid gap-2">
                      {ZONES[city].map(z => (
                        <button key={z.id} onClick={() => setZone(z)}
                          className={cn('flex items-center justify-between rounded-lg border-2 p-3 transition-all',
                            zone?.id === z.id ? 'border-[#06C167] bg-[#E6FAF1]' : 'border-gray-200 hover:border-[#06C167]/50')}>
                          <span className="font-medium">{z.name}</span>
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                            z.riskScore <= 39 ? 'bg-green-100 text-green-700' :
                            z.riskScore <= 69 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')}>
                            DCS: {calcDcs(z.riskScore, 8, 15)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <Label>Working Hours per Day</Label>
                      <span className="text-sm font-medium">{workingHours} hrs</span>
                    </div>
                    <Slider value={[workingHours]} onValueChange={([v]) => setWorkingHours(v)} min={4} max={14} step={1} />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <Label>Average Orders per Day</Label>
                      <span className="text-sm font-medium">{avgOrders} orders</span>
                    </div>
                    <Slider value={[avgOrders]} onValueChange={([v]) => setAvgOrders(v)} min={5} max={35} step={1} />
                  </div>
                </div>
                {zone && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Disruption Confidence Score (DCS)</span>
                      <Zap className={cn('h-4 w-4', isAnimating ? 'text-[#06C167] animate-pulse' : 'text-gray-400')} />
                    </div>
                    <div className="relative h-4 rounded-full bg-gray-200 overflow-hidden">
                      <motion.div
                        className={cn('absolute inset-y-0 left-0 rounded-full', dcsColor)}
                        initial={{ width: 0 }} animate={{ width: `${dcsScore}%` }} transition={{ duration: 0.5 }} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold">{dcsScore}<span className="text-sm text-gray-400 font-normal">/100</span></span>
                      <span className={cn('text-sm font-medium px-3 py-1 rounded-full', dcsBadge)}>
                        {dcsLabel}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {dcsScore >= 70 ? 'High disruption risk in this zone. Premium adjusted accordingly.' :
                       dcsScore >= 40 ? 'Moderate risk. Coverage active for weather and AQI triggers.' :
                       'Low disruption risk. Consistency bonus applied to your premium.'}
                    </p>
                    {premiumData && (
                      <div className="pt-3 border-t border-gray-200 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Weekly Premium</span>
                          <span className="font-bold text-lg">₹{premiumData.finalPremium}/week</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                          <span>Coverage Cap</span>
                          <span>₹{getTierFromPremium(premiumData.finalPremium) === 'basic' ? '1,200' :
                            getTierFromPremium(premiumData.finalPremium) === 'standard' ? '1,600' : '2,000'}</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            )}

            {step === 4 && (
              <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                <div className="space-y-2">
                  <Label>{t('upi_label')}</Label>
                  <Input id="upi" type="text" placeholder={t('upi_placeholder')} value={upiId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUpiId(e.target.value.toLowerCase())} />
                  <p className="text-xs text-gray-500">{t('upi_hint')}</p>
                </div>
                {premiumData && zone && (
                  <div className="rounded-xl border border-[#06C167]/30 bg-[#E6FAF1] p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-[#06C167]" />
                      <span className="font-semibold">{t('policy_summary')}</span>
                    </div>
                    <div className="grid gap-3 text-sm">
                      <div className="flex justify-between"><span className="text-gray-500">Platform</span><span className="font-medium">{platform && PLATFORM_NAMES[platform]}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Zone</span><span className="font-medium">{zone.name}, {city && CITY_NAMES[city]}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('risk_score')}</span><span className="font-medium">{dcsScore}/100 ({dcsLabel})</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">{t('tier')}</span><span className="font-medium capitalize">{getTierFromPremium(premiumData.finalPremium)}</span></div>
                      <div className="flex justify-between border-t border-[#06C167]/20 pt-3">
                        <span className="font-medium">{t('weekly_premium')}</span>
                        <span className="font-bold text-[#06C167]">₹{premiumData.finalPremium}</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-gray-500 bg-white/60 rounded-lg p-3">
                      <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#06C167]" />
                      <span>Auto-debit every Monday 6 AM. Cancel anytime. Policy renews weekly with AI-optimized premium.</span>
                    </div>
                  </div>
                )}
                {apiError && (
                  <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{apiError}</div>
                )}
                <Button onClick={handleComplete} disabled={!canProceed() || isLoading} className="w-full" size="lg">
                  {isLoading ? 'Activating...' : t('activate_policy')}
                  {!isLoading && <CheckCircle2 className="ml-2 h-4 w-4" />}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {step > 1 && step < 4 && (
            <div className="flex gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep((s: RegistrationStep) => (s - 1) as RegistrationStep)} className="flex-1">
                <ChevronLeft className="mr-2 h-4 w-4" /> {t('back')}
              </Button>
              <Button onClick={() => setStep((s: RegistrationStep) => (s + 1) as RegistrationStep)} disabled={!canProceed()} className="flex-1">
                {t('continue')} <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
          {step === 1 && otpVerified && (
            <div className="mt-6">
              <Button onClick={() => setStep(2)} className="w-full">
                {t('continue')} <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
