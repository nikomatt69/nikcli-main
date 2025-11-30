import type { BaseAlertChannel } from './channels/base-channel'
import { DiscordChannel } from './channels/discord-channel'
import { SlackChannel } from './channels/slack-channel'
import { AlertDeduplicator } from './deduplicator'
import { AlertThrottler } from './throttler'
import type { Alert, AlertHistory, AlertSeverity, AlertStats } from './types'

interface AlertManagerConfig {
  readonly channels: {
    readonly slack?: { webhookUrl: string; minSeverity: AlertSeverity }
    readonly discord?: { webhookUrl: string; minSeverity: AlertSeverity }
  }
  readonly deduplication: {
    readonly enabled: boolean
    readonly windowMs: number
  }
  readonly throttling: {
    readonly enabled: boolean
    readonly maxAlertsPerMinute: number
  }
}

export class AlertManager {
  private readonly channels = new Map<string, BaseAlertChannel>()
  private readonly deduplicator: AlertDeduplicator
  private readonly throttler: AlertThrottler
  private readonly history: AlertHistory[] = []
  private readonly maxHistorySize = 10000
  private totalSent = 0
  private failedCount = 0

  constructor(private readonly config: AlertManagerConfig) {
    this.deduplicator = new AlertDeduplicator({
      enabled: config.deduplication.enabled,
      windowMs: config.deduplication.windowMs,
    })

    this.throttler = new AlertThrottler({
      enabled: config.throttling.enabled,
      maxAlertsPerMinute: config.throttling.maxAlertsPerMinute,
    })

    this.initializeChannels()
  }

  private initializeChannels(): void {
    if (this.config.channels.slack?.webhookUrl) {
      this.channels.set(
        'slack',
        new SlackChannel(this.config.channels.slack.webhookUrl, this.config.channels.slack.minSeverity)
      )
    }

    if (this.config.channels.discord?.webhookUrl) {
      this.channels.set(
        'discord',
        new DiscordChannel(this.config.channels.discord.webhookUrl, this.config.channels.discord.minSeverity)
      )
    }
  }

  async sendAlert(alert: Alert): Promise<void> {
    if (this.deduplicator.isDuplicate(alert)) {
      return
    }

    if (this.throttler.shouldThrottle(alert)) {
      return
    }

    const sentChannels: string[] = []
    const sendPromises = Array.from(this.channels.values())
      .filter((channel) => channel.shouldSend(alert))
      .map(async (channel) => {
        try {
          await channel.send(alert)
          sentChannels.push(channel.name)
          this.totalSent++
        } catch (err) {
          console.error(`Failed to send alert to ${channel.name}:`, err)
          this.failedCount++
        }
      })

    await Promise.allSettled(sendPromises)

    this.addToHistory(alert, sentChannels)
  }

  private addToHistory(alert: Alert, channels: string[]): void {
    this.history.push({
      ...alert,
      sentAt: new Date(),
      channels,
    })

    if (this.history.length > this.maxHistorySize) {
      this.history.splice(0, this.history.length - this.maxHistorySize)
    }
  }

  getHistory(limit = 100): AlertHistory[] {
    return this.history.slice(-limit)
  }

  getStats(): AlertStats {
    const bySeverity: Record<AlertSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    }

    const byChannel: Record<string, number> = {}

    for (const alert of this.history) {
      bySeverity[alert.severity]++
      for (const channel of alert.channels || []) {
        byChannel[channel] = (byChannel[channel] || 0) + 1
      }
    }

    const deduplicatorStats = this.deduplicator.getStats()
    const throttlerStats = this.throttler.getStats()

    return {
      totalSent: this.totalSent,
      byChannel,
      bySeverity,
      deduplicatedCount: deduplicatorStats.deduplicatedCount,
      throttledCount: throttlerStats.throttledCount,
      failedCount: this.failedCount,
    }
  }

  reset(): void {
    this.history.length = 0
    this.totalSent = 0
    this.failedCount = 0
    this.deduplicator.reset()
    this.throttler.reset()
  }
}
