/**
 * Platform Mock API — Zomato & Swiggy (and others)
 *
 * Simulates the real partner API responses these platforms expose internally.
 * In production this would be replaced by OAuth-authenticated calls to:
 *   Zomato Partner API  → https://partner.zomato.com/api/v2/
 *   Swiggy Partner API  → https://partner.swiggy.com/api/v1/
 *
 * Each worker has a stable platform_worker_id (e.g. ZOM-DL-00421) that acts
 * as the primary identity key across the entire EarnIQ system.
 */

import type { Platform, City, Zone } from './types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformWorkerProfile {
  platform_worker_id: string          // e.g. "ZOM-CH-00421"
  platform: Platform
  name: string
  phone: string
  city: City
  zone: Zone
  avg_orders_per_day: number
  avg_order_value_inr: number         // ₹ per order (platform-reported)
  working_hours_per_day: number
  working_days_per_week: number
  weekly_income_inr: number           // 8-week rolling average
  daily_income_inr: number
  rating: number                      // 1.0–5.0
  total_deliveries: number
  active_since: string                // ISO date
  vehicle_type: 'bicycle' | 'bike' | 'scooter' | 'car'
  app_state: 'active_seeking' | 'idle' | 'background' | 'offline'
  platform_status: 'operational' | 'degraded' | 'down'
  orders_last_10min: number
  orders_p50_same_slot: number
  verified: boolean
  badge: 'bronze' | 'silver' | 'gold' | 'platinum'
}

export interface PlatformOrderHistory {
  order_id: string
  timestamp: string
  zone: string
  amount_inr: number
  distance_km: number
  duration_min: number
  status: 'delivered' | 'cancelled' | 'failed'
}

export interface PlatformEarningsSummary {
  week_label: string                  // "Week of Apr 14"
  total_orders: number
  total_earnings_inr: number
  avg_daily_earnings_inr: number
  peak_day: string
  peak_earnings_inr: number
}

// ─── Deterministic seeded random (stable per worker ID) ───────────────────────

function seededRand(seed: string, min: number, max: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  const norm = Math.abs(h) / 2147483647
  return Math.round(min + norm * (max - min))
}

function seededFloat(seed: string, min: number, max: number, decimals = 1): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(37, h) + seed.charCodeAt(i)) | 0
  const norm = Math.abs(h) / 2147483647
  return parseFloat((min + norm * (max - min)).toFixed(decimals))
}

// ─── Worker ID generation ─────────────────────────────────────────────────────

const PLATFORM_PREFIX: Record<Platform, string> = {
  zomato:   'ZOM',
  swiggy:   'SWG',
  zepto:    'ZPT',
  blinkit:  'BLK',
  amazon:   'AMZ',
  flipkart: 'FLK',
}

const CITY_PREFIX: Record<City, string> = {
  chennai:   'CH',
  delhi:     'DL',
  mumbai:    'MB',
  hyderabad: 'HY',
  kolkata:   'KL',
}

export function generatePlatformWorkerId(platform: Platform, city: City, phone: string): string {
  const num = phone.slice(-5).padStart(5, '0')
  return `${PLATFORM_PREFIX[platform]}-${CITY_PREFIX[city]}-${num}`
}

// ─── Platform-specific avg order values ──────────────────────────────────────

const AVG_ORDER_VALUE: Record<Platform, number> = {
  zomato:   68,   // food orders higher value
  swiggy:   65,
  zepto:    52,   // grocery smaller basket
  blinkit:  55,
  amazon:   72,   // e-commerce parcels
  flipkart: 70,
}

const VEHICLE_POOL: Record<Platform, PlatformWorkerProfile['vehicle_type'][]> = {
  zomato:   ['bike', 'scooter'],
  swiggy:   ['bike', 'scooter', 'bicycle'],
  zepto:    ['bicycle', 'bike'],
  blinkit:  ['bicycle', 'bike'],
  amazon:   ['bike', 'scooter', 'car'],
  flipkart: ['bike', 'scooter', 'car'],
}

const BADGE_THRESHOLDS: Array<[number, PlatformWorkerProfile['badge']]> = [
  [2000, 'platinum'],
  [1000, 'gold'],
  [300,  'silver'],
  [0,    'bronze'],
]

// ─── Core: fetch worker profile from platform ─────────────────────────────────

/**
 * Simulates a call to the platform's partner API.
 * In production: GET https://partner.zomato.com/api/v2/riders/{phone}/profile
 *
 * Returns null if the phone number is not registered on that platform.
 * For demo purposes, any 10-digit phone returns a valid profile.
 */
export async function fetchPlatformWorkerProfile(
  platform: Platform,
  phone: string,
  city: City,
  zoneId?: string,
  availableZones?: Zone[]
): Promise<PlatformWorkerProfile | null> {
  await new Promise(r => setTimeout(r, 300 + seededRand(phone, 0, 400)))
  if (phone.length !== 10) return null

  const seed      = `${platform}-${phone}-${city}`
  const zonePool  = availableZones ?? []
  const zone: Zone = zonePool.length > 0
    ? (zoneId ? zonePool.find(z => z.id === zoneId) ?? zonePool[0] : zonePool[seededRand(seed + 'zone', 0, zonePool.length - 1)])
    : { id: 'unknown', name: city, city: city as City, riskScore: 50, lat: 0, lon: 0 }

  const avgOrders      = seededRand(seed + 'orders', 10, 28)
  const workingHours   = seededRand(seed + 'hours', 7, 12)
  const workingDays    = workingHours >= 10 ? 6 : workingHours >= 8 ? 5 : 4
  const orderValue     = AVG_ORDER_VALUE[platform]
  const dailyIncome    = avgOrders * orderValue
  const weeklyIncome   = dailyIncome * workingDays
  const totalDeliveries = seededRand(seed + 'total', 150, 3500)
  const rating         = seededFloat(seed + 'rating', 3.8, 5.0)
  const vehiclePool    = VEHICLE_POOL[platform]
  const vehicle        = vehiclePool[seededRand(seed + 'vehicle', 0, vehiclePool.length - 1)]
  const badge          = BADGE_THRESHOLDS.find(([min]) => totalDeliveries >= min)![1]

  // Active since: 6 months to 3 years ago
  const monthsAgo = seededRand(seed + 'since', 6, 36)
  const activeSince = new Date()
  activeSince.setMonth(activeSince.getMonth() - monthsAgo)

  return {
    platform_worker_id: generatePlatformWorkerId(platform, city, phone),
    platform,
    name: '',                          // filled by user in step 1
    phone,
    city,
    zone,
    avg_orders_per_day:    avgOrders,
    avg_order_value_inr:   orderValue,
    working_hours_per_day: workingHours,
    working_days_per_week: workingDays,
    weekly_income_inr:     weeklyIncome,
    daily_income_inr:      dailyIncome,
    rating,
    total_deliveries:      totalDeliveries,
    active_since:          activeSince.toISOString().split('T')[0],
    vehicle_type:          vehicle,
    app_state:             'active_seeking',
    platform_status:       'operational',
    orders_last_10min:     seededRand(seed + 'recent', 0, 3),
    orders_p50_same_slot:  seededFloat(seed + 'p50', 0.8, 2.2),
    verified:              true,
    badge,
  }
}

// ─── Order history (last 30 days) ─────────────────────────────────────────────

export async function fetchPlatformOrderHistory(
  platform: Platform,
  phone: string,
  city: City,
  days = 30,
  availableZones?: Zone[]
): Promise<PlatformOrderHistory[]> {
  await new Promise(r => setTimeout(r, 200 + seededRand(phone + 'hist', 0, 300)))

  const seed       = `${platform}-${phone}-${city}`
  const orderValue = AVG_ORDER_VALUE[platform]
  const avgOrders  = seededRand(seed + 'orders', 10, 28)
  const zonePool   = availableZones ?? []
  const zoneName   = zonePool.length > 0
    ? zonePool[seededRand(seed + 'zone', 0, zonePool.length - 1)].name
    : city
  const orders: PlatformOrderHistory[] = []

  for (let d = 0; d < days; d++) {
    const date = new Date()
    date.setDate(date.getDate() - d)
    const dayOrders = seededRand(seed + d, Math.max(0, avgOrders - 5), avgOrders + 5)
    for (let o = 0; o < dayOrders; o++) {
      const hour = seededRand(seed + d + o, 10, 22)
      date.setHours(hour, seededRand(seed + d + o + 'min', 0, 59))
      orders.push({
        order_id:    `${PLATFORM_PREFIX[platform]}-ORD-${date.getTime().toString(36).toUpperCase()}`,
        timestamp:   date.toISOString(),
        zone:        zoneName,
        amount_inr:  seededRand(seed + d + o + 'amt', orderValue - 15, orderValue + 25),
        distance_km: seededFloat(seed + d + o + 'dist', 1.2, 8.5),
        duration_min:seededRand(seed + d + o + 'dur', 12, 45),
        status:      seededRand(seed + d + o + 'st', 0, 10) > 1 ? 'delivered' : 'cancelled',
      })
    }
  }

  return orders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

// ─── Weekly earnings summary (last 8 weeks) ───────────────────────────────────

export async function fetchPlatformEarningsSummary(
  platform: Platform,
  phone: string,
  city: City
): Promise<PlatformEarningsSummary[]> {
  await new Promise(r => setTimeout(r, 150 + seededRand(phone + 'earn', 0, 200)))

  const seed       = `${platform}-${phone}-${city}`
  const orderValue = AVG_ORDER_VALUE[platform]
  const avgOrders  = seededRand(seed + 'orders', 10, 28)
  const workDays   = seededRand(seed + 'hours', 7, 12) >= 8 ? 5 : 4
  const DAYS       = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return Array.from({ length: 8 }, (_, w) => {
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - (7 - w) * 7)
    const weekOrders   = seededRand(seed + w, avgOrders * workDays - 10, avgOrders * workDays + 10)
    const weekEarnings = weekOrders * orderValue
    const peakDayIdx   = seededRand(seed + w + 'peak', 0, 6)
    return {
      week_label:             `Week of ${weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`,
      total_orders:           weekOrders,
      total_earnings_inr:     weekEarnings,
      avg_daily_earnings_inr: Math.round(weekEarnings / workDays),
      peak_day:               DAYS[peakDayIdx],
      peak_earnings_inr:      seededRand(seed + w + 'pkamt', weekEarnings / workDays, weekEarnings / workDays * 1.6),
    }
  })
}

// ─── Real-time order signal (used by income_tracker) ─────────────────────────

export interface PlatformLiveSignal {
  worker_id: string
  orders_completed_last_10min: number
  orders_completed_p50_same_slot: number
  app_state: PlatformWorkerProfile['app_state']
  platform_status: PlatformWorkerProfile['platform_status']
  zone: string
  timestamp: string
}

export function buildLiveSignal(profile: PlatformWorkerProfile): PlatformLiveSignal {
  return {
    worker_id:                      profile.platform_worker_id,
    orders_completed_last_10min:    profile.orders_last_10min,
    orders_completed_p50_same_slot: profile.orders_p50_same_slot,
    app_state:                      profile.app_state,
    platform_status:                profile.platform_status,
    zone:                           profile.zone.name,
    timestamp:                      new Date().toISOString(),
  }
}

// ─── Platform display metadata ────────────────────────────────────────────────

export const PLATFORM_META: Record<Platform, {
  color: string
  bgColor: string
  textColor: string
  emoji: string
  apiBase: string
  partnerPortal: string
}> = {
  zomato: {
    color:         '#E23744',
    bgColor:       '#FEF2F2',
    textColor:     '#991B1B',
    emoji:         '🍔',
    apiBase:       'https://partner.zomato.com/api/v2',
    partnerPortal: 'https://partner.zomato.com',
  },
  swiggy: {
    color:         '#FC8019',
    bgColor:       '#FFF7ED',
    textColor:     '#9A3412',
    emoji:         '🛵',
    apiBase:       'https://partner.swiggy.com/api/v1',
    partnerPortal: 'https://partner.swiggy.com',
  },
  zepto: {
    color:         '#8B5CF6',
    bgColor:       '#F5F3FF',
    textColor:     '#5B21B6',
    emoji:         '⚡',
    apiBase:       'https://api.zepto.co.in/partner/v1',
    partnerPortal: 'https://partner.zepto.co.in',
  },
  blinkit: {
    color:         '#F59E0B',
    bgColor:       '#FFFBEB',
    textColor:     '#92400E',
    emoji:         '🟡',
    apiBase:       'https://api.blinkit.com/partner/v1',
    partnerPortal: 'https://partner.blinkit.com',
  },
  amazon: {
    color:         '#FF9900',
    bgColor:       '#FFFBEB',
    textColor:     '#92400E',
    emoji:         '📦',
    apiBase:       'https://logistics.amazon.in/api/v1',
    partnerPortal: 'https://flex.amazon.in',
  },
  flipkart: {
    color:         '#2874F0',
    bgColor:       '#EFF6FF',
    textColor:     '#1E40AF',
    emoji:         '🛒',
    apiBase:       'https://seller.flipkart.com/api/v1',
    partnerPortal: 'https://seller.flipkart.com',
  },
}
