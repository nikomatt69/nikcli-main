import { exec, execSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Type definitions for cross-runtime compatibility
interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ShellOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

// Check runtime type
const isBun = typeof (globalThis as any).Bun !== 'undefined';
const isNode = typeof process !== 'undefined' && process.versions?.node;

// Prometheus exporter (mock for compatibility)
const prometheusExporter = {
  bunSpawnDuration: {
    observe: (_labels: any, _value: number) => { },
  },
};

// ============================================================================
// BUN SHELL API COMPATIBILITY
// ============================================================================

/**
 * Re-export for compatibility with existing code
 * Automatically uses Bun.$ if available, falls back to child_process
 */
export const $ = isBun ? (await import('bun')).$ : createShellProxy();

/**
 * Cross-runtime shell command execution
 * Uses Bun.$ in Bun runtime, child_process in Node.js
 */
export async function shell(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<string> {
  const command = strings.reduce((acc, str, i) => {
    return acc + str + (i < values.length ? String(values[i]) : '');
  }, '');

  return (await execShell(command)).stdout as string;
}

/**
 * Synchronous shell command execution
 */
export function shellSync(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  const command = strings.reduce((acc, str, i) => {
    return acc + str + (i < values.length ? String(values[i]) : '');
  }, '');

  return execSync(command, { encoding: 'utf8' }).trim();
}

/**
 * Execute shell command quietly
 */
export async function shellQuiet(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<SpawnResult> {
  const command = strings.reduce((acc, str, i) => {
    return acc + str + (i < values.length ? String(values[i]) : '');
  }, '');

  return await execShell(command, { quiet: true });
}

/**
 * Get output as lines array
 */
export async function shellLines(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<string[]> {
  const output = await shell(strings, ...values);
  return output.split('\n').filter((line) => line.trim() !== '');
}

/**
 * Get output as JSON
 */
export async function shellJson<T = unknown>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T> {
  const output = await shell(strings, ...values);
  return JSON.parse(output);
}

// ============================================================================
// BUN.GLOB COMPATIBILITY
// ============================================================================

/**
 * Cross-runtime glob pattern matching
 */
export function bunGlob(pattern: string): any {
  if (isBun && (globalThis as any).Bun?.Glob) {
    return new (globalThis as any).Bun.Glob(pattern);
  } else {
    // Fallback to glob library
    return { pattern };
  }
}

/**
 * Scan directory with glob pattern
 */
export async function globScan(
  pattern: string,
  options?: {
    cwd?: string;
    absolute?: boolean;
    onlyFiles?: boolean;
  },
): Promise<string[]> {
  if (isBun && (globalThis as any).Bun?.Glob) {
    const glob = new (globalThis as any).Bun.Glob(pattern);
    const results: string[] = [];

    for await (const file of glob.scan({
      cwd: options?.cwd ?? '.',
      absolute: options?.absolute ?? false,
      onlyFiles: options?.onlyFiles ?? true,
    })) {
      results.push(file);
    }

    return results;
  } else {
    // Fallback to glob library
    return await glob(pattern, {
      cwd: options?.cwd,
      absolute: options?.absolute,

    });
  }
}

/**
 * Synchronous glob scan
 */
export function globScanSync(
  pattern: string,
  options?: {
    cwd?: string;
    absolute?: boolean;
    onlyFiles?: boolean;
  },
): string[] {
  if (isBun && (globalThis as any).Bun?.Glob) {
    const glob = new (globalThis as any).Bun.Glob(pattern);
    return Array.from(
      glob.scanSync({
        cwd: options?.cwd ?? '.',
        absolute: options?.absolute ?? false,
        onlyFiles: options?.onlyFiles ?? true,
      }),
    );
  } else {
    return glob.sync(pattern, {
      cwd: options?.cwd,
      absolute: options?.absolute,

    });
  }
}

// ============================================================================
// BUN.SLEEP COMPATIBILITY
// ============================================================================

/**
 * Async sleep/delay
 */
export async function bunSleep(ms: number): Promise<void> {
  if (isBun && (globalThis as any).Bun?.sleep) {
    await (globalThis as any).Bun.sleep(ms);
  } else {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Synchronous sleep
 */
export function bunSleepSync(ms: number): void {
  if (isBun && (globalThis as any).Bun?.sleepSync) {
    (globalThis as any).Bun.sleepSync(ms);
  } else {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // Busy wait
    }
  }
}

/**
 * High-resolution timestamp
 */
export function bunNanoseconds(): number {
  if (isBun && (globalThis as any).Bun?.nanoseconds) {
    return (globalThis as any).Bun.nanoseconds();
  } else {
    return Number(process.hrtime.bigint());
  }
}

// ============================================================================
// BUN.WHICH COMPATIBILITY
// ============================================================================

/**
 * Find executable in PATH
 */
export function bunWhich(command: string): string | null {
  if (isBun && (globalThis as any).Bun?.which) {
    return (globalThis as any).Bun.which(command);
  } else {
    try {
      const result = execSync(`which ${command}`, { encoding: 'utf8' }).trim();
      return result || null;
    } catch {
      return null;
    }
  }
}

/**
 * Check if command exists
 */
export function commandExists(command: string): boolean {
  return bunWhich(command) !== null;
}

// ============================================================================
// BUN.FILE COMPATIBILITY
// ============================================================================

/**
 * Cross-runtime file reading
 */
export const bunFile = (filePath: string): any => {
  if (isBun && (globalThis as any).Bun?.file) {
    return (globalThis as any).Bun.file(filePath);
  } else {
    // Return a promise that mimics Bun.file interface
    return {
      text: async (): Promise<string> => await fs.readFile(filePath, 'utf8'),
      json: async <T = any>(): Promise<T> =>
        JSON.parse(await fs.readFile(filePath, 'utf8')),
      arrayBuffer: async (): Promise<ArrayBuffer> =>
        await fs.readFile(filePath) as unknown as ArrayBuffer,
      exists: async (): Promise<boolean> => {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      },
      get size(): number {
        try {
          return fs.statSync(filePath).size;
        } catch {
          return 0;
        }
      },
      get type(): string {
        // Simple MIME type detection
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.txt': 'text/plain',
          '.json': 'application/json',
          '.js': 'application/javascript',
          '.ts': 'text/typescript',
          '.html': 'text/html',
          '.css': 'text/css',
        };
        return mimeTypes[ext] || 'application/octet-stream';
      },
      get lastModified(): Promise<number> {
        return (async () => {
          try {
            return (await fs.stat(filePath)).mtimeMs;
          } catch {
            return 0;
          }
        })();
      },
    };
  }
};

/**
 * Cross-runtime file writing
 */
export const bunWrite = async (
  filePath: string | number | FileSystemWritableFileStream,
  data: string | Uint8Array | ArrayBuffer | ReadableStream,
): Promise<void> => {
  if (typeof filePath === 'string' || typeof filePath === 'number') {
    if (isBun && (globalThis as any).Bun?.write) {
      await (globalThis as any).Bun.write(filePath, data);
    } else {
      await fs.writeFile(filePath as string, data as Uint8Array);
    }
  }
};

// ============================================================================
// BUN.SPAWN COMPATIBILITY
// ============================================================================

/**
 * Cross-runtime process spawning
 */
export const bunSpawn = (
  options: string[] | { cmd: string[];[key: string]: any },
): any => {
  if (isBun && (globalThis as any).Bun?.spawn) {
    return (globalThis as any).Bun.spawn(options);
  } else {
    // Return a mock subprocess that mimics Bun.spawn interface
    const cmd = Array.isArray(options) ? options : options.cmd;
    const child = spawn(cmd[0], cmd.slice(1), options as any);

    return {
      stdout: child.stdout as any,
      stderr: child.stderr as any,
      exited: new Promise((resolve) => (child as any).on('close', resolve)),
      kill: () => child.kill(),
      exitCode: child.exitCode || 0,
    };
  }
};

// ============================================================================
// BUN.CRYPTO COMPATIBILITY
// ============================================================================

/**
 * Cross-runtime hashing
 */
export async function bunHash(
  algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512',
  data: string | ArrayBuffer,
  encoding: 'hex' | 'base64' = 'hex',
): Promise<string> {
  const hash = crypto.createHash(algorithm);
  hash.update(data as string);
  return hash.digest(encoding);
}

/**
 * Synchronous hashing
 */
export function bunHashSync(
  algorithm: 'md5' | 'sha1' | 'sha256' | 'sha512',
  data: string | ArrayBuffer,
  encoding: 'hex' | 'base64' = 'hex',
): string {
  const hash = crypto.createHash(algorithm);
  hash.update(data as string);
  return hash.digest(encoding);
}

/**
 * Generate random bytes
 */
export function bunRandomBytes(
  size: number,
  encoding: 'hex' | 'base64' = 'hex',
): string {
  const bytes = crypto.randomBytes(size);
  return encoding === 'hex' ? bytes.toString('hex') : bytes.toString('base64');
}

// ============================================================================
// PATH UTILITIES
// ============================================================================

/**
 * Get directory name of current module
 */
export const __bundir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Get full path of current module
 */
export const __bunfile = fileURLToPath(import.meta.url);

// ============================================================================
// STREAM UTILITIES
// ============================================================================

/**
 * Read stream to string
 */
export async function readStreamToString(
  stream: ReadableStream,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }

  return result;
}

/**
 * Read stream with size limit
 */
export async function readStreamWithLimit(
  stream: ReadableStream,
  maxSize: number,
  truncateMessage = '\n... [output truncated]',
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    bytesRead += value.length;

    if (bytesRead > maxSize) {
      const remaining = maxSize - (bytesRead - value.length);
      if (remaining > 0) {
        result += decoder.decode(value.slice(0, remaining), { stream: true });
      }
      result += truncateMessage;
      await reader.cancel();
      break;
    }

    result += decoder.decode(value, { stream: true });
  }

  return result;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if running in Bun runtime
 */
export function isBunRuntime(): boolean {
  return isBun;
}

/**
 * Get Bun version
 */
export function getBunVersion(): string | undefined {
  return isBun ? (globalThis as any).Bun.version : undefined;
}

/**
 * Assert we're running in Bun (throw if not)
 */
export function assertBunRuntime(): void {
  if (!isBun) {
    throw new Error(
      'This module requires Bun runtime. Please run with: bun run',
    );
  }
}

/**
 * Cross-runtime environment variable access
 */
export function bunEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

/**
 * Set environment variable
 */
export function bunSetEnv(key: string, value: string): void {
  process.env[key] = value;
}

/**
 * Get all environment variables
 */
export function bunEnvAll(): Record<string, string | undefined> {
  return { ...process.env };
}

/**
 * UUID generation
 */
export function bunUUID(): string {
  if (isBun && (globalThis as any).Bun?.randomUUIDv7) {
    return (globalThis as any).Bun.randomUUIDv7();
  } else {
    return crypto.randomUUID();
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Execute shell command with options
 */
async function execShell(
  command: string,
  options?: ShellOptions & { quiet?: boolean },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            stdout: stdout?.toString() || '',
            stderr: stderr?.toString() || '',
            exitCode: 0,
          });
        }
      },
    );
  });
}

/**
 * Create shell proxy for template literals
 */
function createShellProxy() {
  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        return (...args: any[]) => {
          if (typeof prop === 'string') {
            const strings = [''];
            return shell([prop as string, ''], ...args);
          }
          return () => Promise.resolve('');
        };
      },
    },
  );
}

// Export types
export type { SpawnResult, ShellOptions };
