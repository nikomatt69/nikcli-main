// api/health.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'nikcli-github-bot',
    version: '1.5.0',
    endpoints: {
      webhook: '/v1/github/webhook',
      health: '/health',
    },
  })
}
