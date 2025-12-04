export interface MigrationConfig {
  // Target environments and runtimes
  targetRuntime: 'bun' | 'node' | 'both';
  compatibilityMode: boolean;

  // Migration strategies
  migrationStrategy: 'progressive' | 'full' | 'phased';
  autoFallback: boolean;

  // Project analysis settings
  analyzeDependencies: boolean;
  checkCompatibility: boolean;
  validateScripts: boolean;

  // Backup and rollback settings
  createBackups: boolean;
  backupLocation: string;
  rollbackEnabled: boolean;

  // Issue resolution settings
  autoResolve: boolean;
  resolveCommonIssues: boolean;
  customIssueResolvers: IssueResolver[];

  // Progressive migration settings
  phaseTimeout: number;
  enableMonitoring: boolean;
  healthCheckInterval: number;
}

export interface IssueResolver {
  pattern: string;
  type: 'dependency' | 'script' | 'config' | 'runtime';
  resolution: string;
  autoApply: boolean;
}

export const defaultMigrationConfig: MigrationConfig = {
  targetRuntime: 'bun',
  compatibilityMode: true,
  migrationStrategy: 'progressive',
  autoFallback: true,
  analyzeDependencies: true,
  checkCompatibility: true,
  validateScripts: true,
  createBackups: true,
  backupLocation: './migration-backups',
  rollbackEnabled: true,
  autoResolve: false,
  resolveCommonIssues: true,
  customIssueResolvers: [],
  phaseTimeout: 300000, // 5 minutes
  enableMonitoring: true,
  healthCheckInterval: 30000, // 30 seconds
};

export const commonIssuePatterns = [
  {
    pattern: 'Cannot find module',
    type: 'dependency' as const,
    resolution: 'Install missing dependency or update import path',
    autoApply: false,
  },
  {
    pattern: 'Buffer is not defined',
    type: 'runtime' as const,
    resolution: 'Add polyfill for Buffer global',
    autoApply: true,
  },
  {
    pattern: 'process.env.NODE_ENV',
    type: 'config' as const,
    resolution: 'Update environment variable access pattern',
    autoApply: true,
  },
  {
    pattern: 'require()',
    type: 'script' as const,
    resolution: 'Convert to ES modules import/export',
    autoApply: false,
  },
  {
    pattern: '__dirname',
    type: 'runtime' as const,
    resolution: 'Use import.meta.url for directory paths',
    autoApply: true,
  },
  {
    pattern: 'module.exports',
    type: 'script' as const,
    resolution: 'Convert to ES exports',
    autoApply: false,
  },
];
