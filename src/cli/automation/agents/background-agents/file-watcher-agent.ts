import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { nanoid } from 'nanoid';
import { logger } from '../../utils/logger';
import { UniversalAgent } from '../universal-agent';
import { BackgroundAgentType, BackgroundAgentConfig, BackgroundAgentInstance } from '../../services/background-agent-service';

/**
 * File Watcher Agent
 * Monitors file system changes and triggers actions based on patterns
 */
export class FileWatcherAgent extends EventEmitter {
  private watcher?: chokidar.FSWatcher;
  private instance: BackgroundAgentInstance;
  private agent: UniversalAgent;
  private isRunning = false;
  private fileCache: Map<string, { hash: string; mtime: Date }> = new Map();

  constructor(instance: BackgroundAgentInstance, agent: UniversalAgent) {
    super();
    this.instance = instance;
    this.agent = agent;
  }

  /**
   * Start the file watcher
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      await logger.logService('warn', 'file-watcher-agent', 'File watcher is already running');
      return;
    }

    try {
      const { workingDirectory, triggers = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'] } = this.instance.config;
      
      // Initialize file cache
      await this.initializeFileCache(workingDirectory, triggers);

      // Setup file watcher
      this.watcher = chokidar.watch(triggers, {
        cwd: workingDirectory,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**',
          '**/build/**',
          '**/.next/**',
          '**/coverage/**',
          '**/*.log'
        ],
        persistent: true,
        ignoreInitial: true,
        followSymlinks: false,
        depth: 10
      });

      // Setup event handlers
      this.setupEventHandlers();

      this.isRunning = true;
      await logger.logService('info', 'file-watcher-agent', `Started file watcher for: ${triggers.join(', ')}`, {
        workingDirectory,
        agentId: this.instance.id
      });

      this.emit('started');

    } catch (error: any) {
      await logger.logService('error', 'file-watcher-agent', 'Failed to start file watcher', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  /**
   * Stop the file watcher
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      await logger.logService('warn', 'file-watcher-agent', 'File watcher is not running');
      return;
    }

    try {
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = undefined;
      }

      this.isRunning = false;
      await logger.logService('info', 'file-watcher-agent', 'Stopped file watcher', {
        agentId: this.instance.id
      });

      this.emit('stopped');

    } catch (error: any) {
      await logger.logService('error', 'file-watcher-agent', 'Failed to stop file watcher', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  /**
   * Get current status
   */
  public getStatus(): { isRunning: boolean; watchedFiles: number; lastActivity?: Date } {
    return {
      isRunning: this.isRunning,
      watchedFiles: this.fileCache.size,
      lastActivity: this.instance.lastActivity
    };
  }

  private async initializeFileCache(workingDirectory: string, patterns: string[]): Promise<void> {
    this.fileCache.clear();

    for (const pattern of patterns) {
      try {
        const files = await this.globFiles(workingDirectory, pattern);
        
        for (const file of files) {
          const fullPath = path.join(workingDirectory, file);
          try {
            const stats = fs.statSync(fullPath);
            const content = fs.readFileSync(fullPath, 'utf8');
            const hash = this.hashContent(content);
            
            this.fileCache.set(fullPath, {
              hash,
              mtime: stats.mtime
            });
          } catch (error) {
            // Skip files that can't be read
            continue;
          }
        }
      } catch (error) {
        await logger.logService('warn', 'file-watcher-agent', `Failed to initialize cache for pattern: ${pattern}`, {
          error: error.message,
          agentId: this.instance.id
        });
      }
    }

    await logger.logService('info', 'file-watcher-agent', `Initialized file cache with ${this.fileCache.size} files`, {
      agentId: this.instance.id
    });
  }

  private async globFiles(workingDirectory: string, pattern: string): Promise<string[]> {
    const { glob } = await import('globby');
    return await glob(pattern, {
      cwd: workingDirectory,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**'
      ]
    });
  }

  private setupEventHandlers(): void {
    if (!this.watcher) return;

    this.watcher.on('add', (filePath) => this.handleFileEvent('add', filePath));
    this.watcher.on('change', (filePath) => this.handleFileEvent('change', filePath));
    this.watcher.on('unlink', (filePath) => this.handleFileEvent('unlink', filePath));
    this.watcher.on('error', (error) => this.handleError(error));
  }

  private async handleFileEvent(event: 'add' | 'change' | 'unlink', filePath: string): Promise<void> {
    try {
      const fullPath = path.resolve(this.instance.config.workingDirectory, filePath);
      
      await logger.logService('debug', 'file-watcher-agent', `File ${event}: ${filePath}`, {
        agentId: this.instance.id,
        fullPath
      });

      // Update file cache
      if (event === 'unlink') {
        this.fileCache.delete(fullPath);
      } else {
        try {
          const stats = fs.statSync(fullPath);
          const content = fs.readFileSync(fullPath, 'utf8');
          const hash = this.hashContent(content);
          
          this.fileCache.set(fullPath, {
            hash,
            mtime: stats.mtime
          });
        } catch (error) {
          // File might be locked or deleted
          this.fileCache.delete(fullPath);
        }
      }

      // Determine action based on file type and event
      const action = await this.determineAction(event, filePath, fullPath);
      
      if (action) {
        await this.executeAction(action, filePath, fullPath);
      }

      this.instance.lastActivity = new Date();
      this.emit('file-event', { event, filePath, fullPath, action });

    } catch (error: any) {
      await logger.logService('error', 'file-watcher-agent', `Failed to handle file event: ${event}`, {
        filePath,
        error: error.message,
        agentId: this.instance.id
      });
    }
  }

  private async determineAction(event: 'add' | 'change' | 'unlink', filePath: string, fullPath: string): Promise<string | null> {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath);

    // Skip certain files
    if (basename.startsWith('.') || basename.includes('node_modules')) {
      return null;
    }

    // Determine action based on file type and event
    switch (ext) {
      case '.ts':
      case '.tsx':
        if (event === 'change') {
          return 'analyze-typescript';
        } else if (event === 'add') {
          return 'analyze-new-file';
        }
        break;

      case '.js':
      case '.jsx':
        if (event === 'change') {
          return 'analyze-javascript';
        } else if (event === 'add') {
          return 'analyze-new-file';
        }
        break;

      case '.json':
        if (basename === 'package.json' && event === 'change') {
          return 'check-dependencies';
        }
        break;

      case '.md':
        if (event === 'change') {
          return 'update-documentation';
        }
        break;

      case '.test.ts':
      case '.test.js':
      case '.spec.ts':
      case '.spec.js':
        if (event === 'change') {
          return 'run-tests';
        }
        break;
    }

    return null;
  }

  private async executeAction(action: string, filePath: string, fullPath: string): Promise<void> {
    try {
      const taskId = nanoid();
      
      await logger.logService('info', 'file-watcher-agent', `Executing action: ${action}`, {
        filePath,
        action,
        taskId,
        agentId: this.instance.id
      });

      // Create task for the universal agent
      const task = {
        id: taskId,
        type: 'background-task',
        title: `File watcher: ${action}`,
        description: `Execute ${action} for file: ${filePath}`,
        priority: 'normal' as const,
        status: 'pending' as const,
        data: {
          action,
          filePath,
          fullPath,
          trigger: 'file-watcher'
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0
      };

      // Execute task with the universal agent
      const result = await this.agent.executeTask(task);

      await logger.logService('info', 'file-watcher-agent', `Action completed: ${action}`, {
        filePath,
        action,
        taskId,
        status: result.status,
        agentId: this.instance.id
      });

      this.emit('action-completed', { action, filePath, result });

    } catch (error: any) {
      await logger.logService('error', 'file-watcher-agent', `Failed to execute action: ${action}`, {
        filePath,
        action,
        error: error.message,
        agentId: this.instance.id
      });

      this.emit('action-failed', { action, filePath, error });
    }
  }

  private async handleError(error: Error): Promise<void> {
    await logger.logService('error', 'file-watcher-agent', 'File watcher error', {
      error: error.message,
      agentId: this.instance.id
    });

    this.emit('error', error);
  }

  private hashContent(content: string): string {
    // Simple hash function for content comparison
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}