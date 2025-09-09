import { EventEmitter } from 'events';
import { DiffData } from './GitDiffBlock';

export interface FileChangeEvent {
  operation: 'write_file' | 'edit' | 'edit_file' | 'create' | 'delete';
  filePath: string;
  oldContent?: string;
  newContent: string;
  timestamp: Date;
  diff?: DiffData;
}

export interface TrackedFile {
  path: string;
  content: string;
  lastModified: Date;
  changeCount: number;
}

export class FileChangeTracker extends EventEmitter {
  private trackedFiles: Map<string, TrackedFile> = new Map();
  private changeHistory: FileChangeEvent[] = [];
  private maxHistorySize: number = 100;
  
  constructor(maxHistorySize: number = 100) {
    super();
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Track a file change operation
   */
  public trackChange(event: Omit<FileChangeEvent, 'timestamp' | 'diff'>): FileChangeEvent {
    const timestamp = new Date();
    
    // Get old content from tracked files
    const trackedFile = this.trackedFiles.get(event.filePath);
    const oldContent = event.oldContent || trackedFile?.content || '';
    
    // Generate diff data if we have old content
    let diff: DiffData | undefined;
    if (oldContent && event.newContent && event.operation !== 'delete') {
      diff = this.generateDiffData(oldContent, event.newContent, event.filePath);
    }

    const changeEvent: FileChangeEvent = {
      ...event,
      oldContent,
      timestamp,
      diff
    };

    // Update tracked file
    if (event.operation === 'delete') {
      this.trackedFiles.delete(event.filePath);
    } else {
      const existingFile = this.trackedFiles.get(event.filePath);
      this.trackedFiles.set(event.filePath, {
        path: event.filePath,
        content: event.newContent,
        lastModified: timestamp,
        changeCount: (existingFile?.changeCount || 0) + 1
      });
    }

    // Add to history
    this.addToHistory(changeEvent);

    // Emit event
    this.emit('fileChange', changeEvent);
    this.emit(`fileChange:${event.filePath}`, changeEvent);
    this.emit(`operation:${event.operation}`, changeEvent);

    return changeEvent;
  }

  /**
   * Track a file write operation
   */
  public trackWrite(filePath: string, content: string, oldContent?: string): FileChangeEvent {
    return this.trackChange({
      operation: 'write_file',
      filePath,
      oldContent,
      newContent: content
    });
  }

  /**
   * Track a file edit operation
   */
  public trackEdit(filePath: string, newContent: string, oldContent?: string): FileChangeEvent {
    return this.trackChange({
      operation: 'edit',
      filePath,
      oldContent,
      newContent: newContent
    });
  }

  /**
   * Track a file creation
   */
  public trackCreate(filePath: string, content: string): FileChangeEvent {
    return this.trackChange({
      operation: 'create',
      filePath,
      newContent: content
    });
  }

  /**
   * Track a file deletion
   */
  public trackDelete(filePath: string, lastContent?: string): FileChangeEvent {
    return this.trackChange({
      operation: 'delete',
      filePath,
      oldContent: lastContent,
      newContent: ''
    });
  }

  /**
   * Get current diff for a file
   */
  public getDiff(filePath: string): DiffData | null {
    const latestChange = this.getLatestChangeForFile(filePath);
    return latestChange?.diff || null;
  }

  /**
   * Get latest change for a specific file
   */
  public getLatestChangeForFile(filePath: string): FileChangeEvent | null {
    for (let i = this.changeHistory.length - 1; i >= 0; i--) {
      if (this.changeHistory[i].filePath === filePath) {
        return this.changeHistory[i];
      }
    }
    return null;
  }

  /**
   * Get all changes for a specific file
   */
  public getChangesForFile(filePath: string): FileChangeEvent[] {
    return this.changeHistory.filter(change => change.filePath === filePath);
  }

  /**
   * Get recent changes (last N changes)
   */
  public getRecentChanges(limit: number = 10): FileChangeEvent[] {
    return this.changeHistory.slice(-limit);
  }

  /**
   * Get changes by operation type
   */
  public getChangesByOperation(operation: FileChangeEvent['operation']): FileChangeEvent[] {
    return this.changeHistory.filter(change => change.operation === operation);
  }

  /**
   * Get all tracked files
   */
  public getTrackedFiles(): TrackedFile[] {
    return Array.from(this.trackedFiles.values());
  }

  /**
   * Get tracked file info
   */
  public getTrackedFile(filePath: string): TrackedFile | null {
    return this.trackedFiles.get(filePath) || null;
  }

  /**
   * Check if file is being tracked
   */
  public isTracking(filePath: string): boolean {
    return this.trackedFiles.has(filePath);
  }

  /**
   * Start tracking an existing file
   */
  public startTracking(filePath: string, currentContent: string): void {
    this.trackedFiles.set(filePath, {
      path: filePath,
      content: currentContent,
      lastModified: new Date(),
      changeCount: 0
    });
  }

  /**
   * Stop tracking a file
   */
  public stopTracking(filePath: string): void {
    this.trackedFiles.delete(filePath);
  }

  /**
   * Clear all tracking data
   */
  public clearTracking(): void {
    this.trackedFiles.clear();
    this.changeHistory = [];
    this.emit('trackingCleared');
  }

  /**
   * Get statistics about tracked changes
   */
  public getStats(): {
    totalChanges: number;
    trackedFiles: number;
    operationCounts: Record<FileChangeEvent['operation'], number>;
    mostActiveFiles: { path: string; changes: number }[];
  } {
    const operationCounts: Record<FileChangeEvent['operation'], number> = {
      'write_file': 0,
      'edit': 0,
      'edit_file': 0,
      'create': 0,
      'delete': 0
    };

    this.changeHistory.forEach(change => {
      operationCounts[change.operation]++;
    });

    const mostActiveFiles = Array.from(this.trackedFiles.values())
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 10)
      .map(file => ({ path: file.path, changes: file.changeCount }));

    return {
      totalChanges: this.changeHistory.length,
      trackedFiles: this.trackedFiles.size,
      operationCounts,
      mostActiveFiles
    };
  }

  /**
   * Subscribe to file changes with optional filters
   */
  public subscribe(
    callback: (event: FileChangeEvent) => void,
    options?: {
      filePath?: string;
      operation?: FileChangeEvent['operation'];
      filePattern?: RegExp;
    }
  ): () => void {
    const wrappedCallback = (event: FileChangeEvent) => {
      // Apply filters
      if (options?.filePath && event.filePath !== options.filePath) return;
      if (options?.operation && event.operation !== options.operation) return;
      if (options?.filePattern && !options.filePattern.test(event.filePath)) return;
      
      callback(event);
    };

    this.on('fileChange', wrappedCallback);
    
    // Return unsubscribe function
    return () => {
      this.off('fileChange', wrappedCallback);
    };
  }

  /**
   * Export change history as JSON
   */
  public exportHistory(): string {
    return JSON.stringify({
      trackedFiles: Array.from(this.trackedFiles.entries()),
      changeHistory: this.changeHistory,
      exportedAt: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Import change history from JSON
   */
  public importHistory(jsonData: string): void {
    try {
      const data = JSON.parse(jsonData);
      
      // Restore tracked files
      this.trackedFiles = new Map(data.trackedFiles);
      
      // Restore change history
      this.changeHistory = data.changeHistory.map((change: any) => ({
        ...change,
        timestamp: new Date(change.timestamp)
      }));
      
      this.emit('historyImported');
    } catch (error) {
      throw new Error(`Failed to import history: ${error}`);
    }
  }

  private addToHistory(event: FileChangeEvent): void {
    this.changeHistory.push(event);
    
    // Trim history if it exceeds max size
    if (this.changeHistory.length > this.maxHistorySize) {
      this.changeHistory = this.changeHistory.slice(-this.maxHistorySize);
    }
  }

  private generateDiffData(oldContent: string, newContent: string, filePath: string): DiffData {
    // Extract file extension for language detection
    const extension = filePath.split('.').pop()?.toLowerCase();
    const language = this.getLanguageFromExtension(extension);

    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    const lines: DiffData['lines'] = [];
    let additions = 0;
    let deletions = 0;
    let modifications = 0;

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine === undefined) {
        // Added line
        lines.push({
          type: 'added',
          newLineNumber: i + 1,
          content: newLine
        });
        additions++;
      } else if (newLine === undefined) {
        // Removed line
        lines.push({
          type: 'removed',
          oldLineNumber: i + 1,
          content: oldLine
        });
        deletions++;
      } else if (oldLine === newLine) {
        // Unchanged line
        lines.push({
          type: 'unchanged',
          oldLineNumber: i + 1,
          newLineNumber: i + 1,
          content: oldLine
        });
      } else {
        // Modified line
        lines.push({
          type: 'modified',
          oldLineNumber: i + 1,
          newLineNumber: i + 1,
          content: newLine,
          originalContent: oldLine
        });
        modifications++;
      }
    }

    return {
      fileName: filePath.split('/').pop() || filePath,
      language,
      oldContent,
      newContent,
      lines,
      stats: { additions, deletions, modifications }
    };
  }

  private getLanguageFromExtension(extension?: string): string | undefined {
    if (!extension) return undefined;
    
    const languageMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'py': 'python',
      'rb': 'ruby',
      'php': 'php',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'zsh',
      'fish': 'fish'
    };

    return languageMap[extension];
  }
}

export default FileChangeTracker;