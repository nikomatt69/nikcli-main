export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Alert {
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly message: string;
  readonly timestamp: Date;
  readonly source: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AlertHistory extends Alert {
  readonly sentAt: Date;
  readonly channels?: readonly string[];
  readonly acknowledged?: boolean;
  readonly acknowledgedAt?: Date;
  readonly acknowledgedBy?: string;
}

export interface AlertChannelConfig {
  readonly enabled: boolean;
  readonly minSeverity: AlertSeverity;
  readonly webhookUrl?: string;
  readonly headers?: Record<string, string>;
  readonly timeout?: number;
  readonly retries?: number;
}

export interface AlertStats {
  readonly totalSent: number;
  readonly byChannel: Record<string, number>;
  readonly bySeverity: Record<AlertSeverity, number>;
  readonly deduplicatedCount: number;
  readonly throttledCount: number;
  readonly failedCount: number;
}
