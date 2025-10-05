import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function provisionOpenRouterApiKey(userId: string, email: string): Promise<{ key: string | null; error?: string }> {
  try {
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

    return { key: response.data.key || null }
  } catch (error: any) {
    console.error('OpenRouter provisioning error:', error.response?.data || error.message)
    return {
      key: null,
      error: error.response?.data?.error || error.message
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' })
    }

    // Verify user is Pro
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('subscription_tier, email, openrouter_api_key')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (user.subscription_tier !== 'pro') {
      return res.status(403).json({ error: 'User is not Pro tier' })
    }

    // If already has key, return it
    if (user.openrouter_api_key) {
      return res.status(200).json({
        apiKey: user.openrouter_api_key,
        message: 'Existing API key returned'
      })
    }

    // Provision new key
    const { key, error } = await provisionOpenRouterApiKey(userId, user.email || '')

    if (!key || error) {
      return res.status(500).json({ error: error || 'Failed to provision API key' })
    }

    // Update user with new key
    await supabase
      .from('user_profiles')
      .update({ openrouter_api_key: key })
      .eq('id', userId)

    // Log event
    await supabase.from('subscription_events').insert({
      user_id: userId,
      event_type: 'api_key_provisioned',
      event_data: { provider: 'openrouter' },
    })

    return res.status(200).json({
      apiKey: key,
      message: 'API key provisioned successfully'
    })
  } catch (error: any) {
    console.error('Provision API error:', error)
    return res.status(500).json({ error: error.message })
  }
}
