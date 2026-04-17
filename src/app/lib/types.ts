export type Platform = 'zomato' | 'swiggy' | 'zepto' | 'blinkit' | 'amazon' | 'flipkart'
export type PlatformCategory = 'food' | 'grocery' | 'ecommerce'
export type City = 'chennai' | 'delhi' | 'mumbai' | 'hyderabad' | 'kolkata'

export type Zone = {
  id: string; name: string; city: City; riskScore: number; lat: number; lon: number
}

export type PolicyTier = 'basic' | 'standard' | 'premium'
export type TriggerType = 'rain' | 'heat' | 'aqi' | 'curfew' | 'platform' | 'pandemic'
export type IncomeHealthStatus = 'green' | 'yellow' | 'red'
export type ClaimStatus = 'pending' | 'approved' | 'paid' | 'rejected'
export type RegistrationStep = 1 | 2 | 3 | 4

export type Worker = {
  id: string
  platform_worker_id: string          // e.g. "ZOM-CH-00421" — stable platform identity
  phone: string; name: string; platform: Platform; city: City
  zone: Zone; avgOrders: number; workingHours: number; upiId: string
  riskScore: number; createdAt: Date
  // Platform-sourced fields
  avg_order_value_inr: number
  working_days_per_week: number
  total_deliveries: number
  rating: number
  vehicle_type: 'bicycle' | 'bike' | 'scooter' | 'car'
  badge: 'bronze' | 'silver' | 'gold' | 'platinum'
  active_since: string
}

export type Policy = {
  id: string; workerId: string; tier: PolicyTier; weeklyPremium: number
  coverageCap: number; validFrom: string; validUntil: string
  triggersActive: TriggerType[]; isActive: boolean; aiInsight?: string
}

export type Claim = {
  id: string; workerId: string; policyId: string; trigger: TriggerType
  dcsScore: number; expectedIncome: number; actualIncome: number
  lossAmount: number; lossPercent: number; fraudScore: number
  status: ClaimStatus; payoutAmount?: number; utr?: string
  createdAt: Date; paidAt?: Date
}

export type DCSSignals = {
  weather: number; aqi: number; traffic: number; govtAlert: number
  workerIdle: number; bioAlert: number; conflict: number; infraOutage: number
}

export const ZONES: Record<City, Zone[]> = {
  chennai: [
    { id: 'ch-vel', name: 'Velachery',  city: 'chennai', riskScore: 75, lat: 12.9815, lon: 80.2180 },
    { id: 'ch-tam', name: 'Tambaram',   city: 'chennai', riskScore: 82, lat: 12.9249, lon: 80.1000 },
    { id: 'ch-omr', name: 'OMR',        city: 'chennai', riskScore: 18, lat: 12.9063, lon: 80.2270 },
    { id: 'ch-ana', name: 'Anna Nagar', city: 'chennai', riskScore: 32, lat: 13.0850, lon: 80.2101 },
    { id: 'ch-tna', name: 'T. Nagar',   city: 'chennai', riskScore: 45, lat: 13.0418, lon: 80.2341 },
  ],
  delhi: [
    { id: 'dl-dwk', name: 'Dwarka',          city: 'delhi', riskScore: 68, lat: 28.5921, lon: 77.0460 },
    { id: 'dl-ito', name: 'ITO',             city: 'delhi', riskScore: 85, lat: 28.6289, lon: 77.2405 },
    { id: 'dl-sdl', name: 'South Delhi',     city: 'delhi', riskScore: 28, lat: 28.5245, lon: 77.2066 },
    { id: 'dl-cp',  name: 'Connaught Place', city: 'delhi', riskScore: 52, lat: 28.6315, lon: 77.2167 },
    { id: 'dl-noi', name: 'Noida Sector 62', city: 'delhi', riskScore: 15, lat: 28.6208, lon: 77.3633 },
  ],
  mumbai: [
    { id: 'mb-krl', name: 'Kurla',   city: 'mumbai', riskScore: 72, lat: 19.0726, lon: 72.8845 },
    { id: 'mb-drv', name: 'Dharavi', city: 'mumbai', riskScore: 88, lat: 19.0430, lon: 72.8554 },
    { id: 'mb-bnd', name: 'Bandra',  city: 'mumbai', riskScore: 48, lat: 19.0596, lon: 72.8295 },
    { id: 'mb-sio', name: 'Sion',    city: 'mumbai', riskScore: 65, lat: 19.0429, lon: 72.8620 },
    { id: 'mb-anr', name: 'Andheri', city: 'mumbai', riskScore: 35, lat: 19.1136, lon: 72.8697 },
  ],
  hyderabad: [
    { id: 'hyd-lbn', name: 'LB Nagar',     city: 'hyderabad', riskScore: 70, lat: 17.3482, lon: 78.5514 },
    { id: 'hyd-nar', name: 'Narayanguda',   city: 'hyderabad', riskScore: 62, lat: 17.3912, lon: 78.4818 },
    { id: 'hyd-wht', name: 'Whitefield',    city: 'hyderabad', riskScore: 12, lat: 17.4467, lon: 78.3800 },
    { id: 'hyd-ban', name: 'Banjara Hills', city: 'hyderabad', riskScore: 25, lat: 17.4156, lon: 78.4386 },
    { id: 'hyd-sec', name: 'Secunderabad',  city: 'hyderabad', riskScore: 42, lat: 17.4399, lon: 78.4983 },
  ],
  kolkata: [
    { id: 'kol-slt', name: 'Salt Lake', city: 'kolkata', riskScore: 22, lat: 22.5800, lon: 88.4116 },
    { id: 'kol-how', name: 'Howrah',    city: 'kolkata', riskScore: 58, lat: 22.5958, lon: 88.2636 },
    { id: 'kol-gar', name: 'Gariahat',  city: 'kolkata', riskScore: 38, lat: 22.5206, lon: 88.3644 },
    { id: 'kol-dum', name: 'Dum Dum',   city: 'kolkata', riskScore: 55, lat: 22.6218, lon: 88.4271 },
    { id: 'kol-new', name: 'New Town',  city: 'kolkata', riskScore: 15, lat: 22.5806, lon: 88.4769 },
  ],
}

export const PLATFORM_NAMES: Record<Platform, string> = {
  zomato: 'Zomato', swiggy: 'Swiggy',
  zepto: 'Zepto', blinkit: 'Blinkit',
  amazon: 'Amazon Flex', flipkart: 'Flipkart Quick',
}

export const PLATFORM_CATEGORIES: Record<PlatformCategory, { label: string; platforms: Platform[] }> = {
  food:      { label: 'Food Delivery',       platforms: ['zomato', 'swiggy'] },
  grocery:   { label: 'Grocery / Q-Commerce', platforms: ['zepto', 'blinkit'] },
  ecommerce: { label: 'E-Commerce',           platforms: ['amazon', 'flipkart'] },
}

export const CITY_NAMES: Record<City, string> = {
  chennai: 'Chennai', delhi: 'Delhi NCR', mumbai: 'Mumbai',
  hyderabad: 'Hyderabad', kolkata: 'Kolkata',
}

export const TIER_DETAILS: Record<PolicyTier, {
  name: string; premium: [number, number]
  cap: number          // max income loss payout per week (NOT vehicle/health/accident)
  triggers: TriggerType[]
}> = {
  basic:    { name: 'Basic',    premium: [8, 12],  cap: 1200, triggers: ['rain', 'heat'] },
  standard: { name: 'Standard', premium: [13, 20], cap: 1600, triggers: ['rain', 'heat', 'aqi', 'curfew'] },
  premium:  { name: 'Premium',  premium: [21, 28], cap: 2000, triggers: ['rain', 'heat', 'aqi', 'curfew', 'platform', 'pandemic'] },
}

export const TRIGGER_DETAILS: Record<TriggerType, { name: string; description: string; threshold: string }> = {
  rain:     { name: 'Heavy Rainfall',    description: 'Lost delivery income when rainfall exceeds 15mm/hr — orders drop 80–90%', threshold: '>15mm/hr for 30 min' },
  heat:     { name: 'Extreme Heat',      description: 'Lost delivery income when outdoor work is halted by extreme heat',        threshold: '>44°C feels-like for 45 min' },
  aqi:      { name: 'Severe AQI',        description: 'Lost delivery income when hazardous air quality reduces orders >60%',     threshold: 'AQI >300 for 3 hours' },
  curfew:   { name: 'Zone Lockdown',     description: 'Lost delivery income when movement is banned and orders = 0',             threshold: 'Official curfew / Sec 144' },
  platform: { name: 'Platform Outage',   description: 'Lost delivery income when the app is unreachable and no orders assigned', threshold: 'Outage >45 min peak hours' },
  pandemic: { name: 'Pandemic Lockdown', description: 'Lost delivery income when all outdoor work is banned by state order',     threshold: 'State lockdown order' },
}
