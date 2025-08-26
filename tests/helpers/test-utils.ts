/**
 * Utility functions for testing
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Create a temporary test file with content
 */
export const createTempFile = async (filename: string, content: string): Promise<string> => {
  const filePath = path.resolve(filename);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
};

/**
 * Check if a file exists
 */
export const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(path.resolve(filePath));
    return true;
  } catch {
    return false;
  }
};

/**
 * Read file content
 */
export const readFile = async (filePath: string): Promise<string> => {
  return await fs.readFile(path.resolve(filePath), 'utf-8');
};

/**
 * Create a mock project structure
 */
export const createMockProject = async (structure: Record<string, string>): Promise<string> => {
  const projectDir = path.resolve('mock-project');
  await fs.mkdir(projectDir, { recursive: true });

  for (const [filePath, content] of Object.entries(structure)) {
    const fullPath = path.join(projectDir, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
  }

  return projectDir;
};

/**
 * Clean up test files and directories
 */
export const cleanup = async (paths: string[]): Promise<void> => {
  for (const testPath of paths) {
    try {
      await fs.rm(path.resolve(testPath), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
};

/**
 * Mock console methods
 */
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

/**
 * Wait for a specific amount of time
 */
export const wait = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mock environment variables
 */
export const mockEnv = (vars: Record<string, string>) => {
  const original = { ...process.env };
  
  Object.assign(process.env, vars);
  
  return {
    restore: () => {
      process.env = original;
    }
  };
};

/**
 * Capture stdout/stderr
 */
export const captureOutput = () => {
  const originalWrite = process.stdout.write;
  const originalErrorWrite = process.stderr.write;
  
  let stdout = '';
  let stderr = '';
  
  process.stdout.write = (chunk: any) => {
    stdout += chunk;
    return true;
  };
  
  process.stderr.write = (chunk: any) => {
    stderr += chunk;
    return true;
  };
  
  return {
    stdout: () => stdout,
    stderr: () => stderr,
    restore: () => {
      process.stdout.write = originalWrite;
      process.stderr.write = originalErrorWrite;
    }
  };
};