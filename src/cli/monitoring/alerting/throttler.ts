import type { Alert } from './types'

interface ThrottlerConfig {
  readonly enabled: boolean
  readonly maxAlertsPerMinute: number
}

export class AlertThrottler {
  private readonly config: ThrottlerConfig
  private readonly alertTimestamps: number[] = []
  private throttledCount = 0

  constructor(config: ThrottlerConfig) {
    this.config = config
  }

  shouldThrottle(alert: Alert): boolean {
    if (!this.config.enabled) {
      return false
    }

    const now = Date.now()
    const oneMinuteAgo = now - 60000

    this.alertTimestamps.push(now)

    this.alertTimestamps.splice(
      0,
      this.alertTimestamps.findIndex((ts) => ts > oneMinuteAgo)
    )

    if (this.alertTimestamps.length > this.config.maxAlertsPerMinute) {
      this.throttledCount++
      return true
    }

    return false
  }

  getStats() {
    return {
      currentRate: this.alertTimestamps.length,
      maxRate: this.config.maxAlertsPerMinute,
      throttledCount: this.throttledCount,
    }
  }

  reset(): void {
    this.alertTimestamps.length = 0
    this.throttledCount = 0
  }
}
