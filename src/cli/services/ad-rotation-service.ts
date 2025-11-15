/**
 * Ad Rotation Service
 * Manages hybrid weighted round-robin rotation with anti-fatigue tracking
 * Global state stored in Supabase for consistency across all users
 */

import type { AdRotationState, AdCampaign } from '../types/ads'
import { enhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'

export class AdRotationService {
  private cachedRotationState: AdRotationState | null = null
  private lastStateCheckTime: number = 0
  private readonly STATE_CACHE_TTL_MS: number = 5000 // Cache rotation state for 5 seconds

  /**
   * Get current rotation state from Supabase
   * Caches locally to reduce database queries
   */
  async getRotationState(): Promise<AdRotationState | null> {
    try {
      const now = Date.now()

      // Return cached state if still valid
      if (this.cachedRotationState && (now - this.lastStateCheckTime) < this.STATE_CACHE_TTL_MS) {
        return this.cachedRotationState
      }

      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) return null

      const { data, error } = await supabase
        .from('ad_rotation_state')
        .select('*')
        .limit(1)
        .single()

      if (error || !data) return null

      // Map to typed interface
      const state: AdRotationState = {
        id: data.id,
        currentCampaignId: data.current_campaign_id,
        rotationIndex: data.rotation_index,
        weightedOrder: data.weighted_order || [],
        lastRotationAt: new Date(data.last_rotation_at),
        rotationIntervalMs: data.rotation_interval_ms || 150000,
        recentCampaigns: data.recent_campaigns || [],
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      }

      // Update cache
      this.cachedRotationState = state
      this.lastStateCheckTime = now

      return state
    } catch (error: any) {
      console.error('[AD-ROTATION] Error fetching state:', error.message)
      return null
    }
  }

  /**
   * Check if enough time has passed to rotate to next ad
   */
  async shouldRotate(): Promise<boolean> {
    try {
      const state = await this.getRotationState()
      if (!state) return true // Rotate if no state exists

      const elapsed = Date.now() - state.lastRotationAt.getTime()
      return elapsed >= state.rotationIntervalMs
    } catch {
      return true
    }
  }

  /**
   * Build weighted order of campaigns based on CPM and budget
   * Higher CPM and more remaining budget = more slots in rotation pool
   */
  async buildWeightedOrder(campaigns: AdCampaign[]): Promise<string[]> {
    try {
      if (campaigns.length === 0) return []

      // Calculate weight for each campaign
      const weights = campaigns.map((campaign) => {
        const remaining = campaign.budgetImpressions - campaign.impressionsServed
        // Weight = (remaining impressions / 1000) * CPM rate
        // This gives higher CPM campaigns more slots
        return (remaining / 1000) * campaign.cpmRate
      })

      const totalWeight = weights.reduce((sum, w) => sum + w, 0)
      if (totalWeight <= 0) return []

      const order: string[] = []

      // Allocate slots proportionally (out of 100 total slots for good distribution)
      campaigns.forEach((campaign, i) => {
        const slots = Math.max(1, Math.round((weights[i] / totalWeight) * 100))
        for (let j = 0; j < slots; j++) {
          order.push(campaign.id)
        }
      })

      // Shuffle to avoid predictable patterns
      return this.shuffle(order)
    } catch (error: any) {
      console.error('[AD-ROTATION] Error building weighted order:', error.message)
      return campaigns.map((c) => c.id) // Fallback: just all IDs
    }
  }

  /**
   * Get next campaign in weighted rotation
   * Automatically skips campaigns in recent history (anti-fatigue)
   */
  async getNextCampaign(
    campaigns: AdCampaign[],
    state: AdRotationState
  ): Promise<AdCampaign | null> {
    try {
      if (!state.weightedOrder || state.weightedOrder.length === 0) {
        return null
      }

      // Get next campaign ID from weighted order
      const nextIndex = state.rotationIndex % state.weightedOrder.length
      const nextCampaignId = state.weightedOrder[nextIndex]

      // Find campaign object
      let campaign = campaigns.find((c) => c.id === nextCampaignId)

      // If not found or in recent history, find first campaign not in recent
      if (!campaign || state.recentCampaigns.includes(nextCampaignId)) {
        campaign = campaigns.find((c) => !state.recentCampaigns.includes(c.id))
      }

      return campaign || null
    } catch (error: any) {
      console.error('[AD-ROTATION] Error getting next campaign:', error.message)
      return null
    }
  }

  /**
   * Update rotation state in Supabase
   * Called after each rotation to advance index and update recent campaigns
   */
  async updateRotationState(
    campaign: AdCampaign,
    state: AdRotationState
  ): Promise<AdRotationState | null> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) return null

      // Update recent campaigns (keep last 10)
      const recentCampaigns = [campaign.id, ...state.recentCampaigns]
        .filter((id, index, arr) => arr.indexOf(id) === index) // Deduplicate
        .slice(0, 10)

      // Call RPC function to update state (SECURITY DEFINER handles auth)
      const { data, error } = await supabase.rpc('update_ad_rotation', {
        p_campaign_id: campaign.id,
        p_new_rotation_index: state.rotationIndex + 1,
        p_new_weighted_order: JSON.stringify(state.weightedOrder),
        p_new_recent_campaigns: JSON.stringify(recentCampaigns),
      })

      if (error) {
        console.error('[AD-ROTATION] RPC error:', error.message)
        return null
      }

      // Invalidate cache to fetch fresh state on next call
      this.cachedRotationState = null
      this.lastStateCheckTime = 0

      return {
        id: data[0]?.rotation_state_id,
        currentCampaignId: data[0]?.current_campaign_id,
        rotationIndex: data[0]?.rotation_index,
        weightedOrder: state.weightedOrder,
        lastRotationAt: new Date(data[0]?.last_rotation_at),
        rotationIntervalMs: state.rotationIntervalMs,
        recentCampaigns,
        createdAt: state.createdAt,
        updatedAt: new Date(),
      }
    } catch (error: any) {
      console.error('[AD-ROTATION] Error updating state:', error.message)
      return null
    }
  }

  /**
   * Initialize rotation state if it doesn't exist
   * Creates default state with first active campaign
   */
  async initializeRotationState(campaign: AdCampaign): Promise<AdRotationState | null> {
    try {
      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) return null

      const { data, error } = await supabase
        .from('ad_rotation_state')
        .select('*')
        .limit(1)
        .maybeSingle()

      // Already exists
      if (data && !error) {
        return this.getRotationState()
      }

      // Create initial state
      const { data: newState, error: insertError } = await supabase
        .from('ad_rotation_state')
        .insert({
          current_campaign_id: campaign.id,
          rotation_index: 0,
          weighted_order: [campaign.id],
          recent_campaigns: [],
          rotation_interval_ms: 150000,
        })
        .select()
        .single()

      if (insertError || !newState) {
        console.error('[AD-ROTATION] Error initializing state:', insertError?.message)
        return null
      }

      // Invalidate cache
      this.cachedRotationState = null
      this.lastStateCheckTime = 0

      return {
        id: newState.id,
        currentCampaignId: newState.current_campaign_id,
        rotationIndex: newState.rotation_index,
        weightedOrder: newState.weighted_order || [],
        lastRotationAt: new Date(newState.last_rotation_at),
        rotationIntervalMs: newState.rotation_interval_ms,
        recentCampaigns: newState.recent_campaigns || [],
        createdAt: new Date(newState.created_at),
        updatedAt: new Date(newState.updated_at),
      }
    } catch (error: any) {
      console.error('[AD-ROTATION] Error initializing state:', error.message)
      return null
    }
  }

  /**
   * Refresh weighted order when campaigns change
   * Call this when new campaigns become active or budgets are updated
   */
  async refreshWeightedOrder(campaigns: AdCampaign[]): Promise<void> {
    try {
      const state = await this.getRotationState()
      if (!state) return

      const newWeightedOrder = await this.buildWeightedOrder(campaigns)

      const supabase = await enhancedSupabaseProvider.getClient()
      if (!supabase) return

      await supabase
        .from('ad_rotation_state')
        .update({
          weighted_order: newWeightedOrder,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.id)

      // Invalidate cache
      this.cachedRotationState = null
      this.lastStateCheckTime = 0
    } catch (error: any) {
      console.error('[AD-ROTATION] Error refreshing weighted order:', error.message)
    }
  }

  /**
   * Utility: Fisher-Yates shuffle algorithm
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  /**
   * Clear local cache (useful for testing)
   */
  clearCache(): void {
    this.cachedRotationState = null
    this.lastStateCheckTime = 0
  }
}

// Export singleton instance
export const adRotationService = new AdRotationService()
