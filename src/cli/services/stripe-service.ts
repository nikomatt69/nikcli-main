/**
 * Payment Service for Ad Processing
 * Handles advertiser payments via LemonSqueezy, checkout sessions, and payment webhooks
 * Uses LemonSqueezy instead of Stripe (same infrastructure as subscription system)
 */

import { enhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'
import {
  AdCreationInput,
  AdCheckoutSession,
  AdCampaign,
  DEFAULT_CPM_RATE,
  MIN_IMPRESSIONS_PURCHASE,
} from '../types/ads'

export class StripeService {
  private static readonly METADATA_KEYS = {
    campaignId: 'campaign_id',
    impressions: 'impressions',
    cpmRate: 'cpm_rate',
    advertiserId: 'advertiser_id',
  }

  /**
   * Create advertiser in database (LemonSqueezy doesn't require pre-creation)
   * Uses RPC function to bypass RLS policy
   */
  async createAdvertiserCustomer(email: string, company?: string): Promise<string> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        throw new Error('Supabase client not available')
      }

      // First, try to get existing advertiser by email
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .limit(1)

      if (existing && existing.length > 0) {
        return existing[0].id
      }

      // Use RPC function to create advertiser (bypasses RLS)
      const { data, error } = await supabase.rpc('create_advertiser_account', {
        advertiser_email: email,
        advertiser_username: company || email.split('@')[0],
      })

      if (error) {
        // Fallback: if RPC not available, create via direct insert with minimal data
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('user_profiles')
          .insert({
            email,
            username: company || email.split('@')[0],
            subscription_tier: 'pro',
          })
          .select('id')
          .single()

        if (fallbackError) {
          throw new Error(`Failed to create advertiser: ${fallbackError.message}`)
        }

        return fallbackData.id
      }

      if (!data || !data.user_id) {
        throw new Error('Failed to create advertiser account')
      }

      return data.user_id
    } catch (error) {
      console.error('Failed to create advertiser:', error)
      throw error
    }
  }

  /**
   * Create checkout session for ad campaign using LemonSqueezy
   */
  async createCheckoutSession(
    advertiserId: string,
    adInput: AdCreationInput,
    email: string
  ): Promise<AdCheckoutSession> {
    try {
      const impressions = Math.max(adInput.budgetImpressions, MIN_IMPRESSIONS_PURCHASE)
      const totalCost = (impressions / 1000) * DEFAULT_CPM_RATE

      // Create campaign record first (pending payment)
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        throw new Error('Supabase client not available')
      }

      const { data: campaignData, error: campaignError } = await supabase
        .from('ad_campaigns')
        .insert({
          advertiser_id: advertiserId,
          content: adInput.content,
          cta_text: adInput.ctaText,
          cta_url: adInput.ctaUrl,
          target_audience: adInput.targetAudience,
          budget_impressions: impressions,
          impressions_served: 0,
          cpm_rate: DEFAULT_CPM_RATE,
          total_cost: totalCost,
          status: 'pending',
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + (adInput.durationDays || 30) * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single()

      if (campaignError) {
        throw new Error(`Failed to create campaign: ${campaignError.message}`)
      }

      const campaignId = campaignData.id

      // Generate LemonSqueezy checkout URL with custom data
      const paymentLink = process.env.LEMONSQUEEZY_PAYMENT_LINK
      if (!paymentLink) {
        throw new Error('LEMONSQUEEZY_PAYMENT_LINK environment variable not set')
      }

      // Custom data passed to LemonSqueezy
      const customData = {
        campaign_id: campaignId,
        advertiser_id: advertiserId,
        email: email,
        impressions: impressions,
        cpm_rate: DEFAULT_CPM_RATE,
        type: 'ad_campaign',
      }

      // Construct checkout URL with custom data
      const checkoutUrl = `${paymentLink}?checkout[custom][campaign_id]=${campaignId}&checkout[custom][advertiser_id]=${advertiserId}`

      const checkoutSession: AdCheckoutSession = {
        id: campaignId,
        campaignId,
        stripeSessionId: checkoutUrl, // Store LemonSqueezy URL
        status: 'pending',
        totalCost,
        cpmRate: DEFAULT_CPM_RATE,
        impressions,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hour expiry
      }

      // Store checkout URL in campaign for reference
      await supabase
        .from('ad_campaigns')
        .update({ stripe_session_id: checkoutUrl })
        .eq('id', campaignId)

      return checkoutSession
    } catch (error) {
      console.error('Failed to create checkout session:', error)
      throw error
    }
  }

  /**
   * Handle successful payment - activate campaign (called by webhook)
   */
  async handlePaymentSuccess(campaignId: string): Promise<AdCampaign | null> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        throw new Error('Supabase client not available')
      }

      // Update campaign status to active
      const { data: campaign, error } = await supabase
        .from('ad_campaigns')
        .update({
          status: 'active',
          stripe_payment_id: `lemonsqueezy_${Date.now()}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaignId)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to activate campaign: ${error.message}`)
      }

      return this.mapDatabaseToCampaign(campaign)
    } catch (error) {
      console.error('Failed to handle payment success:', error)
      throw error
    }
  }

  /**
   * Get payment status for a campaign (via database)
   */
  async getPaymentStatus(campaignId: string): Promise<{
    status: 'paid' | 'unpaid' | 'expired'
    amount: number
    campaignId?: string
  }> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return { status: 'expired', amount: 0 }
      }

      const { data: campaign, error } = await supabase
        .from('ad_campaigns')
        .select('status, total_cost')
        .eq('id', campaignId)
        .single()

      if (error || !campaign) {
        return { status: 'expired', amount: 0 }
      }

      const status = campaign.status === 'active' ? 'paid' : 'unpaid'
      return {
        status,
        amount: campaign.total_cost || 0,
        campaignId,
      }
    } catch (error) {
      console.error('Failed to get payment status:', error)
      return { status: 'expired', amount: 0 }
    }
  }

  /**
   * List advertiser's campaigns
   */
  async listAdvertiserCampaigns(advertiserId: string): Promise<AdCampaign[]> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return []
      }

      const { data: campaigns, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .eq('advertiser_id', advertiserId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to list campaigns:', error.message)
        return []
      }

      return (campaigns || []).map((campaign) => this.mapDatabaseToCampaign(campaign))
    } catch (error) {
      console.error('Error listing campaigns:', error)
      return []
    }
  }

  /**
   * Pause campaign
   */
  async pauseCampaign(campaignId: string): Promise<boolean> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return false
      }

      const { error } = await supabase
        .from('ad_campaigns')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', campaignId)

      return !error
    } catch (error) {
      console.error('Failed to pause campaign:', error)
      return false
    }
  }

  /**
   * Resume campaign
   */
  async resumeCampaign(campaignId: string): Promise<boolean> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return false
      }

      const { error } = await supabase
        .from('ad_campaigns')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', campaignId)

      return !error
    } catch (error) {
      console.error('Failed to resume campaign:', error)
      return false
    }
  }

  /**
   * Get campaign performance metrics
   */
  async getCampaignMetrics(campaignId: string): Promise<{
    impressions: number
    clicks?: number
    conversions?: number
    ctr: number // Click-through rate
    cpc: number // Cost per click
    roi: number // Return on investment
  }> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) {
        return { impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0, roi: 0 }
      }

      // Get impressions count
      const { data: impressions, error: impError } = await supabase
        .from('ad_impressions')
        .select('count', { count: 'exact' })
        .eq('campaign_id', campaignId)

      // Get campaign data
      const { data: campaign, error: campError } = await supabase
        .from('ad_campaigns')
        .select('total_cost, conversion_count')
        .eq('id', campaignId)
        .single()

      if (impError || campError || !campaign) {
        return { impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0, roi: 0 }
      }

      const impressionCount = impressions?.length || 0
      const conversionCount = campaign.conversion_count || 0
      const totalCost = campaign.total_cost || 0
      const ctr = impressionCount > 0 ? (conversionCount / impressionCount) * 100 : 0
      const cpc = conversionCount > 0 ? totalCost / conversionCount : 0
      const roi = totalCost > 0 ? ((conversionCount * 100 - totalCost) / totalCost) * 100 : 0

      return {
        impressions: impressionCount,
        clicks: conversionCount,
        conversions: conversionCount,
        ctr,
        cpc,
        roi,
      }
    } catch (error) {
      console.error('Error getting campaign metrics:', error)
      return { impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0, roi: 0 }
    }
  }

  /**
   * Map database row to AdCampaign interface
   */
  private mapDatabaseToCampaign(row: any): AdCampaign {
    return {
      id: row.id,
      advertiserId: row.advertiser_id,
      content: row.content,
      ctaText: row.cta_text,
      ctaUrl: row.cta_url,
      targetAudience: row.target_audience || [],
      budgetImpressions: row.budget_impressions,
      impressionsServed: row.impressions_served,
      cpmRate: row.cpm_rate || DEFAULT_CPM_RATE,
      totalCost: row.total_cost,
      status: row.status,
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      stripePaymentId: row.stripe_payment_id,
      conversionCount: row.conversion_count,
    }
  }
}

// Singleton instance
let stripeServiceInstance: StripeService | null = null

export function getStripeService(): StripeService {
  if (!stripeServiceInstance) {
    stripeServiceInstance = new StripeService()
  }
  return stripeServiceInstance
}

export const stripeService = getStripeService()
