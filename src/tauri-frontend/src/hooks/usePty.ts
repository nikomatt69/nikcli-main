import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

interface UsePtyOptions {
  cols?: number;
  rows?: number;
  cwd?: string;
  onOutput?: (data: string) => void;
  onExit?: () => void;
  onError?: (error: string) => void;
}

interface UsePtyReturn {
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}

export function usePty(options: UsePtyOptions = {}): UsePtyReturn {
  const {
    cols = 80,
    rows = 24,
    cwd,
    onOutput,
    onExit,
    onError,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const connect = useCallback(async () => {
    try {
      // Set up listeners first
      const unlistenOutput = await listen<string>('pty-output', (event) => {
        onOutput?.(event.payload);
      });
      unlistenersRef.current.push(unlistenOutput);

      const unlistenExit = await listen('pty-exit', () => {
        setIsConnected(false);
        onExit?.();
      });
      unlistenersRef.current.push(unlistenExit);

      // Create PTY
      await invoke('create_pty', { cols, rows, cwd });
      setIsConnected(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      onError?.(errorMessage);
      throw err;
    }
  }, [cols, rows, cwd, onOutput, onExit, onError]);

  const disconnect = useCallback(async () => {
    try {
      // Clean up listeners
      unlistenersRef.current.forEach((unlisten) => unlisten());
      unlistenersRef.current = [];

      // Close PTY
      await invoke('close_pty');
      setIsConnected(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      onError?.(errorMessage);
    }
  }, [onError]);

  const write = useCallback(async (data: string) => {
    if (!isConnected) {
      throw new Error('PTY not connected');
    }
    try {
      await invoke('write_to_pty', { data });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      onError?.(errorMessage);
      throw err;
    }
  }, [isConnected, onError]);

  const resize = useCallback(async (newCols: number, newRows: number) => {
    if (!isConnected) return;
    try {
      await invoke('resize_pty', { cols: newCols, rows: newRows });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      onError?.(errorMessage);
    }
  }, [isConnected, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unlistenersRef.current.forEach((unlisten) => unlisten());
      unlistenersRef.current = [];
      if (isConnected) {
        invoke('close_pty').catch(console.error);
      }
    };
  }, [isConnected]);

  return {
    isConnected,
    connect,
    disconnect,
    write,
    resize,
  };
}
