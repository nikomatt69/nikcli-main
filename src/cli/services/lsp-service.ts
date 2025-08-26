import chalk from 'chalk';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface LSPServerInfo {
  name: string;
  command: string;
  args: string[];
  filetypes: string[];
  status: 'stopped' | 'starting' | 'running' | 'error';
  process?: ChildProcess;
}

export class LSPService {
  private servers: Map<string, LSPServerInfo> = new Map();
  private workingDirectory: string = process.cwd();

  constructor() {
    this.initializeDefaultServers();
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
  }

  private initializeDefaultServers(): void {
    // TypeScript/JavaScript LSP
    this.servers.set('typescript', {
      name: 'TypeScript Language Server',
      command: 'typescript-language-server',
      args: ['--stdio'],
      filetypes: ['.ts', '.tsx', '.js', '.jsx'],
      status: 'stopped'
    });

    // Python LSP
    this.servers.set('python', {
      name: 'Python Language Server',
      command: 'pylsp',
      args: [],
      filetypes: ['.py'],
      status: 'stopped'
    });

    // Rust LSP
    this.servers.set('rust', {
      name: 'Rust Analyzer',
      command: 'rust-analyzer',
      args: [],
      filetypes: ['.rs'],
      status: 'stopped'
    });
  }

  async startServer(serverName: string): Promise<boolean> {
    const server = this.servers.get(serverName);
    if (!server) {
      console.log(chalk.red(`LSP server '${serverName}' not found`));
      return false;
    }

    if (server.status === 'running') {
      console.log(chalk.yellow(`LSP server '${serverName}' is already running`));
      return true;
    }

    try {
      server.status = 'starting';
      console.log(chalk.blue(`🚀 Starting ${server.name}...`));

      const process = spawn(server.command, server.args, {
        cwd: this.workingDirectory,
        stdio: 'pipe'
      });

      server.process = process;

      process.on('spawn', () => {
        server.status = 'running';
        console.log(chalk.green(`✅ ${server.name} started successfully`));
      });

      process.on('error', (error) => {
        server.status = 'error';
        console.log(chalk.red(`❌ Failed to start ${server.name}: ${error.message}`));
      });

      process.on('exit', (code) => {
        server.status = 'stopped';
        console.log(chalk.yellow(`⏹️  ${server.name} stopped (code: ${code})`));
      });

      return true;
    } catch (error: any) {
      server.status = 'error';
      console.log(chalk.red(`❌ Failed to start ${server.name}: ${error.message}`));
      return false;
    }
  }

  async stopServer(serverName: string): Promise<boolean> {
    const server = this.servers.get(serverName);
    if (!server || !server.process) {
      console.log(chalk.yellow(`LSP server '${serverName}' is not running`));
      return false;
    }

    server.process.kill();
    server.status = 'stopped';
    console.log(chalk.green(`✅ Stopped ${server.name}`));
    return true;
  }

  getServerStatus(): Array<{name: string; status: string; filetypes: string[]}> {
    return Array.from(this.servers.values()).map(server => ({
      name: server.name,
      status: server.status,
      filetypes: server.filetypes
    }));
  }

  async autoStartServers(projectPath: string): Promise<void> {
    const detectedLanguages = this.detectProjectLanguages(projectPath);
    console.log(chalk.cyan(`🔍 Detected languages: ${detectedLanguages.join(', ')}`));

    for (const lang of detectedLanguages) {
      const serverName = this.getServerForLanguage(lang);
      if (serverName) {
        await this.startServer(serverName);
      }
    }
  }

  private detectProjectLanguages(projectPath: string): string[] {
    const languages: string[] = [];

    try {
      // Check for common config files
      const files = fs.readdirSync(projectPath);
      
      if (files.includes('tsconfig.json') || files.includes('package.json')) {
        languages.push('typescript');
      }
      
      if (files.includes('Cargo.toml')) {
        languages.push('rust');
      }
      
      if (files.includes('pyproject.toml') || files.includes('requirements.txt')) {
        languages.push('python');
      }
    } catch (error) {
      // Ignore errors
    }

    return languages;
  }

  private getServerForLanguage(language: string): string | null {
    const mapping: Record<string, string> = {
      'typescript': 'typescript',
      'javascript': 'typescript',
      'python': 'python',
      'rust': 'rust'
    };

    return mapping[language] || null;
  }
}

export const lspService = new LSPService();