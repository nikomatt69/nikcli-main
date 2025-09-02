/**
 * NikCLI ACP (Agent Client Protocol) Module
 * Main entry point for ACP functionality using official @zed-industries/agent-client-protocol package
 */

// Re-export types from the official package
export * from '@zed-industries/agent-client-protocol';

// Export our service
export {
  AcpService,
  AcpServiceFactory,
  type AcpServiceConfig,
  type AcpServiceStats,
} from './acp-service';

// ====================== MAIN ACP ENTRY POINT ======================

import { AcpService, AcpServiceFactory } from './acp-service';

export interface StartAcpModeOptions {
  workingDirectory?: string;
  debug?: boolean;
  timeout?: number;
  services?: any;
}

/**
 * Start NikCLI in ACP mode
 * This is the main function called when running `nikcli --acp`
 */
export async function startAcpMode(options: StartAcpModeOptions = {}): Promise<AcpService> {
  const service = AcpServiceFactory.create({
    workingDirectory: options.workingDirectory || process.cwd(),
    debug: options.debug || process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',
    timeout: options.timeout || 30000,
    services: options.services || {},
  });

  // Setup graceful shutdown handlers
  const gracefulShutdown = (signal: string) => {
    service.gracefulShutdown(signal);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in ACP mode:', error);
    service.gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection in ACP mode:', reason, 'at promise:', promise);
    service.gracefulShutdown('unhandledRejection');
  });

  // Start the service
  await service.start(process.stdin, process.stdout);

  return service;
}

/**
 * Create ACP service integrated with NikCLI services
 */
export function createIntegratedAcpService(nikCliServices: any, options?: Partial<StartAcpModeOptions>): AcpService {
  return AcpServiceFactory.createForNikCLI(nikCliServices, options);
}

/**
 * Check if current process is running in ACP mode
 */
export function isAcpMode(): boolean {
  return process.argv.includes('--acp') ||
    process.argv.includes('acp') ||
    process.env.NIKCLI_MODE === 'acp';
}

/**
 * Get ACP mode configuration from command line arguments and environment
 */
export function getAcpModeConfig(): StartAcpModeOptions {
  const config: StartAcpModeOptions = {};

  // Parse command line arguments
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--cwd':
      case '--working-directory':
        config.workingDirectory = args[i + 1];
        i++; // Skip next argument
        break;

      case '--timeout':
        config.timeout = parseInt(args[i + 1], 10);
        i++;
        break;

      case '--debug':
        config.debug = true;
        break;

      case '--no-debug':
        config.debug = false;
        break;
    }
  }

  // Override with environment variables
  if (process.env.NIKCLI_ACP_CWD) {
    config.workingDirectory = process.env.NIKCLI_ACP_CWD;
  }

  if (process.env.NIKCLI_ACP_TIMEOUT) {
    config.timeout = parseInt(process.env.NIKCLI_ACP_TIMEOUT, 10);
  }

  if (process.env.NIKCLI_ACP_DEBUG) {
    config.debug = process.env.NIKCLI_ACP_DEBUG === 'true';
  }

  return config;
}

// ====================== CLI HELPER ======================

/**
 * Main CLI entry point for ACP mode
 * Used when running `nikcli --acp` from command line
 */
export async function runAcpCli(): Promise<void> {
  try {
    const config = getAcpModeConfig();

    if (config.debug) {
      console.log('Starting NikCLI in ACP mode with config:', config);
    }

    const service = await startAcpMode(config);

    // Service will run until terminated
    // The graceful shutdown handlers will take care of cleanup

  } catch (error) {
    console.error('Failed to start NikCLI ACP mode:', error);
    process.exit(1);
  }
}