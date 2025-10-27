import { EventEmitter } from 'node:events';
import type { RedisProvider } from '../../providers/redis/redis-provider';
import type { HealthCheckResult, HealthStatus, DependencyHealth, ReadinessProbe, LivenessProbe } from './types';

export class HealthChecker extends EventEmitter {
  private lastCheck?: HealthCheckResult;
  private checkInterval?: NodeJS.Timeout;

  constructor(
    private readonly redis: RedisProvider,
    private readonly checkIntervalMs = 30000
  ) {
    super();
  }

  startPeriodicChecks(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.check().catch(err => {
        this.emit('error', err);
      });
    }, this.checkIntervalMs);
  }

  stopPeriodicChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  async check(): Promise<HealthCheckResult> {
    const [redisHealth, eventLoopHealth, memoryHealth] = await Promise.all([
      this.checkRedis(),
      this.checkEventLoop(),
      this.checkMemory(),
    ]);

    const result: HealthCheckResult = {
      status: this.determineOverallStatus([
        redisHealth,
        eventLoopHealth,
        memoryHealth,
      ]),
      timestamp: new Date(),
      uptime: process.uptime(),
      checks: {
        redis: redisHealth,
        database: { name: 'database', status: 'healthy' },
        eventLoop: eventLoopHealth,
        memory: memoryHealth,
      },
    };

    this.lastCheck = result;
    this.emit('check', result);

    return result;
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      const health = await this.redis.healthCheck();
      return {
        name: 'redis',
        status: health.status,
        latency: Date.now() - start,
        metadata: {
          connected: health.connected,
          uptime: health.uptime,
        },
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'unhealthy',
        latency: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkEventLoop(): Promise<DependencyHealth> {
    const start = Date.now();
    return new Promise(resolve => {
      setImmediate(() => {
        const lag = Date.now() - start;
        resolve({
          name: 'eventLoop',
          status: lag < 100 ? 'healthy' : lag < 500 ? 'degraded' : 'unhealthy',
          latency: lag,
          metadata: { lagMs: lag },
        });
      });
    });
  }

  private async checkMemory(): Promise<DependencyHealth> {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    return {
      name: 'memory',
      status: heapUsedPercent < 80 ? 'healthy' : heapUsedPercent < 95 ? 'degraded' : 'unhealthy',
      metadata: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsedPercent: Math.round(heapUsedPercent),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
      },
    };
  }

  private determineOverallStatus(checks: DependencyHealth[]): HealthStatus {
    if (checks.some(c => c.status === 'unhealthy')) return 'unhealthy';
    if (checks.some(c => c.status === 'degraded')) return 'degraded';
    return 'healthy';
  }

  async readinessProbe(): Promise<ReadinessProbe> {
    const health = await this.check();
    return {
      ready: health.status !== 'unhealthy',
      reason: health.status === 'unhealthy' ? 'Dependencies unhealthy' : undefined,
      timestamp: new Date(),
    };
  }

  livenessProbe(): LivenessProbe {
    return {
      alive: true,
      timestamp: new Date(),
    };
  }

  getLastCheck(): HealthCheckResult | undefined {
    return this.lastCheck;
  }
}
