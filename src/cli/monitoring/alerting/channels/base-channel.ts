import type { Alert, AlertSeverity } from '../types';

const SEVERITY_PRIORITY: Record<AlertSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export abstract class BaseAlertChannel {
  constructor(
    public readonly name: string,
    protected readonly minSeverity: AlertSeverity
  ) {}

  shouldSend(alert: Alert): boolean {
    return SEVERITY_PRIORITY[alert.severity] >= SEVERITY_PRIORITY[this.minSeverity];
  }

  abstract send(alert: Alert): Promise<void>;

  protected formatAlert(alert: Alert): string {
    return `[${alert.severity.toUpperCase()}] ${alert.title}\n${alert.message}`;
  }

  protected getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'low':
        return '#36a64f';
      case 'medium':
        return '#ff9900';
      case 'high':
        return '#ff6600';
      case 'critical':
        return '#ff0000';
    }
  }

  protected getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case 'low':
        return '✅';
      case 'medium':
        return '⚠️';
      case 'high':
        return '🔴';
      case 'critical':
        return '🚨';
    }
  }
}
