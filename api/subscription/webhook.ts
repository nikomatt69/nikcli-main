import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function provisionOpenRouterApiKey(userId: string, email: string): Promise<string | null> {
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/keys',
      {
        name: `nikcli-pro-${userId.slice(0, 8)}`,
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
    return response.data.key || null
  } catch (error: any) {
    console.error('OpenRouter provisioning failed:', error.response?.data || error.message)
    return null
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
        // Provision OpenRouter API key
        const apiKey = await provisionOpenRouterApiKey(userId, email)

        // Activate Pro subscription
        await supabase.from('user_profiles').update({
          subscription_tier: 'pro',
          lemonsqueezy_subscription_id: data?.id,
          openrouter_api_key: apiKey,
          subscription_started_at: new Date().toISOString(),
          subscription_ends_at: data?.attributes?.renews_at,
        }).eq('id', userId)

        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'subscription_created',
          event_data: { subscriptionId: data?.id, email },
          lemonsqueezy_event_id: meta?.event_id,
        })
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
    }

    return res.status(200).json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return res.status(500).json({ error: error.message })
  }
}
