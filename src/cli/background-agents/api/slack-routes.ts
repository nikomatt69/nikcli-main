import { Router, Request, Response } from 'express'

/**
 * Slack API Routes
 * Manages Slack integration for background job notifications
 */

const slackRouter = Router()

// In-memory storage for stats (TODO: Move to database)
let slackStats = {
  messageCount: 0,
  lastMessageSent: null as Date | null,
}

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
slackRouter.post('/test', async (req: Request, res: Response) => {
  const { message, channel } = req.body

  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'Message is required',
    })
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL

  if (!webhookUrl) {
    return res.status(400).json({
      success: false,
      error: 'Slack webhook not configured. Set SLACK_WEBHOOK_URL in environment variables.',
    })
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
    } else {
      const errorText = await response.text()
      console.error('[Slack] Failed to send message:', errorText)

      res.status(500).json({
        success: false,
        error: `Slack API error: ${response.status} ${response.statusText}`,
      })
    }
  } catch (error) {
    console.error('[Slack] Error sending test message:', error)

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
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
    title: '❌ Job Failed',
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

export { slackRouter }
