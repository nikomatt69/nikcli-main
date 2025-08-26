import { LSPClient, LSPDiagnostic, LSPSymbol, formatDiagnostic } from './lsp-client';
import { LSP_SERVERS, LSPServerInfo, getApplicableLSPServers, findLSPWorkspaceRoot, ensureLSPDependencies } from './lsp-servers';
import { detectLanguageFromExtension, detectLanguageFromContent } from './language-detection';
import { resolve, dirname, relative } from 'path';
import { readFileSync, existsSync } from 'fs';
import chalk from 'chalk';

export interface CodeContext {
  file: string;
  language: string;
  symbols: LSPSymbol[];
  diagnostics: LSPDiagnostic[];
  hover?: any;
  definitions?: any[];
  references?: any[];
  workspaceRoot: string;
}

export interface WorkspaceInsight {
  totalFiles: number;
  languages: string[];
  frameworks: string[];
  diagnostics: {
    errors: number;
    warnings: number;
    hints: number;
  };
  symbols: {
    functions: number;
    classes: number;
    interfaces: number;
    variables: number;
  };
  problems: string[];
  suggestions: string[];
}

export class LSPManager {
  private clients: Map<string, LSPClient> = new Map(); // workspaceRoot+serverId -> client
  private workspaceRoots: Set<string> = new Set();
  private fileAnalysisCache: Map<string, CodeContext> = new Map();

  constructor() {
    // Cleanup on process exit
    process.on('beforeExit', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  // Get or create LSP clients for a file
  async getClientsForFile(filePath: string): Promise<LSPClient[]> {
    const absolutePath = resolve(filePath);
    const applicableServers = getApplicableLSPServers(absolutePath);
    const clients: LSPClient[] = [];

    for (const serverInfo of applicableServers) {
      const workspaceRoot = findLSPWorkspaceRoot(absolutePath, serverInfo) || dirname(absolutePath);
      const clientKey = `${workspaceRoot}:${serverInfo.id}`;

      let client = this.clients.get(clientKey);

      if (!client) {
        try {
          console.log(chalk.blue(`🔌 Starting ${serverInfo.name} for ${relative(workspaceRoot, absolutePath)}...`));

          const serverHandle = await serverInfo.spawn(workspaceRoot);
          if (!serverHandle) {
            console.log(chalk.yellow(`⚠️ Could not start ${serverInfo.name}`));
            continue;
          }

          client = await LSPClient.create(serverHandle, serverInfo, workspaceRoot);
          this.clients.set(clientKey, client);
          this.workspaceRoots.add(workspaceRoot);

        } catch (error: any) {
          console.log(chalk.red(`❌ Failed to start ${serverInfo.name}: ${error.message}`));
          continue;
        }
      }

      clients.push(client);
    }

    return clients;
  }

  // Analyze a file with full LSP context (atomic state updates)
  async analyzeFile(filePath: string): Promise<CodeContext> {
    const absolutePath = resolve(filePath);

    // Atomic cache check and set
    const cached = this.fileAnalysisCache.get(absolutePath);
    if (cached) {
      return cached;
    }

    if (!existsSync(absolutePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(absolutePath, 'utf-8');
    const language = detectLanguageFromContent(content, absolutePath);
    const clients = await this.getClientsForFile(absolutePath);

    // Atomic context creation
    const context: CodeContext = {
      file: absolutePath,
      language,
      symbols: [],
      diagnostics: [],
      workspaceRoot: dirname(absolutePath)
    };

    // Get data from all applicable LSP clients
    for (const client of clients) {
      try {
        // Open file if not already open
        if (!client.isFileOpen(absolutePath)) {
          await client.openFile(absolutePath);
        }

        // Wait a moment for diagnostics to arrive
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Collect diagnostics
        const diagnostics = client.getDiagnostics(absolutePath) as LSPDiagnostic[];
        context.diagnostics.push(...diagnostics);

        // Get document symbols
        const symbols = await client.getDocumentSymbols(absolutePath);
        context.symbols.push(...symbols);

        // Update workspace root to the LSP client's root
        context.workspaceRoot = client.getWorkspaceRoot();

      } catch (error: any) {
        console.log(chalk.yellow(`⚠️ Error analyzing with ${client.getServerInfo().name}: ${error.message}`));
      }
    }

    // Atomic cache update
    this.fileAnalysisCache.set(absolutePath, context);

    console.log(chalk.green(`✅ Analyzed ${relative(context.workspaceRoot, absolutePath)}: ${context.symbols.length} symbols, ${context.diagnostics.length} diagnostics`));

    return context;
  }

  // Get workspace-wide insights (atomic state management)
  async getWorkspaceInsights(workspaceRoot: string): Promise<WorkspaceInsight> {
    // Atomic insight object creation
    const insights: WorkspaceInsight = {
      totalFiles: 0,
      languages: [],
      frameworks: [],
      diagnostics: { errors: 0, warnings: 0, hints: 0 },
      symbols: { functions: 0, classes: 0, interfaces: 0, variables: 0 },
      problems: [],
      suggestions: []
    };

    const languageSet = new Set<string>();
    const frameworkSet = new Set<string>();

    // Atomic data collection from all clients in this workspace
    for (const [key, client] of this.clients) {
      if (!key.startsWith(workspaceRoot)) continue;

      // Get all diagnostics
      const allDiagnostics = client.getDiagnostics() as Map<string, LSPDiagnostic[]>;

      for (const [filePath, diagnostics] of allDiagnostics) {
        insights.totalFiles++;

        // Detect language
        const language = detectLanguageFromExtension(filePath);
        if (language !== 'plaintext') {
          languageSet.add(language);
        }

        // Count diagnostics by severity
        diagnostics.forEach(diag => {
          switch (diag.severity) {
            case 1: insights.diagnostics.errors++; break;
            case 2: insights.diagnostics.warnings++; break;
            case 3:
            case 4: insights.diagnostics.hints++; break;
          }
        });

        // Get symbols
        try {
          const symbols = await client.getDocumentSymbols(filePath);
          symbols.forEach(symbol => {
            switch (symbol.kind) {
              case 12: insights.symbols.functions++; break;
              case 5: insights.symbols.classes++; break;
              case 11: insights.symbols.interfaces++; break;
              case 13:
              case 14: insights.symbols.variables++; break;
            }
          });
        } catch (error) {
          // Skip if can't get symbols
        }
      }
    }

    insights.languages = Array.from(languageSet);
    insights.frameworks = Array.from(frameworkSet);

    // Generate problems and suggestions
    if (insights.diagnostics.errors > 0) {
      insights.problems.push(`${insights.diagnostics.errors} compilation errors need fixing`);
    }

    if (insights.diagnostics.warnings > 10) {
      insights.problems.push(`${insights.diagnostics.warnings} warnings should be addressed`);
    }

    if (insights.languages.includes('typescript') && insights.diagnostics.errors > 0) {
      insights.suggestions.push('Run `tsc --noEmit` to check TypeScript compilation');
    }

    if (insights.languages.includes('javascript') && insights.symbols.functions > insights.symbols.classes * 5) {
      insights.suggestions.push('Consider organizing functions into classes or modules');
    }

    return insights;
  }

  // Search symbols across workspace
  async searchSymbols(query: string, workspaceRoot?: string): Promise<LSPSymbol[]> {
    const allSymbols: LSPSymbol[] = [];

    for (const [key, client] of this.clients) {
      if (workspaceRoot && !key.startsWith(workspaceRoot)) continue;

      try {
        const symbols = await client.getWorkspaceSymbols(query);
        allSymbols.push(...symbols);
      } catch (error) {
        // Skip failed searches
      }
    }

    return allSymbols;
  }

  // Get hover information
  async getHoverInfo(filePath: string, line: number, character: number): Promise<any> {
    const clients = await this.getClientsForFile(filePath);

    for (const client of clients) {
      try {
        if (!client.isFileOpen(filePath)) {
          await client.openFile(filePath);
        }

        const hover = await client.getHover(filePath, line, character);
        if (hover) return hover;
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  // Get completions
  async getCompletions(filePath: string, line: number, character: number): Promise<any[]> {
    const clients = await this.getClientsForFile(filePath);
    const allCompletions: any[] = [];

    for (const client of clients) {
      try {
        if (!client.isFileOpen(filePath)) {
          await client.openFile(filePath);
        }

        const completions = await client.getCompletion(filePath, line, character);
        allCompletions.push(...completions);
      } catch (error) {
        continue;
      }
    }

    return allCompletions;
  }

  // Ensure LSP dependencies are installed
  async ensureDependencies(languages: string[]): Promise<void> {
    const serverIds = languages
      .map(lang => {
        // Map languages to server IDs
        if (['javascript', 'typescript', 'typescriptreact', 'javascriptreact'].includes(lang)) return 'typescript';
        if (lang === 'python') return 'python';
        if (lang === 'rust') return 'rust';
        if (lang === 'go') return 'go';
        if (lang === 'ruby') return 'ruby';
        return null;
      })
      .filter(Boolean) as string[];

    await ensureLSPDependencies(serverIds);
  }

  // Get all diagnostics as formatted strings
  getAllDiagnostics(): string[] {
    const diagnostics: string[] = [];

    for (const client of this.clients.values()) {
      const clientDiagnostics = client.getDiagnostics() as Map<string, LSPDiagnostic[]>;

      for (const [filePath, fileDiagnostics] of clientDiagnostics) {
        const relativePath = relative(process.cwd(), filePath);
        fileDiagnostics.forEach(diag => {
          diagnostics.push(`${relativePath}: ${formatDiagnostic(diag)}`);
        });
      }
    }

    return diagnostics;
  }

  // Check if file has errors
  hasErrors(filePath: string): boolean {
    for (const client of this.clients.values()) {
      const diagnostics = client.getDiagnostics(filePath) as LSPDiagnostic[];
      if (diagnostics.some(d => d.severity === 1)) {
        return true;
      }
    }
    return false;
  }

  // Get error count for workspace
  getErrorCount(workspaceRoot?: string): number {
    let errorCount = 0;

    for (const [key, client] of this.clients) {
      if (workspaceRoot && !key.startsWith(workspaceRoot)) continue;

      const allDiagnostics = client.getDiagnostics() as Map<string, LSPDiagnostic[]>;
      for (const diagnostics of allDiagnostics.values()) {
        errorCount += diagnostics.filter(d => d.severity === 1).length;
      }
    }

    return errorCount;
  }

  // Clear analysis cache
  clearCache(): void {
    this.fileAnalysisCache.clear();
  }

  // Get active workspace roots
  getWorkspaceRoots(): string[] {
    return Array.from(this.workspaceRoots);
  }

  // Get status summary
  getStatus(): any {
    const status = {
      activeClients: this.clients.size,
      workspaceRoots: this.workspaceRoots.size,
      cachedAnalyses: this.fileAnalysisCache.size,
      totalErrors: this.getErrorCount(),
      servers: {} as Record<string, number>
    };

    for (const client of this.clients.values()) {
      const serverName = client.getServerInfo().name;
      status.servers[serverName] = (status.servers[serverName] || 0) + 1;
    }

    return status;
  }

  // Shutdown all clients
  async shutdown(): Promise<void> {
    console.log(chalk.blue('\n🛑 Shutting down LSP clients...'));

    const shutdownPromises = Array.from(this.clients.values()).map(client =>
      client.shutdown().catch(err =>
        console.log(chalk.yellow(`⚠️ Error shutting down client: ${err.message}`))
      )
    );

    await Promise.allSettled(shutdownPromises);

    this.clients.clear();
    this.workspaceRoots.clear();
    this.fileAnalysisCache.clear();

    console.log(chalk.green('✅ LSP shutdown complete'));
  }
}

// Global LSP manager instance
export const lspManager = new LSPManager();
