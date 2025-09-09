import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { logger } from '../../utils/logger';
import { UniversalAgent } from '../universal-agent';
import { BackgroundAgentInstance } from '../../services/background-agent-service';

/**
 * Dependency Monitor Agent
 * Monitors project dependencies for updates, vulnerabilities, and compatibility
 */
export class DependencyMonitorAgent extends EventEmitter {
  private instance: BackgroundAgentInstance;
  private agent: UniversalAgent;
  private isRunning = false;
  private dependencyCache: Map<string, { version: string; lastChecked: Date; vulnerabilities: any[] }> = new Map();
  private checkInterval?: NodeJS.Timeout;

  constructor(instance: BackgroundAgentInstance, agent: UniversalAgent) {
    super();
    this.instance = instance;
    this.agent = agent;
  }

  /**
   * Start the dependency monitor
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      await logger.logService('warn', 'dependency-monitor-agent', 'Dependency monitor is already running');
      return;
    }

    try {
      this.isRunning = true;
      
      // Initialize dependency cache
      await this.initializeDependencyCache();

      // Start periodic checks
      this.startPeriodicChecks();

      await logger.logService('info', 'dependency-monitor-agent', 'Started dependency monitor', {
        agentId: this.instance.id,
        workingDirectory: this.instance.config.workingDirectory
      });

      this.emit('started');

    } catch (error: any) {
      await logger.logService('error', 'dependency-monitor-agent', 'Failed to start dependency monitor', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  /**
   * Stop the dependency monitor
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      await logger.logService('warn', 'dependency-monitor-agent', 'Dependency monitor is not running');
      return;
    }

    try {
      this.isRunning = false;
      
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
        this.checkInterval = undefined;
      }

      await logger.logService('info', 'dependency-monitor-agent', 'Stopped dependency monitor', {
        agentId: this.instance.id
      });

      this.emit('stopped');

    } catch (error: any) {
      await logger.logService('error', 'dependency-monitor-agent', 'Failed to stop dependency monitor', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  /**
   * Get current status
   */
  public getStatus(): { 
    isRunning: boolean; 
    monitoredDependencies: number; 
    lastCheck?: Date;
    vulnerabilities: number;
  } {
    const vulnerabilities = Array.from(this.dependencyCache.values())
      .reduce((total, dep) => total + dep.vulnerabilities.length, 0);

    return {
      isRunning: this.isRunning,
      monitoredDependencies: this.dependencyCache.size,
      lastCheck: this.instance.lastActivity,
      vulnerabilities
    };
  }

  /**
   * Check dependencies immediately
   */
  public async checkDependencies(): Promise<any> {
    try {
      await logger.logService('info', 'dependency-monitor-agent', 'Starting dependency check', {
        agentId: this.instance.id
      });

      const results = await this.performDependencyCheck();
      
      this.instance.lastActivity = new Date();
      this.emit('dependencies-checked', results);

      return results;

    } catch (error: any) {
      await logger.logService('error', 'dependency-monitor-agent', 'Failed to check dependencies', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  private async initializeDependencyCache(): Promise<void> {
    this.dependencyCache.clear();

    const { workingDirectory } = this.instance.config;
    const packageJsonPath = path.join(workingDirectory, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

        for (const [name, version] of Object.entries(dependencies)) {
          this.dependencyCache.set(name, {
            version: version as string,
            lastChecked: new Date(0), // Mark as needing check
            vulnerabilities: []
          });
        }

        await logger.logService('info', 'dependency-monitor-agent', `Initialized dependency cache with ${this.dependencyCache.size} dependencies`, {
          agentId: this.instance.id
        });
      } catch (error: any) {
        await logger.logService('error', 'dependency-monitor-agent', 'Failed to parse package.json', {
          error: error.message,
          agentId: this.instance.id
        });
      }
    }
  }

  private startPeriodicChecks(): void {
    const interval = this.instance.config.interval || 3600000; // Default 1 hour

    this.checkInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.checkDependencies();
      } catch (error: any) {
        await logger.logService('error', 'dependency-monitor-agent', 'Periodic dependency check failed', {
          error: error.message,
          agentId: this.instance.id
        });
      }
    }, interval);
  }

  private async performDependencyCheck(): Promise<any> {
    const taskId = nanoid();
    
    await logger.logService('info', 'dependency-monitor-agent', 'Performing dependency check', {
      taskId,
      agentId: this.instance.id
    });

    // Create dependency check task
    const task = {
      id: taskId,
      type: 'dependency-check',
      title: 'Dependency Monitor Check',
      description: 'Check dependencies for updates and vulnerabilities',
      priority: 'normal' as const,
      status: 'pending' as const,
      data: {
        dependencies: Array.from(this.dependencyCache.entries()).map(([name, info]) => ({
          name,
          version: info.version
        })),
        checkType: 'full-check'
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      progress: 0
    };

    // Execute check with universal agent
    const result = await this.agent.executeTask(task);

    // Process results
    const checkResults = await this.processDependencyResults(result);

    await logger.logService('info', 'dependency-monitor-agent', 'Dependency check completed', {
      taskId,
      status: result.status,
      agentId: this.instance.id
    });

    return checkResults;
  }

  private async processDependencyResults(agentResult: any): Promise<any> {
    const results = {
      timestamp: new Date(),
      totalDependencies: this.dependencyCache.size,
      updatesAvailable: 0,
      vulnerabilities: 0,
      outdated: [] as any[],
      vulnerable: [] as any[],
      recommendations: [] as any[]
    };

    // Check for updates and vulnerabilities
    for (const [name, info] of this.dependencyCache.entries()) {
      try {
        // Check for updates (simplified - in real implementation, would call npm registry)
        const hasUpdate = await this.checkForUpdates(name, info.version);
        if (hasUpdate) {
          results.updatesAvailable++;
          results.outdated.push({
            name,
            currentVersion: info.version,
            latestVersion: hasUpdate.latest,
            updateType: hasUpdate.type
          });
        }

        // Check for vulnerabilities (simplified - in real implementation, would call security APIs)
        const vulnerabilities = await this.checkVulnerabilities(name, info.version);
        if (vulnerabilities.length > 0) {
          results.vulnerabilities += vulnerabilities.length;
          results.vulnerable.push({
            name,
            version: info.version,
            vulnerabilities
          });

          // Update cache
          info.vulnerabilities = vulnerabilities;
        }

        // Update last checked time
        info.lastChecked = new Date();

      } catch (error: any) {
        await logger.logService('warn', 'dependency-monitor-agent', `Failed to check dependency: ${name}`, {
          name,
          error: error.message,
          agentId: this.instance.id
        });
      }
    }

    // Generate recommendations
    results.recommendations = this.generateRecommendations(results);

    return results;
  }

  private async checkForUpdates(name: string, currentVersion: string): Promise<any> {
    // Simplified update check - in real implementation, would call npm registry API
    // For now, simulate some updates
    const mockUpdates: Record<string, any> = {
      'react': { latest: '18.2.0', type: 'minor' },
      'typescript': { latest: '5.0.0', type: 'major' },
      'lodash': { latest: '4.17.21', type: 'patch' }
    };

    return mockUpdates[name] || null;
  }

  private async checkVulnerabilities(name: string, version: string): Promise<any[]> {
    // Simplified vulnerability check - in real implementation, would call security APIs
    // For now, simulate some vulnerabilities
    const mockVulnerabilities: Record<string, any[]> = {
      'lodash': [
        {
          id: 'CVE-2021-23337',
          severity: 'high',
          description: 'Command injection vulnerability',
          fixedIn: '4.17.21'
        }
      ],
      'axios': [
        {
          id: 'CVE-2023-45853',
          severity: 'medium',
          description: 'Prototype pollution vulnerability',
          fixedIn: '1.6.0'
        }
      ]
    };

    return mockVulnerabilities[name] || [];
  }

  private generateRecommendations(results: any): any[] {
    const recommendations: any[] = [];

    // High priority vulnerabilities
    const highSeverityVulns = results.vulnerable.filter((dep: any) => 
      dep.vulnerabilities.some((vuln: any) => vuln.severity === 'high')
    );

    if (highSeverityVulns.length > 0) {
      recommendations.push({
        type: 'security',
        priority: 'high',
        message: `Update ${highSeverityVulns.length} dependencies with high-severity vulnerabilities`,
        action: 'update-dependencies',
        dependencies: highSeverityVulns.map((dep: any) => dep.name)
      });
    }

    // Major version updates
    const majorUpdates = results.outdated.filter((dep: any) => dep.updateType === 'major');
    if (majorUpdates.length > 0) {
      recommendations.push({
        type: 'upgrade',
        priority: 'medium',
        message: `Consider upgrading ${majorUpdates.length} dependencies to major versions`,
        action: 'review-major-updates',
        dependencies: majorUpdates.map((dep: any) => dep.name)
      });
    }

    // Outdated dependencies
    if (results.outdated.length > 0) {
      recommendations.push({
        type: 'maintenance',
        priority: 'low',
        message: `Update ${results.outdated.length} outdated dependencies`,
        action: 'update-dependencies',
        dependencies: results.outdated.map((dep: any) => dep.name)
      });
    }

    return recommendations;
  }
}