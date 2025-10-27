export { OpenTelemetryProvider } from './telemetry/opentelemetry-provider';
export { TracerService, tracerService } from './telemetry/tracer';
export { ContextPropagator, contextPropagator } from './telemetry/context-propagator';
export type { TelemetryConfig, SpanContext, TraceMetadata, TraceEvent, TracingStats } from './telemetry/types';

export { PrometheusExporter, prometheusExporter } from './metrics/prometheus-exporter';
export type { MetricLabels, MetricValue, TimeSeriesData, MetricSnapshot } from './metrics/types';

export { SentryProvider, initializeSentry, getSentryProvider } from './errors/sentry-provider';
export type { SentryConfig } from './errors/sentry-provider';
export { BreadcrumbTracker, breadcrumbTracker } from './errors/breadcrumb-tracker';

export { AlertManager } from './alerting/alert-manager';
export { BaseAlertChannel } from './alerting/channels/base-channel';
export { SlackChannel } from './alerting/channels/slack-channel';
export { DiscordChannel } from './alerting/channels/discord-channel';
export { AlertDeduplicator } from './alerting/deduplicator';
export { AlertThrottler } from './alerting/throttler';
export type { Alert, AlertSeverity, AlertHistory, AlertChannelConfig, AlertStats } from './alerting/types';

export { HealthChecker } from './health/health-checker';
export type { HealthCheckResult, HealthStatus, DependencyHealth, ReadinessProbe, LivenessProbe } from './health/types';
