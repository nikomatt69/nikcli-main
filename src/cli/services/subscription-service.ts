import chalk from 'chalk'
import { simpleConfigManager } from '../core/config-manager'
import { authProvider } from '../providers/supabase/auth-provider'
import { enhancedSupabaseProvider } from '../providers/supabase/enhanced-supabase-provider'

export interface SubscriptionStatus {
  tier: 'free' | 'pro' | 'enterprise'
  lemonsqueezySubscriptionId?: string
  openrouterApiKey?: string
  startedAt?: Date
  endsAt?: Date
  canceledAt?: Date
}

export class SubscriptionService {
  private supabase = enhancedSupabaseProvider
  private auth = authProvider
  private apiBaseUrl: string

  constructor() {
    this.apiBaseUrl =
      process.env.NIKCLI_API_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000'
  }

  /**
   * Get subscription status via Vercel API (recommended for CLI)
   */
  async getSubscriptionStatus(): Promise<SubscriptionStatus | null> {
    const currentUser = this.auth.getCurrentUser()
    if (!currentUser) {
      return null
    }

    try {
      // Try Vercel API first
      const response = await fetch(`${this.apiBaseUrl}/api/subscription/status?userId=${currentUser.id}`)

      if (response.ok) {
        const data = await response.json()
        return {
          tier: data.tier || 'free',
          lemonsqueezySubscriptionId: data.lemonsqueezySubscriptionId,
          openrouterApiKey: data.hasApiKey ? '***' : undefined, // API doesn't return full key for security
          startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
          endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
          canceledAt: data.canceledAt ? new Date(data.canceledAt) : undefined,
        }
      }

      // Fallback to direct Supabase query
      return await this.getSubscriptionStatusDirect()
    } catch (_error: any) {
      console.log(chalk.yellow(`⚠️ API unavailable, using direct Supabase query`))
      return await this.getSubscriptionStatusDirect()
    }
  }

  /**
   * Direct Supabase query (fallback)
   */
  private async getSubscriptionStatusDirect(): Promise<SubscriptionStatus | null> {
    const currentUser = this.auth.getCurrentUser()
    if (!currentUser) {
      return null
    }

    try {
      const { data, error } = await (this.supabase as any).client
        .from('user_profiles')
        .select(
          'subscription_tier, lemonsqueezy_subscription_id, openrouter_api_key, subscription_started_at, subscription_ends_at, subscription_canceled_at'
        )
        .eq('id', currentUser.id)
        .single()

      if (error) throw error

      return {
        tier: data.subscription_tier || 'free',
        lemonsqueezySubscriptionId: data.lemonsqueezy_subscription_id,
        openrouterApiKey: data.openrouter_api_key,
        startedAt: data.subscription_started_at ? new Date(data.subscription_started_at) : undefined,
        endsAt: data.subscription_ends_at ? new Date(data.subscription_ends_at) : undefined,
        canceledAt: data.subscription_canceled_at ? new Date(data.subscription_canceled_at) : undefined,
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to get subscription status: ${error.message}`))
      return null
    }
  }

  /**
   * Load Pro API key from subscription or provision new one
   */
  async loadProApiKey(): Promise<boolean> {
    const currentUser = this.auth.getCurrentUser()
    if (!currentUser) {
      return false
    }

    const status = await this.getSubscriptionStatus()

    if (status?.tier !== 'pro') {
      return false
    }

    // If API key already exists, use it
    if (status.openrouterApiKey && status.openrouterApiKey !== '***') {
      simpleConfigManager.setApiKey('openrouter', status.openrouterApiKey)
      return true
    }

    // Try to provision API key via Vercel API
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/openrouter/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.apiKey) {
          simpleConfigManager.setApiKey('openrouter', data.apiKey)
          console.log(chalk.green('✓ OpenRouter API key provisioned'))
          return true
        }
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Failed to provision API key: ${error.message}`))
    }

    // Fallback: try to fetch from direct Supabase query
    const directStatus = await this.getSubscriptionStatusDirect()
    if (directStatus?.openrouterApiKey) {
      simpleConfigManager.setApiKey('openrouter', directStatus.openrouterApiKey)
      return true
    }

    return false
  }

  async checkIsProUser(): Promise<boolean> {
    const status = await this.getSubscriptionStatus()
    return status?.tier === 'pro'
  }

  getPaymentLink(userId: string): string {
    // Payment link con user_id nel custom_data per webhook
    const paymentLink = process.env.LEMONSQUEEZY_PAYMENT_LINK
    return `${paymentLink}?checkout[custom][user_id]=${userId}`
  }

  async updateSubscriptionStatus(
    userId: string,
    tier: 'free' | 'pro' | 'enterprise',
    data: {
      lemonsqueezySubscriptionId?: string
      openrouterApiKey?: string
    }
  ): Promise<boolean> {
    try {
      const updateData: any = {
        subscription_tier: tier,
        subscription_started_at: tier !== 'free' ? new Date().toISOString() : null,
      }

      if (data.lemonsqueezySubscriptionId) updateData.lemonsqueezy_subscription_id = data.lemonsqueezySubscriptionId
      if (data.openrouterApiKey) updateData.openrouter_api_key = data.openrouterApiKey

      const { error } = await (this.supabase as any).client.from('user_profiles').update(updateData).eq('id', userId)

      if (error) throw error

      await this.logSubscriptionEvent(userId, 'subscription_updated', {
        tier,
        ...data,
      })

      return true
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to update subscription: ${error.message}`))
      return false
    }
  }

  private async logSubscriptionEvent(userId: string, eventType: string, eventData: any): Promise<void> {
    try {
      await (this.supabase as any).client.from('subscription_events').insert({
        user_id: userId,
        event_type: eventType,
        event_data: eventData,
      })
    } catch (_error) {
      // Silent fail for event logging
    }
  }
}

export const subscriptionService = new SubscriptionService()
