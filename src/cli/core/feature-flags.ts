import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { join } from 'path';
import { EventEmitter } from 'events';

import { logger } from '../utils/logger';
import { advancedUI } from '../ui/advanced-cli-ui';

export const FeatureFlagSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean().default(false),
  category: z.enum(['core', 'tools', 'agents', 'ui', 'performance', 'security', 'experimental']),
  environment: z.array(z.enum(['development', 'staging', 'production', 'all'])).default(['all']),
  version: z.string().default('1.0.0'),
  dependencies: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
  rolloutPercentage: z.number().min(0).max(100).default(100),
  userGroups: z.array(z.string()).default(['all']),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  createdBy: z.string().optional(),
  lastModifiedBy: z.string().optional()
});

export const FeatureFlagConfigSchema = z.object({
  configFile: z.string().default('feature-flags.json'),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  enableRemoteConfig: z.boolean().default(false),
  remoteConfigUrl: z.string().optional(),
  refreshInterval: z.number().int().default(300000), // 5 minutes
  enableLogging: z.boolean().default(true),
  enableMetrics: z.boolean().default(true),
  enableValidation: z.boolean().default(true),
  enableHotReload: z.boolean().default(true),
  userId: z.string().optional(),
  userGroup: z.string().default('default'),
  customAttributes: z.record(z.any()).default({})
});

export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type FeatureFlagConfig = z.infer<typeof FeatureFlagConfigSchema>;

export interface FeatureFlagChangeEvent {
  flagId: string;
  oldValue: boolean;
  newValue: boolean;
  timestamp: Date;
  source: 'file' | 'api' | 'manual';
}

export class FeatureFlagManager extends EventEmitter {
  private static instance: FeatureFlagManager;
  private flags: Map<string, FeatureFlag> = new Map();
  private config: FeatureFlagConfig;
  private isInitialized = false;
  private refreshTimer?: NodeJS.Timeout;
  private configFilePath: string;

  constructor(workingDirectory: string, config: Partial<FeatureFlagConfig> = {}) {
    super();
    this.config = FeatureFlagConfigSchema.parse(config);
    this.configFilePath = join(workingDirectory, this.config.configFile);
  }

  static getInstance(workingDirectory?: string, config?: Partial<FeatureFlagConfig>): FeatureFlagManager {
    if (!FeatureFlagManager.instance && workingDirectory) {
      FeatureFlagManager.instance = new FeatureFlagManager(workingDirectory, config);
    }
    return FeatureFlagManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    advancedUI.logInfo('🚩 Initializing Feature Flag Manager...');
    const startTime = Date.now();

    try {
      await this.loadDefaultFlags();
      await this.loadFromFile();
      
      if (this.config.enableRemoteConfig) {
        await this.loadFromRemote();
      }

      if (this.config.enableValidation) {
        await this.validateFlags();
      }

      if (this.config.enableHotReload && this.config.refreshInterval > 0) {
        this.startRefreshTimer();
      }

      this.isInitialized = true;
      const loadTime = Date.now() - startTime;

      advancedUI.logSuccess(`✅ Feature Flag Manager initialized (${this.flags.size} flags, ${loadTime}ms)`);
      
      if (this.config.enableMetrics) {
        this.logFlagStats();
      }

    } catch (error: any) {
      advancedUI.logError(`❌ Feature Flag Manager initialization failed: ${error.message}`);
      throw error;
    }
  }

  isEnabled(flagId: string): boolean {
    const flag = this.flags.get(flagId);
    if (!flag) {
      if (this.config.enableLogging) {
        logger.debug(`Feature flag not found: ${flagId}, defaulting to false`);
      }
      return false;
    }

    // Check environment
    if (!flag.environment.includes(this.config.environment) && !flag.environment.includes('all')) {
      return false;
    }

    // Check date range
    const now = new Date();
    if (flag.startDate && now < flag.startDate) return false;
    if (flag.endDate && now > flag.endDate) return false;

    // Check user group
    if (!flag.userGroups.includes('all') && 
        !flag.userGroups.includes(this.config.userGroup)) {
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const hash = this.hashString(flagId + (this.config.userId || 'anonymous'));
      const percentage = hash % 100;
      if (percentage >= flag.rolloutPercentage) return false;
    }

    // Check dependencies
    if (flag.dependencies.length > 0) {
      for (const depId of flag.dependencies) {
        if (!this.isEnabled(depId)) return false;
      }
    }

    // Check conflicts
    if (flag.conflicts.length > 0) {
      for (const conflictId of flag.conflicts) {
        if (this.isEnabled(conflictId)) return false;
      }
    }

    if (this.config.enableLogging && flag.enabled) {
      logger.debug(`Feature flag enabled: ${flagId}`);
    }

    return flag.enabled;
  }

  async setFlag(flagId: string, enabled: boolean, source: 'file' | 'api' | 'manual' = 'manual'): Promise<void> {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagId}`);
    }

    const oldValue = flag.enabled;
    if (oldValue === enabled) return; // No change

    flag.enabled = enabled;
    flag.updatedAt = new Date();
    flag.lastModifiedBy = this.config.userId || 'system';

    // Emit change event
    this.emit('flagChanged', {
      flagId,
      oldValue,
      newValue: enabled,
      timestamp: new Date(),
      source
    } as FeatureFlagChangeEvent);

    if (this.config.enableLogging) {
      advancedUI.logInfo(`🚩 Feature flag ${enabled ? 'enabled' : 'disabled'}: ${flagId}`);
    }

    // Persist changes
    await this.saveToFile();
  }

  async createFlag(flag: Omit<FeatureFlag, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const flagId = flag.name.toLowerCase().replace(/\s+/g, '-');
    
    const newFlag: FeatureFlag = FeatureFlagSchema.parse({
      ...flag,
      id: flagId,
      createdBy: this.config.userId || 'system'
    });

    if (this.flags.has(flagId)) {
      throw new Error(`Feature flag already exists: ${flagId}`);
    }

    this.flags.set(flagId, newFlag);

    if (this.config.enableLogging) {
      advancedUI.logSuccess(`✅ Created feature flag: ${flagId}`);
    }

    await this.saveToFile();
    return flagId;
  }

  async updateFlag(flagId: string, updates: Partial<FeatureFlag>): Promise<void> {
    const flag = this.flags.get(flagId);
    if (!flag) {
      throw new Error(`Feature flag not found: ${flagId}`);
    }

    const updatedFlag = FeatureFlagSchema.parse({
      ...flag,
      ...updates,
      id: flagId, // Prevent ID changes
      updatedAt: new Date(),
      lastModifiedBy: this.config.userId || 'system'
    });

    this.flags.set(flagId, updatedFlag);

    if (this.config.enableLogging) {
      advancedUI.logInfo(`🚩 Updated feature flag: ${flagId}`);
    }

    await this.saveToFile();
  }

  async deleteFlag(flagId: string): Promise<boolean> {
    const flag = this.flags.get(flagId);
    if (!flag) return false;

    this.flags.delete(flagId);

    if (this.config.enableLogging) {
      advancedUI.logInfo(`🗑️  Deleted feature flag: ${flagId}`);
    }

    await this.saveToFile();
    return true;
  }

  getFlag(flagId: string): FeatureFlag | null {
    return this.flags.get(flagId) || null;
  }

  getAllFlags(): Map<string, FeatureFlag> {
    return new Map(this.flags);
  }

  getFlagsByCategory(category: string): FeatureFlag[] {
    return Array.from(this.flags.values()).filter(flag => flag.category === category);
  }

  getEnabledFlags(): FeatureFlag[] {
    return Array.from(this.flags.values()).filter(flag => this.isEnabled(flag.id));
  }

  searchFlags(query: string): FeatureFlag[] {
    const searchTerm = query.toLowerCase();
    return Array.from(this.flags.values()).filter(flag => 
      flag.name.toLowerCase().includes(searchTerm) ||
      flag.description.toLowerCase().includes(searchTerm) ||
      flag.id.toLowerCase().includes(searchTerm)
    );
  }

  async refresh(): Promise<void> {
    if (this.config.enableRemoteConfig) {
      await this.loadFromRemote();
    } else {
      await this.loadFromFile();
    }
  }

  getFlagStats() {
    const flags = Array.from(this.flags.values());
    const enabled = flags.filter(f => this.isEnabled(f.id));
    
    const stats = {
      total: flags.length,
      enabled: enabled.length,
      disabled: flags.length - enabled.length,
      byCategory: {} as Record<string, number>,
      byEnvironment: {} as Record<string, number>,
      experimental: flags.filter(f => f.category === 'experimental').length,
      recentlyUpdated: flags.filter(f => {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return f.updatedAt > dayAgo;
      }).length
    };

    // Count by category
    for (const flag of flags) {
      stats.byCategory[flag.category] = (stats.byCategory[flag.category] || 0) + 1;
    }

    // Count by environment
    for (const flag of flags) {
      for (const env of flag.environment) {
        stats.byEnvironment[env] = (stats.byEnvironment[env] || 0) + 1;
      }
    }

    return stats;
  }

  updateConfig(newConfig: Partial<FeatureFlagConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart refresh timer if interval changed
    if (newConfig.refreshInterval !== undefined && this.refreshTimer) {
      this.stopRefreshTimer();
      if (this.config.enableHotReload && this.config.refreshInterval > 0) {
        this.startRefreshTimer();
      }
    }

    advancedUI.logInfo('🚩 Feature Flag configuration updated');
  }

  async cleanup(): Promise<void> {
    this.stopRefreshTimer();
    this.removeAllListeners();
    
    if (this.config.enableLogging) {
      advancedUI.logInfo('🚩 Feature Flag Manager cleanup completed');
    }
  }

  private async loadDefaultFlags(): Promise<void> {
    // Use the schema input type so fields with defaults are optional here
    type FeatureFlagInit = Omit<z.input<typeof FeatureFlagSchema>, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'lastModifiedBy'>;

    // Core system flags
    const defaultFlags: FeatureFlagInit[] = [
      {
        name: 'LSP Integration',
        description: 'Enable Language Server Protocol integration for code intelligence',
        enabled: true,
        category: 'core',
        dependencies: [],
        environment: ['all']
      },
      {
        name: 'Context Awareness',
        description: 'Enable workspace context awareness and RAG system',
        enabled: true,
        category: 'core',
        dependencies: [],
        environment: ['all']
      },
      {
        name: 'Advanced Validation',
        description: 'Enable comprehensive validation and formatting pipeline',
        enabled: true,
        category: 'tools',
        dependencies: [],
        environment: ['all']
      },
      {
        name: 'Tool Registry',
        description: 'Enable advanced tool registry and management system',
        enabled: true,
        category: 'tools',
        dependencies: [],
        environment: ['all']
      },
      {
        name: 'Prompt Engineering',
        description: 'Enable advanced prompt registry and template system',
        enabled: true,
        category: 'agents',
        dependencies: [],
        environment: ['all']
      },
      {
        name: 'Performance Monitoring',
        description: 'Enable performance metrics and monitoring',
        enabled: true,
        category: 'performance',
        dependencies: [],
        environment: ['all']
      },
      {
        name: 'Hot Reload',
        description: 'Enable hot reloading of tools and prompts during development',
        enabled: false,
        category: 'experimental',
        environment: ['development'],
        rolloutPercentage: 50
      },
      {
        name: 'Remote Config',
        description: 'Enable remote configuration management',
        enabled: false,
        category: 'experimental',
        environment: ['staging', 'production'],
        rolloutPercentage: 25
      },
      {
        name: 'Advanced Security',
        description: 'Enable advanced security features and sandboxing',
        enabled: false,
        category: 'security',
        environment: ['production'],
        dependencies: ['tool-registry'],
        rolloutPercentage: 75
      },
      {
        name: 'Plugin System',
        description: 'Enable dynamic plugin loading and management',
        enabled: false,
        category: 'experimental',
        dependencies: ['tool-registry', 'advanced-validation'],
        rolloutPercentage: 10
      }
    ];

    for (const flagData of defaultFlags) {
      const flagId = flagData.name.toLowerCase().replace(/\s+/g, '-');
      if (!this.flags.has(flagId)) {
        const flag = FeatureFlagSchema.parse({
          ...flagData,
          id: flagId,
          createdBy: 'system'
        });
        this.flags.set(flagId, flag);
      }
    }
  }

  private async loadFromFile(): Promise<void> {
    try {
      if (!existsSync(this.configFilePath)) {
        await this.saveToFile(); // Create initial file
        return;
      }

      const content = await readFile(this.configFilePath, 'utf8');
      const data = JSON.parse(content);

      if (data.flags && Array.isArray(data.flags)) {
        for (const flagData of data.flags) {
          try {
            const flag = FeatureFlagSchema.parse(flagData);
            this.flags.set(flag.id, flag);
          } catch (error: any) {
            logger.warn(`Invalid feature flag in config: ${flagData.id || 'unknown'}`, error.message);
          }
        }
      }

    } catch (error: any) {
      logger.warn(`Failed to load feature flags from file: ${error.message}`);
    }
  }

  private async loadFromRemote(): Promise<void> {
    if (!this.config.remoteConfigUrl) return;

    try {
      // Placeholder for remote config loading
      // In a real implementation, this would fetch from a remote API
      logger.debug('Remote config loading not implemented yet');
      
    } catch (error: any) {
      logger.warn(`Failed to load feature flags from remote: ${error.message}`);
    }
  }

  private async saveToFile(): Promise<void> {
    try {
      const data = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        environment: this.config.environment,
        flags: Array.from(this.flags.values()).map(flag => ({
          ...flag,
          createdAt: flag.createdAt.toISOString(),
          updatedAt: flag.updatedAt.toISOString(),
          startDate: flag.startDate?.toISOString(),
          endDate: flag.endDate?.toISOString()
        }))
      };

      await writeFile(this.configFilePath, JSON.stringify(data, null, 2), 'utf8');

    } catch (error: any) {
      logger.error(`Failed to save feature flags to file: ${error.message}`);
    }
  }

  private async validateFlags(): Promise<void> {
    const flags = Array.from(this.flags.values());
    const issues: string[] = [];

    for (const flag of flags) {
      // Check dependencies exist
      for (const depId of flag.dependencies) {
        if (!this.flags.has(depId)) {
          issues.push(`Flag ${flag.id} depends on non-existent flag: ${depId}`);
        }
      }

      // Check conflicts exist
      for (const conflictId of flag.conflicts) {
        if (!this.flags.has(conflictId)) {
          issues.push(`Flag ${flag.id} conflicts with non-existent flag: ${conflictId}`);
        }
      }

      // Check circular dependencies
      if (this.hasCircularDependency(flag.id, new Set())) {
        issues.push(`Flag ${flag.id} has circular dependency`);
      }
    }

    if (issues.length > 0 && this.config.enableLogging) {
      advancedUI.logWarning(`⚠️  Feature flag validation issues found:`);
      for (const issue of issues) {
        logger.warn(`  - ${issue}`);
      }
    }
  }

  private hasCircularDependency(flagId: string, visited: Set<string>): boolean {
    if (visited.has(flagId)) return true;
    
    const flag = this.flags.get(flagId);
    if (!flag) return false;

    visited.add(flagId);
    
    for (const depId of flag.dependencies) {
      if (this.hasCircularDependency(depId, new Set(visited))) {
        return true;
      }
    }

    return false;
  }

  private startRefreshTimer(): void {
    this.refreshTimer = setInterval(() => {
      this.refresh().catch(error => {
        logger.warn(`Feature flag refresh failed: ${error.message}`);
      });
    }, this.config.refreshInterval);
  }

  private stopRefreshTimer(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private logFlagStats(): void {
    const stats = this.getFlagStats();
    
    advancedUI.logInfo(`🚩 Feature Flag Statistics:`);
    console.log(chalk.cyan(`   Total Flags: ${stats.total}`));
    console.log(chalk.cyan(`   Enabled: ${stats.enabled}`));
    console.log(chalk.cyan(`   Disabled: ${stats.disabled}`));
    console.log(chalk.cyan(`   Experimental: ${stats.experimental}`));
    console.log(chalk.cyan(`   Recently Updated: ${stats.recentlyUpdated}`));
    
    if (Object.keys(stats.byCategory).length > 0) {
      console.log(chalk.cyan(`   By Category:`));
      Object.entries(stats.byCategory).forEach(([category, count]) => {
        console.log(chalk.gray(`     ${category}: ${count}`));
      });
    }
  }
}

export const featureFlagManager = FeatureFlagManager.getInstance();