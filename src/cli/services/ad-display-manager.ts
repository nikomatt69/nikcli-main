/**
 * Ad Display Manager Service
 * Manages CPM ad display and frequency control
 * Free users always see ads, Pro users can hide ads
 */

import { simpleConfigManager } from '../core/config-manager'
import { enhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'
import { advancedUI } from '../ui/advanced-cli-ui'
import {
  AdCampaign,
  AdRotationResult,
  DEFAULT_CPM_RATE,
  DEFAULT_AD_FREQUENCY_MINUTES,
} from '../types/ads'

export class AdDisplayManager {
  private activeCampaigns: Map<string, AdCampaign> = new Map()
  private lastAdShowTime: Map<string, Date> = new Map()
  private impressionCache: Map<string, number> = new Map()
  private updateInterval?: NodeJS.Timeout
  private syncInterval?: NodeJS.Timeout
  private adCampaignsTable: string = 'ad_campaigns'
  private adImpressionsTable: string = 'ad_impressions'
  private userAdsConfigTable: string = 'user_ads_config'
  private adRotationStateTable: string = 'ad_rotation_state'

  constructor() {
    const config = simpleConfigManager.getSupabaseConfig()
    this.adCampaignsTable = config.tables.adCampaigns
    this.adImpressionsTable = config.tables.adImpressions
    this.userAdsConfigTable = config.tables.userAdsConfig
    this.adRotationStateTable = config.tables.adRotationState
    this.initialize()
  }

  private async initialize(): Promise<void> {
    await this.loadActiveCampaigns()
    this.startPeriodicUpdate()
    this.startPeriodicSync()
  }

  /**
   * Load active ad campaigns from Supabase
   */
  private async loadActiveCampaigns(): Promise<void> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) return

      const { data, error } = await supabase
        .from(this.adCampaignsTable)
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
   * Decide whether to show an ad based on user tier and frequency
   * Free users ALWAYS see ads (no opt-out), Pro users can hide ads
   */
  async shouldShowAd(userId: string, userTier: 'free' | 'pro'): Promise<AdRotationResult> {
    const config = simpleConfigManager.getAll()

    // Pro users can opt-out by hiding ads
    if (userTier === 'pro' && config.ads.userOptIn) {
      return {
        shouldShow: false,
        reason: 'Pro user has disabled ads',
      }
    }

    // Check ads enabled globally
    if (!config.ads.enabled) {
      return {
        shouldShow: false,
        reason: 'Ads globally disabled',
      }
    }

    // Check frequency - no ad within last N minutes
    const lastAdTime = this.lastAdShowTime.get(userId)
    if (lastAdTime) {
      const minutesSinceLastAd = (Date.now() - lastAdTime.getTime()) / (1000 * 60)
      if (minutesSinceLastAd < config.ads.frequencyMinutes) {
        return {
          shouldShow: false,
          reason: `Frequency limit: ${Math.ceil(config.ads.frequencyMinutes - minutesSinceLastAd)} minutes remaining`,
        }
      }
    }

    // Get available campaigns
    if (this.activeCampaigns.size === 0) {
      return {
        shouldShow: false,
        reason: 'No active campaigns',
      }
    }

    // Select random active campaign
    const campaigns = Array.from(this.activeCampaigns.values())
    const selectedCampaign = campaigns[Math.floor(Math.random() * campaigns.length)]

    // Record impression and update tracking
    this.lastAdShowTime.set(userId, new Date())
    await this.trackImpression(userId, selectedCampaign)

    return {
      shouldShow: true,
      ad: selectedCampaign,
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
      const { error: insertError } = await supabase.from(this.adImpressionsTable).insert({
        campaign_id: campaign.id,
        user_id: userId,
        timestamp: new Date().toISOString(),
        session_id: this.getSessionId(),
        ad_content: campaign.content,
      })

      if (insertError) {
        console.error('Failed to track impression:', insertError.message)
        return
      }

      // Update campaign impression count
      const newImpressions = campaign.impressionsServed + 1
      const { error: updateError } = await supabase
        .from(this.adCampaignsTable)
        .update({ impressions_served: newImpressions })
        .eq('id', campaign.id)

      if (updateError) {
        console.error('Failed to update campaign:', updateError.message)
      }
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

    return lines.join('\n')
  }

  /**
   * Display ad as structured log using advancedUI
   * Less invasive than panel-based display, integrates with other logs
   * Only displays during assistant processing (toolchains), not during idle
   */
  displayAdAsStructuredLog(ad: AdCampaign, isAssistantProcessing: boolean = false): void {
    try {
      // Only show ads when assistant is processing (during toolchains)
      if (!isAssistantProcessing) {
        return
      }

      // Start sponsored function in structured log
      advancedUI.logFunctionCall('sponsored', {
        campaign_id: ad.id,
        advertiser_id: ad.advertiserId,
      })

      // Ad content
      advancedUI.logFunctionUpdate('info', ad.content, '📢')

      // Call-to-action if available
      if (ad.ctaText && ad.ctaUrl) {
        advancedUI.logFunctionUpdate('info', `${ad.ctaText}: ${ad.ctaUrl}`, '🔗')
      }
    } catch (error) {
      console.error('Error displaying ad as structured log:', error)
    }
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
   * Start periodic sync to persist lastAdShowTime to database
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
    }

    // Sync lastAdShowTime to database every 30 seconds
    this.syncInterval = setInterval(() => {
      void this.syncLastAdShowTimeToDatabase()
    }, 30 * 1000)
  }

  /**
   * Sync lastAdShowTime from memory to database for persistence
   */
  private async syncLastAdShowTimeToDatabase(): Promise<void> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase || this.lastAdShowTime.size === 0) return

      for (const [userId, timestamp] of this.lastAdShowTime.entries()) {
        const { error } = await supabase
          .from(this.userAdsConfigTable)
          .update({ last_ad_shown_at: timestamp.toISOString() })
          .eq('user_id', userId)

        if (error) {
          console.error(`Failed to sync lastAdShowTime for user ${userId}:`, error.message)
        }
      }
    } catch (error) {
      console.error('Error syncing lastAdShowTime to database:', error)
    }
  }

  /**
   * Get user's ad impression statistics
   */
  async getUserAdStats(userId: string): Promise<{
    impressions: number
  }> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return { impressions: 0 }
      }

      const { data, error } = await supabase
        .from(this.adImpressionsTable)
        .select('count', { count: 'exact' })
        .eq('user_id', userId)

      if (error) {
        console.error('Failed to get impressions:', error.message)
        return { impressions: 0 }
      }

      const impressions = data?.length || 0
      return { impressions }
    } catch (error) {
      console.error('Error getting user stats:', error)
      return { impressions: 0 }
    }
  }

  /**
   * Get platform-wide ad statistics
   */
  async getGlobalAdStats(): Promise<{
    totalImpressions: number
    totalRevenue: number
    activeCampaigns: number
  }> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return { totalImpressions: 0, totalRevenue: 0, activeCampaigns: 0 }
      }

      const { count: impressionCount } = await supabase
        .from(this.adImpressionsTable)
        .select('*', { count: 'exact' })

      const totalImpressions = impressionCount || 0

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
      }
    } catch (error) {
      console.error('Error getting global stats:', error)
      return { totalImpressions: 0, totalRevenue: 0, activeCampaigns: 0 }
    }
  }

  /**
   * Cleanup and stop periodic updates
   */
  dispose(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
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
