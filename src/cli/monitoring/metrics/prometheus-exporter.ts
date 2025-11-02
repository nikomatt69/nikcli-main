import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics, type LabelValues } from 'prom-client';

export class PrometheusExporter {
  private readonly registry: Registry;

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly httpRequestsInFlight: Gauge<string>;
  readonly circuitBreakerState: Gauge<string>;
  readonly circuitBreakerFailures: Counter<string>;
  readonly agentExecutionDuration: Histogram<string>;
  readonly agentExecutionTotal: Counter<string>;
  readonly agentErrorsTotal: Counter<string>;
  readonly redisConnectionsActive: Gauge<string>;
  readonly redisCommandDuration: Histogram<string>;
  readonly memoryUsageBytes: Gauge<string>;
  readonly cpuUsagePercent: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    collectDefaultMetrics({ register: this.registry, prefix: 'nikcli_' });

    this.httpRequestsTotal = new Counter({
      name: 'nikcli_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'] as const,
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'nikcli_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'] as const,
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.httpRequestsInFlight = new Gauge({
      name: 'nikcli_http_requests_in_flight',
      help: 'Current HTTP requests in flight',
      registers: [this.registry],
    });

    this.circuitBreakerState = new Gauge({
      name: 'nikcli_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
      labelNames: ['name'] as const,
      registers: [this.registry],
    });

    this.circuitBreakerFailures = new Counter({
      name: 'nikcli_circuit_breaker_failures_total',
      help: 'Total circuit breaker failures',
      labelNames: ['name'] as const,
      registers: [this.registry],
    });

    this.agentExecutionDuration = new Histogram({
      name: 'nikcli_agent_execution_duration_seconds',
      help: 'Agent execution duration',
      labelNames: ['agent_id', 'status'] as const,
      buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
      registers: [this.registry],
    });

    this.agentExecutionTotal = new Counter({
      name: 'nikcli_agent_execution_total',
      help: 'Total agent executions',
      labelNames: ['agent_id', 'status'] as const,
      registers: [this.registry],
    });

    this.agentErrorsTotal = new Counter({
      name: 'nikcli_agent_errors_total',
      help: 'Total agent errors',
      labelNames: ['agent_id', 'error_type'] as const,
      registers: [this.registry],
    });

    this.redisConnectionsActive = new Gauge({
      name: 'nikcli_redis_connections_active',
      help: 'Active Redis connections',
      registers: [this.registry],
    });

    this.redisCommandDuration = new Histogram({
      name: 'nikcli_redis_command_duration_seconds',
      help: 'Redis command duration',
      labelNames: ['command'] as const,
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
      registers: [this.registry],
    });

    this.memoryUsageBytes = new Gauge({
      name: 'nikcli_memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'] as const,
      registers: [this.registry],
    });

    this.cpuUsagePercent = new Gauge({
      name: 'nikcli_cpu_usage_percent',
      help: 'CPU usage percentage',
      registers: [this.registry],
    });

    this.startSystemMetricsCollection();
  }

  private startSystemMetricsCollection(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.memoryUsageBytes.set({ type: 'heapUsed' }, memUsage.heapUsed);
      this.memoryUsageBytes.set({ type: 'heapTotal' }, memUsage.heapTotal);
      this.memoryUsageBytes.set({ type: 'rss' }, memUsage.rss);
      this.memoryUsageBytes.set({ type: 'external' }, memUsage.external);
    }, 5000);
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getRegistry(): Registry {
    return this.registry;
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}

export const prometheusExporter = new PrometheusExporter();
