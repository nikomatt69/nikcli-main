import type { APIServerConfig } from './server'
import type { HealthChecker } from '../../monitoring'
import { prometheusExporter } from '../../monitoring'

export class BunBackgroundAgentsAPIServer {
  private config: APIServerConfig
  private healthChecker?: HealthChecker
  private server?: ReturnType<typeof Bun.serve>

  constructor(config: APIServerConfig, healthChecker?: HealthChecker) {
    this.config = config
    this.healthChecker = healthChecker
  }

  async start(): Promise<void> {
    const prometheusPath =
      // @ts-expect-error legacy config typing lacks monitoring
      this.config.monitoring?.prometheus?.path || process.env.PROMETHEUS_PATH || '/metrics'
    const prometheusEnabled =
      // @ts-expect-error legacy config typing lacks monitoring
      this.config.monitoring?.prometheus?.enabled ?? process.env.PROMETHEUS_ENABLED === 'true'

    this.server = Bun.serve({
      port: this.config.port,
      hostname: '0.0.0.0',
      fetch: async (req) => {
        const url = new URL(req.url)
        const origin = req.headers.get('origin')
        const corsHeaders = this.buildCorsHeaders(origin)

        // CORS preflight
        if (req.method === 'OPTIONS') {
          return new Response(null, {
            status: 200,
            headers: {
              ...corsHeaders,
              'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-AI-Provider, X-AI-Model, X-AI-Key',
              'Access-Control-Max-Age': '86400',
            },
          })
        }

        // Metrics
        if (prometheusEnabled && url.pathname === prometheusPath) {
          return new Response(await prometheusExporter.getMetrics(), {
            status: 200,
            headers: {
              'Content-Type': prometheusExporter.getContentType(),
              ...corsHeaders,
            },
          })
        }

        // Health endpoints
        if (url.pathname === '/health') {
          if (this.healthChecker) {
            const health = await this.healthChecker.check()
            const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 500
            return Response.json(health, {
              status: statusCode,
              headers: corsHeaders,
            })
          }
          return Response.json(
            {
              status: 'healthy',
              timestamp: new Date().toISOString(),
              version: '1.5.0',
              uptime: process.uptime(),
            },
            { headers: corsHeaders }
          )
        }

        if (url.pathname === '/ready') {
          if (this.healthChecker) {
            const readiness = await this.healthChecker.readinessProbe()
            return Response.json(readiness, {
              status: readiness.ready ? 200 : 503,
              headers: corsHeaders,
            })
          }
          return Response.json({ ready: true, timestamp: new Date() }, { headers: corsHeaders })
        }

        if (url.pathname === '/live') {
          if (this.healthChecker) {
            const liveness = this.healthChecker.livenessProbe()
            return Response.json(liveness, { headers: corsHeaders })
          }
          return Response.json({ alive: true, timestamp: new Date() }, { headers: corsHeaders })
        }

        // Root info
        if (url.pathname === '/') {
          return Response.json(
            {
              name: 'NikCLI Background Agents API (Bun)',
              version: '1.5.0',
              status: 'running',
              endpoints: {
                health: '/health',
                metrics: prometheusEnabled ? prometheusPath : undefined,
              },
              timestamp: new Date().toISOString(),
            },
            { headers: corsHeaders }
          )
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders })
      },
      error(error) {
        console.error('Bun API server error:', error)
        return new Response('Internal Server Error', { status: 500 })
      },
    })

    console.log(`🚀 Bun API server running on http://0.0.0.0:${this.config.port}`)
    if (prometheusEnabled) {
      console.log(`📈 Prometheus metrics at http://0.0.0.0:${this.config.port}${prometheusPath}`)
    }
  }

  async stop(): Promise<void> {
    this.server?.stop()
  }

  private buildCorsHeaders(origin: string | null): Record<string, string> {
    const allowedOrigins = this.config.cors.origin || ['*']

    const allow =
      !origin ||
      allowedOrigins.includes('*') ||
      allowedOrigins.includes(origin) ||
      allowedOrigins.some((pattern) => {
        if (!pattern.includes('*')) return false
        const regex = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`)
        return regex.test(origin)
      })

    return allow
      ? {
          'Access-Control-Allow-Origin': origin || '*',
          'Access-Control-Allow-Credentials': this.config.cors.credentials ? 'true' : 'false',
        }
      : {}
  }
}
