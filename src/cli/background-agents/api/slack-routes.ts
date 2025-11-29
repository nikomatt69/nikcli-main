import { Router, Request, Response } from 'express'
import crypto from 'node:crypto'

/**
 * Slack API Routes
 * Manages Slack integration for background job notifications and Events API
 */

const slackRouter = Router()

// In-memory storage for stats (TODO: Move to database)
let slackStats = {
  messageCount: 0,
  lastMessageSent: null as Date | null,
}

// Deduplication cache for Slack events (prevents processing retry events)
const processedEvents = new Map<string, number>()
const DEDUP_WINDOW_MS = 60000 // 1 minute

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, timestamp] of processedEvents.entries()) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      processedEvents.delete(key)
    }
  }
}, 300000)

/**
 * GET /v1/slack/config
 * Get current Slack configuration from environment
 */
slackRouter.get('/config', (req: Request, res: Response) => {
  const config = {
    enabled: process.env.SLACK_TASK_NOTIFICATIONS === 'true',
    webhookUrl: process.env.SLACK_WEBHOOK_URL ? '***masked***' : undefined,
    channel: process.env.SLACK_CHANNEL || undefined,
    username: process.env.SLACK_USERNAME || 'NikCLI Bot',
    taskNotifications: process.env.SLACK_TASK_NOTIFICATIONS === 'true',
  }

  res.json(config)
})

/**
 * GET /v1/slack/status
 * Get Slack connection status
 */
slackRouter.get('/status', (req: Request, res: Response) => {
  const isConfigured = !!process.env.SLACK_WEBHOOK_URL
  const isEnabled = process.env.SLACK_TASK_NOTIFICATIONS === 'true'

  const status = {
    isConnected: isConfigured && isEnabled,
    channel: process.env.SLACK_CHANNEL || undefined,
    username: process.env.SLACK_USERNAME || 'NikCLI Bot',
    messageCount: slackStats.messageCount,
    lastMessageSent: slackStats.lastMessageSent?.toISOString(),
  }

  res.json(status)
})

/**
 * POST /v1/slack/config
 * Update Slack configuration (runtime toggles)
 */
slackRouter.post('/config', (req: Request, res: Response) => {
  const { taskNotifications } = req.body

  // Note: This only updates runtime state, not env vars
  // In production, you might want to persist this to a database

  if (typeof taskNotifications === 'boolean') {
    // For now, just return updated config
    // In production, save to database
    const config = {
      enabled: taskNotifications,
      webhookUrl: process.env.SLACK_WEBHOOK_URL ? '***masked***' : undefined,
      channel: process.env.SLACK_CHANNEL || undefined,
      username: process.env.SLACK_USERNAME || 'NikCLI Bot',
      taskNotifications,
    }

    res.json(config)
  } else {
    res.status(400).json({
      error: 'Invalid request',
      message: 'taskNotifications must be a boolean',
    })
  }
})

/**
 * POST /v1/slack/test
 * Send a test message to Slack
 */
slackRouter.post('/test', async (req: Request, res: Response): Promise<void> => {
  const { message, channel } = req.body

  if (!message) {
    res.status(400).json({
      success: false,
      error: 'Message is required',
    })
    return
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    res.status(400).json({
      success: false,
      error: 'Slack webhook not configured. Set SLACK_WEBHOOK_URL in environment variables.',
    })
    return
  }

  try {
    // Prepare Slack message payload
    const payload = {
      text: message,
      channel: channel || process.env.SLACK_CHANNEL,
      username: process.env.SLACK_USERNAME || 'NikCLI Bot',
      icon_emoji: ':robot_face:',
    }

    // Send to Slack webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      // Update stats
      slackStats.messageCount++
      slackStats.lastMessageSent = new Date()

      const timestamp = Date.now().toString()

      res.json({
        success: true,
        timestamp,
        message: 'Test message sent successfully',
      })
      return
    } else {
      const errorText = await response.text()
      console.error('[Slack] Failed to send message:', errorText)

      res.status(500).json({
        success: false,
        error: `Slack API error: ${response.status} ${response.statusText}`,
      })
      return
    }
  } catch (error) {
    console.error('[Slack] Error sending test message:', error)

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return
  }
})

/**
 * DELETE /v1/slack/disconnect
 * Disconnect Slack integration (clear stats)
 */
slackRouter.delete('/disconnect', (req: Request, res: Response) => {
  // Reset stats
  slackStats = {
    messageCount: 0,
    lastMessageSent: null,
  }

  res.json({
    success: true,
    message: 'Slack integration stats cleared',
  })
})

/**
 * POST /v1/slack/events
 * Slack Events API endpoint - receives app_mention and message events from Slack
 * This is the public endpoint that Slack will POST events to
 */
slackRouter.post('/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-slack-signature'] as string
    const timestamp = req.headers['x-slack-request-timestamp'] as string
    // Use raw body for signature verification (set by express.json verify callback)
    const body = (req as any).rawBody || JSON.stringify(req.body)

    // Verify Slack signature
    if (!verifySlackSignature(body, signature, timestamp)) {
      console.error('✖ Invalid Slack signature')
      res.status(401).json({ error: 'Invalid signature' })
      return
    }

    // Handle URL verification challenge (Slack setup)
    if (req.body.type === 'url_verification') {
      console.log('✅ Slack URL verification successful')
      res.status(200).json({ challenge: req.body.challenge })
      return
    }

    // Handle events
    if (req.body.type === 'event_callback') {
      const event = req.body.event

      // Deduplication: Check if we've already processed this event
      const eventId = `${event.type}_${event.ts}_${event.channel}`
      if (processedEvents.has(eventId)) {
        // Already processed, ignore silently (Slack retry)
        res.status(200).json({ ok: true })
        return
      }

      // Mark event as processed
      processedEvents.set(eventId, Date.now())

      // Ignore bot messages to prevent loops
      if (event.bot_id) {
        res.status(200).json({ ok: true })
        return
      }

      // Handle app_mention event
      if (event.type === 'app_mention') {
        // Process asynchronously to avoid Slack timeout
        processAppMention(event).catch(error => {
          console.error('✖ Error processing app_mention:', error)
        })

        // Respond quickly to Slack
        res.status(200).json({ ok: true })
        return
      }
    }

    res.status(200).json({ ok: true })
  } catch (error: any) {
    console.error('✖ Slack events endpoint error:', error)
    res.status(500).json({ error: 'Internal server error', message: error.message })
  }
})

/**
 * Helper function to send notification to Slack
 * Can be called from job lifecycle events
 */
export async function sendSlackNotification(params: {
  title: string
  message: string
  color?: 'good' | 'warning' | 'danger'
  fields?: Array<{ title: string; value: string; short?: boolean }>
}): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  const isEnabled = process.env.SLACK_TASK_NOTIFICATIONS === 'true'

  if (!webhookUrl || !isEnabled) {
    return false
  }

  try {
    const payload = {
      username: process.env.SLACK_USERNAME || 'NikCLI Bot',
      channel: process.env.SLACK_CHANNEL,
      icon_emoji: ':robot_face:',
      attachments: [
        {
          color: params.color || 'good',
          title: params.title,
          text: params.message,
          fields: params.fields || [],
          footer: 'NikCLI Background Agents',
          footer_icon: 'https://platform.slack-edge.com/img/default_application_icon.png',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.ok) {
      slackStats.messageCount++
      slackStats.lastMessageSent = new Date()
      return true
    }

    return false
  } catch (error) {
    console.error('[Slack] Failed to send notification:', error)
    return false
  }
}

/**
 * Job event notification helpers
 */
export async function notifyJobCompleted(jobId: string, repo: string, duration: number) {
  await sendSlackNotification({
    title: '✅ Job Completed Successfully',
    message: `Background job completed for repository \`${repo}\``,
    color: 'good',
    fields: [
      { title: 'Job ID', value: jobId, short: true },
      { title: 'Repository', value: repo, short: true },
      { title: 'Duration', value: `${Math.round(duration / 1000)}s`, short: true },
    ],
  })
}

export async function notifyJobFailed(jobId: string, repo: string, error: string) {
  await sendSlackNotification({
    title: '✖ Job Failed',
    message: `Background job failed for repository \`${repo}\``,
    color: 'danger',
    fields: [
      { title: 'Job ID', value: jobId, short: true },
      { title: 'Repository', value: repo, short: true },
      { title: 'Error', value: error.substring(0, 200), short: false },
    ],
  })
}

export async function notifyJobStarted(jobId: string, repo: string, task: string) {
  await sendSlackNotification({
    title: '🚀 Job Started',
    message: `Background job started for repository \`${repo}\``,
    color: 'warning',
    fields: [
      { title: 'Job ID', value: jobId, short: true },
      { title: 'Repository', value: repo, short: true },
      { title: 'Task', value: task.substring(0, 200), short: false },
    ],
  })
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

    const { EnhancedSlackService } = await import('../../integrations/slack/slack-service')
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

    console.log(`✅ @nikcli mention processed successfully`)
  } catch (error: any) {
    console.error('✖ Error in processAppMention:', error)
    throw error
  }
}

export { slackRouter }
