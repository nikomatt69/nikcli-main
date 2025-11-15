/**
 * Ad Display Manager Service
 * Manages CPM ad display, frequency control, and user compensation tracking
 */

import { simpleConfigManager } from '../core/config-manager'
import { enhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'
import {
  AdCampaign,
  AdRotationResult,
  TOKEN_CREDIT_PER_IMPRESSION,
  DEFAULT_CPM_RATE,
  DEFAULT_AD_FREQUENCY_MINUTES,
} from '../types/ads'

export class AdDisplayManager {
  private activeCampaigns: Map<string, AdCampaign> = new Map()
  private lastAdShowTime: Map<string, Date> = new Map()
  private impressionCache: Map<string, number> = new Map()
  private updateInterval?: NodeJS.Timeout

  constructor() {
    this.initialize()
  }

  private async initialize(): Promise<void> {
    await this.loadActiveCampaigns()
    this.startPeriodicUpdate()
  }

  /**
   * Load active ad campaigns from Supabase
   */
  private async loadActiveCampaigns(): Promise<void> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) return

      const { data, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('status', 'active')
        .gte('end_date', new Date().toISOString())

      if (error) {
        console.error('Failed to load campaigns:', error.message)
        return
      }

      // Clear and repopulate
      this.activeCampaigns.clear()
      if (data && Array.isArray(data)) {
        data.forEach((campaign: any) => {
          // Skip if campaign has met its impression limit
          if (campaign.impressions_served >= campaign.budget_impressions) {
            return
          }

          this.activeCampaigns.set(campaign.id, {
            id: campaign.id,
            advertiserId: campaign.advertiser_id,
            content: campaign.content,
            ctaText: campaign.cta_text,
            ctaUrl: campaign.cta_url,
            targetAudience: campaign.target_audience || [],
            budgetImpressions: campaign.budget_impressions,
            impressionsServed: campaign.impressions_served,
            cpmRate: campaign.cpm_rate || DEFAULT_CPM_RATE,
            totalCost: campaign.total_cost,
            status: campaign.status,
            startDate: new Date(campaign.start_date),
            endDate: new Date(campaign.end_date),
            createdAt: new Date(campaign.created_at),
            updatedAt: new Date(campaign.updated_at),
            stripePaymentId: campaign.stripe_payment_id,
            conversionCount: campaign.conversion_count || 0,
          })
        })
      }
    } catch (error) {
      console.error('Error loading campaigns:', error)
    }
  }

  /**
   * Decide whether to show an ad based on frequency and user preferences
   */
  async shouldShowAd(userId: string, userTier: 'free' | 'pro'): Promise<AdRotationResult> {
    // Only show ads to free tier users
    if (userTier !== 'free') {
      return {
        shouldShow: false,
        tokenCredit: 0,
        reason: 'Pro users do not see ads',
      }
    }

    // Get user preferences from config
    const config = simpleConfigManager.getAll()
    if (!config.ads.enabled || !config.ads.userOptIn) {
      return {
        shouldShow: false,
        tokenCredit: 0,
        reason: 'Ads disabled or user not opted in',
      }
    }

    // Check frequency - no ad within last N minutes
    const lastAdTime = this.lastAdShowTime.get(userId)
    if (lastAdTime) {
      const minutesSinceLastAd = (Date.now() - lastAdTime.getTime()) / (1000 * 60)
      if (minutesSinceLastAd < config.ads.frequencyMinutes) {
        return {
          shouldShow: false,
          tokenCredit: 0,
          reason: `Frequency limit: ${Math.ceil(config.ads.frequencyMinutes - minutesSinceLastAd)} minutes remaining`,
        }
      }
    }

    // Get available campaigns
    if (this.activeCampaigns.size === 0) {
      return {
        shouldShow: false,
        tokenCredit: 0,
        reason: 'No active campaigns',
      }
    }

    // Select random active campaign
    const campaigns = Array.from(this.activeCampaigns.values())
    const selectedCampaign = campaigns[Math.floor(Math.random() * campaigns.length)]

    // Record impression and update tracking
    this.lastAdShowTime.set(userId, new Date())
    await this.trackImpression(userId, selectedCampaign)

    // Calculate token credit (25% of advertiser's pay goes to user)
    const tokenCredit = TOKEN_CREDIT_PER_IMPRESSION

    return {
      shouldShow: true,
      ad: selectedCampaign,
      tokenCredit,
    }
  }

  /**
   * Track ad impression in database and update stats
   */
  private async trackImpression(userId: string, campaign: AdCampaign): Promise<void> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) return

      // Record impression
      const { error: insertError } = await supabase.from('ad_impressions').insert({
        campaign_id: campaign.id,
        user_id: userId,
        timestamp: new Date().toISOString(),
        session_id: this.getSessionId(),
        token_credit_awarded: TOKEN_CREDIT_PER_IMPRESSION,
        ad_content: campaign.content,
      })

      if (insertError) {
        console.error('Failed to track impression:', insertError.message)
        return
      }

      // Update campaign impression count
      const newImpressions = campaign.impressionsServed + 1
      const { error: updateError } = await supabase
        .from('ad_campaigns')
        .update({ impressions_served: newImpressions })
        .eq('id', campaign.id)

      if (updateError) {
        console.error('Failed to update campaign:', updateError.message)
      }

      // Update local config
      const config = simpleConfigManager.getAll()
      config.ads.impressionCount += 1
      config.ads.tokenCreditsEarned += TOKEN_CREDIT_PER_IMPRESSION
      simpleConfigManager.setAll(config)
    } catch (error) {
      console.error('Error tracking impression:', error)
    }
  }

  /**
   * Get formatted ad content for display
   */
  getAdDisplayContent(ad: AdCampaign): string {
    const lines: string[] = []
    lines.push('📢 Sponsored')
    lines.push('')
    lines.push(`"${ad.content}"`)
    lines.push('')

    if (ad.ctaText && ad.ctaUrl) {
      lines.push(`🔗 ${ad.ctaText}`)
    }

    const tokenCredit = TOKEN_CREDIT_PER_IMPRESSION
    lines.push(`💡 +${(tokenCredit * 1000).toFixed(0)} tokens earned!`)

    return lines.join('\n')
  }

  /**
   * Get session ID (simple implementation)
   */
  private getSessionId(): string {
    // In real implementation, get from session context
    return `session-${Date.now()}`
  }

  /**
   * Start periodic update to refresh campaign list
   */
  private startPeriodicUpdate(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }

    // Refresh active campaigns every 5 minutes
    this.updateInterval = setInterval(() => {
      void this.loadActiveCampaigns()
    }, 5 * 60 * 1000)
  }

  /**
   * Get user's ad statistics
   */
  async getUserAdStats(userId: string): Promise<{
    impressions: number
    tokenCredits: number
    revenue: number
  }> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return { impressions: 0, tokenCredits: 0, revenue: 0 }
      }

      const { data, error } = await supabase
        .from('ad_impressions')
        .select('count', { count: 'exact' })
        .eq('user_id', userId)

      if (error) {
        console.error('Failed to get impressions:', error.message)
        return { impressions: 0, tokenCredits: 0, revenue: 0 }
      }

      const impressions = data?.length || 0
      const tokenCredits = impressions * TOKEN_CREDIT_PER_IMPRESSION
      const revenue = impressions * (DEFAULT_CPM_RATE / 1000) * (0.25) // 25% goes to user

      return { impressions, tokenCredits, revenue }
    } catch (error) {
      console.error('Error getting user stats:', error)
      return { impressions: 0, tokenCredits: 0, revenue: 0 }
    }
  }

  /**
   * Get platform-wide ad statistics
   */
  async getGlobalAdStats(): Promise<{
    totalImpressions: number
    totalRevenue: number
    activeCampaigns: number
    totalTokensDistributed: number
  }> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return { totalImpressions: 0, totalRevenue: 0, activeCampaigns: 0, totalTokensDistributed: 0 }
      }

      const { count: impressionCount } = await supabase
        .from('ad_impressions')
        .select('*', { count: 'exact' })

      const totalImpressions = impressionCount || 0
      const totalTokensDistributed = totalImpressions * TOKEN_CREDIT_PER_IMPRESSION

      // Calculate revenue from active campaigns
      const activeCampaigns = this.activeCampaigns.size
      let totalRevenue = 0

      for (const campaign of this.activeCampaigns.values()) {
        const impressions = campaign.impressionsServed
        totalRevenue += (impressions / 1000) * campaign.cpmRate
      }

      return {
        totalImpressions,
        totalRevenue,
        activeCampaigns,
        totalTokensDistributed,
      }
    } catch (error) {
      console.error('Error getting global stats:', error)
      return { totalImpressions: 0, totalRevenue: 0, activeCampaigns: 0, totalTokensDistributed: 0 }
    }
  }

  /**
   * Cleanup and stop periodic updates
   */
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }
    this.activeCampaigns.clear()
    this.lastAdShowTime.clear()
    this.impressionCache.clear()
  }
}

// Singleton instance
let adDisplayManagerInstance: AdDisplayManager | null = null

export function getAdDisplayManager(): AdDisplayManager {
  if (!adDisplayManagerInstance) {
    adDisplayManagerInstance = new AdDisplayManager()
  }
  return adDisplayManagerInstance
}

export const adDisplayManager = getAdDisplayManager()
