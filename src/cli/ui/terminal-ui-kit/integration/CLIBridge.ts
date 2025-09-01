/**
 * CLI Bridge - Ponte tra il sistema CLI esistente e il nuovo Terminal UI Kit
 * Fornisce compatibilità bidirezionale e migrazione graduale
 */

import { EventEmitter } from 'events';
import { TerminalUIManager } from '../TerminalUIManager';
import { StreamData, StatusIndicator, BackgroundAgentInfo, TodoItem, FileInfo, DiffInfo, ChatMessage, ApprovalRequest } from '../types';

export class CLIBridge extends EventEmitter {
  private uiManager: TerminalUIManager;
  private cliInstance: any;
  private isInkMode: boolean = false;
  private fallbackToConsole: boolean = true;

  constructor(cliInstance: any) {
    super();
    this.cliInstance = cliInstance;
    this.uiManager = new TerminalUIManager(cliInstance);
    this.setupBridgeEvents();
  }

  /**
   * Configura il bridge tra CLI e UI Kit
   */
  private setupBridgeEvents(): void {
    // Forward eventi dal CLI al UI Manager
    if (this.cliInstance.on) {
      // Agent events
      this.cliInstance.on('task_start', (task: any) => {
        this.uiManager.addStreamData({
          type: 'info',
          content: `🤖 ${task.agentType}: ${task.task}`,
          source: 'agent',
        });
      });

      this.cliInstance.on('task_progress', (task: any, update: any) => {
        this.uiManager.addStreamData({
          type: 'progress',
          content: `📊 ${update.description || 'Progress'}: ${update.progress || 0}%`,
          source: 'agent',
        });
      });

      this.cliInstance.on('task_complete', (task: any) => {
        this.uiManager.addStreamData({
          type: 'log',
          content: `✅ ${task.agentType} completed`,
          source: 'agent',
        });
      });

      // File events
      this.cliInstance.on('file_read', (data: any) => {
        if (data.path && data.content) {
          this.uiManager.setCurrentFile({
            path: data.path,
            content: data.content,
            language: this.detectLanguage(data.path),
            size: data.content.length,
            modified: new Date(),
          });
        }
      });

      this.cliInstance.on('file_written', (data: any) => {
        if (data.path) {
          if (data.originalContent && data.content) {
            this.uiManager.updateDiff({
              filePath: data.path,
              oldContent: data.originalContent,
              newContent: data.content,
              language: this.detectLanguage(data.path),
            });
          }
          
          this.uiManager.addStreamData({
            type: 'log',
            content: `✏️ File ${data.originalContent ? 'updated' : 'created'}: ${data.path}`,
            source: 'file',
          });
        }
      });

      this.cliInstance.on('file_list', (data: any) => {
        if (data.files && Array.isArray(data.files)) {
          const fileInfos: FileInfo[] = data.files.map((path: string) => ({
            path,
            language: this.detectLanguage(path),
          }));
          this.uiManager.updateFiles(fileInfos);
        }
      });
    }

    // Forward eventi dal UI Manager al CLI
    this.uiManager.on('command:execute', (command: string) => {
      this.executeCommand(command);
    });

    this.uiManager.on('input:submit', (input: string) => {
      this.handleInput(input);
    });
  }

  /**
   * Abilita modalità Ink
   */
  async enableInkMode(mode: string = 'default'): Promise<void> {
    if (this.isInkMode) return;

    try {
      await this.uiManager.start(mode);
      this.isInkMode = true;
      
      // Disabilita output console dell'advanced-cli-ui
      if (this.cliInstance.advancedUI) {
        this.cliInstance.advancedUI.stopInteractiveMode();
      }

      console.log('🎨 Switched to Ink Terminal UI');
    } catch (error) {
      console.error('Failed to enable Ink mode:', error);
      this.fallbackToConsole = true;
    }
  }

  /**
   * Disabilita modalità Ink e torna alla console
   */
  async disableInkMode(): Promise<void> {
    if (!this.isInkMode) return;

    try {
      await this.uiManager.stop();
      this.isInkMode = false;

      // Riabilita advanced-cli-ui se disponibile
      if (this.cliInstance.advancedUI) {
        this.cliInstance.advancedUI.startInteractiveMode();
      }

      console.log('📺 Switched back to console UI');
    } catch (error) {
      console.error('Failed to disable Ink mode:', error);
    }
  }

  /**
   * Toggle tra modalità Ink e console
   */
  async toggleUIMode(): Promise<void> {
    if (this.isInkMode) {
      await this.disableInkMode();
    } else {
      await this.enableInkMode();
    }
  }

  /**
   * Esegue un comando attraverso il CLI
   */
  private async executeCommand(command: string): Promise<void> {
    try {
      if (this.cliInstance.dispatchSlash) {
        await this.cliInstance.dispatchSlash(command);
      } else if (this.cliInstance.slashHandler) {
        await this.cliInstance.slashHandler.handle(command);
      }
    } catch (error: any) {
      this.uiManager.addStreamData({
        type: 'error',
        content: `❌ Command failed: ${error.message}`,
        source: 'bridge',
      });
    }
  }

  /**
   * Gestisce input dell'utente
   */
  private async handleInput(input: string): Promise<void> {
    try {
      if (this.cliInstance.handleChatInput) {
        await this.cliInstance.handleChatInput(input);
      }
    } catch (error: any) {
      this.uiManager.addStreamData({
        type: 'error',
        content: `❌ Input handling failed: ${error.message}`,
        source: 'bridge',
      });
    }
  }

  /**
   * Mostra pannello di comando specifico
   */
  async showCommandPanel(commandName: string, args: string[] = []): Promise<any> {
    if (!this.isInkMode) {
      await this.enableInkMode();
    }

    return this.uiManager.showCommandPanel(commandName, args);
  }

  /**
   * Metodi di compatibilità con advanced-cli-ui
   */
  
  logInfo(message: string, details?: string): void {
    if (this.isInkMode) {
      this.uiManager.logInfo(message, details);
    } else if (this.cliInstance.advancedUI) {
      this.cliInstance.advancedUI.logInfo(message, details);
    } else {
      console.log(`ℹ️ ${message}${details ? ` - ${details}` : ''}`);
    }
  }

  logSuccess(message: string, details?: string): void {
    if (this.isInkMode) {
      this.uiManager.logSuccess(message, details);
    } else if (this.cliInstance.advancedUI) {
      this.cliInstance.advancedUI.logSuccess(message, details);
    } else {
      console.log(`✅ ${message}${details ? ` - ${details}` : ''}`);
    }
  }

  logWarning(message: string, details?: string): void {
    if (this.isInkMode) {
      this.uiManager.logWarning(message, details);
    } else if (this.cliInstance.advancedUI) {
      this.cliInstance.advancedUI.logWarning(message, details);
    } else {
      console.log(`⚠️ ${message}${details ? ` - ${details}` : ''}`);
    }
  }

  logError(message: string, details?: string): void {
    if (this.isInkMode) {
      this.uiManager.logError(message, details);
    } else if (this.cliInstance.advancedUI) {
      this.cliInstance.advancedUI.logError(message, details);
    } else {
      console.log(`❌ ${message}${details ? ` - ${details}` : ''}`);
    }
  }

  showFileContent(filePath: string, content: string): void {
    if (this.isInkMode) {
      this.uiManager.showFileContent(filePath, content);
    } else if (this.cliInstance.advancedUI) {
      this.cliInstance.advancedUI.showFileContent(filePath, content);
    }
  }

  showFileDiff(filePath: string, oldContent: string, newContent: string): void {
    if (this.isInkMode) {
      this.uiManager.showFileDiff(filePath, oldContent, newContent);
    } else if (this.cliInstance.advancedUI) {
      this.cliInstance.advancedUI.showFileDiff(filePath, oldContent, newContent);
    }
  }

  showFileList(files: string[], title?: string): void {
    if (this.isInkMode) {
      this.uiManager.showFileList(files, title);
    } else if (this.cliInstance.advancedUI) {
      this.cliInstance.advancedUI.showFileList(files, title);
    }
  }

  /**
   * Utility methods
   */
  
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

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    await this.uiManager.stop();
    this.removeAllListeners();
  }
}

// Singleton per integrazione globale
export const cliBridge = new CLIBridge((global as any).__nikCLI);