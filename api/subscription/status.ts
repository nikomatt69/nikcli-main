import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId } = req.query

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid userId' })
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('subscription_tier, lemonsqueezy_subscription_id, openrouter_api_key, subscription_started_at, subscription_ends_at, subscription_canceled_at')
      .eq('id', userId)
      .single()

    if (error) {
      return res.status(404).json({ error: 'User not found' })
    }

    const status = {
      tier: data.subscription_tier || 'free',
      isPro: data.subscription_tier === 'pro',
      lemonsqueezySubscriptionId: data.lemonsqueezy_subscription_id,
      hasApiKey: !!data.openrouter_api_key,
      startedAt: data.subscription_started_at,
      endsAt: data.subscription_ends_at,
      canceledAt: data.subscription_canceled_at,
    }

    return res.status(200).json(status)
  } catch (error: any) {
    console.error('Status check error:', error)
    return res.status(500).json({ error: error.message })
  }
}
