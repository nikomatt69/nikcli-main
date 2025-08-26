import { IPCMessageReader, IPCMessageWriter } from 'vscode-jsonrpc/node';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
import { LSPServerHandle, LSPServerInfo } from './lsp-servers';
import { detectLanguageFromExtension } from './language-detection';
import { resolve, relative } from 'path';
import { readFileSync } from 'fs';
import chalk from 'chalk';

export interface LSPDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: number; // 1=Error, 2=Warning, 3=Information, 4=Hint
  message: string;
  source?: string;
  code?: string | number;
}

export interface LSPSymbol {
  name: string;
  kind: number;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  containerName?: string;
}

export interface LSPHoverInfo {
  contents: any;
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface LSPCompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
}

export class LSPClient {
  private connection: any;
  private server: LSPServerHandle;
  private serverInfo: LSPServerInfo;
  private workspaceRoot: string;
  private openFiles: Map<string, number> = new Map(); // file -> version
  private diagnostics: Map<string, LSPDiagnostic[]> = new Map();
  private isInitialized = false;

  constructor(server: LSPServerHandle, serverInfo: LSPServerInfo, workspaceRoot: string) {
    this.server = server;
    this.serverInfo = serverInfo;
    this.workspaceRoot = workspaceRoot;

    // Create JSON-RPC connection
    this.connection = createMessageConnection(
      new StreamMessageReader(server.process.stdout!),
      new StreamMessageWriter(server.process.stdin!)
    );

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle diagnostics
    this.connection.onNotification('textDocument/publishDiagnostics', (params: any) => {
      const uri = params.uri;
      const filePath = this.uriToPath(uri);

      console.log(chalk.blue(`📊 Diagnostics for: ${relative(this.workspaceRoot, filePath)}`));

      this.diagnostics.set(filePath, params.diagnostics);

      // Log diagnostics for immediate feedback
      if (params.diagnostics.length > 0) {
        params.diagnostics.forEach((diag: LSPDiagnostic) => {
          const severity = diag.severity === 1 ? chalk.red('ERROR') :
            diag.severity === 2 ? chalk.yellow('WARNING') :
              diag.severity === 3 ? chalk.blue('INFO') : chalk.gray('HINT');

          console.log(`  ${severity} [${diag.range.start.line + 1}:${diag.range.start.character + 1}] ${diag.message}`);
        });
      }
    });

    // Handle server requests
    this.connection.onRequest('window/showMessage', (params: any) => {
      console.log(`${this.serverInfo.name}: ${params.message}`);
    });

    this.connection.onRequest('window/showMessageRequest', (params: any) => {
      console.log(`${this.serverInfo.name}: ${params.message}`);
      return null; // Auto-dismiss
    });

    this.connection.onRequest('workspace/configuration', () => {
      return [{}]; // Return empty configuration
    });

    // Handle progress notifications
    this.connection.onNotification('$/progress', (params: any) => {
      if (params.value?.kind === 'begin') {
        console.log(chalk.blue(`🔄 ${this.serverInfo.name}: ${params.value.title || params.value.message || 'Working...'}`));
      }
    });

    // Start listening
    this.connection.listen();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log(chalk.blue(`🚀 Initializing ${this.serverInfo.name}...`));

      const initResult = await this.connection.sendRequest('initialize', {
        processId: process.pid,
        rootPath: this.workspaceRoot,
        rootUri: this.pathToUri(this.workspaceRoot),
        capabilities: {
          workspace: {
            applyEdit: true,
            workspaceEdit: { documentChanges: true },
            didChangeConfiguration: { dynamicRegistration: true },
            didChangeWatchedFiles: { dynamicRegistration: true },
            symbol: { dynamicRegistration: true },
            executeCommand: { dynamicRegistration: true },
          },
          textDocument: {
            publishDiagnostics: {
              relatedInformation: true,
              versionSupport: false,
              tagSupport: { valueSet: [1, 2] } // 1: Unnecessary, 2: Deprecated
            },
            synchronization: {
              dynamicRegistration: true,
              willSave: true,
              willSaveWaitUntil: true,
              didSave: true
            },
            completion: {
              dynamicRegistration: true,
              contextSupport: true,
              completionItem: {
                snippetSupport: true,
                commitCharactersSupport: true,
                documentationFormat: ['markdown', 'plaintext'],
                deprecatedSupport: true,
                preselectSupport: true,
              }
            },
            hover: {
              dynamicRegistration: true,
              contentFormat: ['markdown', 'plaintext']
            },
            signatureHelp: { dynamicRegistration: true },
            references: { dynamicRegistration: true },
            documentHighlight: { dynamicRegistration: true },
            documentSymbol: { dynamicRegistration: true },
            formatting: { dynamicRegistration: true },
            rangeFormatting: { dynamicRegistration: true },
            onTypeFormatting: { dynamicRegistration: true },
            definition: { dynamicRegistration: true },
            typeDefinition: { dynamicRegistration: true },
            implementation: { dynamicRegistration: true },
            codeAction: { dynamicRegistration: true },
            codeLens: { dynamicRegistration: true },
            documentLink: { dynamicRegistration: true },
            rename: { dynamicRegistration: true },
          }
        },
        initializationOptions: this.server.initialization,
        workspaceFolders: [{
          uri: this.pathToUri(this.workspaceRoot),
          name: 'workspace'
        }]
      });

      await this.connection.sendNotification('initialized', {});

      this.isInitialized = true;
      console.log(chalk.green(`✅ ${this.serverInfo.name} initialized`));

    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to initialize ${this.serverInfo.name}: ${error.message}`));
      throw error;
    }
  }

  async openFile(filePath: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const absolutePath = resolve(filePath);
    const uri = this.pathToUri(absolutePath);

    try {
      const content = readFileSync(absolutePath, 'utf-8');
      const languageId = detectLanguageFromExtension(absolutePath);

      // Close if already open
      if (this.openFiles.has(absolutePath)) {
        await this.connection.sendNotification('textDocument/didClose', {
          textDocument: { uri }
        });
      }

      // Open file
      await this.connection.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: content
        }
      });

      this.openFiles.set(absolutePath, 1);
      console.log(chalk.blue(`📖 Opened: ${relative(this.workspaceRoot, absolutePath)}`));

    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to open file ${filePath}: ${error.message}`));
      throw error;
    }
  }

  async getHover(filePath: string, line: number, character: number): Promise<LSPHoverInfo | null> {
    const uri = this.pathToUri(resolve(filePath));

    try {
      const result = await this.connection.sendRequest('textDocument/hover', {
        textDocument: { uri },
        position: { line, character }
      });

      return result || null;
    } catch (error) {
      return null;
    }
  }

  async getCompletion(filePath: string, line: number, character: number): Promise<LSPCompletionItem[]> {
    const uri = this.pathToUri(resolve(filePath));

    try {
      const result = await this.connection.sendRequest('textDocument/completion', {
        textDocument: { uri },
        position: { line, character },
        context: { triggerKind: 1 } // Invoked
      });

      return result?.items || result || [];
    } catch (error) {
      return [];
    }
  }

  async getWorkspaceSymbols(query: string): Promise<LSPSymbol[]> {
    try {
      const result = await this.connection.sendRequest('workspace/symbol', { query });
      return result || [];
    } catch (error) {
      return [];
    }
  }

  async getDocumentSymbols(filePath: string): Promise<LSPSymbol[]> {
    const uri = this.pathToUri(resolve(filePath));

    try {
      const result = await this.connection.sendRequest('textDocument/documentSymbol', {
        textDocument: { uri }
      });

      return result || [];
    } catch (error) {
      return [];
    }
  }

  async getDefinition(filePath: string, line: number, character: number): Promise<any> {
    const uri = this.pathToUri(resolve(filePath));

    try {
      const result = await this.connection.sendRequest('textDocument/definition', {
        textDocument: { uri },
        position: { line, character }
      });

      return result;
    } catch (error) {
      return null;
    }
  }

  async getReferences(filePath: string, line: number, character: number): Promise<any[]> {
    const uri = this.pathToUri(resolve(filePath));

    try {
      const result = await this.connection.sendRequest('textDocument/references', {
        textDocument: { uri },
        position: { line, character },
        context: { includeDeclaration: true }
      });

      return result || [];
    } catch (error) {
      return [];
    }
  }

  getDiagnostics(filePath?: string): Map<string, LSPDiagnostic[]> | LSPDiagnostic[] {
    if (filePath) {
      const absolutePath = resolve(filePath);
      return this.diagnostics.get(absolutePath) || [];
    }
    return this.diagnostics;
  }

  async waitForDiagnostics(filePath: string, timeoutMs: number = 3000): Promise<LSPDiagnostic[]> {
    return new Promise((resolvePromise) => {
      const absolutePath = resolve(filePath);
      const checkDiagnostics = () => {
        const diagnostics = this.diagnostics.get(absolutePath);
        if (diagnostics !== undefined) {
          resolvePromise(diagnostics);
        } else {
          setTimeout(checkDiagnostics, 100);
        }
      };

      setTimeout(() => resolvePromise([]), timeoutMs);
      checkDiagnostics();
    });
  }

  getServerInfo(): LSPServerInfo {
    return this.serverInfo;
  }

  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  isFileOpen(filePath: string): boolean {
    return this.openFiles.has(resolve(filePath));
  }

  getOpenFiles(): string[] {
    return Array.from(this.openFiles.keys());
  }

  async closeFile(filePath: string): Promise<void> {
    const absolutePath = resolve(filePath);

    if (this.openFiles.has(absolutePath)) {
      const uri = this.pathToUri(absolutePath);
      await this.connection.sendNotification('textDocument/didClose', {
        textDocument: { uri }
      });

      this.openFiles.delete(absolutePath);
      this.diagnostics.delete(absolutePath);
    }
  }

  async shutdown(): Promise<void> {
    try {
      if (this.isInitialized) {
        await this.connection.sendRequest('shutdown', null);
        await this.connection.sendNotification('exit', null);
      }

      // Close all files
      for (const filePath of this.openFiles.keys()) {
        await this.closeFile(filePath);
      }

      // Terminate server process
      this.server.process.kill();
      this.connection.end();

      console.log(chalk.green(`🛑 ${this.serverInfo.name} shutdown`));
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Error during shutdown: ${error.message}`));
    }
  }

  private pathToUri(path: string): string {
    return `file://${path}`;
  }

  private uriToPath(uri: string): string {
    return uri.replace('file://', '');
  }

  // Static method to create and initialize LSP client
  static async create(server: LSPServerHandle, serverInfo: LSPServerInfo, workspaceRoot: string): Promise<LSPClient> {
    const client = new LSPClient(server, serverInfo, workspaceRoot);
    await client.initialize();
    return client;
  }
}

// Helper to pretty-print diagnostics
export function formatDiagnostic(diagnostic: LSPDiagnostic): string {
  const severityMap = {
    1: chalk.red('ERROR'),
    2: chalk.yellow('WARNING'),
    3: chalk.blue('INFO'),
    4: chalk.gray('HINT')
  };

  const severity = severityMap[diagnostic.severity as keyof typeof severityMap] || 'UNKNOWN';
  const line = diagnostic.range.start.line + 1;
  const col = diagnostic.range.start.character + 1;

  return `${severity} [${line}:${col}] ${diagnostic.message}`;
}

// Helper to get symbol kind name
export function getSymbolKindName(kind: number): string {
  const symbolKindMap: Record<number, string> = {
    1: 'File',
    2: 'Module',
    3: 'Namespace',
    4: 'Package',
    5: 'Class',
    6: 'Method',
    7: 'Property',
    8: 'Field',
    9: 'Constructor',
    10: 'Enum',
    11: 'Interface',
    12: 'Function',
    13: 'Variable',
    14: 'Constant',
    15: 'String',
    16: 'Number',
    17: 'Boolean',
    18: 'Array',
    19: 'Object',
    20: 'Key',
    21: 'Null',
    22: 'EnumMember',
    23: 'Struct',
    24: 'Event',
    25: 'Operator',
    26: 'TypeParameter'
  };

  return symbolKindMap[kind] || 'Unknown';
}
