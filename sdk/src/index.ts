/**
 * NikCLI Enterprise SDK
 *
 * Complete programmatic access to all NikCLI commands, tools, agents, and services
 *
 * @packageDocumentation
 */

import type { SDKConfig, SDKEvent, SDKEventHandler, SDKResponse } from './types';
import { CommandsSDK } from './commands';
import { ToolsSDK } from './tools';
import { AgentsSDK } from './agents';
import { ServicesSDK } from './services';
import { AISDK } from './ai';
import { BrowserSDK } from './browser';
import { VMSDK } from './vm';
import { Web3SDK } from './web3';

// Export all types
export * from './types';

// Export all SDK classes
export { CommandsSDK } from './commands';
export { ToolsSDK } from './tools';
export { AgentsSDK } from './agents';
export { ServicesSDK } from './services';
export { AISDK } from './ai';
export { BrowserSDK } from './browser';
export { VMSDK } from './vm';
export { Web3SDK } from './web3';

/**
 * Main NikCLI Enterprise SDK class
 *
 * @example
 * ```typescript
 * import { NikCLI } from '@nikcli/enterprise-sdk';
 *
 * const nikcli = new NikCLI({
 *   workingDirectory: '/path/to/project',
 *   apiKeys: {
 *     anthropic: 'your-api-key',
 *   },
 * });
 *
 * await nikcli.init();
 *
 * // Execute commands
 * const result = await nikcli.commands.help();
 *
 * // Use tools
 * const fileContent = await nikcli.tools.readFile('package.json');
 *
 * // Run agents
 * const agentResult = await nikcli.agents.universal('Build a React component');
 *
 * // AI completions
 * const completion = await nikcli.ai.complete('Explain this code');
 * ```
 */
export class NikCLI {
  private config: SDKConfig;
  private initialized: boolean = false;
  private eventHandlers: SDKEventHandler[] = [];

  // Internal services
  private _cli: any;
  private _toolRegistry: any;
  private _agentManager: any;
  private _services: any;
  private _aiProvider: any;
  private _browserService: any;
  private _vmService: any;
  private _web3Service: any;

  // Public SDK modules
  public commands: CommandsSDK;
  public tools: ToolsSDK;
  public agents: AgentsSDK;
  public services: ServicesSDK;
  public ai: AISDK;
  public browser: BrowserSDK;
  public vm: VMSDK;
  public web3: Web3SDK;

  /**
   * Create a new NikCLI SDK instance
   *
   * @param config - SDK configuration
   */
  constructor(config: SDKConfig = {}) {
    this.config = {
      workingDirectory: process.cwd(),
      verbose: false,
      debug: false,
      adaptiveRouting: true,
      ...config,
    };

    // Initialize SDK modules (will be properly connected after init())
    this.commands = new CommandsSDK(this._cli, this.config);
    this.tools = new ToolsSDK(this._toolRegistry, this.config);
    this.agents = new AgentsSDK(this._agentManager, this.config);
    this.services = new ServicesSDK(this._services, this.config);
    this.ai = new AISDK(this._aiProvider, this.config);
    this.browser = new BrowserSDK(this._browserService, this.config);
    this.vm = new VMSDK(this._vmService, this.config);
    this.web3 = new Web3SDK(this._web3Service, this.config);
  }

  /**
   * Initialize the SDK
   *
   * This must be called before using any SDK features
   */
  async init(): Promise<SDKResponse<void>> {
    try {
      if (this.initialized) {
        return { success: true };
      }

      // Initialize core services
      await this.initializeCoreServices();

      // Set working directory
      if (this.config.workingDirectory) {
        process.chdir(this.config.workingDirectory);
      }

      // Set API keys
      if (this.config.apiKeys) {
        await this.setApiKeys(this.config.apiKeys);
      }

      // Configure AI settings
      if (this.config.defaultModel) {
        await this.ai.switchModel(this.config.defaultModel);
      }

      if (this.config.temperature !== undefined) {
        await this.commands.setTemperature(this.config.temperature);
      }

      // Configure adaptive routing
      if (this.config.adaptiveRouting === false) {
        await this.ai.disableAdaptiveRouting();
      }

      // Configure Redis if provided
      if (this.config.redisUrl) {
        await this.configureRedis(this.config.redisUrl);
      }

      // Configure Upstash Vector if provided
      if (this.config.upstashVector) {
        await this.configureUpstashVector(this.config.upstashVector);
      }

      // Configure Supabase if provided
      if (this.config.supabase) {
        await this.configureSupabase(this.config.supabase);
      }

      this.initialized = true;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INIT_ERROR',
          message: 'Failed to initialize SDK',
          details: error,
        },
      };
    }
  }

  /**
   * Shutdown the SDK and cleanup resources
   */
  async shutdown(): Promise<SDKResponse<void>> {
    try {
      // Close browser sessions
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore errors
      }

      // Stop VMs if any
      try {
        const vms = await this.vm.list();
        if (vms.success && vms.data) {
          for (const vm of vms.data) {
            await this.vm.stop(vm.id);
          }
        }
      } catch (e) {
        // Ignore errors
      }

      // Clear cache if needed
      try {
        if (this.config.features?.clearCacheOnShutdown) {
          await this.services.cacheClear();
        }
      } catch (e) {
        // Ignore errors
      }

      this.initialized = false;

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SHUTDOWN_ERROR',
          message: 'Failed to shutdown SDK',
          details: error,
        },
      };
    }
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get SDK version
   */
  getVersion(): string {
    return require('../../package.json').version || '1.0.0';
  }

  /**
   * Get current configuration
   */
  getConfig(): SDKConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<SDKConfig>): Promise<SDKResponse<void>> {
    try {
      this.config = { ...this.config, ...updates };

      // Apply relevant config changes
      if (updates.workingDirectory) {
        process.chdir(updates.workingDirectory);
      }

      if (updates.defaultModel) {
        await this.ai.switchModel(updates.defaultModel);
      }

      if (updates.temperature !== undefined) {
        await this.commands.setTemperature(updates.temperature);
      }

      if (updates.adaptiveRouting !== undefined) {
        if (updates.adaptiveRouting) {
          await this.ai.enableAdaptiveRouting();
        } else {
          await this.ai.disableAdaptiveRouting();
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'Failed to update configuration',
          details: error,
        },
      };
    }
  }

  /**
   * Register event handler
   */
  on(handler: SDKEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Unregister event handler
   */
  off(handler: SDKEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit event to all handlers
   */
  private async emitEvent(event: SDKEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        if (this.config.verbose) {
          console.error('Event handler error:', error);
        }
      }
    }
  }

  /**
   * Execute a chat message and get AI response
   *
   * High-level convenience method for chat interactions
   */
  async chat(message: string, options?: {
    model?: string;
    temperature?: number;
    stream?: boolean;
  }): Promise<SDKResponse<any>> {
    try {
      const aiOptions = {
        model: options?.model || this.config.defaultModel,
        temperature: options?.temperature ?? this.config.temperature,
        stream: options?.stream,
      };

      if (options?.stream) {
        // Return stream
        const stream = this.ai.streamComplete(message, aiOptions);
        return { success: true, data: stream };
      } else {
        // Return complete response
        const result = await this.ai.complete(message, aiOptions);
        return result;
      }
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CHAT_ERROR',
          message: 'Chat failed',
          details: error,
        },
      };
    }
  }

  /**
   * Execute autonomous task
   *
   * High-level convenience method for autonomous execution
   */
  async auto(description: string): Promise<SDKResponse<any>> {
    try {
      const result = await this.commands.auto(description);
      return result;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AUTO_ERROR',
          message: 'Autonomous execution failed',
          details: error,
        },
      };
    }
  }

  /**
   * Quick file read
   */
  async read(filePath: string): Promise<SDKResponse<string>> {
    return await this.tools.readFile(filePath);
  }

  /**
   * Quick file write
   */
  async write(filePath: string, content: string): Promise<SDKResponse<void>> {
    return await this.tools.writeFile(filePath, content);
  }

  /**
   * Quick search
   */
  async search(query: string, options?: any): Promise<SDKResponse<any>> {
    return await this.tools.grep(query, options);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async initializeCoreServices(): Promise<void> {
    // This would connect to the actual NikCLI implementation
    // For now, this is a placeholder that would be implemented to
    // dynamically import and initialize the actual CLI services

    const NikCLICore = await this.loadNikCLICore();

    this._cli = NikCLICore.cli;
    this._toolRegistry = NikCLICore.toolRegistry;
    this._agentManager = NikCLICore.agentManager;
    this._services = NikCLICore.services;
    this._aiProvider = NikCLICore.aiProvider;
    this._browserService = NikCLICore.browserService;
    this._vmService = NikCLICore.vmService;
    this._web3Service = NikCLICore.web3Service;

    // Reconnect SDK modules with initialized services
    this.commands = new CommandsSDK(this._cli, this.config);
    this.tools = new ToolsSDK(this._toolRegistry, this.config);
    this.agents = new AgentsSDK(this._agentManager, this.config);
    this.services = new ServicesSDK(this._services, this.config);
    this.ai = new AISDK(this._aiProvider, this.config);
    this.browser = new BrowserSDK(this._browserService, this.config);
    this.vm = new VMSDK(this._vmService, this.config);
    this.web3 = new Web3SDK(this._web3Service, this.config);
  }

  private async loadNikCLICore(): Promise<any> {
    // Dynamic import of NikCLI core
    // This would import the actual implementation
    try {
      // Attempt to import from parent module
      const core = await import('../..');
      return core;
    } catch (error) {
      // Fallback: create mock services for standalone SDK usage
      if (this.config.debug) {
        console.warn('Running in standalone mode without full NikCLI core');
      }
      return this.createMockServices();
    }
  }

  private createMockServices(): any {
    // Create mock services for development/testing
    return {
      cli: {},
      toolRegistry: {},
      agentManager: {},
      services: {},
      aiProvider: {},
      browserService: {},
      vmService: {},
      web3Service: {},
    };
  }

  private async setApiKeys(keys: Record<string, string>): Promise<void> {
    for (const [provider, key] of Object.entries(keys)) {
      await this.commands.setApiKey(provider, key);
    }
  }

  private async configureRedis(url: string): Promise<void> {
    // Configure Redis connection
    if (this._services && this._services.cache) {
      await this._services.cache.configure({ url });
    }
  }

  private async configureUpstashVector(config: { url: string; token: string }): Promise<void> {
    // Configure Upstash Vector
    if (this._services && this._services.rag) {
      await this._services.rag.configure(config);
    }
  }

  private async configureSupabase(config: { url: string; key: string }): Promise<void> {
    // Configure Supabase
    if (this._services && this._services.auth) {
      await this._services.auth.configure(config);
    }
  }
}

/**
 * Create and initialize a new NikCLI SDK instance
 *
 * Convenience function that creates and initializes the SDK in one call
 *
 * @param config - SDK configuration
 * @returns Initialized NikCLI SDK instance
 *
 * @example
 * ```typescript
 * const nikcli = await createNikCLI({
 *   workingDirectory: '/path/to/project',
 *   apiKeys: {
 *     anthropic: 'your-key',
 *   },
 * });
 *
 * const result = await nikcli.chat('Hello!');
 * ```
 */
export async function createNikCLI(config?: SDKConfig): Promise<NikCLI> {
  const sdk = new NikCLI(config);
  await sdk.init();
  return sdk;
}

/**
 * Default export
 */
export default NikCLI;
