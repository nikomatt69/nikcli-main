export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyHealth {
  readonly name: string;
  readonly status: HealthStatus;
  readonly latency?: number;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly timestamp: Date;
  readonly uptime: number;
  readonly checks: {
    readonly redis: DependencyHealth;
    readonly database: DependencyHealth;
    readonly eventLoop: DependencyHealth;
    readonly memory: DependencyHealth;
  };
  readonly metadata?: Record<string, unknown>;
}

export interface ReadinessProbe {
  readonly ready: boolean;
  readonly reason?: string;
  readonly timestamp: Date;
}

export interface LivenessProbe {
  readonly alive: boolean;
  readonly timestamp: Date;
}
