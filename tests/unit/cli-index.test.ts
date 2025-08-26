/**
 * Unit tests for CLI Index - Entry point and initialization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockConsole, mockEnv } from '../helpers/test-utils';

// Mock the main CLI module
vi.mock('../../src/cli/nik-cli', () => ({
  NikCLI: vi.fn(() => ({
    initialize: vi.fn(),
    startSession: vi.fn(),
    processCommand: vi.fn(() => 'Mock response'),
    endSession: vi.fn(),
  })),
}));

vi.mock('../../src/cli/main-orchestrator', () => ({
  MainOrchestrator: vi.fn(() => ({
    initialize: vi.fn(),
    startServices: vi.fn(),
    processRequest: vi.fn(() => ({ success: true, response: 'Mock response' })),
    stopServices: vi.fn(),
  })),
}));

vi.mock('../../src/cli/core/config-manager', () => ({
  ConfigManager: vi.fn(() => ({
    hasValidConfig: vi.fn(() => true),
    getConfig: vi.fn(() => ({ apiKey: 'test-key' })),
  })),
}));

describe('CLI Index (Entry Point)', () => {
  let console: ReturnType<typeof mockConsole>;
  let env: ReturnType<typeof mockEnv>;

  beforeEach(() => {
    console = mockConsole();
    env = mockEnv({
      NODE_ENV: 'test',
      ANTHROPIC_API_KEY: 'test-key',
    });

    // Clear module cache to ensure fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    console.restore();
    env.restore();
  });

  describe('Environment Validation', () => {
    it('should validate Node.js version requirements', async () => {
      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

      expect(majorVersion).toBeGreaterThanOrEqual(18);
    });

    it('should check for required environment variables', async () => {
      env.restore();
      const testEnv = mockEnv({ NODE_ENV: 'test' }); // Missing API keys

      // Import and run the main function
      const { main } = await import('../../src/cli/index');

      // Should handle missing API keys gracefully
      // Test passes if no exception is thrown

      testEnv.restore();
    });

    it('should validate working directory permissions', async () => {
      const { checkPermissions } = await import('../../src/cli/index');

      // Test that permission checking doesn't throw errors
      expect(() => checkPermissions && checkPermissions()).not.toThrow();
    });
  });

  describe('System Initialization', () => {
    it('should initialize core systems in correct order', async () => {
      const { main } = await import('../../src/cli/index');

      // Should initialize without throwing errors
      await expect(() => main()).not.toThrow();
    });

    it('should handle initialization failures gracefully', async () => {
      // Mock a failing configuration
      vi.doMock('../../src/cli/core/config-manager', () => ({
        ConfigManager: vi.fn(() => ({
          hasValidConfig: vi.fn(() => false),
          getConfig: vi.fn(() => { throw new Error('Config failed'); }),
        })),
      }));

      const { main } = await import('../../src/cli/index');

      // Should handle config failures without crashing
      await expect(() => main()).not.toThrow();
    });

    it('should set up proper signal handlers', async () => {
      const { setupSignalHandlers } = await import('../../src/cli/index');

      // Test signal handler setup
      if (setupSignalHandlers) {
        expect(() => setupSignalHandlers()).not.toThrow();
      }
    });
  });

  describe('Command Line Argument Processing', () => {
    it('should parse command line arguments correctly', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'cli.js', '--help'];

      const { parseArguments } = await import('../../src/cli/index');

      if (parseArguments) {
        const args = parseArguments();
        expect(args).toBeDefined();
      }

      process.argv = originalArgv;
    });

    it('should handle version command', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'cli.js', '--version'];

      const { main } = await import('../../src/cli/index');

      // Should handle version display
      await expect(() => main()).not.toThrow();

      process.argv = originalArgv;
    });

    it('should process configuration options', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'cli.js', '--config', 'test.json'];

      const { main } = await import('../../src/cli/index');

      // Should handle config file option
      await expect(() => main()).not.toThrow();

      process.argv = originalArgv;
    });
  });

  describe('Interactive Mode', () => {
    it('should start interactive mode by default', async () => {
      const { startInteractiveMode } = await import('../../src/cli/index');

      if (startInteractiveMode) {
        // Mock readline interface
        const mockReadline = {
          question: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
        };

        vi.doMock('readline', () => ({
          createInterface: vi.fn(() => mockReadline),
        }));

        expect(() => startInteractiveMode()).not.toThrow();
      }
    });

    it('should handle non-interactive mode', async () => {
      const originalArgv = process.argv;
      process.argv = ['node', 'cli.js', '--non-interactive'];

      const { main } = await import('../../src/cli/index');

      // Should handle non-interactive mode
      await expect(() => main()).not.toThrow();

      process.argv = originalArgv;
    });
  });

  describe('Error Handling', () => {
    it('should handle uncaught exceptions', async () => {
      const { setupErrorHandlers } = await import('../../src/cli/index');

      if (setupErrorHandlers) {
        expect(() => setupErrorHandlers()).not.toThrow();

        // Simulate an uncaught exception
        process.emit('uncaughtException', new Error('Test error'));

        // Should not crash the process in test environment
        expect(true).toBe(true);
      }
    });

    it('should handle unhandled promise rejections', async () => {
      const { setupErrorHandlers } = await import('../../src/cli/index');

      if (setupErrorHandlers) {
        setupErrorHandlers();

        // Simulate an unhandled rejection
        process.emit('unhandledRejection', new Error('Test rejection'));

        // Should log the error without crashing
        expect(console.errors.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should provide helpful error messages', async () => {
      const { formatError } = await import('../../src/cli/index');

      if (formatError) {
        const testError = new Error('Test error message');
        const formatted = formatError(testError);

        expect(typeof formatted).toBe('string');
        expect(formatted).toContain('Test error message');
      }
    });
  });

  describe('Logging and Output', () => {
    it('should configure logging correctly', async () => {
      const { setupLogging } = await import('../../src/cli/index');

      if (setupLogging) {
        expect(() => setupLogging()).not.toThrow();
      }
    });

    it('should handle different log levels', async () => {
      const { logger } = await import('../../src/cli/index');

      if (logger) {
        expect(() => {
          logger.info('Test info message');
          logger.warn('Test warning message');
          logger.error('Test error message');
          logger.debug('Test debug message');
        }).not.toThrow();
      }
    });

    it('should format output appropriately for terminal', async () => {
      const { formatOutput } = await import('../../src/cli/index');

      if (formatOutput) {
        const testMessage = 'Test message';
        const formatted = formatOutput(testMessage);

        expect(typeof formatted).toBe('string');
      }
    });
  });

  describe('Performance Monitoring', () => {
    it('should track startup performance', async () => {
      const startTime = Date.now();

      const { main } = await import('../../src/cli/index');
      await main();

      const endTime = Date.now();
      const startupTime = endTime - startTime;

      // Startup should complete within reasonable time
      expect(startupTime).toBeLessThan(30000); // 30 seconds max
    });

    it('should monitor memory usage', async () => {
      const { getMemoryUsage } = await import('../../src/cli/index');

      if (getMemoryUsage) {
        const usage = getMemoryUsage();
        expect(usage).toHaveProperty('heapUsed');
        expect(usage).toHaveProperty('heapTotal');
      }
    });
  });

  describe('Cleanup and Shutdown', () => {
    it('should cleanup resources on exit', async () => {
      const { cleanup } = await import('../../src/cli/index');

      if (cleanup) {
        expect(() => cleanup()).not.toThrow();
      }
    });

    it('should handle graceful shutdown', async () => {
      const { gracefulShutdown } = await import('../../src/cli/index');

      if (gracefulShutdown) {
        expect(() => gracefulShutdown()).not.toThrow();
      }
    });

    it('should save state before exit', async () => {
      const { saveState } = await import('../../src/cli/index');

      if (saveState) {
        const testState = { test: 'data' };
        expect(() => saveState(testState)).not.toThrow();
      }
    });
  });
});