import { invoke } from '@tauri-apps/api/core';
import { listen, emit, UnlistenFn } from '@tauri-apps/api/event';

export interface PtyOptions {
  cols: number;
  rows: number;
  cwd?: string;
}

export interface PtyEvents {
  onOutput: (data: string) => void;
  onExit: () => void;
}

export class TauriBridge {
  private unlisteners: UnlistenFn[] = [];
  private isConnected = false;

  async createPty(options: PtyOptions): Promise<void> {
    await invoke('create_pty', { ...options });
    this.isConnected = true;
  }

  async writeToPty(data: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('PTY not connected');
    }
    await invoke('write_to_pty', { data });
  }

  async resizePty(cols: number, rows: number): Promise<void> {
    if (!this.isConnected) return;
    await invoke('resize_pty', { cols, rows });
  }

  async closePty(): Promise<void> {
    if (!this.isConnected) return;
    await invoke('close_pty');
    this.isConnected = false;
  }

  async subscribe(events: PtyEvents): Promise<void> {
    const unlistenOutput = await listen<string>('pty-output', (event) => {
      events.onOutput(event.payload);
    });
    this.unlisteners.push(unlistenOutput);

    const unlistenExit = await listen('pty-exit', () => {
      this.isConnected = false;
      events.onExit();
    });
    this.unlisteners.push(unlistenExit);
  }

  unsubscribe(): void {
    this.unlisteners.forEach((unlisten) => unlisten());
    this.unlisteners = [];
  }

  async emitEvent(event: string, payload?: unknown): Promise<void> {
    await emit(event, payload);
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
let bridgeInstance: TauriBridge | null = null;

export function getTauriBridge(): TauriBridge {
  if (!bridgeInstance) {
    bridgeInstance = new TauriBridge();
  }
  return bridgeInstance;
}
