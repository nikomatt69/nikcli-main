import axios from 'axios'
import type { Alert, AlertSeverity } from '../types'
import { BaseAlertChannel } from './base-channel'

export class DiscordChannel extends BaseAlertChannel {
  private readonly webhookUrl: string

  constructor(webhookUrl: string, minSeverity: AlertSeverity) {
    super('discord', minSeverity)
    this.webhookUrl = webhookUrl
  }

  async send(alert: Alert): Promise<void> {
    try {
      const color = this.parseColorToDecimal(this.getSeverityColor(alert.severity))
      const emoji = this.getSeverityEmoji(alert.severity)

      await axios.post(this.webhookUrl, {
        embeds: [
          {
            title: `${emoji} ${alert.title}`,
            description: alert.message,
            color,
            fields: [
              {
                name: 'Severity',
                value: alert.severity.toUpperCase(),
                inline: true,
              },
              {
                name: 'Source',
                value: alert.source,
                inline: true,
              },
              {
                name: 'Timestamp',
                value: alert.timestamp.toISOString(),
                inline: false,
              },
            ],
            footer: {
              text: 'NikCLI Monitoring',
            },
            timestamp: alert.timestamp.toISOString(),
          },
        ],
      })
    } catch (error) {
      console.error('[DiscordChannel] Failed to send alert:', error)
      throw error
    }
  }

  private parseColorToDecimal(hex: string): number {
    return parseInt(hex.replace('#', ''), 16)
  }
}
