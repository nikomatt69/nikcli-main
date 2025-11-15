import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function provisionOpenRouterApiKey(userId: string, email: string, retryCount: number = 0): Promise<{ key: string | null; error?: string }> {
  const maxRetries = 3
  const retryDelay = 1000 * (retryCount + 1) // Exponential backoff: 1s, 2s, 3s

  try {
    console.log(`[OpenRouter] Provisioning key for user ${userId} (attempt ${retryCount + 1}/${maxRetries})`)

    const response = await axios.post(
      'https://openrouter.ai/api/v1/keys',
      {
        name: `nikcli-pro-${userId.slice(0, 8)}-${Date.now()}`,
        limit: 1000,
        limit_remaining: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_ADMIN_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.data?.key) {
      throw new Error('No API key in response')
    }

    console.log(`[OpenRouter] Key provisioned successfully for user ${userId}`)
    return { key: response.data.key }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message
    console.error(`[OpenRouter] Provisioning failed (attempt ${retryCount + 1}/${maxRetries}): ${errorMsg}`)

    // Retry logic for transient errors
    if (retryCount < maxRetries - 1 && (error.response?.status === 429 || error.response?.status === 500)) {
      console.log(`[OpenRouter] Retrying in ${retryDelay}ms...`)
      await new Promise(resolve => setTimeout(resolve, retryDelay))
      return provisionOpenRouterApiKey(userId, email, retryCount + 1)
    }

    return {
      key: null,
      error: errorMsg
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify webhook signature
  const signature = req.headers['x-signature'] as string
  const body = JSON.stringify(req.body)
  const hash = createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET!)
    .update(body)
    .digest('hex')

  if (signature !== hash) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  const { meta, data } = req.body as any

  try {
    // Lemonsqueezy unifica tutti gli eventi in un solo webhook
    const eventName = meta?.event_name

    // Extract custom data from Lemonsqueezy payload
    let customData: any = {}
    try {
      const customDataStr = data?.attributes?.first_order_item?.custom_data ||
        data?.attributes?.custom_data ||
        '{}'
      customData = typeof customDataStr === 'string' ? JSON.parse(customDataStr) : customDataStr
    } catch (e) {
      console.error('Failed to parse custom_data:', e)
    }

    const userId = customData.user_id
    const email = data?.attributes?.user_email

    if (!userId) {
      console.error('No user_id in custom_data')
      return res.status(400).json({ error: 'Missing user_id' })
    }

    switch (eventName) {
      case 'order_created':
      case 'subscription_created': {
        console.log(`[Webhook] Processing ${eventName} for user ${userId}`)

        // Provision OpenRouter API key with retry logic
        const { key: apiKey, error: provisionError } = await provisionOpenRouterApiKey(userId, email)

        // Determine API key provision status
        let apiKeyStatus = 'provisioned'
        if (!apiKey) {
          apiKeyStatus = provisionError ? 'failed' : 'pending'
          console.warn(`[Webhook] API key provision failed for user ${userId}: ${provisionError}`)
        }

        // Always activate Pro subscription (even if API key provisioning fails)
        const updateData: any = {
          subscription_tier: 'pro',
          lemonsqueezy_subscription_id: data?.id,
          subscription_started_at: new Date().toISOString(),
          subscription_ends_at: data?.attributes?.renews_at,
        }

        // Only set API key if successfully provisioned
        if (apiKey) {
          updateData.openrouter_api_key = apiKey
        }

        await supabase.from('user_profiles').update(updateData).eq('id', userId)

        // Log detailed subscription event
        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'subscription_created',
          event_data: {
            subscriptionId: data?.id,
            email,
            apiKeyStatus,
            provisionError: provisionError || null,
          },
          lemonsqueezy_event_id: meta?.event_id,
        })

        console.log(`[Webhook] Subscription activated for user ${userId}, API key status: ${apiKeyStatus}`)
        break
      }

      case 'subscription_updated': {
        await supabase.from('user_profiles').update({
          subscription_ends_at: data?.attributes?.renews_at,
        }).eq('id', userId)

        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'subscription_updated',
          event_data: { subscriptionId: data?.id },
          lemonsqueezy_event_id: meta?.event_id,
        })
        break
      }

      case 'subscription_cancelled':
      case 'subscription_expired': {
        await supabase.from('user_profiles').update({
          subscription_tier: 'free',
          subscription_canceled_at: new Date().toISOString(),
          openrouter_api_key: null,
        }).eq('id', userId)

        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'subscription_canceled',
          event_data: { subscriptionId: data?.id },
          lemonsqueezy_event_id: meta?.event_id,
        })
        break
      }

      case 'subscription_payment_success': {
        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'payment_succeeded',
          event_data: {
            subscriptionId: data?.id,
            amount: data?.attributes?.total
          },
          lemonsqueezy_event_id: meta?.event_id,
        })
        break
      }

      case 'subscription_payment_failed': {
        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'payment_failed',
          event_data: { subscriptionId: data?.id },
          lemonsqueezy_event_id: meta?.event_id,
        })
        break
      }

      case 'order_created': {
        // Check if this is an ad campaign payment by looking for campaign_id in custom data
        const campaignId = customData.campaign_id
        if (campaignId) {
          // This is an ad campaign purchase
          console.log(`[Webhook] Processing ad campaign payment for campaign ${campaignId}`)

          try {
            // Activate the ad campaign by updating status to 'active' in database
            const { error: updateError } = await supabase
              .from('ad_campaigns')
              .update({
                status: 'active',
                stripe_payment_id: `lemonsqueezy_${meta?.event_id || Date.now()}`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', campaignId)

            if (updateError) {
              throw updateError
            }

            // Log ad payment event
            await supabase.from('subscription_events').insert({
              user_id: userId,
              event_type: 'ad_payment_success',
              event_data: {
                campaignId,
                advertiserId: customData.advertiser_id,
                impressions: customData.impressions,
                cpmRate: customData.cpm_rate,
                amount: data?.attributes?.total,
              },
              lemonsqueezy_event_id: meta?.event_id,
            })

            console.log(`[Webhook] Ad campaign ${campaignId} activated successfully`)
          } catch (error: any) {
            console.error(`[Webhook] Failed to process ad payment for campaign ${campaignId}:`, error)

            // Log ad payment failure
            await supabase.from('subscription_events').insert({
              user_id: userId,
              event_type: 'ad_payment_failed',
              event_data: {
                campaignId,
                error: error.message,
              },
              lemonsqueezy_event_id: meta?.event_id,
            })
          }
        }
        break
      }
    }

    return res.status(200).json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: error.message })
  }
}
