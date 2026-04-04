import type { Zone, PolicyTier, DCSSignals, Claim, Worker } from './types'

export function calculateZoneMultiplier(riskScore: number): number {
  if (riskScore <= 20) return 0.67
  if (riskScore <= 40) return 0.9
  if (riskScore <= 60) return 1.2
  if (riskScore <= 80) return 1.65
  return 2.33
}

export function calculatePremium(
  zoneRiskScore: number,
  claimsLast8Weeks = 0,
  activeDays = 7,
  totalDays = 7
): { baseRate: number; zoneMultiplier: number; claimFactor: number; consistencyBonus: number; finalPremium: number } {
  const baseRate = 12
  const zoneMultiplier = calculateZoneMultiplier(zoneRiskScore)
  const claimFactor = Math.min(1.0 + claimsLast8Weeks * 0.2, 1.8)
  const consistency = activeDays / totalDays
  const consistencyBonus = consistency >= 0.85 ? 0.85 : consistency >= 0.7 ? 0.9 : consistency >= 0.5 ? 0.95 : 1.0
  const finalPremium = Math.round(baseRate * zoneMultiplier * claimFactor * consistencyBonus)
  return { baseRate, zoneMultiplier, claimFactor, consistencyBonus,
    finalPremium: Math.max(8, Math.min(28, finalPremium)) }
}

export function calculateRiskScore(zone: Zone, avgOrders: number, workingHours: number): number {
  let score = zone.riskScore
  if (workingHours >= 10) score += 5
  if (workingHours >= 12) score += 5
  if (avgOrders >= 20) score += 3
  if (avgOrders >= 25) score += 3
  return Math.min(100, Math.max(0, score))
}

export function calculateFraudScore(claim: Partial<Claim>, _worker: Worker, signals: DCSSignals): number {
  let score = 0
  if (signals.weather < 50 && claim.trigger === 'rain') score += 30
  if (signals.aqi < 50 && claim.trigger === 'aqi') score += 30
  if ((claim.lossPercent || 0) > 90) score += 10
  return Math.min(100, score)
}

export function getTierFromPremium(premium: number): PolicyTier {
  if (premium <= 12) return 'basic'
  if (premium <= 20) return 'standard'
  return 'premium'
}
