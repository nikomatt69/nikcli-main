import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { BackgroundAgentInstance, BackgroundAgentStatus } from './background-agent-service';
import { backgroundAgentCommunication } from './background-agent-communication';

/**
 * Background Agent Monitor
 * Monitors agent health, performance, and provides alerts
 */
export class BackgroundAgentMonitor extends EventEmitter {
  private static instance: BackgroundAgentMonitor;
  private monitoringInterval?: NodeJS.Timeout;
  private isMonitoring = false;
  private agentMetrics: Map<string, AgentMetrics> = new Map();
  private alerts: Alert[] = [];
  private maxAlerts = 1000;
  private logPath: string;
  private workingDirectory: string;

  private constructor(workingDirectory: string) {
    super();
    this.workingDirectory = workingDirectory;
    this.logPath = path.join(workingDirectory, '.nikcli', 'background-agent-monitor.log');
    this.setupLogging();
  }

  public static getInstance(workingDirectory?: string): BackgroundAgentMonitor {
    if (!BackgroundAgentMonitor.instance) {
      if (!workingDirectory) {
        throw new Error('Working directory required for first initialization');
      }
      BackgroundAgentMonitor.instance = new BackgroundAgentMonitor(workingDirectory);
    }
    return BackgroundAgentMonitor.instance;
  }

  /**
   * Start monitoring
   */
  public async startMonitoring(intervalMs: number = 30000): Promise<void> {
    if (this.isMonitoring) {
      await logger.logService('warn', 'background-agent-monitor', 'Monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      await this.performMonitoringCycle();
    }, intervalMs);

    await logger.logService('info', 'background-agent-monitor', `Started monitoring with ${intervalMs}ms interval`);
    this.emit('monitoring-started');
  }

  /**
   * Stop monitoring
   */
  public async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      await logger.logService('warn', 'background-agent-monitor', 'Monitoring is not running');
      return;
    }

    this.isMonitoring = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    await logger.logService('info', 'background-agent-monitor', 'Stopped monitoring');
    this.emit('monitoring-stopped');
  }

  /**
   * Record agent metrics
   */
  public recordAgentMetrics(agent: BackgroundAgentInstance): void {
    const agentId = agent.id;
    const now = Date.now();

    if (!this.agentMetrics.has(agentId)) {
      this.agentMetrics.set(agentId, {
        agentId,
        startTime: now,
        lastUpdate: now,
        statusChanges: [],
        taskCount: 0,
        errorCount: 0,
        averageTaskDuration: 0,
        totalTaskDuration: 0,
        memoryUsage: 0,
        cpuUsage: 0,
        uptime: 0,
        healthScore: 100
      });
    }

    const metrics = this.agentMetrics.get(agentId)!;
    const previousStatus = metrics.statusChanges.length > 0 ? 
      metrics.statusChanges[metrics.statusChanges.length - 1].status : null;

    // Record status change if different
    if (previousStatus !== agent.status) {
      metrics.statusChanges.push({
        status: agent.status,
        timestamp: now,
        duration: previousStatus ? now - metrics.statusChanges[metrics.statusChanges.length - 1].timestamp : 0
      });
    }

    // Update metrics
    metrics.lastUpdate = now;
    metrics.taskCount = agent.taskCount;
    metrics.errorCount = agent.errorCount;
    metrics.uptime = now - metrics.startTime;

    // Calculate health score
    metrics.healthScore = this.calculateHealthScore(agent, metrics);

    // Check for alerts
    this.checkAlerts(agent, metrics);
  }

  /**
   * Get agent metrics
   */
  public getAgentMetrics(agentId: string): AgentMetrics | undefined {
    return this.agentMetrics.get(agentId);
  }

  /**
   * Get all agent metrics
   */
  public getAllMetrics(): Map<string, AgentMetrics> {
    return new Map(this.agentMetrics);
  }

  /**
   * Get alerts
   */
  public getAlerts(limit?: number): Alert[] {
    const sortedAlerts = this.alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? sortedAlerts.slice(0, limit) : sortedAlerts;
  }

  /**
   * Get system health summary
   */
  public getSystemHealth(): SystemHealth {
    const agents = Array.from(this.agentMetrics.values());
    const totalAgents = agents.length;
    const runningAgents = agents.filter(m => m.statusChanges.length > 0 && 
      m.statusChanges[m.statusChanges.length - 1].status === BackgroundAgentStatus.RUNNING).length;
    const errorAgents = agents.filter(m => m.errorCount > 0).length;
    const averageHealthScore = totalAgents > 0 ? 
      agents.reduce((sum, m) => sum + m.healthScore, 0) / totalAgents : 100;

    const recentAlerts = this.alerts.filter(alert => 
      Date.now() - alert.timestamp.getTime() < 3600000 // Last hour
    );

    return {
      totalAgents,
      runningAgents,
      errorAgents,
      averageHealthScore,
      recentAlerts: recentAlerts.length,
      systemStatus: this.determineSystemStatus(runningAgents, totalAgents, averageHealthScore),
      timestamp: new Date()
    };
  }

  /**
   * Generate monitoring report
   */
  public async generateReport(): Promise<MonitoringReport> {
    const systemHealth = this.getSystemHealth();
    const allMetrics = this.getAllMetrics();
    const recentAlerts = this.getAlerts(50);

    const report: MonitoringReport = {
      id: nanoid(),
      timestamp: new Date(),
      systemHealth,
      agentMetrics: Array.from(allMetrics.values()),
      recentAlerts,
      summary: this.generateSummary(systemHealth, allMetrics, recentAlerts)
    };

    // Save report to file
    await this.saveReport(report);

    return report;
  }

  /**
   * Clear old alerts
   */
  public clearOldAlerts(olderThanMs: number = 86400000): void { // Default 24 hours
    const cutoff = Date.now() - olderThanMs;
    this.alerts = this.alerts.filter(alert => alert.timestamp.getTime() > cutoff);
  }

  /**
   * Clear all alerts
   */
  public clearAllAlerts(): void {
    this.alerts = [];
  }

  // Private methods

  private setupLogging(): void {
    // Ensure log directory exists
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private async performMonitoringCycle(): Promise<void> {
    try {
      // This would be called by the background agent service
      // to update metrics for all agents
      this.emit('monitoring-cycle', {
        timestamp: new Date(),
        metricsCount: this.agentMetrics.size,
        alertsCount: this.alerts.length
      });

      // Clean up old alerts
      this.clearOldAlerts();

    } catch (error: any) {
      await logger.logService('error', 'background-agent-monitor', 'Monitoring cycle failed', {
        error: error.message
      });
    }
  }

  private calculateHealthScore(agent: BackgroundAgentInstance, metrics: AgentMetrics): number {
    let score = 100;

    // Deduct points for errors
    if (metrics.errorCount > 0) {
      score -= Math.min(metrics.errorCount * 5, 50); // Max 50 points for errors
    }

    // Deduct points for low uptime (if agent should be running)
    if (agent.config.enabled && agent.status !== BackgroundAgentStatus.RUNNING) {
      score -= 20;
    }

    // Deduct points for high task failure rate
    if (metrics.taskCount > 0) {
      const failureRate = metrics.errorCount / metrics.taskCount;
      if (failureRate > 0.1) { // More than 10% failure rate
        score -= Math.min(failureRate * 100, 30); // Max 30 points for high failure rate
      }
    }

    // Deduct points for long downtime
    if (metrics.statusChanges.length > 0) {
      const lastStatus = metrics.statusChanges[metrics.statusChanges.length - 1];
      if (lastStatus.status === BackgroundAgentStatus.ERROR || 
          lastStatus.status === BackgroundAgentStatus.STOPPED) {
        const downtimeHours = (Date.now() - lastStatus.timestamp) / (1000 * 60 * 60);
        if (downtimeHours > 1) {
          score -= Math.min(downtimeHours * 5, 25); // Max 25 points for downtime
        }
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  private checkAlerts(agent: BackgroundAgentInstance, metrics: AgentMetrics): void {
    const alerts: Alert[] = [];

    // Health score alert
    if (metrics.healthScore < 50) {
      alerts.push({
        id: nanoid(),
        type: 'health',
        severity: metrics.healthScore < 25 ? 'critical' : 'warning',
        message: `Agent ${agent.config.name} health score is low: ${metrics.healthScore}`,
        agentId: agent.id,
        timestamp: new Date(),
        data: { healthScore: metrics.healthScore }
      });
    }

    // Error rate alert
    if (metrics.taskCount > 10 && metrics.errorCount / metrics.taskCount > 0.2) {
      alerts.push({
        id: nanoid(),
        type: 'error-rate',
        severity: 'warning',
        message: `Agent ${agent.config.name} has high error rate: ${(metrics.errorCount / metrics.taskCount * 100).toFixed(1)}%`,
        agentId: agent.id,
        timestamp: new Date(),
        data: { errorRate: metrics.errorCount / metrics.taskCount }
      });
    }

    // Status alert
    if (agent.status === BackgroundAgentStatus.ERROR) {
      alerts.push({
        id: nanoid(),
        type: 'status',
        severity: 'critical',
        message: `Agent ${agent.config.name} is in error state`,
        agentId: agent.id,
        timestamp: new Date(),
        data: { status: agent.status, lastError: agent.lastError }
      });
    }

    // Add new alerts
    for (const alert of alerts) {
      this.addAlert(alert);
    }
  }

  private addAlert(alert: Alert): void {
    this.alerts.push(alert);

    // Limit alert history
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts);
    }

    // Emit alert event
    this.emit('alert', alert);

    // Log alert
    logger.logService('warn', 'background-agent-monitor', `Alert: ${alert.message}`, {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      agentId: alert.agentId
    });
  }

  private determineSystemStatus(runningAgents: number, totalAgents: number, averageHealthScore: number): 'healthy' | 'warning' | 'critical' {
    if (totalAgents === 0) return 'healthy';
    
    const runningRatio = runningAgents / totalAgents;
    
    if (runningRatio < 0.5 || averageHealthScore < 30) {
      return 'critical';
    } else if (runningRatio < 0.8 || averageHealthScore < 70) {
      return 'warning';
    } else {
      return 'healthy';
    }
  }

  private generateSummary(systemHealth: SystemHealth, metrics: Map<string, AgentMetrics>, alerts: Alert[]): string {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = alerts.filter(a => a.severity === 'warning').length;

    let summary = `System Status: ${systemHealth.systemStatus.toUpperCase()}\n`;
    summary += `Total Agents: ${systemHealth.totalAgents} (${systemHealth.runningAgents} running)\n`;
    summary += `Average Health Score: ${systemHealth.averageHealthScore.toFixed(1)}/100\n`;
    summary += `Alerts: ${criticalAlerts} critical, ${warningAlerts} warning\n`;

    if (criticalAlerts > 0) {
      summary += `\nCritical Issues:\n`;
      alerts.filter(a => a.severity === 'critical').slice(0, 3).forEach(alert => {
        summary += `- ${alert.message}\n`;
      });
    }

    return summary;
  }

  private async saveReport(report: MonitoringReport): Promise<void> {
    try {
      const reportPath = path.join(this.workingDirectory, '.nikcli', 'reports', `monitoring-report-${report.id}.json`);
      const reportDir = path.dirname(reportPath);
      
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
      }

      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      
      await logger.logService('info', 'background-agent-monitor', `Saved monitoring report: ${report.id}`);
    } catch (error: any) {
      await logger.logService('error', 'background-agent-monitor', 'Failed to save monitoring report', {
        error: error.message
      });
    }
  }
}

/**
 * Agent Metrics Interface
 */
export interface AgentMetrics {
  agentId: string;
  startTime: number;
  lastUpdate: number;
  statusChanges: StatusChange[];
  taskCount: number;
  errorCount: number;
  averageTaskDuration: number;
  totalTaskDuration: number;
  memoryUsage: number;
  cpuUsage: number;
  uptime: number;
  healthScore: number;
}

/**
 * Status Change Interface
 */
export interface StatusChange {
  status: BackgroundAgentStatus;
  timestamp: number;
  duration: number;
}

/**
 * Alert Interface
 */
export interface Alert {
  id: string;
  type: 'health' | 'error-rate' | 'status' | 'performance' | 'communication';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  agentId: string;
  timestamp: Date;
  data?: any;
}

/**
 * System Health Interface
 */
export interface SystemHealth {
  totalAgents: number;
  runningAgents: number;
  errorAgents: number;
  averageHealthScore: number;
  recentAlerts: number;
  systemStatus: 'healthy' | 'warning' | 'critical';
  timestamp: Date;
}

/**
 * Monitoring Report Interface
 */
export interface MonitoringReport {
  id: string;
  timestamp: Date;
  systemHealth: SystemHealth;
  agentMetrics: AgentMetrics[];
  recentAlerts: Alert[];
  summary: string;
}

// Export singleton instance
export const backgroundAgentMonitor = BackgroundAgentMonitor.getInstance();