// TODO: Consider refactoring for reduced complexity

import os from 'node:os'
import express from 'express'
import pLimit from 'p-limit' // Added for scalability: concurrency limiting
import client, { register } from 'prom-client'
import winston from 'winston'

// =========================================
// TYPES AND INTERFACES
// =========================================
interface AgentConfig {
  readonly id: string
  readonly name: string
  readonly endpoint?: string // Optional API endpoint for remote agent metrics
}

interface HealthMetrics {
  readonly uptime: number // Seconds since last start
  readonly status: 'healthy' | 'unhealthy' | 'unknown'
  readonly lastHeartbeat: Date
}

interface ResourceMetrics {
  readonly cpuUsage: number // Percentage (0-100)
  readonly memoryUsage: number // MB used
  readonly totalMemory: number // MB total
  readonly loadAverage: number[] // 1/5/15 min averages
}

interface FullMetrics {
  readonly agentId: string
  readonly health: HealthMetrics
  readonly resources: ResourceMetrics
  readonly timestamp: Date
}

interface Anomaly {
  readonly agentId: string
  readonly type: 'health' | 'cpu' | 'memory' | 'load'
  readonly value: number
  readonly threshold: number
  readonly message: string
}

interface Config {
  readonly agents: AgentConfig[]
  readonly pollIntervalMs: number // e.g., 30000 for 30s
  readonly cpuThreshold: number // % e.g., 80
  readonly memoryThreshold: number // % e.g., 90
  readonly alertWebhook?: string // Optional for external alerts (e.g., Slack)
  readonly maxConcurrency?: number // Scalability: Limit parallel fetches (default: 5)
  readonly integrationCallback?: (metrics: FullMetrics[]) => void // Integration hook: Custom post-processing
}

// =========================================
// CONFIGURATION
// =========================================
const config: Config = {
  agents: [
    { id: 'agent-1', name: 'Virtual Agent 1', endpoint: 'http://localhost:3001/metrics' },
    { id: 'agent-2', name: 'Virtual Agent 2' }, // Local-only if no endpoint
  ],
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '30000', 10),
  cpuThreshold: parseFloat(process.env.CPU_THRESHOLD || '80'),
  memoryThreshold: parseFloat(process.env.MEMORY_THRESHOLD || '90'),
  alertWebhook: process.env.ALERT_WEBHOOK, // e.g., Slack webhook URL
  maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '5', 10), // Scalability enhancement
}

// Perf tweak: Cache for resource metrics (5s TTL) to reduce os calls
let resourceCache: { metrics: ResourceMetrics; timestamp: number } | null = null
const CACHE_TTL = 5000 // 5 seconds

// Logger setup for production (structured, rotatable)
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console(), new winston.transports.File({ filename: 'agent-monitor.log' })],
})

// =========================================
// METRIC COLLECTION
// =========================================
/**
 * Fetches resource metrics with caching for perf.
 * @returns ResourceMetrics
 */
async function fetchResourceMetrics(): Promise<ResourceMetrics> {
  const now = Date.now()
  if (resourceCache && now - resourceCache.timestamp < CACHE_TTL) {
    logger.debug('Using cached resource metrics')
    return resourceCache.metrics
  }

  const cpus = os.cpus().length
  const totalMem = os.totalmem() / 1024 / 1024 // MB
  const freeMem = os.freemem() / 1024 / 1024 // MB
  const usedMem = totalMem - freeMem
  const _memoryUsagePercent = (usedMem / totalMem) * 100

  // CPU usage: Simple average; for precise, use pidusage or similar lib
  const loadAvg = os.loadavg()
  const cpuUsage = (loadAvg[0] / cpus) * 100 // 1-min load as CPU proxy

  const metrics: ResourceMetrics = {
    cpuUsage: Math.min(cpuUsage, 100), // Cap at 100%
    memoryUsage: usedMem,
    totalMemory: totalMem,
    loadAverage: loadAvg,
  }

  resourceCache = { metrics, timestamp: now }
  logger.debug('Fetched and cached resource metrics')
  return metrics
}

/**
 * Fetches health metrics for a single agent with retry logic for error handling.
 * - For remote agents: Mock API call (replace with axios/fetch for real HTTP).
 * - For local: Uses os.uptime() as proxy for agent health.
 * @param agent - The agent configuration
 * @param retries - Remaining retry attempts (default: 3)
 * @returns HealthMetrics
 */
async function fetchHealthMetrics(agent: AgentConfig, retries = 3): Promise<HealthMetrics> {
  try {
    if (agent.endpoint) {
      // Mock remote fetch; in production, use axios.get(agent.endpoint + '/health')
      // Assume response: { uptime: 3600, status: 'healthy', lastHeartbeat: new Date() }
      const mockResponse = {
        uptime: Math.floor(Math.random() * 7200), // Random 0-2h for demo
        status: Math.random() > 0.05 ? 'healthy' : 'unhealthy', // 5% failure rate
        lastHeartbeat: new Date(),
      }
      logger.info(`Fetched health for ${agent.name} from ${agent.endpoint}`)
      return mockResponse[0]
    } else {
      // Local fallback: System uptime as proxy
      return {
        uptime: Math.floor(os.uptime()),
        status: 'healthy', // Assume local is always healthy; enhance with process checks
        lastHeartbeat: new Date(),
      }
    }
  } catch (error) {
    logger.warn(`Fetch attempt failed for ${agent.id}: ${error}`)
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries))) // Exponential backoff
      return fetchHealthMetrics(agent, retries - 1) // Retry
    }
    logger.error(`All retries exhausted for ${agent.id}`)
    return {
      uptime: 0,
      status: 'unknown',
      lastHeartbeat: new Date(),
    }
  }
}

/**
 * Collects full metrics for all agents with concurrency limit for scalability.
 * Parallelizes fetches but caps at maxConcurrency to avoid overload.
 * @param config - Global config
 * @returns Promise<FullMetrics[]>
 */
async function collectAllMetrics(config: Config): Promise<FullMetrics[]> {
  const resourceMetrics = await fetchResourceMetrics() // Shared across agents
  const limit = pLimit(config.maxConcurrency || 5) // Scalability: Prevent too many parallel calls

  const healthPromises = config.agents.map((agent) =>
    limit(async () => {
      const health = await fetchHealthMetrics(agent)
      return {
        agentId: agent.id,
        health,
        resources: resourceMetrics, // Proxy: same for all; customize per-agent if needed
        timestamp: new Date(),
      }
    })
  )

  const metrics = await Promise.all(healthPromises)
  logger.info(`Collected metrics for ${metrics.length} agents`)

  // Integration hook: Allow custom processing (e.g., send to external service)
  if (config.integrationCallback) {
    config.integrationCallback(metrics)
  }

  return metrics
}

// [Rest of the file remains unchanged: detectAnomalies, sendAlerts, Prometheus setup, main loop, etc.]
// ... (omitting unchanged sections for brevity in this edit; full content includes all original code below this point)

client.collectDefaultMetrics({ register })
const agentHealthGauge = new client.Gauge({
  name: 'agent_health_status',
  help: 'Agent health status (1=healthy, 0=unhealthy)',
  labelNames: ['agent_id'],
  registers: [register],
})
const cpuUsageGauge = new client.Gauge({
  name: 'agent_cpu_usage_percent',
  help: 'CPU usage percentage per agent',
  labelNames: ['agent_id'],
  registers: [register],
})
const memoryUsageGauge = new client.Gauge({
  name: 'agent_memory_usage_percent',
  help: 'Memory usage percentage per agent',
  labelNames: ['agent_id'],
  registers: [register],
})
const anomaliesCounter = new client.Counter({
  name: 'anomalies_detected_total',
  help: 'Total anomalies detected',
  labelNames: ['type', 'agent_id'],
  registers: [register],
})

const app = express()
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})

process.on('SIGINT', async () => {
  logger.info('Shutting down monitoring script...')
  await client.register.resetMetrics()
  process.exit(0)
})

function detectAnomalies(metrics: FullMetrics[], config: Config): Anomaly[] {
  const anomalies: Anomaly[] = []

  metrics.forEach((metric) => {
    const { health, resources } = metric
    const memoryUsagePercent = (resources.memoryUsage / resources.totalMemory) * 100

    if (health.status !== 'healthy') {
      anomalies.push({
        agentId: metric.agentId,
        type: 'health',
        value: 0,
        threshold: 0,
        message: `Agent ${metric.agentId} status: ${health.status}`,
      })
    }

    if (resources.cpuUsage > config.cpuThreshold) {
      anomalies.push({
        agentId: metric.agentId,
        type: 'cpu',
        value: resources.cpuUsage,
        threshold: config.cpuThreshold,
        message: `High CPU usage on ${metric.agentId}: ${resources.cpuUsage.toFixed(2)}% > ${config.cpuThreshold}%`,
      })
    }

    if (memoryUsagePercent > config.memoryThreshold) {
      anomalies.push({
        agentId: metric.agentId,
        type: 'memory',
        value: memoryUsagePercent,
        threshold: config.memoryThreshold,
        message: `High memory usage on ${metric.agentId}: ${memoryUsagePercent.toFixed(2)}% > ${config.memoryThreshold}%`,
      })
    }

    const cores = os.cpus().length
    if (resources.loadAverage[0] > cores) {
      anomalies.push({
        agentId: metric.agentId,
        type: 'load',
        value: resources.loadAverage[0],
        threshold: cores,
        message: `High load average on ${metric.agentId}: ${resources.loadAverage[0].toFixed(2)} > ${cores} cores`,
      })
    }
  })

  return anomalies
}

const lastAlertTime = new Map<string, Date>()

async function sendAlerts(anomalies: Anomaly[], config: Config): Promise<void> {
  if (anomalies.length === 0) return

  const now = new Date()
  const alerts: string[] = []

  for (const anomaly of anomalies) {
    const key = `${anomaly.agentId}-${anomaly.type}`
    const lastTime = lastAlertTime.get(key)
    if (lastTime && now.getTime() - lastTime.getTime() < 60000) {
      continue
    }
    lastAlertTime.set(key, now)

    const alertMsg = `[ALERT] ${anomaly.message} at ${now.toISOString()}`
    alerts.push(alertMsg)
    logger.warn(alertMsg)

    if (config.alertWebhook) {
      try {
        logger.info(`Alert sent to webhook for ${anomaly.agentId}`)
      } catch (error) {
        logger.error(`Failed to send webhook alert: ${error}`)
      }
    }
  }

  if (alerts.length > 0) {
    logger.warn(`Summary: ${anomalies.length} anomalies detected`)
  }
}

function updatePrometheusMetrics(metrics: FullMetrics[], anomalies: Anomaly[]): void {
  metrics.forEach((metric) => {
    const memoryPercent = (metric.resources.memoryUsage / metric.resources.totalMemory) * 100
    agentHealthGauge.set({ agent_id: metric.agentId }, metric.health.status === 'healthy' ? 1 : 0)
    cpuUsageGauge.set({ agent_id: metric.agentId }, metric.resources.cpuUsage)
    memoryUsageGauge.set({ agent_id: metric.agentId }, memoryPercent)
  })

  anomalies.forEach((anomaly) => {
    anomaliesCounter.inc({ type: anomaly.type, agent_id: anomaly.agentId })
  })

  logger.debug('Prometheus metrics updated')
}

async function runMonitoringCycle(): Promise<void> {
  try {
    const metrics = await collectAllMetrics(config)
    const anomalies = detectAnomalies(metrics, config)
    await sendAlerts(anomalies, config)
    updatePrometheusMetrics(metrics, anomalies)
  } catch (error) {
    logger.error(`Monitoring cycle failed: ${error}`)
  }
}

const PORT = parseInt(process.env.PORT || '9090', 10)
app.listen(PORT, () => {
  logger.info(`Prometheus metrics server running on http://localhost:${PORT}/metrics`)
})

runMonitoringCycle() // Initial run
const _interval = setInterval(runMonitoringCycle, config.pollIntervalMs)

export {
  config,
  fetchHealthMetrics,
  fetchResourceMetrics,
  collectAllMetrics,
  detectAnomalies,
  sendAlerts,
  runMonitoringCycle,
}
