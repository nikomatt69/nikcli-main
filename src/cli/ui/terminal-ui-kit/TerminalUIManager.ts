/**
 * Terminal UI Manager - Integrazione tra Ink UI Kit e NikCLI esistente
 * Gestisce il rendering e la comunicazione tra i componenti React e il sistema CLI
 */

import React from 'react';
import { render } from 'ink';
import { EventEmitter } from 'events';
import App from './components/App';
import { TerminalState, StreamData, StatusIndicator, BackgroundAgentInfo, TodoItem, FileInfo, DiffInfo, ChatMessage, ApprovalRequest } from './types';

export class TerminalUIManager extends EventEmitter {
  private app: any = null;
  private isActive: boolean = false;
  private cliInstance: any;
  private currentState: TerminalState;

  constructor(cliInstance: any) {
    super();
    this.cliInstance = cliInstance;
    this.currentState = {
      currentMode: 'default',
      isProcessing: false,
      userInputActive: false,
      shouldInterrupt: false,
      structuredUIEnabled: true,
      cognitiveMode: true,
      orchestrationLevel: 8,
    };

    this.setupCLIIntegration();
  }

  /**
   * Avvia l'interfaccia Ink
   */
  async start(mode: string = 'default'): Promise<void> {
    if (this.isActive) {
      console.warn('Terminal UI is already active');
      return;
    }

    try {
      this.currentState.currentMode = mode as any;
      this.isActive = true;

      // Render dell'app Ink
      this.app = render(
        React.createElement(App, {
          initialMode: mode as any,
          cliInstance: this.cliInstance,
          onExit: () => this.stop(),
        })
      );

      console.log('🎨 Terminal UI Kit started with Ink');
      this.emit('ui:started', { mode });
    } catch (error: any) {
      console.error('Failed to start Terminal UI:', error.message);
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Ferma l'interfaccia Ink
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      if (this.app) {
        this.app.unmount();
        this.app = null;
      }

      this.isActive = false;
      console.log('🛑 Terminal UI Kit stopped');
      this.emit('ui:stopped');
    } catch (error: any) {
      console.error('Failed to stop Terminal UI:', error.message);
    }
  }

  /**
   * Configura l'integrazione con il CLI esistente
   */
  private setupCLIIntegration(): void {
    // Ascolta eventi dal CLI per aggiornare l'UI
    if (this.cliInstance.on) {
      // Mode changes
      this.cliInstance.on('mode:change', (mode: string) => {
        this.updateState({ currentMode: mode as any });
      });

      // Processing state
      this.cliInstance.on('processing:start', () => {
        this.updateState({ isProcessing: true });
      });

      this.cliInstance.on('processing:end', () => {
        this.updateState({ isProcessing: false });
      });

      // User input state
      this.cliInstance.on('input:active', () => {
        this.updateState({ userInputActive: true });
      });

      this.cliInstance.on('input:inactive', () => {
        this.updateState({ userInputActive: false });
      });

      // Stream data
      this.cliInstance.on('stream:data', (data: StreamData) => {
        this.emit('stream:data', data);
      });

      // Status indicators
      this.cliInstance.on('status:update', (indicators: StatusIndicator[]) => {
        this.emit('status:update', indicators);
      });

      // Background agents
      this.cliInstance.on('agents:update', (agents: BackgroundAgentInfo[]) => {
        this.emit('agents:update', agents);
      });

      // Todos
      this.cliInstance.on('todos:update', (todos: TodoItem[]) => {
        this.emit('todos:update', todos);
      });

      // Files
      this.cliInstance.on('files:update', (files: FileInfo[]) => {
        this.emit('files:update', files);
      });

      this.cliInstance.on('file:current', (file: FileInfo) => {
        this.emit('file:current', file);
      });

      // Diffs
      this.cliInstance.on('diff:update', (diff: DiffInfo) => {
        this.emit('diff:update', diff);
      });

      // Chat
      this.cliInstance.on('chat:update', (messages: ChatMessage[]) => {
        this.emit('chat:update', messages);
      });

      // Approvals
      this.cliInstance.on('approval:update', (approvals: ApprovalRequest[]) => {
        this.emit('approval:update', approvals);
      });

      // Plans
      this.cliInstance.on('plan:update', (plan: any) => {
        this.emit('plan:update', plan);
      });
    }
  }

  /**
   * Aggiorna lo stato interno
   */
  private updateState(updates: Partial<TerminalState>): void {
    this.currentState = { ...this.currentState, ...updates };
    this.emit('state:update', this.currentState);
  }

  /**
   * Invia stream data all'UI
   */
  addStreamData(data: Omit<StreamData, 'timestamp'>): void {
    const streamData: StreamData = {
      ...data,
      timestamp: new Date(),
    };
    this.emit('stream:data', streamData);
  }

  /**
   * Aggiorna status indicators
   */
  updateStatusIndicators(indicators: StatusIndicator[]): void {
    this.emit('status:update', indicators);
  }

  /**
   * Aggiorna background agents
   */
  updateBackgroundAgents(agents: BackgroundAgentInfo[]): void {
    this.emit('agents:update', agents);
  }

  /**
   * Aggiorna todos
   */
  updateTodos(todos: TodoItem[]): void {
    this.emit('todos:update', todos);
  }

  /**
   * Aggiorna file list
   */
  updateFiles(files: FileInfo[]): void {
    this.emit('files:update', files);
  }

  /**
   * Imposta file corrente
   */
  setCurrentFile(file: FileInfo): void {
    this.emit('file:current', file);
  }

  /**
   * Aggiorna diff
   */
  updateDiff(diff: DiffInfo): void {
    this.emit('diff:update', diff);
  }

  /**
   * Aggiorna chat messages
   */
  updateChat(messages: ChatMessage[]): void {
    this.emit('chat:update', messages);
  }

  /**
   * Aggiorna pending approvals
   */
  updateApprovals(approvals: ApprovalRequest[]): void {
    this.emit('approval:update', approvals);
  }

  /**
   * Aggiorna plan corrente
   */
  updatePlan(plan: any): void {
    this.emit('plan:update', plan);
  }

  /**
   * Mostra un pannello di comando specifico
   */
  async showCommandPanel(commandName: string, args: string[] = []): Promise<any> {
    if (!this.isActive) {
      await this.start();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Command panel timeout'));
      }, 30000);

      this.emit('command:show', {
        commandName,
        args,
        onComplete: (result: any) => {
          clearTimeout(timeout);
          resolve(result);
        },
        onError: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
    });
  }

  /**
   * Cambia modalità UI
   */
  setMode(mode: string): void {
    this.updateState({ currentMode: mode as any });
    this.emit('mode:change', mode);
  }

  /**
   * Abilita/disabilita UI strutturata
   */
  setStructuredUI(enabled: boolean): void {
    this.updateState({ structuredUIEnabled: enabled });
    this.emit('ui:structured', enabled);
  }

  /**
   * Imposta modalità cognitiva
   */
  setCognitiveMode(enabled: boolean): void {
    this.updateState({ cognitiveMode: enabled });
    this.emit('cognitive:mode', enabled);
  }

  /**
   * Ottieni stato corrente
   */
  getState(): TerminalState {
    return { ...this.currentState };
  }

  /**
   * Verifica se l'UI è attiva
   */
  isUIActive(): boolean {
    return this.isActive;
  }

  /**
   * Metodi di utilità per compatibilità con advanced-cli-ui
   */
  
  // Compatibilità con il sistema esistente
  startInteractiveMode(): void {
    if (!this.isActive) {
      this.start();
    }
  }

  stopInteractiveMode(): void {
    this.stop();
  }

  logInfo(message: string, details?: string): void {
    this.addStreamData({
      type: 'info',
      content: message,
      source: details,
    });
  }

  logSuccess(message: string, details?: string): void {
    this.addStreamData({
      type: 'log',
      content: `✅ ${message}`,
      source: details,
    });
  }

  logWarning(message: string, details?: string): void {
    this.addStreamData({
      type: 'warning',
      content: `⚠️ ${message}`,
      source: details,
    });
  }

  logError(message: string, details?: string): void {
    this.addStreamData({
      type: 'error',
      content: `❌ ${message}`,
      source: details,
    });
  }

  showFileContent(filePath: string, content: string): void {
    this.setCurrentFile({
      path: filePath,
      content,
      language: this.detectLanguage(filePath),
      size: content.length,
      modified: new Date(),
    });
  }

  showFileDiff(filePath: string, oldContent: string, newContent: string): void {
    this.updateDiff({
      filePath,
      oldContent,
      newContent,
      language: this.detectLanguage(filePath),
    });
  }

  showFileList(files: string[], title?: string): void {
    const fileInfos: FileInfo[] = files.map(path => ({
      path,
      language: this.detectLanguage(path),
    }));
    this.updateFiles(fileInfos);
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      'ts': 'typescript', 'tsx': 'typescript',
      'js': 'javascript', 'jsx': 'javascript',
      'py': 'python', 'java': 'java', 'go': 'go', 'rs': 'rust',
      'html': 'html', 'css': 'css', 'scss': 'scss',
      'json': 'json', 'yaml': 'yaml', 'yml': 'yaml',
      'md': 'markdown', 'sql': 'sql',
    };
    return languageMap[ext || ''] || 'text';
  }
}

// Singleton instance per compatibilità
export const terminalUIManager = new TerminalUIManager((global as any).__nikCLI);