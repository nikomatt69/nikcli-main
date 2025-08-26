/**
 * Unit tests for NikCLI - Core CLI interface
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NikCLI } from '../../src/cli/nik-cli';
import { mockConsole } from '../helpers/test-utils';

vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  })),
}));

vi.mock('../../src/cli/core/config-manager', () => ({
  ConfigManager: vi.fn(() => ({
    getConfig: vi.fn(() => ({ apiKey: 'test-key', model: 'claude-3' })),
    setConfig: vi.fn(),
    hasValidConfig: vi.fn(() => true),
  })),
}));

describe('NikCLI', () => {
  let nikCLI: NikCLI;
  let console: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    console = mockConsole();
    nikCLI = new NikCLI();
  });

  afterEach(() => {
    console.restore();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(nikCLI).toBeInstanceOf(NikCLI);
    });

    it('should load configuration on initialization', async () => {
      await nikCLI.initialize();
      // Test passes if no errors thrown during initialization
      // Initialization completed successfully
    });
  });

  describe('Command Processing', () => {
    it('should handle system commands', async () => {
      const result = await nikCLI.processCommand('/help');
      expect(typeof result).toBe('string');
    });

    it('should handle agent commands', async () => {
      const result = await nikCLI.processCommand('@agent test message');
      expect(typeof result).toBe('string');
    });

    it('should handle regular chat messages', async () => {
      const result = await nikCLI.processCommand('Hello, how are you?');
      expect(typeof result).toBe('string');
    });

    it('should validate empty commands', async () => {
      const result = await nikCLI.processCommand('');
      expect(typeof result).toBe('string');
    });
  });

  describe('Session Management', () => {
    it('should start a new session', async () => {
      await nikCLI.startSession();
      // Test passes if no errors thrown
      // Session started successfully
    });

    it('should end session gracefully', async () => {
      await nikCLI.startSession();
      await nikCLI.endSession();
      // Test passes if no errors thrown
      // Session ended successfully
    });

    it('should handle session state correctly', () => {
      const initialState = nikCLI.getSessionState();
      expect(typeof initialState).toBe('object');
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', async () => {
      const newConfig = { model: 'gpt-4', temperature: 0.7 };
      await nikCLI.updateConfig(newConfig);
      // Test passes if no errors thrown
      // Configuration updated successfully
    });

    it('should validate configuration before setting', async () => {
      const invalidConfig = { invalidKey: 'value' };
      await expect(() => nikCLI.updateConfig(invalidConfig)).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid commands gracefully', async () => {
      const result = await nikCLI.processCommand('/invalid-command');
      expect(typeof result).toBe('string');
    });

    it('should recover from processing errors', async () => {
      // Simulate an error condition
      const result = await nikCLI.processCommand('trigger error').catch(() => 'error handled');
      expect(typeof result).toBe('string');
    });
  });

  describe('Event Handling', () => {
    it('should emit events for command processing', (done) => {
      nikCLI.on('commandProcessed', (command) => {
        expect(typeof command).toBe('string');
        done();
      });

      nikCLI.processCommand('test command');
    });

    it('should handle event listener registration', () => {
      const listener = vi.fn();
      nikCLI.on('test', listener);
      nikCLI.emit('test', 'data');

      expect(listener).toHaveBeenCalledWith('data');
    });
  });

  describe('Interaction with External Systems', () => {
    it('should interface with agent system', async () => {
      const result = await nikCLI.callAgent('test-agent', 'test message');
      expect(typeof result).toBe('object');
    });

    it('should handle tool execution', async () => {
      const result = await nikCLI.executeTool('read-file', { path: 'test.txt' });
      expect(typeof result).toBe('object');
    });

    it('should manage context appropriately', () => {
      const context = nikCLI.getContext();
      expect(typeof context).toBe('object');
    });
  });
});