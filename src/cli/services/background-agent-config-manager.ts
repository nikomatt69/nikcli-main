import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';
import { BackgroundAgentConfig, BackgroundAgentType } from './background-agent-service';

/**
 * Background Agent Configuration Manager
 * Handles creation and management of default background agent configurations
 */
export class BackgroundAgentConfigManager {
  private static instance: BackgroundAgentConfigManager;
  private configPath: string;
  private workingDirectory: string;

  private constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.configPath = path.join(workingDirectory, '.nikcli', 'background-agents.json');
  }

  public static getInstance(workingDirectory?: string): BackgroundAgentConfigManager {
    if (!BackgroundAgentConfigManager.instance) {
      if (!workingDirectory) {
        throw new Error('Working directory required for first initialization');
      }
      BackgroundAgentConfigManager.instance = new BackgroundAgentConfigManager(workingDirectory);
    }
    return BackgroundAgentConfigManager.instance;
  }

  /**
   * Create default background agent configurations
   */
  public async createDefaultConfigurations(): Promise<BackgroundAgentConfig[]> {
    const configs: BackgroundAgentConfig[] = [];

    // File Watcher Agent
    configs.push({
      id: 'file-watcher-default',
      type: BackgroundAgentType.FILE_WATCHER,
      name: 'File Watcher',
      description: 'Monitors file system changes and triggers actions',
      enabled: true,
      workingDirectory: this.workingDirectory,
      interval: 0, // Event-driven, no interval
      triggers: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.json'],
      settings: {
        ignorePatterns: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
        debounceMs: 1000,
        maxFileSize: 1024 * 1024 // 1MB
      },
      autoStart: true,
      maxConcurrentTasks: 2,
      timeout: 30000
    });

    // Code Analyzer Agent
    configs.push({
      id: 'code-analyzer-default',
      type: BackgroundAgentType.CODE_ANALYZER,
      name: 'Code Analyzer',
      description: 'Continuously analyzes code for quality and patterns',
      enabled: true,
      workingDirectory: this.workingDirectory,
      interval: 300000, // 5 minutes
      settings: {
        analysisTypes: ['complexity', 'quality', 'patterns', 'metrics'],
        maxFilesPerRun: 10,
        cacheResults: true,
        generateReports: true
      },
      autoStart: true,
      maxConcurrentTasks: 1,
      timeout: 60000
    });

    // Dependency Monitor Agent
    configs.push({
      id: 'dependency-monitor-default',
      type: BackgroundAgentType.DEPENDENCY_MONITOR,
      name: 'Dependency Monitor',
      description: 'Monitors dependencies for updates and vulnerabilities',
      enabled: true,
      workingDirectory: this.workingDirectory,
      interval: 3600000, // 1 hour
      settings: {
        checkUpdates: true,
        checkVulnerabilities: true,
        checkCompatibility: true,
        autoUpdate: false,
        notifyOnCritical: true
      },
      autoStart: true,
      maxConcurrentTasks: 1,
      timeout: 120000
    });

    // Security Scanner Agent
    configs.push({
      id: 'security-scanner-default',
      type: BackgroundAgentType.SECURITY_SCANNER,
      name: 'Security Scanner',
      description: 'Scans code for security vulnerabilities',
      enabled: true,
      workingDirectory: this.workingDirectory,
      interval: 1800000, // 30 minutes
      settings: {
        scanTypes: ['secrets', 'injection', 'xss', 'crypto', 'auth'],
        severityThreshold: 'medium',
        generateReports: true,
        autoFix: false
      },
      autoStart: true,
      maxConcurrentTasks: 1,
      timeout: 90000
    });

    // Performance Monitor Agent
    configs.push({
      id: 'performance-monitor-default',
      type: BackgroundAgentType.PERFORMANCE_MONITOR,
      name: 'Performance Monitor',
      description: 'Monitors application performance and bottlenecks',
      enabled: false, // Disabled by default
      workingDirectory: this.workingDirectory,
      interval: 600000, // 10 minutes
      settings: {
        monitorTypes: ['memory', 'cpu', 'network', 'database'],
        alertThresholds: {
          memory: 80,
          cpu: 70,
          responseTime: 1000
        },
        generateReports: true
      },
      autoStart: false,
      maxConcurrentTasks: 1,
      timeout: 60000
    });

    // Documentation Generator Agent
    configs.push({
      id: 'documentation-generator-default',
      type: BackgroundAgentType.DOCUMENTATION_GENERATOR,
      name: 'Documentation Generator',
      description: 'Automatically generates and updates documentation',
      enabled: false, // Disabled by default
      workingDirectory: this.workingDirectory,
      interval: 7200000, // 2 hours
      settings: {
        generateTypes: ['api', 'readme', 'changelog', 'code-comments'],
        outputFormats: ['markdown', 'html'],
        autoCommit: false,
        includeDiagrams: true
      },
      autoStart: false,
      maxConcurrentTasks: 1,
      timeout: 180000
    });

    // Test Runner Agent
    configs.push({
      id: 'test-runner-default',
      type: BackgroundAgentType.TEST_RUNNER,
      name: 'Test Runner',
      description: 'Runs tests automatically on code changes',
      enabled: false, // Disabled by default
      workingDirectory: this.workingDirectory,
      interval: 0, // Event-driven
      triggers: ['**/*.test.ts', '**/*.test.js', '**/*.spec.ts', '**/*.spec.js'],
      settings: {
        testFrameworks: ['jest', 'mocha', 'vitest'],
        runOnChange: true,
        runOnSchedule: false,
        generateReports: true,
        notifyOnFailure: true
      },
      autoStart: false,
      maxConcurrentTasks: 1,
      timeout: 300000
    });

    // Build Monitor Agent
    configs.push({
      id: 'build-monitor-default',
      type: BackgroundAgentType.BUILD_MONITOR,
      name: 'Build Monitor',
      description: 'Monitors build processes and deployment status',
      enabled: false, // Disabled by default
      workingDirectory: this.workingDirectory,
      interval: 900000, // 15 minutes
      settings: {
        monitorTypes: ['build', 'deploy', 'ci-cd'],
        checkEndpoints: [],
        alertOnFailure: true,
        generateReports: true
      },
      autoStart: false,
      maxConcurrentTasks: 1,
      timeout: 120000
    });

    await logger.logService('info', 'background-agent-config-manager', `Created ${configs.length} default background agent configurations`);
    return configs;
  }

  /**
   * Load existing configurations
   */
  public async loadConfigurations(): Promise<BackgroundAgentConfig[]> {
    try {
      if (!fs.existsSync(this.configPath)) {
        await logger.logService('info', 'background-agent-config-manager', 'No existing configurations found, will create defaults');
        return [];
      }

      const data = fs.readFileSync(this.configPath, 'utf8');
      const configs: BackgroundAgentConfig[] = JSON.parse(data);

      await logger.logService('info', 'background-agent-config-manager', `Loaded ${configs.length} background agent configurations`);
      return configs;

    } catch (error: any) {
      await logger.logService('error', 'background-agent-config-manager', 'Failed to load configurations', { error: error.message });
      return [];
    }
  }

  /**
   * Save configurations to file
   */
  public async saveConfigurations(configs: BackgroundAgentConfig[]): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(configs, null, 2));
      
      await logger.logService('info', 'background-agent-config-manager', `Saved ${configs.length} background agent configurations`);
    } catch (error: any) {
      await logger.logService('error', 'background-agent-config-manager', 'Failed to save configurations', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a custom background agent configuration
   */
  public createCustomConfiguration(
    type: BackgroundAgentType,
    name: string,
    description: string,
    settings: Record<string, any> = {}
  ): BackgroundAgentConfig {
    const id = `${type}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    const baseConfig: BackgroundAgentConfig = {
      id,
      type,
      name,
      description,
      enabled: false,
      workingDirectory: this.workingDirectory,
      interval: 300000, // Default 5 minutes
      settings,
      autoStart: false,
      maxConcurrentTasks: 1,
      timeout: 60000
    };

    // Add type-specific defaults
    switch (type) {
      case BackgroundAgentType.FILE_WATCHER:
        baseConfig.interval = 0; // Event-driven
        baseConfig.triggers = ['**/*.ts', '**/*.js'];
        baseConfig.settings = {
          ignorePatterns: ['**/node_modules/**', '**/dist/**'],
          debounceMs: 1000,
          ...settings
        };
        break;

      case BackgroundAgentType.CODE_ANALYZER:
        baseConfig.interval = 300000; // 5 minutes
        baseConfig.settings = {
          analysisTypes: ['complexity', 'quality'],
          maxFilesPerRun: 10,
          ...settings
        };
        break;

      case BackgroundAgentType.DEPENDENCY_MONITOR:
        baseConfig.interval = 3600000; // 1 hour
        baseConfig.settings = {
          checkUpdates: true,
          checkVulnerabilities: true,
          ...settings
        };
        break;

      case BackgroundAgentType.SECURITY_SCANNER:
        baseConfig.interval = 1800000; // 30 minutes
        baseConfig.settings = {
          scanTypes: ['secrets', 'injection'],
          severityThreshold: 'medium',
          ...settings
        };
        break;

      case BackgroundAgentType.PERFORMANCE_MONITOR:
        baseConfig.interval = 600000; // 10 minutes
        baseConfig.settings = {
          monitorTypes: ['memory', 'cpu'],
          ...settings
        };
        break;

      case BackgroundAgentType.DOCUMENTATION_GENERATOR:
        baseConfig.interval = 7200000; // 2 hours
        baseConfig.settings = {
          generateTypes: ['api', 'readme'],
          ...settings
        };
        break;

      case BackgroundAgentType.TEST_RUNNER:
        baseConfig.interval = 0; // Event-driven
        baseConfig.triggers = ['**/*.test.ts', '**/*.spec.ts'];
        baseConfig.settings = {
          testFrameworks: ['jest'],
          runOnChange: true,
          ...settings
        };
        break;

      case BackgroundAgentType.BUILD_MONITOR:
        baseConfig.interval = 900000; // 15 minutes
        baseConfig.settings = {
          monitorTypes: ['build'],
          ...settings
        };
        break;
    }

    return baseConfig;
  }

  /**
   * Validate a configuration
   */
  public validateConfiguration(config: BackgroundAgentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!config.id) errors.push('ID is required');
    if (!config.type) errors.push('Type is required');
    if (!config.name) errors.push('Name is required');
    if (!config.workingDirectory) errors.push('Working directory is required');

    // Type validation
    if (config.type && !Object.values(BackgroundAgentType).includes(config.type)) {
      errors.push(`Invalid agent type: ${config.type}`);
    }

    // Interval validation
    if (config.interval !== undefined && config.interval < 0) {
      errors.push('Interval must be non-negative');
    }

    // Timeout validation
    if (config.timeout !== undefined && config.timeout <= 0) {
      errors.push('Timeout must be positive');
    }

    // Max concurrent tasks validation
    if (config.maxConcurrentTasks !== undefined && config.maxConcurrentTasks <= 0) {
      errors.push('Max concurrent tasks must be positive');
    }

    // Working directory validation
    if (config.workingDirectory && !fs.existsSync(config.workingDirectory)) {
      errors.push(`Working directory does not exist: ${config.workingDirectory}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get configuration template for a specific agent type
   */
  public getConfigurationTemplate(type: BackgroundAgentType): Partial<BackgroundAgentConfig> {
    const templates: Record<BackgroundAgentType, Partial<BackgroundAgentConfig>> = {
      [BackgroundAgentType.FILE_WATCHER]: {
        interval: 0,
        triggers: ['**/*.ts', '**/*.js'],
        settings: {
          ignorePatterns: ['**/node_modules/**'],
          debounceMs: 1000
        }
      },
      [BackgroundAgentType.CODE_ANALYZER]: {
        interval: 300000,
        settings: {
          analysisTypes: ['complexity', 'quality'],
          maxFilesPerRun: 10
        }
      },
      [BackgroundAgentType.DEPENDENCY_MONITOR]: {
        interval: 3600000,
        settings: {
          checkUpdates: true,
          checkVulnerabilities: true
        }
      },
      [BackgroundAgentType.SECURITY_SCANNER]: {
        interval: 1800000,
        settings: {
          scanTypes: ['secrets', 'injection'],
          severityThreshold: 'medium'
        }
      },
      [BackgroundAgentType.PERFORMANCE_MONITOR]: {
        interval: 600000,
        settings: {
          monitorTypes: ['memory', 'cpu']
        }
      },
      [BackgroundAgentType.DOCUMENTATION_GENERATOR]: {
        interval: 7200000,
        settings: {
          generateTypes: ['api', 'readme']
        }
      },
      [BackgroundAgentType.TEST_RUNNER]: {
        interval: 0,
        triggers: ['**/*.test.ts'],
        settings: {
          testFrameworks: ['jest'],
          runOnChange: true
        }
      },
      [BackgroundAgentType.BUILD_MONITOR]: {
        interval: 900000,
        settings: {
          monitorTypes: ['build']
        }
      }
    };

    return templates[type] || {};
  }
}

// Export singleton instance
export const backgroundAgentConfigManager = BackgroundAgentConfigManager.getInstance();