import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { simpleConfigManager } from '../../core/config-manager';

export interface SnapshotEntry {
  id: string;
  name: string;
  description: string;
  timestamp: number;
  files: SnapshotFile[];
  metadata: {
    branch?: string;
    commit?: string;
    author?: string;
    tags: string[];
    size: number;
    fileCount: number;
  };
}

export interface SnapshotFile {
  path: string;
  content: string;
  hash: string;
  size: number;
  lastModified: number;
}

export interface SnapshotConfig {
  provider: 'local' | 'github' | 'supabase';
  localPath?: string;
  githubRepo?: string;
  githubToken?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
  compression: boolean;
  maxSnapshots: number;
  excludePatterns: string[];
}

export interface SnapshotSearchOptions {
  name?: string;
  tags?: string[];
  dateRange?: { start: number; end: number };
  author?: string;
  limit?: number;
}

/**
 * Snapshot Provider - Handles snapshot creation, storage and retrieval
 * Supports local, GitHub, and Supabase backends
 */
export class SnapshotProvider extends EventEmitter {
  private config: SnapshotConfig;
  private snapshots: Map<string, SnapshotEntry> = new Map();
  private isInitialized = false;

  constructor() {
    super();
    
    this.config = {
      provider: 'local',
      localPath: './.nikcli/snapshots',
      compression: true,
      maxSnapshots: 50,
      excludePatterns: [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '*.log',
        '.env*',
        '*.tmp'
      ]
    };

    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      // Use getAll() to get all config and extract snapshot section
      const allConfig = simpleConfigManager.getAll();
      const config = (allConfig as any).snapshot || {};
      this.config = { ...this.config, ...config };
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Using default snapshot config: ${error.message}`));
    }
  }

  /**
   * Initialize snapshot provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      switch (this.config.provider) {
        case 'local':
          await this.initializeLocal();
          break;
        case 'github':
          await this.initializeGitHub();
          break;
        case 'supabase':
          await this.initializeSupabase();
          break;
      }

      await this.loadExistingSnapshots();
      this.isInitialized = true;
      
      console.log(chalk.green(`✅ Snapshot provider initialized (${this.config.provider})`));
      this.emit('initialized');
      
    } catch (error: any) {
      console.log(chalk.red(`❌ Snapshot provider initialization failed: ${error.message}`));
      throw error;
    }
  }

  private async initializeLocal(): Promise<void> {
    const snapshotDir = this.config.localPath!;
    
    try {
      await fs.access(snapshotDir);
    } catch {
      await fs.mkdir(snapshotDir, { recursive: true });
      console.log(chalk.blue(`📁 Created snapshots directory: ${snapshotDir}`));
    }
  }

  private async initializeGitHub(): Promise<void> {
    if (!this.config.githubToken || !this.config.githubRepo) {
      throw new Error('GitHub token and repo required for GitHub provider');
    }
    
    // Test GitHub API connection
    try {
      const response = await fetch(`https://api.github.com/repos/${this.config.githubRepo}`, {
        headers: { 'Authorization': `token ${this.config.githubToken}` }
      });
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }
      
      console.log(chalk.green('✅ GitHub connection verified'));
    } catch (error: any) {
      throw new Error(`GitHub initialization failed: ${error.message}`);
    }
  }

  private async initializeSupabase(): Promise<void> {
    if (!this.config.supabaseUrl || !this.config.supabaseKey) {
      throw new Error('Supabase URL and key required for Supabase provider');
    }
    
    // Test Supabase connection
    try {
      const response = await fetch(`${this.config.supabaseUrl}/rest/v1/`, {
        headers: { 
          'apikey': this.config.supabaseKey,
          'Authorization': `Bearer ${this.config.supabaseKey}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Supabase API error: ${response.status}`);
      }
      
      console.log(chalk.green('✅ Supabase connection verified'));
    } catch (error: any) {
      throw new Error(`Supabase initialization failed: ${error.message}`);
    }
  }

  /**
   * Create a new snapshot
   */
  async createSnapshot(
    name: string, 
    description: string = '',
    options: {
      includePaths?: string[];
      excludePaths?: string[];
      tags?: string[];
    } = {}
  ): Promise<string> {
    if (!this.isInitialized) await this.initialize();

    const snapshotId = this.generateSnapshotId();
    const timestamp = Date.now();
    
    console.log(chalk.blue(`📸 Creating snapshot: ${name}`));
    
    try {
      // Scan and collect files
      const files = await this.collectFiles(options.includePaths, options.excludePaths);
      
      if (files.length === 0) {
        throw new Error('No files found to snapshot');
      }

      const snapshot: SnapshotEntry = {
        id: snapshotId,
        name,
        description,
        timestamp,
        files,
        metadata: {
          tags: options.tags || [],
          size: files.reduce((sum, f) => sum + f.size, 0),
          fileCount: files.length,
          branch: await this.getCurrentBranch(),
          commit: await this.getCurrentCommit(),
          author: process.env.USER || 'unknown'
        }
      };

      // Store snapshot
      await this.storeSnapshot(snapshot);
      this.snapshots.set(snapshotId, snapshot);

      // Cleanup old snapshots if needed
      await this.cleanupOldSnapshots();

      console.log(chalk.green(`✅ Snapshot created: ${snapshotId.substring(0, 8)}...`));
      console.log(chalk.gray(`   Files: ${snapshot.metadata.fileCount}, Size: ${this.formatSize(snapshot.metadata.size)}`));
      
      this.emit('snapshot_created', { snapshot });
      
      return snapshotId;
      
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to create snapshot: ${error.message}`));
      throw error;
    }
  }

  /**
   * Restore from snapshot
   */
  async restoreSnapshot(
    snapshotId: string, 
    options: {
      targetPath?: string;
      overwrite?: boolean;
      selectedFiles?: string[];
    } = {}
  ): Promise<void> {
    if (!this.isInitialized) await this.initialize();

    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    const targetPath = options.targetPath || process.cwd();
    const filesToRestore = options.selectedFiles 
      ? snapshot.files.filter(f => options.selectedFiles!.includes(f.path))
      : snapshot.files;

    console.log(chalk.blue(`🔄 Restoring snapshot: ${snapshot.name}`));
    console.log(chalk.gray(`   Target: ${targetPath}`));
    console.log(chalk.gray(`   Files: ${filesToRestore.length}/${snapshot.files.length}`));

    let restoredCount = 0;
    let skippedCount = 0;

    for (const file of filesToRestore) {
      try {
        const fullPath = path.join(targetPath, file.path);
        const dir = path.dirname(fullPath);

        // Create directory if needed
        await fs.mkdir(dir, { recursive: true });

        // Check if file exists and overwrite setting
        if (!options.overwrite) {
          try {
            await fs.access(fullPath);
            console.log(chalk.yellow(`⏭️ Skipped (exists): ${file.path}`));
            skippedCount++;
            continue;
          } catch {
            // File doesn't exist, proceed
          }
        }

        // Write file content
        await fs.writeFile(fullPath, file.content);
        restoredCount++;
        
      } catch (error: any) {
        console.log(chalk.red(`❌ Failed to restore ${file.path}: ${error.message}`));
      }
    }

    console.log(chalk.green(`✅ Snapshot restored: ${restoredCount} files`));
    if (skippedCount > 0) {
      console.log(chalk.gray(`   Skipped: ${skippedCount} files (use --overwrite to replace)`));
    }

    this.emit('snapshot_restored', { snapshot, restoredCount, skippedCount });
  }

  /**
   * List snapshots with filtering
   */
  async listSnapshots(options: SnapshotSearchOptions = {}): Promise<SnapshotEntry[]> {
    if (!this.isInitialized) await this.initialize();

    let results = Array.from(this.snapshots.values());

    // Apply filters
    if (options.name) {
      results = results.filter(s => 
        s.name.toLowerCase().includes(options.name!.toLowerCase())
      );
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(s => 
        options.tags!.some(tag => s.metadata.tags.includes(tag))
      );
    }

    if (options.dateRange) {
      results = results.filter(s => 
        s.timestamp >= options.dateRange!.start && 
        s.timestamp <= options.dateRange!.end
      );
    }

    if (options.author) {
      results = results.filter(s => 
        s.metadata.author === options.author
      );
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    if (!this.isInitialized) await this.initialize();

    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return false;
    }

    try {
      await this.removeStoredSnapshot(snapshotId);
      this.snapshots.delete(snapshotId);
      
      console.log(chalk.green(`✅ Snapshot deleted: ${snapshotId.substring(0, 8)}...`));
      this.emit('snapshot_deleted', { snapshotId });
      
      return true;
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to delete snapshot: ${error.message}`));
      return false;
    }
  }

  // ===== PRIVATE METHODS =====

  private async collectFiles(
    includePaths?: string[], 
    excludePaths?: string[]
  ): Promise<SnapshotFile[]> {
    const files: SnapshotFile[] = [];
    const basePath = process.cwd();

    // Use includePaths or scan current directory
    const scanPaths = includePaths || ['.'];
    
    for (const scanPath of scanPaths) {
      await this.scanDirectory(scanPath, files, basePath, excludePaths);
    }

    return files;
  }

  private async scanDirectory(
    dirPath: string, 
    files: SnapshotFile[], 
    basePath: string,
    excludePaths?: string[]
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);

        // Check exclusion patterns
        if (this.shouldExclude(relativePath, excludePaths)) {
          continue;
        }

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, files, basePath, excludePaths);
        } else if (entry.isFile()) {
          try {
            const content = await fs.readFile(fullPath, 'utf8');
            const stats = await fs.stat(fullPath);
            
            files.push({
              path: relativePath,
              content,
              hash: this.generateFileHash(content),
              size: stats.size,
              lastModified: stats.mtime.getTime()
            });
          } catch (error) {
            // Skip files that can't be read
            console.log(chalk.yellow(`⚠️ Skipped ${relativePath}: ${error}`));
          }
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }
  }

  private shouldExclude(filePath: string, excludePaths?: string[]): boolean {
    const allExcludes = [...this.config.excludePatterns, ...(excludePaths || [])];
    
    return allExcludes.some(pattern => {
      // Simple glob pattern matching
      const regex = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]');
      
      return new RegExp(`^${regex}$`).test(filePath);
    });
  }

  private async storeSnapshot(snapshot: SnapshotEntry): Promise<void> {
    switch (this.config.provider) {
      case 'local':
        await this.storeSnapshotLocal(snapshot);
        break;
      case 'github':
        await this.storeSnapshotGitHub(snapshot);
        break;
      case 'supabase':
        await this.storeSnapshotSupabase(snapshot);
        break;
    }
  }

  private async storeSnapshotLocal(snapshot: SnapshotEntry): Promise<void> {
    const snapshotPath = path.join(this.config.localPath!, `${snapshot.id}.json`);
    
    let data = snapshot;
    if (this.config.compression) {
      // Simple compression by removing whitespace from file contents
      data = {
        ...snapshot,
        files: snapshot.files.map(f => ({
          ...f,
          content: f.content.replace(/\s+/g, ' ').trim()
        }))
      };
    }
    
    await fs.writeFile(snapshotPath, JSON.stringify(data, null, 2));
  }

  private async storeSnapshotGitHub(snapshot: SnapshotEntry): Promise<void> {
    // Store as GitHub Gist or in repository
    const content = JSON.stringify(snapshot, null, 2);
    
    const response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.config.githubToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: `NikCLI Snapshot: ${snapshot.name}`,
        public: false,
        files: {
          [`snapshot_${snapshot.id}.json`]: { content }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`GitHub storage failed: ${response.status}`);
    }
  }

  private async storeSnapshotSupabase(snapshot: SnapshotEntry): Promise<void> {
    const response = await fetch(`${this.config.supabaseUrl}/rest/v1/snapshots`, {
      method: 'POST',
      headers: {
        'apikey': this.config.supabaseKey!,
        'Authorization': `Bearer ${this.config.supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(snapshot)
    });

    if (!response.ok) {
      throw new Error(`Supabase storage failed: ${response.status}`);
    }
  }

  private async loadExistingSnapshots(): Promise<void> {
    switch (this.config.provider) {
      case 'local':
        await this.loadSnapshotsLocal();
        break;
      case 'github':
        await this.loadSnapshotsGitHub();
        break;
      case 'supabase':
        await this.loadSnapshotsSupabase();
        break;
    }
  }

  private async loadSnapshotsLocal(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.localPath!);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(
              path.join(this.config.localPath!, file), 
              'utf8'
            );
            const snapshot: SnapshotEntry = JSON.parse(content);
            this.snapshots.set(snapshot.id, snapshot);
          } catch (error) {
            console.log(chalk.yellow(`⚠️ Skipped invalid snapshot file: ${file}`));
          }
        }
      }
      
      console.log(chalk.dim(`📁 Loaded ${this.snapshots.size} local snapshots`));
    } catch (error) {
      // Directory doesn't exist or is empty
    }
  }

  private async loadSnapshotsGitHub(): Promise<void> {
    // Load from GitHub Gists
    const response = await fetch('https://api.github.com/gists', {
      headers: { 'Authorization': `token ${this.config.githubToken}` }
    });

    if (response.ok) {
      const gists = await response.json() as any[];
      
      for (const gist of gists) {
        if (gist.description?.startsWith('NikCLI Snapshot:')) {
          // Load gist content
          // Implementation would parse gist files
        }
      }
    }
  }

  private async loadSnapshotsSupabase(): Promise<void> {
    const response = await fetch(`${this.config.supabaseUrl}/rest/v1/snapshots`, {
      headers: {
        'apikey': this.config.supabaseKey!,
        'Authorization': `Bearer ${this.config.supabaseKey}`
      }
    });

    if (response.ok) {
      const snapshots: SnapshotEntry[] = await response.json() as SnapshotEntry[];
      snapshots.forEach(snapshot => {
        this.snapshots.set(snapshot.id, snapshot);
      });
    }
  }

  private async removeStoredSnapshot(snapshotId: string): Promise<void> {
    switch (this.config.provider) {
      case 'local':
        const snapshotPath = path.join(this.config.localPath!, `${snapshotId}.json`);
        await fs.unlink(snapshotPath);
        break;
      // GitHub and Supabase deletion implementation
    }
  }

  private async cleanupOldSnapshots(): Promise<void> {
    if (this.snapshots.size <= this.config.maxSnapshots) {
      return;
    }

    const sortedSnapshots = Array.from(this.snapshots.entries())
      .sort(([,a], [,b]) => b.timestamp - a.timestamp);

    const toDelete = sortedSnapshots.slice(this.config.maxSnapshots);
    
    for (const [id] of toDelete) {
      await this.deleteSnapshot(id);
    }

    if (toDelete.length > 0) {
      console.log(chalk.gray(`🧹 Cleaned up ${toDelete.length} old snapshots`));
    }
  }

  private generateSnapshotId(): string {
    return `snap_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateFileHash(content: string): string {
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private async getCurrentBranch(): Promise<string | undefined> {
    try {
      const { execSync } = require('child_process');
      return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    } catch {
      return undefined;
    }
  }

  private async getCurrentCommit(): Promise<string | undefined> {
    try {
      const { execSync } = require('child_process');
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return undefined;
    }
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }

  /**
   * Get snapshot statistics
   */
  getSnapshotStats(): {
    totalSnapshots: number;
    totalSize: number;
    oldestSnapshot?: number;
    newestSnapshot?: number;
    averageSize: number;
  } {
    const snapshots = Array.from(this.snapshots.values());
    const totalSize = snapshots.reduce((sum, s) => sum + s.metadata.size, 0);
    const timestamps = snapshots.map(s => s.timestamp);

    return {
      totalSnapshots: snapshots.length,
      totalSize,
      oldestSnapshot: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
      newestSnapshot: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
      averageSize: snapshots.length > 0 ? Math.round(totalSize / snapshots.length) : 0
    };
  }

  /**
   * Get provider configuration
   */
  getConfig(): SnapshotConfig {
    return { ...this.config };
  }
}

// Singleton instance
export const snapshotProvider = new SnapshotProvider();