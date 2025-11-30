import type { Alert } from './types'

interface DeduplicatorConfig {
  readonly enabled: boolean
  readonly windowMs: number
}

interface AlertFingerprint {
  readonly key: string
  readonly lastSeen: number
}

interface MutableAlertFingerprint {
  readonly key: string
  lastSeen: number
}

export class AlertDeduplicator {
  private readonly config: DeduplicatorConfig
  private readonly fingerprints = new Map<string, MutableAlertFingerprint>()
  private deduplicatedCount = 0

  constructor(config: DeduplicatorConfig) {
    this.config = config
    this.startCleanupInterval()
  }

  isDuplicate(alert: Alert): boolean {
    if (!this.config.enabled) {
      return false
    }

    const key = this.generateFingerprint(alert)
    const existing = this.fingerprints.get(key)

    if (!existing) {
      this.fingerprints.set(key, {
        key,
        lastSeen: Date.now(),
      })
      return false
    }

    const timeSinceLastSeen = Date.now() - existing.lastSeen
    if (timeSinceLastSeen < this.config.windowMs) {
      this.deduplicatedCount++
      existing.lastSeen = Date.now()
      return true
    }

    existing.lastSeen = Date.now()
    return false
  }

  private generateFingerprint(alert: Alert): string {
    return `${alert.severity}:${alert.title}:${alert.source}`
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now()
      const threshold = now - this.config.windowMs * 2

      for (const [key, fingerprint] of this.fingerprints.entries()) {
        if (fingerprint.lastSeen < threshold) {
          this.fingerprints.delete(key)
        }
      }
    }, this.config.windowMs)
  }

  getStats() {
    return {
      activeFingerprints: this.fingerprints.size,
      deduplicatedCount: this.deduplicatedCount,
    }
  }

  reset(): void {
    this.fingerprints.clear()
    this.deduplicatedCount = 0
  }
}
