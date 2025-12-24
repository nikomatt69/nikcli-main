# NikCLI Enterprise Monitoring Guide

## 📋 Overview

NikCLI includes a comprehensive enterprise-grade monitoring stack with:

- **OpenTelemetry**: Distributed tracing and observability
- **Prometheus**: Metrics collection and time-series data
- **Sentry**: Error tracking and performance monitoring
- **Multi-channel Alerting**: Slack and Discord integration
- **Health Checks**: Kubernetes-compatible probes

---

## 🚀 Quick Start

### 1. Install Dependencies

All monitoring dependencies are included in the main `package.json`:

```bash
bun install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.monitoring.example .env
```

Edit `.env` and configure your monitoring services:

```bash
# Sentry (Optional but recommended)
SENTRY_ENABLED=true
SENTRY_DSN=your-sentry-dsn-here

# Slack Alerts (Optional)
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Discord Alerts (Optional)
DISCORD_ENABLED=true
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL
```

### 3. Start Monitoring Services

#### Option A: Docker Compose (Recommended)

Create `docker-compose.monitoring.yml`:

```yaml
version: '3.8'

services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # Jaeger UI
      - "4318:4318"    # OTLP HTTP receiver
    environment:
      - COLLECTOR_OTLP_ENABLED=true

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
```

Start services:

```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

#### Option B: Manual Setup

**Jaeger (OpenTelemetry):**
```bash
docker run -d -p 16686:16686 -p 4318:4318 \
  -e COLLECTOR_OTLP_ENABLED=true \
  jaegertracing/all-in-one:latest
```

**Prometheus:**
```bash
docker run -d -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

### 4. Configure Prometheus

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'nikcli'
    static_configs:
      - targets: ['host.docker.internal:3000']
    metrics_path: '/metrics'
```

### 5. Start NikCLI

```bash
bun run dev
```

---

## 📊 Accessing Dashboards

### Jaeger (Distributed Tracing)
- URL: http://localhost:16686
- View distributed traces across operations
- Analyze request flows and bottlenecks

### Prometheus (Metrics)
- URL: http://localhost:9090
- Query time-series metrics
- Create custom dashboards

### NikCLI Metrics Endpoint
- URL: http://localhost:3000/metrics
- Prometheus-compatible metrics export

### Health Check Endpoints
- **Health**: http://localhost:3000/health
- **Readiness**: http://localhost:3000/ready
- **Liveness**: http://localhost:3000/live

---

## 📈 Available Metrics

### HTTP Metrics

```prometheus
# Total HTTP requests
nikcli_http_requests_total{method="GET", route="/jobs", status_code="200"}

# Request duration histogram
nikcli_http_request_duration_seconds{method="GET", route="/jobs", status_code="200"}

# In-flight requests gauge
nikcli_http_requests_in_flight
```

### Agent Metrics

```prometheus
# Agent execution duration
nikcli_agent_execution_duration_seconds{agent_id="background-agent", status="success"}

# Total agent executions
nikcli_agent_execution_total{agent_id="background-agent", status="success"}

# Agent errors
nikcli_agent_errors_total{agent_id="background-agent", error_type="network"}
```

### Circuit Breaker Metrics

```prometheus
# Circuit breaker state (0=closed, 1=open, 2=half-open)
nikcli_circuit_breaker_state{name="redis-client"}

# Circuit breaker failures
nikcli_circuit_breaker_failures_total{name="redis-client"}
```

### Redis Metrics

```prometheus
# Active Redis connections
nikcli_redis_connections_active

# Redis command duration
nikcli_redis_command_duration_seconds{command="get"}
```

### System Metrics

```prometheus
# Memory usage by type
nikcli_memory_usage_bytes{type="heapUsed"}
nikcli_memory_usage_bytes{type="heapTotal"}
nikcli_memory_usage_bytes{type="rss"}
nikcli_memory_usage_bytes{type="external"}

# CPU usage percentage
nikcli_cpu_usage_percent
```

---

## 🚨 Alerting

### Alert Severity Levels

- **low**: Informational, no immediate action required
- **medium**: Warning, should be investigated
- **high**: Requires attention within hours
- **critical**: Immediate action required

### Configuring Alert Channels

#### Slack

1. Create a Slack webhook:
   - Go to https://api.slack.com/apps
   - Create a new app
   - Enable Incoming Webhooks
   - Create a webhook URL

2. Configure in `.env`:
```bash
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_MIN_SEVERITY=high
```

#### Discord

1. Create a Discord webhook:
   - Go to Server Settings → Integrations
   - Create a webhook
   - Copy the webhook URL

2. Configure in `.env`:
```bash
DISCORD_ENABLED=true
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL
DISCORD_MIN_SEVERITY=critical
```

### Alert Deduplication

Prevent duplicate alerts within a time window:

```bash
ALERT_DEDUPLICATION_ENABLED=true
ALERT_DEDUPLICATION_WINDOW_MS=300000  # 5 minutes
```

### Alert Throttling

Limit the rate of alerts:

```bash
ALERT_THROTTLING_ENABLED=true
ALERT_MAX_ALERTS_PER_MINUTE=10
```

---

## 🔍 Distributed Tracing

### Viewing Traces in Jaeger

1. Open http://localhost:16686
2. Select "nikcli" service
3. Click "Find Traces"
4. View trace details with timing information

### Trace Attributes

Traces include rich context:

- **Request ID**: Unique identifier
- **Operation**: Middleware or agent operation name
- **Performance**: Execution time, memory usage, CPU usage
- **Errors**: Stack traces and error details
- **Custom**: Additional context-specific attributes

### Example Trace Query

Find slow operations (> 1 second):

```
service=nikcli
duration > 1s
```

---

## 🏥 Health Checks

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2025-10-26T17:00:00.000Z",
  "uptime": 12345,
  "checks": {
    "redis": {
      "name": "redis",
      "status": "healthy",
      "latency": 5,
      "metadata": {
        "connected": true,
        "uptime": 10000
      }
    },
    "database": {
      "name": "database",
      "status": "healthy"
    },
    "eventLoop": {
      "name": "eventLoop",
      "status": "healthy",
      "latency": 2,
      "metadata": {
        "lagMs": 2
      }
    },
    "memory": {
      "name": "memory",
      "status": "healthy",
      "metadata": {
        "heapUsedMB": 150,
        "heapTotalMB": 512,
        "heapUsedPercent": 29,
        "rssMB": 200
      }
    }
  }
}
```

### Readiness Probe

Checks if the application is ready to accept traffic:

```bash
curl http://localhost:3000/ready
```

Response:
```json
{
  "ready": true,
  "timestamp": "2025-10-26T17:00:00.000Z"
}
```

### Liveness Probe

Checks if the application is alive:

```bash
curl http://localhost:3000/live
```

Response:
```json
{
  "alive": true,
  "timestamp": "2025-10-26T17:00:00.000Z"
}
```

---

## 🐛 Error Tracking with Sentry

### Features

- **Automatic error capture**: All errors are automatically sent to Sentry
- **Breadcrumbs**: Track user actions leading to errors
- **Performance monitoring**: Transaction tracking for slow operations
- **Release tracking**: Associate errors with specific releases
- **User context**: Track which users are affected

### Viewing Errors

1. Go to your Sentry dashboard
2. View errors grouped by type
3. Click on an error to see:
   - Stack trace
   - Breadcrumbs (user actions)
   - Context (request, environment)
   - Affected users

### Setting User Context

```typescript
import { getSentryProvider } from './monitoring';

const sentry = getSentryProvider();
if (sentry) {
  sentry.setUser({
    id: 'user-123',
    email: 'user@example.com',
    username: 'john_doe'
  });
}
```

---

## 📊 Prometheus Queries

### Example Queries

**Request rate (requests/second):**
```prometheus
rate(nikcli_http_requests_total[5m])
```

**95th percentile latency:**
```prometheus
histogram_quantile(0.95,
  rate(nikcli_http_request_duration_seconds_bucket[5m])
)
```

**Error rate percentage:**
```prometheus
sum(rate(nikcli_http_requests_total{status_code=~"5.."}[5m]))
/
sum(rate(nikcli_http_requests_total[5m])) * 100
```

**Memory usage trend:**
```prometheus
nikcli_memory_usage_bytes{type="heapUsed"} / 1024 / 1024
```

**Active agents:**
```prometheus
count(nikcli_agent_execution_total)
```

---

## 🔧 Troubleshooting

### Metrics Not Appearing in Prometheus

1. Check if Prometheus can reach NikCLI:
```bash
curl http://localhost:3000/metrics
```

2. Verify Prometheus target is up:
   - Go to http://localhost:9090/targets
   - Check if "nikcli" target shows as "UP"

3. Check Prometheus configuration:
```bash
cat prometheus.yml
```

### Traces Not Appearing in Jaeger

1. Verify OpenTelemetry endpoint:
```bash
curl http://localhost:4318/v1/traces
```

2. Check NikCLI configuration:
```bash
echo $OTEL_ENDPOINT
echo $OTEL_ENABLED
```

3. Check Jaeger logs:
```bash
docker logs <jaeger-container-id>
```

### Alerts Not Being Sent

1. Test webhook URLs manually:

**Slack:**
```bash
curl -X POST YOUR_SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message"}'
```

**Discord:**
```bash
curl -X POST YOUR_DISCORD_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"content": "Test message"}'
```

2. Check NikCLI logs for alert errors

3. Verify alert configuration in `.env`

---

## 🚀 Production Deployment

### Kubernetes Configuration

**Health Probes:**

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

**ServiceMonitor (Prometheus Operator):**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: nikcli
spec:
  selector:
    matchLabels:
      app: nikcli
  endpoints:
  - port: metrics
    path: /metrics
    interval: 30s
```

### Environment-Specific Configuration

**Development:**
```bash
SENTRY_ENABLED=false
OTEL_SAMPLE_RATE=1.0
PROMETHEUS_ENABLED=true
```

**Staging:**
```bash
SENTRY_ENABLED=true
SENTRY_ENVIRONMENT=staging
OTEL_SAMPLE_RATE=0.5
SLACK_ENABLED=true
SLACK_MIN_SEVERITY=medium
```

**Production:**
```bash
SENTRY_ENABLED=true
SENTRY_ENVIRONMENT=production
OTEL_SAMPLE_RATE=0.1
SLACK_ENABLED=true
SLACK_MIN_SEVERITY=high
DISCORD_ENABLED=true
DISCORD_MIN_SEVERITY=critical
```

---

## 📚 Additional Resources

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Sentry Documentation](https://docs.sentry.io/)
- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [Slack Webhooks](https://api.slack.com/messaging/webhooks)
- [Discord Webhooks](https://discord.com/developers/docs/resources/webhook)

---

## 🆘 Support

For issues or questions:
1. Check the [GitHub Issues](https://github.com/nikomatt69/nikcli/issues)
2. Review existing documentation
3. Create a new issue with logs and configuration details
