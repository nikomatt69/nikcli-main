

```ts
/**
 * Migration Engine: Node.js -> Bun
 *
 * This module provides a production-ready migration engine to help migrate a Node.js project to Bun.
 * It performs safe, idempotent transformations and produces a detailed report.
 *
 * Features:
 * - Detects current project state (package manager, module system, TypeScript usage)
 * - Backs up modified files before changes
 * - Updates package.json scripts (npm -> bun run, yarn/pnpm -> bun run, node -> bunx)
 * - Converts CommonJS files (.cjs) to ESM (.mjs) with safe import/export rewrites
 * - Optionally updates tsconfig.json to ESNext/NodeNext
 * - Optionally updates README with Bun usage instructions
 * - Dry-run support
 *
 * Usage (as a library):
 *   import { migrateNodeToBun } from './migration-engine';
 *   const report = await migrateNodeToBun({ dryRun: true });
 *   console.log(report);
 *
 * Usage (CLI):
 *   ts-node src/migrate-node-to-bun.ts --dry-run
 *   node dist/migrate-node-to-bun.js --apply
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown';

export interface MigrateOptions {
  /**
   * Do not write to disk; only compute changes.
   */
  dryRun?: boolean;

  /**
   * Root directory to migrate. Defaults to process.cwd().
   */
  cwd?: string;

  /**
   * Backup directory for original files. Defaults to `.mig-bak-<timestamp>`.
   */
  backupDir?: string;

  /**
   * If true, update tsconfig.json to ESNext/NodeNext.
   */
  updateTsconfig?: boolean;

  /**
   * If true, append Bun usage instructions to README.md (if exists).
   */
  updateReadme?: boolean;

  /**
   * If true, convert .cjs files to .mjs and rewrite require/exports to import/export.
   */
  convertCjsToEsm?: boolean;

  /**
   * If true, update package.json scripts to use Bun equivalents.
   */
  updateScripts?: boolean;

  /**
   * If true, add "bun" to devDependencies if missing.
   */
  ensureBunDependency?: boolean;

  /**
   * If true, replace ts-node with bun-types in devDependencies.
   */
  replaceTsNodeWithBunTypes?: boolean;

  /**
   * If true, set package.json "type": "module" if missing.
   */
  ensurePackageTypeModule?: boolean;

  /**
   * If true, set package.json "type": "commonjs" if missing (rarely needed; default false).
   */
  forcePackageTypeCommonjs?: boolean;

  /**
   * If true, prefer "bunx" for node-based commands (e.g., "node -e" -> "bunx -e").
   */
  preferBunxForNode?: boolean;

  /**
   * If true, prefer "bunx" for non-bun CLIs (e.g., "eslint" -> "bunx eslint").
   */
  preferBunxForNonBunBinaries?: boolean;

  /**
   * If true, prefer "bun run" for all scripts (overrides npm/yarn/pnpm).
   */
  forceBunRunForAllScripts?: boolean;

  /**
   * If true, only update scripts that look like they use npm/yarn/pnpm/node.
   */
  onlyUpdateKnownScripts?: boolean;
}

export interface FileChange {
  filePath: string;
  action: 'backup' | 'write' | 'skip' | 'delete' | 'rename';
  reason?: string;
  backupPath?: string;
  sizeBefore?: number;
  sizeAfter?: number;
}

export interface ProjectState {
  packageManager: PackageManager;
  hasBunLock: boolean;
  hasPackageJson: boolean;
  hasTsConfig: boolean;
  usesTypeScript: boolean;
  packageJson: any;
  tsconfigJson: any;
  rootDir: string;
}

export interface MigrateResult {
  ok: boolean;
  state: ProjectState;
  changes: FileChange[];
  notes: string[];
  errors: string[];
  summary: {
    filesBackedUp: number;
    filesWritten: number;
    filesDeleted: number;
    filesRenamed: number;
    scriptsUpdated: number;
    tsconfigUpdated: boolean;
    readmeUpdated: boolean;
  };
}

/* ============================== Utilities ============================== */

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonSafe<T = any>(filePath: string): Promise<T | null> {
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return null