import { simpleConfigManager } from '../core/config-manager'
import { enhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'
import { adRotationService } from '../services/ad-rotation-service'
import { adDisplayManager } from '../services/ad-display-manager'

/**
 * AdsManager - Handles ads display and rotation
 * Extracted from lines 5773-5922 in nik-cli.ts
 */
export class AdsManager {
  private nikCLI: any
  private adCampaignsTable = 'ad_campaigns'
  private adImpressionsTable = 'ad_impressions'
  private adsTimer: NodeJS.Timeout | undefined

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async showAdsAsStructuredLog(): Promise<void> {
    try {
      // Respect global ads configuration and Pro opt-out
      const config = simpleConfigManager.getAll()

      if (!config.ads?.enabled) {
        return
      }

      // Determine effective tier (prefer auth profile over config.ads.tier)
      let tier: 'free' | 'pro' = (config.ads.tier as 'free' | 'pro') || 'free'
      try {
        const { authProvider } = await import('../providers/supabase/auth-provider')
        const profile = authProvider.getCurrentProfile()
        if (profile) {
          tier = profile.subscription_tier === 'free' ? 'free' : 'pro'
        }
      } catch {
        // If auth provider is unavailable, fall back to config value
      }

      // For Pro/Enterprise users, honor /ads off (userOptIn === true means ads hidden)
      if (tier !== 'free' && config.ads.userOptIn) {
        return
      }

      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) return

      const nowIso = new Date().toISOString()
      const { data: campaigns, error } = await supabase
        .from(this.adCampaignsTable)
        .select('*')
        .eq('status', 'active')
        .gte('end_date', nowIso)
        .lte('start_date', nowIso)

      if (error || !campaigns || campaigns.length === 0) return

      // Filter campaigns that haven't reached impression limit
      const availableCampaigns = campaigns.filter(
        (campaign: any) => campaign.impressions_served < campaign.budget_impressions
      )

      if (availableCampaigns.length === 0) return

      // Map to AdCampaign type
      const typedCampaigns = availableCampaigns.map((c: any) => ({
        id: c.id,
        advertiserId: c.advertiser_id,
        content: c.content,
        ctaText: c.cta_text,
        ctaUrl: c.cta_url,
        targetAudience: c.target_audience || ['all'],
        budgetImpressions: c.budget_impressions,
        impressionsServed: c.impressions_served,
        cpmRate: c.cpm_rate,
        totalCost: c.total_cost,
        status: c.status,
        startDate: new Date(c.start_date),
        endDate: new Date(c.end_date),
        createdAt: new Date(c.created_at),
        updatedAt: new Date(c.updated_at),
        stripePaymentId: c.stripe_payment_id,
        conversionCount: c.conversion_count,
      }))

      // Get rotation state
      let rotationState = await adRotationService.getRotationState()
      if (!rotationState) {
        rotationState = await adRotationService.initializeRotationState(typedCampaigns[0])
      }

      // Check if should rotate
      const shouldRotate = await adRotationService.shouldRotate()
      let selectedAd: any = null

      if (shouldRotate && rotationState) {
        const weightedOrder = await adRotationService.buildWeightedOrder(typedCampaigns)
        rotationState.weightedOrder = weightedOrder
        selectedAd = await adRotationService.getNextCampaign(typedCampaigns, rotationState)

        if (selectedAd) {
          const updatedState = await adRotationService.updateRotationState(selectedAd, rotationState)
          if (updatedState) rotationState = updatedState
        }
      } else if (rotationState?.currentCampaignId) {
        selectedAd = typedCampaigns.find((c) => c.id === rotationState!.currentCampaignId) || null
      }

      // Fallback to first available
      if (!selectedAd && typedCampaigns.length > 0) {
        selectedAd = typedCampaigns[0]
      }

      if (!selectedAd) return

      // Track impression
      const { randomUUID } = await import('node:crypto')
      const userId = randomUUID()
      await supabase.from(this.adImpressionsTable).insert({
        campaign_id: selectedAd.id,
        user_id: userId,
        timestamp: new Date().toISOString(),
        session_id: `session-${Date.now()}`,
        ad_content: selectedAd.content,
      })

      // Increment impressions
      const newImpressions = (selectedAd.impressions_served || 0) + 1
      await supabase
        .from(this.adCampaignsTable)
        .update({ impressions_served: newImpressions })
        .eq('id', selectedAd.id)

      // Display as structured log
      adDisplayManager.displayAdAsStructuredLog(selectedAd)
    } catch (error: any) {
      // Silently fail - ads should never break user experience
    }
  }

  startAdsTimer(): void {
    // Clear any existing timer
    this.stopAdsTimer()

    // Show first ad after 30 seconds
    setTimeout(() => {
      void this.showAdsAsStructuredLog()
    }, 30 * 1000)

    // Then show ads every 5 minutes
    this.adsTimer = setInterval(() => {
      void this.showAdsAsStructuredLog()
    }, 5 * 60 * 1000)
  }

  stopAdsTimer(): void {
    if (this.adsTimer) {
      clearInterval(this.adsTimer)
      this.adsTimer = undefined
    }
  }
}
