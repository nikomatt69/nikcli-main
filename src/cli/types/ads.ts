/**
 * Advertising System Types
 * CPM-based revenue model with token credit compensation for users
 */

export interface AdCampaign {
  id: string
  advertiserId: string
  content: string // Max 280 chars
  ctaText?: string
  ctaUrl?: string
  targetAudience: string[]
  budgetImpressions: number
  impressionsServed: number
  cpmRate: number // Default $3.00
  totalCost: number
  status: 'pending' | 'active' | 'paused' | 'completed'
  startDate: Date
  endDate: Date
  createdAt: Date
  updatedAt: Date
  stripePaymentId?: string
  conversionCount?: number // Optional: click tracking
}

export interface AdImpression {
  id: string
  campaignId: string
  userId: string
  timestamp: Date
  sessionId: string
  tokenCreditAwarded: number // Fixed: 0.02 tokens per impression
  adContent: string
}

export interface UserAdPreferences {
  userId: string
  adsEnabled: boolean
  frequencyMinutes: number // Default 5 (max 1 ad per 5 min)
  impressionCount: number
  tokenCreditsEarned: number
  lastAdShownAt?: Date
  tier: 'free' | 'pro'
  optInDate?: Date
}

export interface AdMetrics {
  userId: string
  impressions: number
  tokenCreditsEarned: number
  lastAdShown?: Date
  currentCPM: number
  revenueContribution: number // User's revenue contribution to nikcli
}

export interface AdDisplayOptions {
  userId: string
  userTier: 'free' | 'pro'
  sessionId: string
  forceShow?: boolean // For testing
}

export interface AdvertiserProfile {
  id: string
  email: string
  company?: string
  stripeCustomerId: string
  totalSpent: number
  activeCampaigns: number
  totalImpressions: number
  createdAt: Date
  paymentStatus: 'pending' | 'verified' | 'suspended'
}

export interface AdCreationInput {
  content: string // Max 280 chars
  ctaText?: string
  ctaUrl?: string
  targetAudience: string[] // e.g., ['developers', 'ai-users', 'indie-hackers']
  budgetImpressions: number
  durationDays?: number // Default 30 days
}

export interface AdCheckoutSession {
  id: string
  campaignId: string
  stripeSessionId: string
  status: 'pending' | 'completed' | 'expired'
  totalCost: number
  cpmRate: number
  impressions: number
  createdAt: Date
  expiresAt: Date
}

export interface AdStatistics {
  totalImpressions: number
  totalRevenue: number
  averageCPM: number
  activeCampaigns: number
  topAdvertisers: Array<{
    id: string
    company: string
    impressions: number
    cost: number
  }>
  userStats: {
    freeUsersWithAds: number
    totalTokensDistributed: number
    averageTokensPerUser: number
  }
}

export interface AdRotationResult {
  shouldShow: boolean
  ad?: AdCampaign
  tokenCredit: number
  reason?: string
}

export interface AdRotationState {
  id: string
  currentCampaignId: string | null
  rotationIndex: number
  weightedOrder: string[] // Array of campaign IDs in weighted rotation order
  lastRotationAt: Date
  rotationIntervalMs: number // Time before next rotation (default 150000 = 2.5 min)
  recentCampaigns: string[] // Last 10 campaign IDs shown for anti-fatigue
  createdAt: Date
  updatedAt: Date
}

export const TOKEN_CREDIT_PER_IMPRESSION = 0.02 // Tokens per ad impression
export const DEFAULT_CPM_RATE = 3.0 // $3 per 1000 impressions
export const MIN_IMPRESSIONS_PURCHASE = 1000
export const MAX_AD_LENGTH = 280
export const DEFAULT_AD_FREQUENCY_MINUTES = 5
export const TOKEN_DISCOUNT_RATIO = 0.25 // Users get 25% of revenue as credits
