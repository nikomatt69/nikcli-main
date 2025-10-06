// api/github/webhook.ts

import type { Response } from 'express'
import type { GitHubBotConfig } from '../../src/cli/github-bot/types'
import { GitHubWebhookHandler } from '../../src/cli/github-bot/webhook-handler'

// Initialize GitHub Bot configuration
const config: GitHubBotConfig = {
  githubToken: process.env.GITHUB_TOKEN!,
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET!,
  appId: process.env.GITHUB_APP_ID!,
  privateKey: process.env.GITHUB_PRIVATE_KEY!,
  installationId: process.env.GITHUB_INSTALLATION_ID!,
}

// Initialize webhook handler
let webhookHandler: GitHubWebhookHandler

function getWebhookHandler() {
  if (!webhookHandler) {
    webhookHandler = new GitHubWebhookHandler(config)
  }
  return webhookHandler
}

export default async function handler(req: Request, res: Response) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-GitHub-Event, X-Hub-Signature-256')
    res.status(200).end()
    return
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are supported',
    })
    return
  }

  try {
    console.log('🔌 GitHub webhook received:', {
      method: req.method,
      headers: {
        'x-github-event': req.headers.get('x-github-event'),
        'x-hub-signature-256': req.headers.get('x-hub-signature-256') ? 'present' : 'missing',
      },
    })

    // Validate required environment variables
    const requiredEnvVars = [
      'GITHUB_TOKEN',
      'GITHUB_WEBHOOK_SECRET',
      'GITHUB_APP_ID',
      'GITHUB_PRIVATE_KEY',
      'GITHUB_INSTALLATION_ID',
    ]

    const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar])
    if (missingVars.length > 0) {
      console.error('❌ Missing environment variables:', missingVars)
      return res.status(500).json({
        error: 'Configuration error',
        message: `Missing required environment variables: ${missingVars.join(', ')}`,
      })
    }

    // Create mock Express request/response objects for compatibility
    const mockReq = {
      headers: req.headers,
      body: req.body,
      // Forward rawBody if provided by Vercel/Next (to enable HMAC verification)
      rawBody: (req as any).rawBody || (typeof req.body === 'string' ? req.body : undefined),
      method: req.method,
      url: req.url,
    } as any

    const mockRes = {
      status: (code: number) => {
        res.status(code)
        return {
          json: (data: any) => {
            console.log(`📤 Response: ${code}`, data)
            res.json(data)
          },
          end: () => res.end(),
        }
      },
      json: (data: any) => res.json(data),
      end: () => res.end(),
    } as any

    // Handle webhook using existing handler
    const handler = getWebhookHandler()
    await handler.handleWebhook(mockReq, mockRes)
    return
  } catch (error) {
    console.error('❌ Webhook handler error:', error)

    return res.status(500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development'
          ? error instanceof Error
            ? error.message
            : 'Unknown error'
          : 'Something went wrong processing the webhook',
    })
  }
}
