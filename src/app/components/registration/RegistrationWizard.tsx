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
import type { Platform, PlatformCategory, City, Zone, RegistrationStep } from '../../lib/types'
import { PLATFORM_NAMES, PLATFORM_CATEGORIES, CITY_NAMES, ZONES } from '../../lib/types'
import { calculateMLPremium, getTierFromPremium } from '../../lib/store'
import type { MLPricingResult } from '../../lib/store'
import { api, saveAuth } from '../../lib/api'
import type { Worker, Policy } from '../../lib/types'
import { useZoneLiveDcs } from '../../hooks/useZoneLiveDcs'
import { useZones } from '../../hooks/useZones'

const PLATFORM_CATEGORY_ORDER: PlatformCategory[] = ['food', 'grocery', 'ecommerce']
const CITIES: City[] = ['chennai', 'delhi', 'mumbai', 'hyderabad', 'kolkata']

interface Props {
  onComplete: (data: {
    phone: string; platform: Platform; city: City; zone: Zone
    workingHours: number; avgOrders: number; upiId: string
    riskScore: number; premium: number
    worker: Worker; policy: Policy
  }) => void
}

export function RegistrationWizard({ onComplete }: Props) {
  const { t } = useTranslation()
  const { zones: apiZones, loading: zonesLoading } = useZones()
  const [step, setStep] = useState<RegistrationStep>(1)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpVerified, setOtpVerified] = useState(false)
  const [generatedOtp, setGeneratedOtp] = useState('')
  const [platformCategory, setPlatformCategory] = useState<PlatformCategory | null>(null)
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [city, setCity] = useState<City | null>(null)
  const [zone, setZone] = useState<Zone | null>(null)
  const [workingHours, setWorkingHours] = useState(8)
  const [avgOrders, setAvgOrders] = useState(15)
  const [upiId, setUpiId] = useState('')
  const [otpError, setOtpError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [enrollmentSuspended, setEnrollmentSuspended] = useState(false)

  // DCS score — same formula as backend and dashboard
  // ── Live DCS from OWM + AQICN ─────────────────────────────────────────────
  const liveSignals = useZoneLiveDcs(
    zone?.lat ?? null,
    zone?.lon ?? null,
  )
  const dcsScore = liveSignals.source === 'loading' ? 0 : liveSignals.dcs
  const dcsLabel = dcsScore >= 70 ? 'High Risk' : dcsScore >= 40 ? 'Moderate Risk' : 'Low Risk'
  const dcsColor = dcsScore >= 70 ? 'bg-red-500'    : dcsScore >= 40 ? 'bg-yellow-500'    : 'bg-[#06C167]'
  const dcsBadge = dcsScore >= 70 ? 'bg-red-100 text-red-700' : dcsScore >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'

  const handleSendOtp = () => {
    if (phone.length === 10 && name.trim().length >= 2) {
      const code = String(Math.floor(100000 + Math.random() * 900000))
      setGeneratedOtp(code)
      setOtpSent(true)
      setOtpError('')
    }
  }
  const handleVerifyOtp = () => {
    if (otp === generatedOtp) {
      setOtpVerified(true)
      setOtpError('')
      setTimeout(() => setStep(2), 500)
    } else {
      setOtpError('Incorrect OTP. Please try again.')
      setOtp('')
    }
  }
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
        onComplete({
          phone, platform, city, zone, workingHours, avgOrders, upiId,
          riskScore: dcsScore, premium: response.policy.weeklyPremium,
          worker: response.worker, policy: response.policy,
        })
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : ''
        if (msg.includes('new_enrollment_suspended')) {
          setEnrollmentSuspended(true)
        } else {
          setApiError(msg || 'Registration failed. Please try again.')
        }
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
  // Feed live rain + AQI into ML pricing so premium reflects today's conditions
  const premiumData = zone && platform ? calculateMLPremium({
    zoneId:        zone.id,
    zoneRiskScore: zone.riskScore,
    platform:      platform,
    vehicleType:   'bike',
    avgOrders,
    workingHours,
    claimsLast8Weeks: 0,
    activeDays: 7,
    totalDays:  7,
    liveRainMm:   liveSignals.rain_mm,
    liveAqi:      liveSignals.aqi,
    liveFeelsLike: liveSignals.feels_like,
  }) : null

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
                      <InputOTP maxLength={6} value={otp} onChange={v => { setOtp(v); setOtpError('') }} disabled={otpVerified}>
                        <InputOTPGroup>
                          {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                        </InputOTPGroup>
                      </InputOTP>
                      {/* Demo OTP display — replace with real SMS in production */}
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <span className="text-xs text-blue-600">Demo OTP:</span>
                        <span className="font-mono font-bold text-blue-700 tracking-widest">{generatedOtp}</span>
                      </div>
                      {otpError && (
                        <p className="text-xs text-red-600">{otpError}</p>
                      )}
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
                  <Label>Delivery Category</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {PLATFORM_CATEGORY_ORDER.map(cat => (
                      <button key={cat} onClick={() => { setPlatformCategory(cat); setPlatform(null) }}
                        className={cn('flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-3 transition-all text-xs',
                          platformCategory === cat ? 'border-[#06C167] bg-[#E6FAF1]' : 'border-gray-200 hover:border-[#06C167]/50')}>
                        <span className="text-lg">{cat === 'food' ? '🍔' : cat === 'grocery' ? '🛒' : '📦'}</span>
                        <span className="font-medium text-center leading-tight">{PLATFORM_CATEGORIES[cat].label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {platformCategory && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <Label>Select Platform</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {PLATFORM_CATEGORIES[platformCategory].platforms.map(p => (
                        <button key={p} onClick={() => setPlatform(p)}
                          className={cn('flex items-center justify-center gap-2 rounded-lg border-2 p-4 transition-all',
                            platform === p ? 'border-[#06C167] bg-[#E6FAF1]' : 'border-gray-200 hover:border-[#06C167]/50')}>
                          <span className="font-medium">{PLATFORM_NAMES[p]}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
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
                      {ZONES[city].map(z => {
                        // Overlay live DCS from API if available, else use static riskScore
                        const live = apiZones[city]?.find(az => az.id === z.id)
                        const dcs  = live?.currentDcs ?? 0
                        const activeDisruption = live?.activeDisruption ?? false
                        return (
                          <button key={z.id} onClick={() => setZone(z)}
                            className={cn('flex items-center justify-between rounded-lg border-2 p-3 transition-all',
                              zone?.id === z.id ? 'border-[#06C167] bg-[#E6FAF1]' : 'border-gray-200 hover:border-[#06C167]/50')}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{z.name}</span>
                              {activeDisruption && (
                                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">⚠ Active</span>
                              )}
                            </div>
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                              dcs < 40 ? 'bg-green-100 text-green-700' :
                              dcs < 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700')}>
                              {dcs > 0 ? `DCS: ${dcs}` : 'Loading...'}
                            </span>
                          </button>
                        )
                      })}
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
                      {liveSignals.source === 'loading'
                        ? <div className="w-4 h-4 border-2 border-[#06C167] border-t-transparent rounded-full animate-spin" />
                        : <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1',
                            liveSignals.source === 'live' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {liveSignals.source === 'live' ? `Live · ${liveSignals.fetched_at}` : 'Estimated'}
                          </span>
                      }
                    </div>

                    {/* Live sensor readings */}
                    {liveSignals.source !== 'loading' && (
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'Rain',       value: `${liveSignals.rain_mm.toFixed(1)}mm/hr`, alert: liveSignals.rain_mm >= 15 },
                          { label: 'Feels Like', value: `${Math.round(liveSignals.feels_like)}°C`,  alert: liveSignals.feels_like >= 44 },
                          { label: 'AQI',        value: `${liveSignals.aqi}`,                        alert: liveSignals.aqi >= 300 },
                          { label: 'Wind',       value: `${liveSignals.wind_kmh}km/h`,               alert: false },
                        ].map(s => (
                          <div key={s.label} className={cn('rounded-lg px-2 py-1.5 text-center',
                            s.alert ? 'bg-red-50 border border-red-200' : 'bg-white border border-gray-200')}>
                            <p className="text-xs text-gray-500">{s.label}</p>
                            <p className={cn('text-sm font-bold', s.alert ? 'text-red-600' : 'text-gray-800')}>{s.value}</p>
                          </div>
                        ))}
                      </div>
                    )}
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
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">ML Pricing Breakdown</p>
                        {premiumData.factors.map(f => (
                          <div key={f.name} className="flex justify-between items-center text-xs">
                            <span className="text-gray-500 flex items-center gap-1">
                              <span>{f.impact === 'discount' ? '🟢' : f.impact === 'loading' ? '🔴' : '⚪'}</span>
                              {f.name}
                            </span>
                            <span className={f.impact === 'discount' ? 'text-[#06C167] font-semibold' : f.impact === 'loading' ? 'text-red-500 font-semibold' : 'text-gray-500'}>
                              {f.value}
                            </span>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-gray-100 space-y-1.5">
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Est. Weekly Income</span>
                            <span>₹{premiumData.weeklyIncome.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Max Payout per Event</span>
                            <span className="font-semibold text-[#06C167]">₹{premiumData.perEventCap.toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Weekly Premium</span>
                            <span className="font-bold text-lg">₹{premiumData.finalPremium}/week</span>
                          </div>
                          {premiumData.savingsPerWeek > 0 && (
                            <div className="flex justify-between text-xs text-[#06C167]">
                              <span>You save vs max</span>
                              <span className="font-semibold">₹{premiumData.savingsPerWeek}/week ({premiumData.savingsPct}% off)</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>Premium as % of income</span>
                            <span>{((premiumData.finalPremium / premiumData.weeklyIncome) * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                        {premiumData.aiInsight && (
                          <div className="mt-2 bg-[#E6FAF1] border border-[#06C167]/20 rounded-lg p-2.5 flex gap-2">
                            <span className="text-xs font-bold text-[#06C167] flex-shrink-0">AI</span>
                            <p className="text-xs text-gray-600 leading-relaxed">{premiumData.aiInsight}</p>
                          </div>
                        )}
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
                      <div className="flex justify-between"><span className="text-gray-500">Est. Weekly Income</span><span className="font-medium">₹{premiumData.weeklyIncome.toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Max Payout / Event</span><span className="font-medium text-[#06C167]">₹{premiumData.perEventCap.toLocaleString('en-IN')}</span></div>
                      <div className="flex justify-between border-t border-[#06C167]/20 pt-3">
                        <span className="font-medium">{t('weekly_premium')}</span>
                        <span className="font-bold text-[#06C167]">₹{premiumData.finalPremium} <span className="text-xs font-normal text-gray-400">({((premiumData.finalPremium / premiumData.weeklyIncome) * 100).toFixed(1)}% of income)</span></span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 text-xs text-gray-500 bg-white/60 rounded-lg p-3">
                      <TrendingUp className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#06C167]" />
                      <span>Auto-debit every Monday 6 AM. Cancel anytime. Policy renews weekly with AI-optimized premium.</span>
                    </div>
                    <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <span className="flex-shrink-0">⚠️</span>
                      <span className="text-amber-700"><strong>Income loss only.</strong> Covers lost delivery wages from weather, AQI, curfew &amp; platform outages. Does NOT cover vehicle repairs, medical bills, or accidents.</span>
                    </div>
                  </div>
                )}
                {apiError && (
                  <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{apiError}</div>
                )}
                {enrollmentSuspended ? (
                  <div className="rounded-xl border-2 border-red-200 bg-red-50 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-red-800 text-sm">New Enrollments Temporarily Paused</p>
                        <p className="text-xs text-red-600 mt-0.5">Portfolio under actuarial review</p>
                      </div>
                    </div>
                    <p className="text-xs text-red-700 leading-relaxed">
                      Earniq has temporarily paused new policy activations while our actuarial team rebalances the risk pool.
                      This is a routine portfolio control — existing policyholders are fully covered.
                    </p>
                    <div className="bg-white/70 rounded-lg px-3 py-2 text-xs text-red-600 font-medium">
                      ⏳ Check back in 24–48 hours. Your details have been saved.
                    </div>
                  </div>
                ) : (
                  <Button onClick={handleComplete} disabled={!canProceed() || isLoading} className="w-full" size="lg">
                    {isLoading ? 'Activating...' : t('activate_policy')}
                    {!isLoading && <CheckCircle2 className="ml-2 h-4 w-4" />}
                  </Button>
                )}
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
