import { describe, it, expect, beforeAll } from 'vitest';
import { PrometheusExporter } from '../src/cli/monitoring/metrics/prometheus-exporter';
import { AlertManager } from '../src/cli/monitoring/alerting/alert-manager';
import { AlertDeduplicator } from '../src/cli/monitoring/alerting/deduplicator';
import { AlertThrottler } from '../src/cli/monitoring/alerting/throttler';
import { HealthChecker } from '../src/cli/monitoring/health/health-checker';
import type { Alert } from '../src/cli/monitoring/alerting/types';

describe('Enterprise Monitoring Integration', () => {
  describe('Prometheus Metrics', () => {
    let exporter: PrometheusExporter;

    beforeAll(() => {
      exporter = new PrometheusExporter();
    });

    it('should collect HTTP metrics', async () => {
      exporter.httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });
      const metrics = await exporter.getMetrics();
      expect(metrics).toContain('nikcli_http_requests_total');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('route="/test"');
    });

    it('should track request duration', () => {
      exporter.httpRequestDuration.observe(
        { method: 'POST', route: '/jobs', status_code: '201' },
        0.5
      );
      expect(exporter.httpRequestDuration).toBeDefined();
    });

    it('should track circuit breaker state', () => {
      exporter.circuitBreakerState.set({ name: 'test-breaker' }, 0);
      expect(exporter.circuitBreakerState).toBeDefined();
    });

    it('should export metrics in Prometheus format', async () => {
      const metrics = await exporter.getMetrics();
      expect(metrics).toMatch(/^# HELP/m);
      expect(metrics).toMatch(/^# TYPE/m);
    });
  });

  describe('Alert Manager', () => {
    let alertManager: AlertManager;

    beforeAll(() => {
      alertManager = new AlertManager({
        channels: {},
        deduplication: {
          enabled: true,
          windowMs: 300000,
        },
        throttling: {
          enabled: true,
          maxAlertsPerMinute: 10,
        },
      });
    });

    it('should create alert manager instance', () => {
      expect(alertManager).toBeDefined();
    });

    it('should track alert history', async () => {
      const alert: Alert = {
        id: 'test-1',
        severity: 'high',
        title: 'Test Alert',
        message: 'Test message',
        timestamp: new Date(),
        source: 'test',
      };

      await alertManager.sendAlert(alert);
      const history = alertManager.getHistory(10);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should provide alert stats', () => {
      const stats = alertManager.getStats();
      expect(stats).toHaveProperty('totalSent');
      expect(stats).toHaveProperty('bySeverity');
      expect(stats).toHaveProperty('deduplicatedCount');
    });
  });

  describe('Alert Deduplicator', () => {
    let deduplicator: AlertDeduplicator;

    beforeAll(() => {
      deduplicator = new AlertDeduplicator({
        enabled: true,
        windowMs: 60000,
      });
    });

    it('should detect duplicate alerts', () => {
      const alert: Alert = {
        id: 'test-2',
        severity: 'medium',
        title: 'Duplicate Test',
        message: 'Test',
        timestamp: new Date(),
        source: 'test',
      };

      const isDup1 = deduplicator.isDuplicate(alert);
      const isDup2 = deduplicator.isDuplicate(alert);

      expect(isDup1).toBe(false);
      expect(isDup2).toBe(true);
    });

    it('should provide deduplication stats', () => {
      const stats = deduplicator.getStats();
      expect(stats).toHaveProperty('activeFingerprints');
      expect(stats).toHaveProperty('deduplicatedCount');
    });
  });

  describe('Alert Throttler', () => {
    let throttler: AlertThrottler;

    beforeAll(() => {
      throttler = new AlertThrottler({
        enabled: true,
        maxAlertsPerMinute: 5,
      });
    });

    it('should throttle excessive alerts', () => {
      const alert: Alert = {
        id: 'test-3',
        severity: 'low',
        title: 'Throttle Test',
        message: 'Test',
        timestamp: new Date(),
        source: 'test',
      };

      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(throttler.shouldThrottle(alert));
      }

      const throttledCount = results.filter(r => r === true).length;
      expect(throttledCount).toBeGreaterThan(0);
    });

    it('should provide throttling stats', () => {
      const stats = throttler.getStats();
      expect(stats).toHaveProperty('currentRate');
      expect(stats).toHaveProperty('maxRate');
      expect(stats).toHaveProperty('throttledCount');
    });
  });

  describe('Health Checker', () => {
    it('should create health checker instance', () => {
      const mockRedis = {
        healthCheck: async () => ({
          connected: true,
          status: 'healthy' as const,
          latency: 10,
          lastCheck: Date.now(),
        }),
      };

      const checker = new HealthChecker(mockRedis as any);
      expect(checker).toBeDefined();
    });

    it('should perform health check', async () => {
      const mockRedis = {
        healthCheck: async () => ({
          connected: true,
          status: 'healthy' as const,
          latency: 5,
          lastCheck: Date.now(),
        }),
      };

      const checker = new HealthChecker(mockRedis as any);
      const result = await checker.check();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('checks');
      expect(result.checks).toHaveProperty('redis');
      expect(result.checks).toHaveProperty('eventLoop');
      expect(result.checks).toHaveProperty('memory');
    });

    it('should provide readiness probe', async () => {
      const mockRedis = {
        healthCheck: async () => ({
          connected: true,
          status: 'healthy' as const,
          latency: 5,
          lastCheck: Date.now(),
          uptime: 10000,
        }),
      };

      const checker = new HealthChecker(mockRedis as any);
      const readiness = await checker.readinessProbe();

      expect(readiness).toHaveProperty('ready');
      expect(readiness).toHaveProperty('timestamp');
      expect(typeof readiness.ready).toBe('boolean');
    });

    it('should provide liveness probe', () => {
      const mockRedis = {
        healthCheck: async () => ({
          connected: true,
          status: 'healthy' as const,
          latency: 5,
          lastCheck: Date.now(),
        }),
      };

      const checker = new HealthChecker(mockRedis as any);
      const liveness = checker.livenessProbe();

      expect(liveness).toHaveProperty('alive');
      expect(liveness).toHaveProperty('timestamp');
      expect(liveness.alive).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should work together without conflicts', async () => {
      const exporter = new PrometheusExporter();
      const alertManager = new AlertManager({
        channels: {},
        deduplication: { enabled: true, windowMs: 60000 },
        throttling: { enabled: true, maxAlertsPerMinute: 10 },
      });

      exporter.httpRequestsTotal.inc({ method: 'GET', route: '/test', status_code: '200' });

      const alert: Alert = {
        id: 'integration-test',
        severity: 'low',
        title: 'Integration Test',
        message: 'Testing integration',
        timestamp: new Date(),
        source: 'test',
      };

      await alertManager.sendAlert(alert);

      const metrics = await exporter.getMetrics();
      const history = alertManager.getHistory(1);

      expect(metrics).toBeDefined();
      expect(history.length).toBeGreaterThan(0);
    });
  });
});
