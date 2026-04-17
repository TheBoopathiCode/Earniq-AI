import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from 'react-error-boundary'
import { RegistrationWizard } from './components/registration/RegistrationWizard'
import { LoginScreen } from './components/LoginScreen'
import { Root } from './components/Root'
import { Dashboard } from './components/Dashboard'
import { Policy } from './components/Policy'
import { Claims } from './components/Claims'
import { History } from './components/History'
import { Profile } from './components/Profile'
import { HelpCenter } from './components/HelpCenter'
import { InsurerDashboard } from './components/insurer/InsurerDashboard'
import { AdminApp } from './components/AdminApp'
import { AppProvider, useAppContext } from './context/AppContext'
import { ToastProvider } from './components/ui/ToastProvider'
import { getTierFromPremium } from './lib/store'
import { TIER_DETAILS } from './lib/types'
import { getSavedWorker, getSavedPolicy, clearAuth } from './lib/api'
import type { Worker, Policy as PolicyType, Platform, City, Zone } from './lib/types'
import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { LanguageSuggestion } from './components/LanguageSuggestion'
import { cn } from './lib/utils'
import {
  Shield, Zap, TrendingUp, ChevronRight, ArrowRight,
  CloudRain, Thermometer, Wind, WifiOff, ShieldAlert, Brain, CheckCircle2
} from 'lucide-react'

type AppView = 'landing' | 'login' | 'register' | 'app' | 'insurer'

function AppInner() {
  const [view, setView] = useState<AppView>('landing')
  const { setWorker, setPolicy } = useAppContext()

  useEffect(() => {
    // Clear any corrupt localStorage from previous sessions
    try { JSON.parse(localStorage.getItem('earniq_worker') || 'null') }
    catch { localStorage.removeItem('earniq_worker'); localStorage.removeItem('earniq_policy'); localStorage.removeItem('earniq_token') }
    try { JSON.parse(localStorage.getItem('earniq_policy') || 'null') }
    catch { localStorage.removeItem('earniq_policy') }

    const savedWorker = getSavedWorker<Worker>()
    const savedPolicy = getSavedPolicy<PolicyType>()
    if (savedWorker && savedPolicy) {
      setWorker(savedWorker)
      setPolicy(savedPolicy)
      setView('app')
    }
  }, [])

  const handleRegistrationComplete = (_data: {
    phone: string; platform: Platform; city: City; zone: Zone
    workingHours: number; avgOrders: number; upiId: string
    riskScore: number; premium: number
    worker: Worker; policy: PolicyType
  }) => {
    setWorker(_data.worker)
    setPolicy(_data.policy)
    setView('app')
  }

  return (
    <AnimatePresence mode="wait">
      {view === 'landing' && (
        <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <LandingPage onGetStarted={() => setView('register')} onLogin={() => setView('login')} />
        </motion.div>
      )}
      {view === 'login' && (
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <LoginScreen
            onSuccess={(worker, policy) => { setWorker(worker); setPolicy(policy); setView('app') }}
            onAdminSuccess={() => setView('insurer')}
            onBack={() => setView('landing')}
            onRegister={() => setView('register')}
          />
        </motion.div>
      )}
      {view === 'register' && (
        <motion.div key="register" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <RegistrationWizard onComplete={handleRegistrationComplete} />
        </motion.div>
      )}
      {view === 'insurer' && (
        <motion.div key="insurer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-screen">
          <AdminApp onLogout={() => setView('landing')} />
        </motion.div>
      )}
      {view === 'app' && (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-screen">
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Root onLogout={() => { clearAuth(); setWorker(null); setPolicy(null); setView('landing') }} />}>
                <Route index element={<Dashboard />} />
                <Route path="policy"   element={<Policy />} />
                <Route path="claims"   element={<Claims />} />
                <Route path="history"  element={<History />} />
                <Route path="profile"  element={<Profile />} />
                <Route path="help"     element={<HelpCenter />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppProvider><ToastProvider><AppInner /></ToastProvider></AppProvider>
    </ErrorBoundary>
  )
}

function ErrorFallback({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="p-6 bg-red-50 border border-red-200 rounded-lg m-4">
      <h2 className="font-semibold text-red-800 mb-2">Something went wrong</h2>
      <p className="text-sm text-red-600">{msg}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-3 text-sm text-red-700 underline"
      >
        Reload app
      </button>
    </div>
  )
}

function LandingPage({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="EarnIQ" className="h-8 w-8 object-contain" />
            <span className="font-bold text-gray-900">EarnIQ</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onLogin}>Sign In</Button>
              <Button size="sm" onClick={onGetStarted}>
                {t('get_started')} <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>
      <LanguageSuggestion />

      <section className="relative overflow-hidden py-20 lg:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-[#E6FAF1] via-transparent to-transparent" />
        <div className="container mx-auto px-4 relative">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-6 border-[#06C167] text-[#06C167]">
              <Zap className="mr-1 h-3 w-3" /> AI-Powered Parametric Insurance
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              We prevent income loss{' '}
              <span className="text-[#06C167]">before it happens</span>
            </h1>
            <p className="mt-6 text-lg text-gray-500">
              And automatically compensate whatever we couldn't prevent.
              Zero forms. Zero waiting. Predict, prevent, protect, pay — all automatically.
            </p>
            <p className="mt-3 text-sm text-amber-600 font-medium">
              💰 Income loss coverage only · Covers lost delivery wages from weather, AQI, curfew & platform outages
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" onClick={onGetStarted}>
                {t('start_3min')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-16 grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              { value: '15M+', label: 'Gig Workers in India' },
              { value: '90sec', label: 'Payout Time' },
              { value: '5', label: 'Parametric Triggers' },
              { value: '₹8-28', label: 'Weekly Premium' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-[#06C167]">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">{t('four_layer')}</h2>
            <p className="text-gray-500 mt-2">From prediction to payout in seconds</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Brain,      title: t('predict'), description: 'AI scores zone risk 6-24 hours ahead using 5 data sources' },
              { icon: TrendingUp, title: t('prevent'), description: 'Safe Zone Advisory fires at 20% income drop — move before loss' },
              { icon: ShieldAlert,title: t('confirm'), description: 'Multi-source DCS validates the disruption event' },
              { icon: Zap,        title: t('pay'),     description: 'Zero-touch UPI payout within 90 seconds' },
            ].map((step, i) => (
              <div key={step.title} className="relative rounded-xl border border-gray-200 bg-white p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#E6FAF1]">
                  <step.icon className="h-6 w-6 text-[#06C167]" />
                </div>
                <p className="mt-4 font-bold">{step.title}</p>
                <p className="mt-2 text-sm text-gray-500">{step.description}</p>
                <div className="absolute top-6 -right-3 hidden lg:flex h-6 w-6 items-center justify-center rounded-full bg-[#06C167] text-white text-xs font-bold z-10">
                  {i + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">{t('five_triggers')}</h2>
            <p className="text-gray-500 mt-2">Objective, measurable events that activate coverage automatically</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              { icon: CloudRain,  name: t('heavy_rainfall'),  threshold: '>15mm/hr for 30min', tier: 'Tier 1' },
              { icon: Thermometer,name: t('extreme_heat'),    threshold: '>44°C for 45min',    tier: 'Tier 1' },
              { icon: Wind,       name: t('severe_aqi'),      threshold: 'AQI >300 for 3hrs',  tier: 'Tier 1' },
              { icon: ShieldAlert,name: t('zone_lockdown'),   threshold: 'Sec 144 / Curfew',   tier: 'Tier 2' },
              { icon: WifiOff,    name: t('platform_outage'), threshold: '>45min peak hours',  tier: 'Tier 2' },
            ].map(trigger => (
              <div key={trigger.name} className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E6FAF1]">
                  <trigger.icon className="h-5 w-5 text-[#06C167]" />
                </div>
                <div>
                  <p className="font-medium">{trigger.name}</p>
                  <p className="text-xs text-gray-500">{trigger.threshold}</p>
                </div>
                <span className="ml-auto px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{trigger.tier}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">{t('simple_pricing')}</h2>
            <p className="text-gray-500 mt-2">Dynamic premium based on your zone risk</p>
            <div className="inline-flex items-center gap-2 mt-3 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-4 py-2 rounded-full">
              <span>💰</span> Income loss coverage only · No health · No accident · No vehicle
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { tier: 'Basic',    premium: '₹8-12',  cap: '₹1,200',  triggers: [t('heavy_rainfall'), t('extreme_heat')],                                                                  featured: false },
              { tier: 'Standard', premium: '₹13-20', cap: '₹1,600',  triggers: [t('heavy_rainfall'), t('extreme_heat'), t('severe_aqi'), t('zone_lockdown')], featured: true  },
              { tier: 'Premium',  premium: '₹21-28', cap: '₹2,000',  triggers: [t('all_triggers')],                                                                                       featured: false },
            ].map(plan => (
              <div key={plan.tier} className={cn('rounded-xl border p-6', plan.featured ? 'border-[#06C167] bg-[#E6FAF1] shadow-lg scale-105' : 'border-gray-200 bg-white')}>
                {plan.featured && <span className="px-2 py-0.5 text-xs bg-[#06C167] text-white rounded mb-4 inline-block">{t('most_popular')}</span>}
                <h3 className="text-xl font-bold">{plan.tier}</h3>
                <p className="text-3xl font-bold mt-4">{plan.premium}<span className="text-sm font-normal text-gray-500">/week</span></p>
                <p className="text-sm text-gray-500 mt-2">Max income payout/week: {plan.cap}</p>
                <div className="mt-6 space-y-2">
                  {plan.triggers.map(t => (
                    <div key={t} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-[#06C167]" /><span>{t}</span>
                    </div>
                  ))}
                </div>
                <Button className={cn('w-full mt-6', !plan.featured && 'border border-[#06C167] text-[#06C167] bg-white hover:bg-[#E6FAF1]')}
                  variant={plan.featured ? 'default' : 'ghost'} onClick={onGetStarted}>
                  Get Started
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 py-8">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.jpeg" alt="EarnIQ" className="h-5 w-5 object-contain" />
            <span className="font-bold">EarnIQ AI</span>
          </div>
          <p className="text-sm text-gray-500">AI-Powered Parametric Income Insurance for Gig Workers</p>
        </div>
      </footer>
    </div>
  )
}
