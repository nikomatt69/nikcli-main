import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
        return res.status(200).end()
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
        if (!supabaseUrl || !supabaseAnonKey) {
            return res.status(500).json({ error: 'Supabase not configured' })
        }

        const auth = req.headers.authorization || ''
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
        if (!token) {
            return res.status(401).json({ error: 'Missing token' })
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey)
        const { data, error } = await supabase.auth.getUser(token)
        if (error || !data?.user) {
            return res.status(401).json({ error: 'Invalid token' })
        }

        const userId = data.user.id
        const tier = (data.user.user_metadata?.subscription_tier || 'free') as 'free' | 'pro' | 'enterprise'

        const poolEnv = tier === 'pro' || tier === 'enterprise'
            ? process.env.NIKCLI_OPENROUTER_KEYS_PRO
            : process.env.NIKCLI_OPENROUTER_KEYS_FREE

        const pool = (poolEnv || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)

        if (pool.length === 0) {
            return res.status(503).json({ error: 'Key pool empty' })
        }

        const idx = Math.abs(hash(userId)) % pool.length
        const key = pool[idx]

        // Never log keys
        return res.status(200).json({ key })
    } catch (_e: any) {
        return res.status(500).json({ error: 'Internal error' })
    }
}

function hash(s: string) {
    let h = 0
    for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i)
        h |= 0
    }
    return h
}


