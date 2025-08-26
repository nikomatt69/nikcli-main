import { toolRegistry } from './tool-registry';
import { promptRegistry } from './prompt-registry';
import { featureFlagManager } from './feature-flags';
// import { errorManager } from './error-manager'; // Removed for now
import { validatorManager } from './validator-manager';
import { advancedUI } from '../ui/advanced-cli-ui';
import { logger } from '../utils/logger';

/**
 * Enterprise Integration Layer
 * Connects all new enterprise systems with existing services
 */
export class EnterpriseIntegration {
  private static instance: EnterpriseIntegration;
  private workingDirectory: string;
  private isInitialized = false;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
  }

  static getInstance(workingDirectory?: string): EnterpriseIntegration {
    if (!EnterpriseIntegration.instance && workingDirectory) {
      EnterpriseIntegration.instance = new EnterpriseIntegration(workingDirectory);
    }
    return EnterpriseIntegration.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    advancedUI.logInfo('🏢 Initializing Enterprise Integration...');
    const startTime = Date.now();

    try {
      // Initialize in dependency order
      await featureFlagManager.initialize();
      await toolRegistry.initialize();
      await promptRegistry.initialize();
      
      // Validator manager is singleton, already initialized
      
      this.setupIntegrations();
      
      this.isInitialized = true;
      const initTime = Date.now() - startTime;

      advancedUI.logSuccess(`✅ Enterprise Integration initialized (${initTime}ms)`);
      
      // Log system stats
      this.logSystemStats();

    } catch (error: any) {
      advancedUI.logError(`❌ Enterprise Integration failed: ${error.message}`);
      throw error;
    }
  }

  private setupIntegrations(): void {
    // Integration with existing logger for error handling
    const originalExecuteTool = toolRegistry.executeTool.bind(toolRegistry);
    toolRegistry.executeTool = async (toolId: string, ...args: any[]) => {
      try {
        return await originalExecuteTool(toolId, ...args);
      } catch (error: any) {
        logger.error(`Tool execution failed: ${toolId}`, {
          error: error.message,
          toolId,
          argsCount: args.length
        });
        throw error;
      }
    };

    // Feature flag integration
    if (featureFlagManager.isEnabled('advanced-validation')) {
      advancedUI.logInfo('🔍 Advanced validation enabled via feature flag');
    }

    if (featureFlagManager.isEnabled('tool-registry')) {
      advancedUI.logInfo('🔧 Tool registry enabled via feature flag');
    }

    // Prompt registry integration with error handling
    const originalGetPrompt = promptRegistry.getPrompt.bind(promptRegistry);
    promptRegistry.getPrompt = async (promptId: string, context: any = {}) => {
      try {
        return await originalGetPrompt(promptId, context);
      } catch (error: any) {
        logger.error(`Prompt registry error: ${promptId}`, {
          error: error.message,
          promptId
        });
        throw error;
      }
    };
  }

  getSystemStatus() {
    return {
      featureFlags: {
        enabled: featureFlagManager.isEnabled('tool-registry'),
        stats: featureFlagManager.getFlagStats()
      },
      toolRegistry: {
        stats: toolRegistry.getRegistryStats(),
        totalTools: toolRegistry.getAvailableTools().size
      },
      promptRegistry: {
        stats: promptRegistry.getRegistryStats(),
        totalPrompts: promptRegistry.getAvailablePrompts().size
      },
      validator: {
        config: validatorManager.getConfig()
      }
    };
  }

  private logSystemStats(): void {
    const status = this.getSystemStatus();
    
    advancedUI.logInfo('🏢 Enterprise Systems Status:');
    console.log(`   🚩 Feature Flags: ${status.featureFlags.stats.total} total, ${status.featureFlags.stats.enabled} enabled`);
    console.log(`   🔧 Tool Registry: ${status.toolRegistry.totalTools} tools loaded`);
    console.log(`   🧠 Prompt Registry: ${status.promptRegistry.totalPrompts} prompts available`);
    console.log(`   ✅ All systems operational`);
  }

  async cleanup(): Promise<void> {
    await featureFlagManager.cleanup();
    
    advancedUI.logInfo('🏢 Enterprise Integration cleanup completed');
  }
}

export const enterpriseIntegration = EnterpriseIntegration.getInstance();