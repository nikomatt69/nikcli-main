import { AsyncUtils } from './async-utils';
import { serviceOptimizer } from './service-optimizer';
import {
  lazyImport,
  lazyImportManager,
  preloadEssentialModules,
} from './lazy-import-manager';
import { logInfo, logWarn } from './error-handler';
import { AgentManager } from './agent-manager';
import { simpleConfigManager as configManager } from './config-manager';

// Import the original services
import { agentService } from '../services/agent-service';
import { toolService } from '../services/tool-service';
import { planningService } from '../services/planning-service';
import { cacheService } from '../services/cache-service';
import { lspService } from '../services/lsp-service';
import { memoryService } from '../services/memory-service';
import { snapshotService } from '../services/snapshot-service';

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  phases: {
    critical: { start: number; end?: number };
    core: { start: number; end?: number };
    enhanced: { start: number; end?: number };
    optional: { start: number; end?: number };
  };
  results: {
    totalTime?: number;
    criticalTime?: number;
    coreTime?: number;
    enhancedTime?: number;
    optionalTime?: number;
    memoryUsage?: NodeJS.MemoryUsage;
  };
}

/**
 * Optimized service initialization - drop-in replacement for ServiceModule.initializeSystem()
 */
export async function initializeSystemOptimized(): Promise<boolean> {
  const metrics: PerformanceMetrics = {
    startTime: Date.now(),
    phases: {
      critical: { start: Date.now() },
      core: { start: 0 },
      enhanced: { start: 0 },
      optional: { start: 0 },
    },
    results: {
      totalTime: 0,
      criticalTime: 0,
      coreTime: 0,
      enhancedTime: 0,
      optionalTime: 0,
      memoryUsage: process.memoryUsage(),
    },
  };

  logInfo(
    '🚀 Starting optimized system initialization...',
    'PerformanceIntegration',
  );

  try {
    // Phase 1: Critical services (required for startup)
    metrics.phases.critical.start = Date.now();
    await initializeCriticalServicesOptimized();
    metrics.phases.critical.end = Date.now();
    metrics.results.criticalTime =
      metrics.phases.critical.end - metrics.phases.critical.start;

    logInfo(
      `✅ Critical services: ${metrics.results.criticalTime}ms`,
      'PerformanceIntegration',
    );

    // Phase 2: Core services (parallel initialization)
    metrics.phases.core.start = Date.now();
    await initializeCoreServicesOptimized();
    metrics.phases.core.end = Date.now();
    metrics.results.coreTime =
      metrics.phases.core.end - metrics.phases.core.start;

    logInfo(
      `✅ Core services: ${metrics.results.coreTime}ms`,
      'PerformanceIntegration',
    );

    // Phase 3: Enhanced services (parallel, non-blocking)
    metrics.phases.enhanced.start = Date.now();
    initializeEnhancedServicesOptimized(); // Fire and forget
    metrics.phases.enhanced.end = Date.now();
    metrics.results.enhancedTime =
      metrics.phases.enhanced.end - metrics.phases.enhanced.start;

    logInfo(
      `✅ Enhanced services init: ${metrics.results.enhancedTime}ms`,
      'PerformanceIntegration',
    );

    // Phase 4: Optional providers (lazy loading)
    metrics.phases.optional.start = Date.now();
    // Optional providers are loaded on-demand, no blocking initialization
    metrics.phases.optional.end = Date.now();
    metrics.results.optionalTime =
      metrics.phases.optional.end - metrics.phases.optional.start;

    // Final metrics
    metrics.endTime = Date.now();
    metrics.results.totalTime = metrics.endTime - metrics.startTime;
    metrics.results.memoryUsage = process.memoryUsage();

    const totalTime = metrics.results.totalTime;
    const improvement =
      totalTime < 2000
        ? '🟢 Excellent'
        : totalTime < 3000
          ? '🟡 Good'
          : '🔴 Needs improvement';

    logInfo(
      `🎉 Total optimization: ${totalTime}ms (${improvement})`,
      'PerformanceIntegration',
      metrics.results,
    );

    return true;
  } catch (error) {
    logWarn(
      'System initialization failed',
      'PerformanceIntegration',
      error as Record<string, unknown>,
    );
    return false;
  }
}

/**
 * Initialize critical services with minimal dependencies
 */
async function initializeCriticalServicesOptimized(): Promise<void> {
  // Critical services that must be initialized first
  const criticalServices = [
    async () => {
      // Config manager is already initialized
      logInfo('Config manager ready', 'PerformanceIntegration');
    },
    async () => {
      // Resource manager is already initialized
      logInfo('Resource manager ready', 'PerformanceIntegration');
    },
    async () => {
      // Logger is already initialized
      logInfo('Logger ready', 'PerformanceIntegration');
    },
  ];

  await AsyncUtils.parallel(criticalServices, 3);
}

/**
 * Initialize core services in parallel
 */
async function initializeCoreServicesOptimized(): Promise<void> {
  const workingDir = process.cwd();

  // Core services that can be initialized in parallel
  const coreServices = [
    async () => {
      toolService.setWorkingDirectory(workingDir);
      logInfo('Tool service ready', 'PerformanceIntegration');
    },
    async () => {
      planningService.setWorkingDirectory(workingDir);
      logInfo('Planning service ready', 'PerformanceIntegration');
    },
    async () => {
      lspService.setWorkingDirectory(workingDir);
      logInfo('LSP service ready', 'PerformanceIntegration');
    },
    async () => {
      await memoryService.initialize();
      logInfo('Memory service ready', 'PerformanceIntegration');
    },
    async () => {
      await snapshotService.initialize();
      logInfo('Snapshot service ready', 'PerformanceIntegration');
    },
    async () => {
      await initializeAgentManager();
      logInfo('Agent manager ready', 'PerformanceIntegration');
    },
  ];

  // Initialize up to 4 services in parallel for optimal performance
  await AsyncUtils.parallel(coreServices, 4);
}

/**
 * Initialize agent manager with optimized approach
 */
async function initializeAgentManager(): Promise<void> {
  if (configManager.get('nikdrive')?.enabled !== false) {
    // Create and initialize the core AgentManager
    const agentManager = new AgentManager(configManager as any);
    await agentManager.initialize();

    // Register agent classes (e.g., UniversalAgent)
    const { registerAgents } = await lazyImport('../register-agents');
    registerAgents(agentManager);

    // Ensure at least one agent instance is created (universal-agent)
    try {
      await agentManager.createAgent('universal-agent');
    } catch (_) {
      // If already created or creation failed silently, proceed
    }

    logInfo('Agent manager initialized', 'PerformanceIntegration');
  }
}

/**
 * Initialize enhanced services in background (non-blocking)
 */
function initializeEnhancedServicesOptimized(): void {
  // Fire and forget - these don't block the main thread
  setImmediate(async () => {
    try {
      // Cache service (already initialized in constructor)
      logInfo('Cache service ready', 'PerformanceIntegration');

      // Redis cache (if enabled)
      const config = configManager.getAll();
      if (config.redis?.enabled) {
        const { redisProvider } = await lazyImport(
          '../providers/redis/redis-provider',
        );
        logInfo('Redis cache ready', 'PerformanceIntegration');
      }

      // Supabase (if enabled)
      if (config.supabase?.enabled) {
        const { enhancedSupabaseProvider } = await lazyImport(
          '../providers/supabase/enhanced-supabase-provider',
        );
        enhancedSupabaseProvider.on('error', (error: any) => {
          logWarn(
            'Supabase provider error (non-critical)',
            'PerformanceIntegration',
            error,
          );
        });
        logInfo('Supabase ready', 'PerformanceIntegration');
      }

      // Vision and image providers (optional)
      try {
        await lazyImport('../providers/vision');
        await lazyImport('../providers/image');
        logInfo('Vision and image providers ready', 'PerformanceIntegration');
      } catch (error) {
        logWarn(
          'Vision providers not available (optional)',
          'PerformanceIntegration',
        );
      }

      // CAD/GCode provider (optional)
      try {
        await lazyImport('../providers/cad-gcode');
        const { getCadService, getGcodeService } = await lazyImport(
          '../services/cad-gcode-service',
        );
        (global as any).cadService = getCadService();
        (global as any).gcodeService = getGcodeService();
        logInfo('CAD/GCode provider ready', 'PerformanceIntegration');
      } catch (error) {
        logWarn(
          'CAD/GCode provider not available (optional)',
          'PerformanceIntegration',
        );
      }

      logInfo(
        '✅ Enhanced services initialized in background',
        'PerformanceIntegration',
      );
    } catch (error) {
      logWarn(
        'Some enhanced services failed to initialize',
        'PerformanceIntegration',
        error as Record<string, unknown>,
      );
    }
  });
}

/**
 * Optimized tools initialization - lazy loading approach
 */
export async function getToolsOptimized() {
  try {
    // Use lazy import to avoid loading all tools upfront
    const { toolService } = await lazyImport('../services/tool-service');

    // Initialize tools on demand
    const tools = await toolService.getAvailableTools();
    return tools;
  } catch (error) {
    logWarn(
      'Failed to load tools service',
      'PerformanceIntegration',
      error as Record<string, unknown>,
    );
    return [];
  }
}

/**
 * Performance benchmark utility
 */
export async function benchmarkStartup(): Promise<PerformanceMetrics> {
  const metrics: PerformanceMetrics = {
    startTime: Date.now(),
    phases: {
      critical: { start: 0 },
      core: { start: 0 },
      enhanced: { start: 0 },
      optional: { start: 0 },
    },
    results: {
      totalTime: 0,
      criticalTime: 0,
      coreTime: 0,
      enhancedTime: 0,
      optionalTime: 0,
      memoryUsage: process.memoryUsage(),
    },
  };

  logInfo('🔍 Running performance benchmark...', 'PerformanceIntegration');

  // Measure critical services
  metrics.phases.critical.start = Date.now();
  await initializeCriticalServicesOptimized();
  metrics.phases.critical.end = Date.now();

  // Measure core services
  metrics.phases.core.start = Date.now();
  await initializeCoreServicesOptimized();
  metrics.phases.core.end = Date.now();

  // Measure enhanced services (non-blocking)
  metrics.phases.enhanced.start = Date.now();
  initializeEnhancedServicesOptimized();
  metrics.phases.enhanced.end = Date.now();

  // Final measurement
  metrics.endTime = Date.now();
  metrics.results = {
    totalTime: metrics.endTime - metrics.startTime,
    criticalTime: metrics.phases.critical.end! - metrics.phases.critical.start,
    coreTime: metrics.phases.core.end! - metrics.phases.core.start,
    enhancedTime: metrics.phases.enhanced.end! - metrics.phases.enhanced.start,
    memoryUsage: process.memoryUsage(),
  };

  return metrics;
}

/**
 * Check if optimization is enabled
 */
export function isOptimizationEnabled(): boolean {
  return process.env.NIKCLI_OPTIMIZE !== 'false';
}

/**
 * Enable optimization features
 */
export function enableOptimizations(): void {
  process.env.NIKCLI_OPTIMIZE = 'true';
  logInfo('Performance optimizations enabled', 'PerformanceIntegration');
}

/**
 * Disable optimization features (for debugging)
 */
export function disableOptimizations(): void {
  process.env.NIKCLI_OPTIMIZE = 'false';
  logInfo('Performance optimizations disabled', 'PerformanceIntegration');
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(): {
  optimization: boolean;
  cache: any;
  status: string;
} {
  return {
    optimization: isOptimizationEnabled(),
    cache: lazyImportManager.getCacheStats(),
    status: serviceOptimizer.isReady()
      ? 'ready'
      : 'initializing',
  };
}

// Auto-enable optimizations if not explicitly disabled
if (!process.env.NIKCLI_OPTIMIZE) {
  enableOptimizations();
}
