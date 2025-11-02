# NikCLI Enterprise Monitoring System

## Overview

Production-ready enterprise monitoring stack integrating OpenTelemetry, Prometheus, Sentry, and multi-channel alerting.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NikCLI Application                       │
├─────────────────────────────────────────────────────────────┤
│  OpenTelemetry → Distributed Tracing → Jaeger              │
│  Prometheus    → Metrics Collection  → Grafana              │
│  Sentry        → Error Tracking      → Sentry Dashboard     │
│  AlertManager  → Multi-channel       → Slack/Discord        │
│  HealthChecker → K8s Probes          → /health, /ready      │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 📡 Telemetry (`/telemetry`)
- **OpenTelemetryProvider**: Auto-instrumentation for HTTP, Redis, IORedis
- **TracerService**: Span creation and context propagation
- **ContextPropagator**: W3C Trace Context support

### 📊 Metrics (`/metrics`)
- **PrometheusExporter**: Metrics registry and collectors
  - HTTP metrics (requests, duration, in-flight)
  - Agent metrics (execution, errors)
  - Circuit breaker metrics
  - Redis metrics
  - System metrics (memory, CPU)

### 🐛 Errors (`/errors`)
- **SentryProvider**: Error capture and performance monitoring
- **BreadcrumbTracker**: User action tracking

### 🚨 Alerting (`/alerting`)
- **AlertManager**: Unified alert dispatcher
- **Channels**: Slack, Discord with webhook support
- **Deduplicator**: Prevent duplicate alerts (5-minute window)
- **Throttler**: Rate limiting (10 alerts/minute default)

### 🏥 Health (`/health`)
- **HealthChecker**: Comprehensive health checks
  - Redis connectivity
  - Event loop lag
  - Memory pressure
  - K8s readiness/liveness probes

## Quick Start

### 1. Configuration

```typescript
import { initializeMonitoring } from './monitoring/init';
import { simpleConfigManager } from './core/config-manager';

const config = simpleConfigManager.getConfig();
const services = await initializeMonitoring(config, redisProvider);
```

### 2. Using Metrics

```typescript
import { prometheusExporter } from './monitoring';

// Increment counter
prometheusExporter.httpRequestsTotal.inc({
  method: 'GET',
  route: '/api/jobs',
  status_code: '200'
});

// Observe histogram
prometheusExporter.httpRequestDuration.observe(
  { method: 'GET', route: '/api/jobs', status_code: '200' },
  0.150 // seconds
);
```

### 3. Using Tracing

```typescript
import { tracerService } from './monitoring';

const result = await tracerService.trackOperation(
  'processJob',
  async () => {
    // Your operation here
    return await processJobLogic();
  },
  {
    'job.id': jobId,
    'job.priority': 'high'
  }
);
```

### 4. Error Tracking

```typescript
import { getSentryProvider } from './monitoring';

const sentry = getSentryProvider();
if (sentry) {
  sentry.captureError(error, {
    requestId: req.id,
    metadata: { /* context */ }
  });
}
```

### 5. Sending Alerts

```typescript
import { AlertManager } from './monitoring';

const alertManager = new AlertManager(config);

await alertManager.sendAlert({
  id: nanoid(),
  severity: 'high',
  title: 'High Memory Usage',
  message: 'Memory usage exceeded 80%',
  timestamp: new Date(),
  source: 'health-checker',
  metadata: { heapUsedPercent: 85 }
});
```

## Environment Variables

See `.env.monitoring.example` for all configuration options.

Key variables:
- `SENTRY_DSN`: Sentry project DSN
- `SLACK_WEBHOOK_URL`: Slack incoming webhook
- `DISCORD_WEBHOOK_URL`: Discord webhook
- `OTEL_ENDPOINT`: OpenTelemetry collector endpoint

## Endpoints

- **Metrics**: `GET /metrics` - Prometheus metrics
- **Health**: `GET /health` - Full health status
- **Readiness**: `GET /ready` - K8s readiness probe
- **Liveness**: `GET /live` - K8s liveness probe

## Production Deployment

### Kubernetes

```yaml
livenessProbe:
  httpGet:
    path: /live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Docker Compose

See `docs/enterprise-monitoring.md` for full Docker Compose setup.

## Testing

Run integration tests:

```bash
bun test tests/monitoring-integration.test.ts
```

## Documentation

Full documentation: `docs/enterprise-monitoring.md`

## License

MIT
