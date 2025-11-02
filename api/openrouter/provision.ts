import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function provisionOpenRouterApiKey(userId: string, email: string): Promise<{ key: string | null; error?: string }> {
  try {
    console.log(`[Provision API] Creating OpenRouter key for user ${userId}`)

    if (!process.env.OPENROUTER_ADMIN_API_KEY) {
      throw new Error('OPENROUTER_ADMIN_API_KEY not configured')
    }

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
        timeout: 10000, // 10 second timeout
      }
    )

    if (!response.data?.key) {
      throw new Error('No API key returned in response')
    }

    console.log(`[Provision API] Successfully provisioned key for user ${userId}`)
    return { key: response.data.key }
  } catch (error: any) {
    const errorMsg = error.response?.data?.error || error.message
    console.error(`[Provision API] Error provisioning key for user ${userId}: ${errorMsg}`)
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

  try {
    const { userId } = req.body

    if (!userId) {
      console.error('[Provision API] Missing userId in request')
      return res.status(400).json({ error: 'Missing userId' })
    }

    console.log(`[Provision API] Request to provision key for user ${userId}`)

    // Verify user is Pro
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('subscription_tier, email, openrouter_api_key')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      console.error(`[Provision API] User ${userId} not found:`, userError?.message)
      return res.status(404).json({ error: 'User not found' })
    }

    if (user.subscription_tier !== 'pro') {
      console.warn(`[Provision API] User ${userId} is not Pro tier (${user.subscription_tier})`)
      return res.status(403).json({ error: 'User is not Pro tier' })
    }

    // If already has key, return it
    if (user.openrouter_api_key) {
      console.log(`[Provision API] User ${userId} already has API key`)
      return res.status(200).json({
        apiKey: user.openrouter_api_key,
        message: 'Existing API key returned'
      })
    }

    // Provision new key
    const { key, error } = await provisionOpenRouterApiKey(userId, user.email || '')

    if (!key) {
      console.error(`[Provision API] Failed to provision key for user ${userId}: ${error}`)
      return res.status(500).json({ error: error || 'Failed to provision API key' })
    }

    // Update user with new key
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ openrouter_api_key: key })
      .eq('id', userId)

    if (updateError) {
      console.error(`[Provision API] Failed to save key for user ${userId}:`, updateError.message)
      return res.status(500).json({ error: 'Failed to save API key' })
    }

    // Log event
    await supabase.from('subscription_events').insert({
      user_id: userId,
      event_type: 'api_key_provisioned',
      event_data: { provider: 'openrouter' },
    })

    console.log(`[Provision API] Successfully provisioned and saved key for user ${userId}`)
    return res.status(200).json({
      apiKey: key,
      message: 'API key provisioned successfully'
    })
  } catch (error: any) {
    console.error('[Provision API] Unexpected error:', error)
    return res.status(500).json({ error: error.message })
  }
}
