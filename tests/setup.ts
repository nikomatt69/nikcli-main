/**
 * Global test setup for Vitest
 * Sets up common test utilities and environment
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Global test state
export let testWorkspace: string;
export let originalCwd: string;

beforeAll(async () => {
  // Save original working directory
  originalCwd = process.cwd();
  
  // Create temporary test workspace
  testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-test-'));
  
  // Set environment variables for testing
  (process.env as any).NODE_ENV = 'test';
  process.env.CLI_DISABLE_ANALYTICS = 'true';
  process.env.CLI_DISABLE_TELEMETRY = 'true';
  
  console.log(`🧪 Test workspace created: ${testWorkspace}`);
});

afterAll(async () => {
  // Cleanup test workspace
  if (testWorkspace) {
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
      console.log(`🧹 Test workspace cleaned up: ${testWorkspace}`);
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup test workspace: ${error}`);
    }
  }
  
  // Restore original working directory
  process.chdir(originalCwd);
});

beforeEach(async () => {
  // Create a fresh test directory for each test
  const testId = Math.random().toString(36).substring(7);
  const testDir = path.join(testWorkspace, `test-${testId}`);
  await fs.mkdir(testDir, { recursive: true });
  process.chdir(testDir);
});

afterEach(async () => {
  // Return to original directory
  process.chdir(originalCwd);
});

// Test utilities
export const createTestFile = async (filePath: string, content: string): Promise<string> => {
  const fullPath = path.resolve(filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
  return fullPath;
};

export const createTestProject = async (files: Record<string, string>): Promise<string> => {
  const projectDir = path.join(process.cwd(), 'test-project');
  await fs.mkdir(projectDir, { recursive: true });
  
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(projectDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }
  
  return projectDir;
};

export const readTestFile = async (filePath: string): Promise<string> => {
  return await fs.readFile(path.resolve(filePath), 'utf-8');
};

export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(path.resolve(filePath));
    return true;
  } catch {
    return false;
  }
};

// Mock console for testing
export const mockConsole = () => {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  const logs: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  
  console.log = (...args) => logs.push(args.join(' '));
  console.error = (...args) => errors.push(args.join(' '));
  console.warn = (...args) => warnings.push(args.join(' '));
  
  return {
    logs,
    errors,
    warnings,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  };
};

// Timeout helper for async operations
export const waitFor = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

// Environment validation will happen after setup