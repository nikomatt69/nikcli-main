// api/slack/events.ts
import { Router, Request, Response } from 'express'
import crypto from 'node:crypto'
import { EnhancedSlackService } from '../../../integrations/slack/slack-service'

/**
 * Slack Events API endpoint
 * Handles app_mention events for @nikcli mentions in Slack
 */
export default async function handler(req: Request, res: Response) {
  // CORS handling
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Slack-Signature, X-Slack-Request-Timestamp')
    return res.status(200).end()
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Verify Slack signature
    const signature = req.headers['x-slack-signature'] as string
    const timestamp = req.headers['x-slack-request-timestamp'] as string
    // Use raw body for signature verification (set by express.json verify callback)
    const body = (req as any).rawBody || JSON.stringify(req.body)

    if (!verifySlackSignature(body, signature, timestamp)) {
      console.error('✖ Invalid Slack signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // Handle URL verification challenge (Slack setup)
    if (req.body.type === 'url_verification') {
      console.log('✓ Slack URL verification successful')
      return res.status(200).json({ challenge: req.body.challenge })
    }

    // Handle events
    if (req.body.type === 'event_callback') {
      const event = req.body.event

      // Ignore bot messages to prevent loops
      if (event.bot_id) {
        return res.status(200).json({ ok: true })
      }

      // Handle app_mention event
      if (event.type === 'app_mention') {
        // Process asynchronously to avoid Slack timeout
        processAppMention(event).catch(error => {
          console.error('✖ Error processing app_mention:', error)
        })

        // Respond quickly to Slack
        return res.status(200).json({ ok: true })
      }
    }

    return res.status(200).json({ ok: true })
  } catch (error: any) {
    console.error('✖ Slack events endpoint error:', error)
    return res.status(500).json({ error: 'Internal server error', message: error.message })
  }
}

/**
 * Verify Slack request signature
 */
function verifySlackSignature(body: string, signature: string, timestamp: string): boolean {
  if (!signature || !timestamp) {
    return false
  }

  // Check timestamp to prevent replay attacks (5 minutes)
  const currentTime = Math.floor(Date.now() / 1000)
  const requestTime = parseInt(timestamp, 10)
  if (Math.abs(currentTime - requestTime) > 300) {
    console.error('✖ Slack request timestamp too old')
    return false
  }

  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    console.error('✖ SLACK_SIGNING_SECRET not configured')
    return false
  }

  // Calculate expected signature
  const baseString = `v0:${timestamp}:${body}`
  const hash = crypto.createHmac('sha256', signingSecret).update(baseString).digest('hex')
  const expected = `v0=${hash}`

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Process app_mention event asynchronously
 */
async function processAppMention(event: any): Promise<void> {
  try {
    // Initialize Slack service
    if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_SIGNING_SECRET) {
      console.error('✖ Slack credentials not configured')
      return
    }

    const slackService = new EnhancedSlackService({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      botToken: process.env.SLACK_BOT_TOKEN,
      webhookUrl: process.env.SLACK_WEBHOOK_URL,
    })

    console.log(`📥 Processing @nikcli mention in channel ${event.channel}`)

    // Handle the mention
    await slackService.handleAppMention({
      user: event.user,
      text: event.text,
      channel: event.channel,
      ts: event.ts,
      thread_ts: event.thread_ts,
    })

    console.log(`✓ @nikcli mention processed successfully`)
  } catch (error: any) {
    console.error('✖ Error in processAppMention:', error)
    throw error
  }
}
