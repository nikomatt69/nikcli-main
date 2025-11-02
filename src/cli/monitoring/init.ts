import { OpenTelemetryProvider } from './telemetry/opentelemetry-provider';
import { initializeSentry } from './errors/sentry-provider';
import { AlertManager } from './alerting/alert-manager';
import { HealthChecker } from './health/health-checker';
import type { RedisProvider } from '../providers/redis/redis-provider';
import type { ConfigType } from '../core/config-manager';

export interface MonitoringServices {
  openTelemetry?: OpenTelemetryProvider;
  alertManager?: AlertManager;
  healthChecker?: HealthChecker;
}

export async function initializeMonitoring(
  config: ConfigType,
  redis: RedisProvider
): Promise<MonitoringServices> {
  const services: MonitoringServices = {};

  if (!config.monitoring.enabled) {
    console.log('[Monitoring] Disabled by configuration');
    return services;
  }

  try {
    if (config.monitoring.opentelemetry.enabled) {
      const openTelemetry = new OpenTelemetryProvider({
        serviceName: config.monitoring.opentelemetry.serviceName,
        serviceVersion: config.monitoring.opentelemetry.serviceVersion,
        endpoint: config.monitoring.opentelemetry.endpoint,
        enabled: config.monitoring.opentelemetry.enabled,
        sampleRate: config.monitoring.opentelemetry.sampleRate,
        exportIntervalMs: config.monitoring.opentelemetry.exportIntervalMs,
      });

      await openTelemetry.initialize();
      services.openTelemetry = openTelemetry;
    }

    if (config.monitoring.sentry.enabled && config.monitoring.sentry.dsn) {
      initializeSentry({
        dsn: config.monitoring.sentry.dsn,
        environment: config.monitoring.sentry.environment,
        release: `nikcli@${config.monitoring.opentelemetry.serviceVersion}`,
        enabled: config.monitoring.sentry.enabled,
        sampleRate: 1.0,
        tracesSampleRate: config.monitoring.sentry.tracesSampleRate,
        profilesSampleRate: config.monitoring.sentry.profilesSampleRate,
        debug: config.monitoring.sentry.debug,
      });
    }

    if (config.monitoring.alerting.enabled) {
      const channels: any = {};

      if (config.monitoring.alerting.channels.slack?.enabled && config.monitoring.alerting.channels.slack?.webhookUrl) {
        channels.slack = {
          webhookUrl: config.monitoring.alerting.channels.slack.webhookUrl,
          minSeverity: config.monitoring.alerting.channels.slack.minSeverity,
        };
      }

      if (config.monitoring.alerting.channels.discord?.enabled && config.monitoring.alerting.channels.discord?.webhookUrl) {
        channels.discord = {
          webhookUrl: config.monitoring.alerting.channels.discord.webhookUrl,
          minSeverity: config.monitoring.alerting.channels.discord.minSeverity,
        };
      }

      services.alertManager = new AlertManager({
        channels,
        deduplication: config.monitoring.alerting.deduplication,
        throttling: config.monitoring.alerting.throttling,
      });
    }

    if (config.monitoring.health.enabled) {
      services.healthChecker = new HealthChecker(
        redis,
        config.monitoring.health.checkIntervalMs
      );
      services.healthChecker.startPeriodicChecks();
    }

    console.log('[Monitoring] Initialized successfully', {
      openTelemetry: !!services.openTelemetry,
      sentry: config.monitoring.sentry.enabled,
      alertManager: !!services.alertManager,
      healthChecker: !!services.healthChecker,
    });

    return services;
  } catch (error) {
    console.error('[Monitoring] Failed to initialize:', error);
    return services;
  }
}

export async function shutdownMonitoring(services: MonitoringServices): Promise<void> {
  console.log('[Monitoring] Shutting down...');

  if (services.openTelemetry) {
    await services.openTelemetry.shutdown();
  }

  if (services.healthChecker) {
    services.healthChecker.stopPeriodicChecks();
  }

  console.log('[Monitoring] Shutdown complete');
}
