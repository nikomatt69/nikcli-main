import { IncomingWebhook } from '@slack/webhook';
import { BaseAlertChannel } from './base-channel';
import type { Alert, AlertSeverity } from '../types';

export class SlackChannel extends BaseAlertChannel {
  private readonly webhook: IncomingWebhook;

  constructor(webhookUrl: string, minSeverity: AlertSeverity) {
    super('slack', minSeverity);
    this.webhook = new IncomingWebhook(webhookUrl);
  }

  async send(alert: Alert): Promise<void> {
    try {
      const color = this.getSeverityColor(alert.severity);
      const emoji = this.getSeverityEmoji(alert.severity);

      await this.webhook.send({
        text: `${emoji} *${alert.title}*`,
        attachments: [
          {
            color,
            fields: [
              {
                title: 'Severity',
                value: alert.severity.toUpperCase(),
                short: true,
              },
              {
                title: 'Source',
                value: alert.source,
                short: true,
              },
              {
                title: 'Message',
                value: alert.message,
                short: false,
              },
              {
                title: 'Timestamp',
                value: alert.timestamp.toISOString(),
                short: true,
              },
            ],
            footer: 'NikCLI Monitoring',
            ts: Math.floor(alert.timestamp.getTime() / 1000).toString(),
          },
        ],
      });
    } catch (error) {
      console.error('[SlackChannel] Failed to send alert:', error);
      throw error;
    }
  }
}
