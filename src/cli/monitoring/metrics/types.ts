export interface MetricLabels {
  readonly [key: string]: string | number;
}

export interface MetricValue {
  readonly value: number;
  readonly timestamp: Date;
  readonly labels?: MetricLabels;
}

export interface TimeSeriesData {
  readonly metric: string;
  readonly values: readonly MetricValue[];
}

export interface MetricSnapshot {
  readonly timestamp: Date;
  readonly metrics: {
    readonly http: {
      readonly requestsTotal: number;
      readonly requestsPerSecond: number;
      readonly averageLatency: number;
      readonly p95Latency: number;
      readonly p99Latency: number;
      readonly errorRate: number;
    };
    readonly agents: {
      readonly activeCount: number;
      readonly totalExecutions: number;
      readonly averageDuration: number;
      readonly errorRate: number;
    };
    readonly system: {
      readonly memoryUsageMB: number;
      readonly memoryUsagePercent: number;
      readonly cpuUsagePercent: number;
      readonly eventLoopLag: number;
    };
    readonly redis: {
      readonly connectionsActive: number;
      readonly commandsPerSecond: number;
      readonly averageLatency: number;
    };
  };
}
