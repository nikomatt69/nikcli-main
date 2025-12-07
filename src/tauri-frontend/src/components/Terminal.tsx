import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

interface TerminalProps {
  onConnect?: () => void;
  onExit?: () => void;
  onError?: (error: string) => void;
}

export function Terminal({ onConnect, onExit, onError }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terminalRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenersRef = useRef<UnlistenFn[]>([]);

  const initTerminal = useCallback(async () => {
    if (isInitialized || !containerRef.current) return;

    try {
      // Dynamic import ghostty-web
      const ghosttyModule = await import('ghostty-web');

      // Initialize WASM first - pass path to WASM file
      if (typeof ghosttyModule.init === 'function') {
        await ghosttyModule.init('/ghostty-vt.wasm');
      }

      const GhosttyTerminal = ghosttyModule.Terminal;

      // Create terminal with basic options
      const term = new GhosttyTerminal({
        cols: 80,
        rows: 24,
        fontSize: 14,
        fontFamily: 'monospace',
      });

      // Open terminal in container
      await term.open(containerRef.current);
      terminalRef.current = term;

      // Get actual terminal dimensions after open
      const cols = term.cols || 80;
      const rows = term.rows || 24;

      // Create PTY with initial size
      await invoke('create_pty', { cols, rows });

      // Handle input from terminal
      if (term.onData) {
        const dataDisposable = term.onData((data: string) => {
          invoke('write_to_pty', { data }).catch((err: unknown) => {
            console.error('Failed to write to PTY:', err);
          });
        });
        // Store for cleanup
        (term as any)._dataDisposable = dataDisposable;
      }

      // Listen for PTY output
      const unlistenOutput = await listen<string>('pty-output', (event) => {
        if (terminalRef.current) {
          terminalRef.current.write(event.payload);
        }
      });
      unlistenersRef.current.push(unlistenOutput);

      // Listen for PTY exit
      const unlistenExit = await listen('pty-exit', () => {
        onExit?.();
      });
      unlistenersRef.current.push(unlistenExit);

      setIsInitialized(true);
      onConnect?.();

      // Cleanup function
      return () => {
        unlistenersRef.current.forEach((unlisten) => unlisten());
        unlistenersRef.current = [];
        if ((term as any)._dataDisposable?.dispose) {
          (term as any)._dataDisposable.dispose();
        }
        if (terminalRef.current && typeof terminalRef.current.dispose === 'function') {
          terminalRef.current.dispose();
        }
        invoke('close_pty').catch(console.error);
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('Failed to initialize terminal:', errorMessage);
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [isInitialized, onConnect, onExit, onError]);

  useEffect(() => {
    const cleanup = initTerminal();

    return () => {
      cleanup?.then((fn) => fn?.());
    };
  }, [initTerminal]);

  // Focus terminal on click
  const handleClick = useCallback(() => {
    if (terminalRef.current && typeof terminalRef.current.focus === 'function') {
      terminalRef.current.focus();
    }
  }, []);

  if (error) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1b26',
        color: '#f7768e',
        padding: '20px',
        fontFamily: 'monospace',
      }}>
        <h3>Terminal Error</h3>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1b26',
        padding: '8px',
      }}
    />
  );
}
