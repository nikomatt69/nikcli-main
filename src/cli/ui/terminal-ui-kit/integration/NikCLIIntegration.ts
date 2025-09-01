/**
 * NikCLI Integration - Integrazione completa del Terminal UI Kit con NikCLI
 * Modifica il comportamento del CLI per utilizzare i componenti Ink quando appropriato
 */

import { CLIBridge } from './CLIBridge';
import { CommandRouter } from './CommandRouter';
import { TerminalUIManager } from '../TerminalUIManager';

export class NikCLIIntegration {
  private cliBridge: CLIBridge;
  private commandRouter: CommandRouter;
  private uiManager: TerminalUIManager;
  private originalMethods: Map<string, any> = new Map();

  constructor(cliInstance: any) {
    this.cliBridge = new CLIBridge(cliInstance);
    this.commandRouter = new CommandRouter();
    this.uiManager = new TerminalUIManager(cliInstance);
    
    this.setupIntegration(cliInstance);
  }

  /**
   * Configura l'integrazione con NikCLI
   */
  private setupIntegration(cliInstance: any): void {
    // Salva metodi originali
    this.saveOriginalMethods(cliInstance);
    
    // Patch metodi del CLI per utilizzare UI Kit
    this.patchCLIMethods(cliInstance);
    
    // Setup event forwarding
    this.setupEventForwarding(cliInstance);
  }

  /**
   * Salva i metodi originali per fallback
   */
  private saveOriginalMethods(cliInstance: any): void {
    const methodsToSave = [
      'dispatchSlash',
      'handleChatInput',
      'showPrompt',
      'renderPromptAfterOutput',
      'startEnhancedChat',
    ];

    methodsToSave.forEach(method => {
      if (cliInstance[method]) {
        this.originalMethods.set(method, cliInstance[method].bind(cliInstance));
      }
    });

    // Salva anche metodi dell'advanced UI
    if (cliInstance.advancedUI) {
      const uiMethodsToSave = [
        'logInfo',
        'logSuccess',
        'logWarning',
        'logError',
        'showFileContent',
        'showFileDiff',
        'showFileList',
        'startInteractiveMode',
        'stopInteractiveMode',
      ];

      uiMethodsToSave.forEach(method => {
        if (cliInstance.advancedUI[method]) {
          this.originalMethods.set(`advancedUI.${method}`, cliInstance.advancedUI[method].bind(cliInstance.advancedUI));
        }
      });
    }
  }

  /**
   * Patch dei metodi CLI per utilizzare UI Kit
   */
  private patchCLIMethods(cliInstance: any): void {
    // Patch dispatchSlash per utilizzare componenti UI
    const originalDispatchSlash = this.originalMethods.get('dispatchSlash');
    if (originalDispatchSlash) {
      cliInstance.dispatchSlash = async (input: string) => {
        const command = input.slice(1).split(' ')[0];
        const args = input.slice(1).split(' ').slice(1);

        // Verifica se dovrebbe usare UI component
        if (this.shouldUseUIComponent(command, cliInstance.structuredUIEnabled)) {
          try {
            return await this.cliBridge.showCommandPanel(command, args);
          } catch (error) {
            console.error(`UI Component failed for /${command}, falling back to console:`, error);
            return await originalDispatchSlash(input);
          }
        } else {
          return await originalDispatchSlash(input);
        }
      };
    }

    // Patch advanced UI methods per utilizzare bridge
    if (cliInstance.advancedUI) {
      // Log methods
      cliInstance.advancedUI.logInfo = (message: string, details?: string) => {
        this.cliBridge.logInfo(message, details);
      };

      cliInstance.advancedUI.logSuccess = (message: string, details?: string) => {
        this.cliBridge.logSuccess(message, details);
      };

      cliInstance.advancedUI.logWarning = (message: string, details?: string) => {
        this.cliBridge.logWarning(message, details);
      };

      cliInstance.advancedUI.logError = (message: string, details?: string) => {
        this.cliBridge.logError(message, details);
      };

      // File display methods
      cliInstance.advancedUI.showFileContent = (filePath: string, content: string) => {
        this.cliBridge.showFileContent(filePath, content);
      };

      cliInstance.advancedUI.showFileDiff = (filePath: string, oldContent: string, newContent: string) => {
        this.cliBridge.showFileDiff(filePath, oldContent, newContent);
      };

      cliInstance.advancedUI.showFileList = (files: string[], title?: string) => {
        this.cliBridge.showFileList(files, title);
      };

      // Interactive mode methods
      cliInstance.advancedUI.startInteractiveMode = () => {
        this.cliBridge.enableInkMode();
      };

      cliInstance.advancedUI.stopInteractiveMode = () => {
        this.cliBridge.disableInkMode();
      };
    }

    // Aggiungi nuovo metodo per toggle UI
    cliInstance.toggleTerminalUI = async () => {
      await this.cliBridge.toggleUIMode();
    };

    // Aggiungi metodo per abilitare UI Kit
    cliInstance.enableTerminalUIKit = async (mode: string = 'default') => {
      await this.cliBridge.enableInkMode(mode);
    };

    // Aggiungi metodo per disabilitare UI Kit
    cliInstance.disableTerminalUIKit = async () => {
      await this.cliBridge.disableInkMode();
    };
  }

  /**
   * Setup event forwarding tra CLI e UI
   */
  private setupEventForwarding(cliInstance: any): void {
    // Forward eventi dal CLI bridge al CLI instance
    this.cliBridge.on('command:execute', (command: string) => {
      cliInstance.emit?.('ui:command', command);
    });

    this.cliBridge.on('ui:started', (data: any) => {
      cliInstance.emit?.('ui:started', data);
    });

    this.cliBridge.on('ui:stopped', () => {
      cliInstance.emit?.('ui:stopped');
    });

    // Setup bidirectional communication
    if (cliInstance.on) {
      cliInstance.on('ui:toggle', () => {
        this.cliBridge.toggleUIMode();
      });

      cliInstance.on('ui:enable', (mode: string) => {
        this.cliBridge.enableInkMode(mode);
      });

      cliInstance.on('ui:disable', () => {
        this.cliBridge.disableInkMode();
      });
    }
  }

  /**
   * Determina se utilizzare UI component per un comando
   */
  private shouldUseUIComponent(command: string, structuredUIEnabled: boolean): boolean {
    return this.commandRouter.shouldUseUIComponent(command, structuredUIEnabled);
  }

  /**
   * Ripristina metodi originali
   */
  restore(): void {
    const cliInstance = (global as any).__nikCLI;
    if (!cliInstance) return;

    // Ripristina metodi originali
    for (const [methodName, originalMethod] of this.originalMethods.entries()) {
      if (methodName.includes('.')) {
        const [object, method] = methodName.split('.');
        if (cliInstance[object] && cliInstance[object][method]) {
          cliInstance[object][method] = originalMethod;
        }
      } else {
        if (cliInstance[methodName]) {
          cliInstance[methodName] = originalMethod;
        }
      }
    }

    // Cleanup
    this.cliBridge.destroy();
  }

  /**
   * Ottieni statistiche di utilizzo UI
   */
  getUIStats(): any {
    return {
      isActive: this.uiManager.isUIActive(),
      commandsWithUI: this.commandRouter.listCommands().length,
      commandsByCategory: Object.keys(this.commandRouter.listCommandsByCategory()),
    };
  }

  /**
   * Metodi di accesso pubblico
   */
  
  getCommandRouter(): CommandRouter {
    return this.commandRouter;
  }

  getCLIBridge(): CLIBridge {
    return this.cliBridge;
  }

  getUIManager(): TerminalUIManager {
    return this.uiManager;
  }
}

/**
 * Funzione di inizializzazione per NikCLI
 */
export function initializeTerminalUIKit(cliInstance: any): NikCLIIntegration {
  const integration = new NikCLIIntegration(cliInstance);
  
  // Salva l'integrazione globalmente per accesso facile
  (global as any).__terminalUIKit = integration;
  
  console.log('🎨 Terminal UI Kit integration initialized');
  
  return integration;
}

/**
 * Ottieni l'integrazione globale
 */
export function getTerminalUIKit(): NikCLIIntegration | null {
  return (global as any).__terminalUIKit || null;
}