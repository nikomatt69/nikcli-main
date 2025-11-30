import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import type { TelemetryConfig } from './types'

export class OpenTelemetryProvider {
  private sdk?: NodeSDK
  private readonly config: TelemetryConfig
  private initialized = false

  constructor(config: TelemetryConfig) {
    this.config = config
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[OpenTelemetry] Disabled by configuration')
      return
    }

    if (this.initialized) {
      console.warn('[OpenTelemetry] Already initialized')
      return
    }

    try {
      const traceExporter = new OTLPTraceExporter({
        url: `${this.config.endpoint}/v1/traces`,
        headers: {},
      })

      const metricExporter = new OTLPMetricExporter({
        url: `${this.config.endpoint}/v1/metrics`,
        headers: {},
      })

      this.sdk = new NodeSDK({
        // resource: new Resource({
        //   [SemanticResourceAttributes.SERVICE_NAME]: this.config.serviceName,
        //   [SemanticResourceAttributes.SERVICE_VERSION]: this.config.serviceVersion,
        // }),
        traceExporter,
        metricReader: new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: this.config.exportIntervalMs || 60000,
        }),
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
            '@opentelemetry/instrumentation-net': { enabled: false },
            '@opentelemetry/instrumentation-dns': { enabled: false },
          }),
          new IORedisInstrumentation({
            dbStatementSerializer: (cmdName, cmdArgs) => {
              return `${cmdName} ${cmdArgs.slice(0, 2).join(' ')}`
            },
          }),
        ],
      })

      await this.sdk.start()
      this.initialized = true
      console.log('[OpenTelemetry] Initialized successfully', {
        service: this.config.serviceName,
        version: this.config.serviceVersion,
        endpoint: this.config.endpoint,
      })
    } catch (error) {
      console.error('[OpenTelemetry] Failed to initialize:', error)
      throw error
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      await this.sdk?.shutdown()
      this.initialized = false
      console.log('[OpenTelemetry] Shutdown successfully')
    } catch (error) {
      console.error('[OpenTelemetry] Error during shutdown:', error)
      throw error
    }
  }

  isInitialized(): boolean {
    return this.initialized
  }

  getConfig(): TelemetryConfig {
    return { ...this.config }
  }
}
