import { useState, useCallback } from 'react';

interface CommandHistoryEntry {
  command: string;
  timestamp: Date;
  success: boolean;
  output?: string;
  duration?: number;
}

export function useCommandHistory(maxEntries: number = 100) {
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const addCommand = useCallback((
    command: string, 
    success: boolean = true, 
    output?: string, 
    duration?: number
  ) => {
    const entry: CommandHistoryEntry = {
      command,
      timestamp: new Date(),
      success,
      output,
      duration,
    };

    setHistory(prev => {
      const newHistory = [...prev, entry];
      return newHistory.slice(-maxEntries);
    });
    
    setCurrentIndex(-1); // Reset navigation
  }, [maxEntries]);

  const navigateHistory = useCallback((direction: 'up' | 'down'): string | null => {
    if (history.length === 0) return null;

    let newIndex = currentIndex;
    
    if (direction === 'up') {
      newIndex = currentIndex === -1 ? history.length - 1 : Math.max(0, currentIndex - 1);
    } else {
      newIndex = currentIndex === -1 ? -1 : Math.min(history.length - 1, currentIndex + 1);
    }

    setCurrentIndex(newIndex);
    return newIndex === -1 ? '' : history[newIndex].command;
  }, [history, currentIndex]);

  const searchHistory = useCallback((query: string): CommandHistoryEntry[] => {
    return history.filter(entry => 
      entry.command.toLowerCase().includes(query.toLowerCase())
    ).slice(-10);
  }, [history]);

  const getRecentCommands = useCallback((count: number = 5): CommandHistoryEntry[] => {
    return history.slice(-count);
  }, [history]);

  const getCommandStats = useCallback(() => {
    const total = history.length;
    const successful = history.filter(h => h.success).length;
    const failed = total - successful;
    const avgDuration = history.reduce((sum, h) => sum + (h.duration || 0), 0) / total;

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
      avgDuration: Math.round(avgDuration),
    };
  }, [history]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  return {
    history,
    currentIndex,
    addCommand,
    navigateHistory,
    searchHistory,
    getRecentCommands,
    getCommandStats,
    clearHistory,
  };
}