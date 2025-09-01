import { useState, useEffect, useCallback } from 'react';
import { FileInfo } from '../types';

interface FileWatcherOptions {
  watchPatterns?: string[];
  ignorePatterns?: string[];
  maxFiles?: number;
  enabled?: boolean;
}

interface FileChangeEvent {
  type: 'created' | 'modified' | 'deleted';
  path: string;
  timestamp: Date;
  size?: number;
}

export function useFileWatcher(cliInstance: any, options: FileWatcherOptions = {}) {
  const {
    watchPatterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.json', '**/*.md'],
    ignorePatterns = ['node_modules/**', '.git/**', 'dist/**'],
    maxFiles = 1000,
    enabled = true,
  } = options;

  const [watchedFiles, setWatchedFiles] = useState<Map<string, FileInfo>>(new Map());
  const [recentChanges, setRecentChanges] = useState<FileChangeEvent[]>([]);
  const [isWatching, setIsWatching] = useState(false);

  const addFileChange = useCallback((change: FileChangeEvent) => {
    setRecentChanges(prev => {
      const newChanges = [...prev, change];
      return newChanges.slice(-50); // Keep only recent changes
    });
  }, []);

  const updateWatchedFile = useCallback((path: string, info: Partial<FileInfo>) => {
    setWatchedFiles(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(path);
      
      if (existing) {
        newMap.set(path, { ...existing, ...info });
      } else {
        newMap.set(path, { path, ...info });
      }
      
      return newMap;
    });
  }, []);

  const removeWatchedFile = useCallback((path: string) => {
    setWatchedFiles(prev => {
      const newMap = new Map(prev);
      newMap.delete(path);
      return newMap;
    });
  }, []);

  const startWatching = useCallback(async () => {
    if (!enabled || isWatching) return;

    try {
      // Simula file watcher - in un'implementazione reale useresti chokidar
      setIsWatching(true);
      
      // Mock file discovery
      const mockFiles: FileInfo[] = [
        { path: 'src/index.ts', size: 1024, language: 'typescript' },
        { path: 'src/components/App.tsx', size: 2048, language: 'typescript' },
        { path: 'package.json', size: 512, language: 'json' },
        { path: 'README.md', size: 1536, language: 'markdown' },
      ];

      mockFiles.forEach(file => {
        updateWatchedFile(file.path, file);
      });

    } catch (error) {
      console.error('Failed to start file watcher:', error);
      setIsWatching(false);
    }
  }, [enabled, isWatching, updateWatchedFile]);

  const stopWatching = useCallback(() => {
    setIsWatching(false);
    setWatchedFiles(new Map());
    setRecentChanges([]);
  }, []);

  // Auto-start watching when enabled
  useEffect(() => {
    if (enabled) {
      startWatching();
    }
    
    return () => {
      stopWatching();
    };
  }, [enabled, startWatching, stopWatching]);

  // Integrazione con CLI instance per eventi reali
  useEffect(() => {
    if (!cliInstance) return;

    const handleFileRead = (data: any) => {
      if (data.path && data.content) {
        updateWatchedFile(data.path, {
          content: data.content,
          language: data.language,
          size: data.content.length,
          modified: new Date(),
        });
        
        addFileChange({
          type: 'modified',
          path: data.path,
          timestamp: new Date(),
          size: data.content.length,
        });
      }
    };

    const handleFileWritten = (data: any) => {
      if (data.path) {
        updateWatchedFile(data.path, {
          content: data.content,
          size: data.content?.length,
          modified: new Date(),
        });
        
        addFileChange({
          type: data.originalContent ? 'modified' : 'created',
          path: data.path,
          timestamp: new Date(),
          size: data.content?.length,
        });
      }
    };

    // Registra listeners se disponibili
    if (cliInstance.on) {
      cliInstance.on('file_read', handleFileRead);
      cliInstance.on('file_written', handleFileWritten);
    }

    return () => {
      if (cliInstance.off) {
        cliInstance.off('file_read', handleFileRead);
        cliInstance.off('file_written', handleFileWritten);
      }
    };
  }, [cliInstance, updateWatchedFile, addFileChange]);

  const getFileStats = useCallback(() => {
    const files = Array.from(watchedFiles.values());
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const languages = new Set(files.map(f => f.language).filter(Boolean));
    
    return {
      totalFiles: files.length,
      totalSize,
      languages: Array.from(languages),
      recentChanges: recentChanges.length,
    };
  }, [watchedFiles, recentChanges]);

  const getRecentChanges = useCallback((count: number = 10) => {
    return recentChanges.slice(-count);
  }, [recentChanges]);

  const searchFiles = useCallback((query: string): FileInfo[] => {
    const files = Array.from(watchedFiles.values());
    return files.filter(file => 
      file.path.toLowerCase().includes(query.toLowerCase()) ||
      (file.content && file.content.toLowerCase().includes(query.toLowerCase()))
    );
  }, [watchedFiles]);

  // Metodi per interagire con il CLI
  const handleInput = useCallback((input: string) => {
    if (cliInstance?.handleChatInput) {
      cliInstance.handleChatInput(input);
    }
  }, [cliInstance]);

  const handleCommand = useCallback((command: string) => {
    if (cliInstance?.dispatchSlash) {
      cliInstance.dispatchSlash(command);
    }
  }, [cliInstance]);

  const interruptProcessing = useCallback(() => {
    if (cliInstance?.interruptProcessing) {
      cliInstance.interruptProcessing();
    }
  }, [cliInstance]);

  const approveRequest = useCallback((id: string) => {
    if (cliInstance?.approvalSystem?.approve) {
      cliInstance.approvalSystem.approve(id);
    }
  }, [cliInstance]);

  const rejectRequest = useCallback((id: string) => {
    if (cliInstance?.approvalSystem?.reject) {
      cliInstance.approvalSystem.reject(id);
    }
  }, [cliInstance]);

  return {
    // File watcher specific
    watchedFiles,
    recentChanges,
    isWatching,
    
    // Methods
    startWatching,
    stopWatching,
    updateWatchedFile,
    removeWatchedFile,
    getFileStats,
    getRecentChanges,
    searchFiles,
    handleInput,
    handleCommand,
    interruptProcessing,
    approveRequest,
    rejectRequest,
  };
}