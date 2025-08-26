import { spawn, ChildProcess } from 'child_process';
import { resolve, join, dirname, extname } from 'path';
import { existsSync, readdirSync } from 'fs';
import chalk from 'chalk';

export interface LSPServerHandle {
  process: ChildProcess;
  initialization?: Record<string, any>;
}

export interface LSPServerInfo {
  id: string;
  name: string;
  extensions: string[];
  command?: string[];
  rootPatterns: string[];
  initializationOptions?: Record<string, any>;
  spawn(workspaceRoot: string): Promise<LSPServerHandle | undefined>;
}

// Find workspace root by walking up directory tree
function findWorkspaceRoot(startPath: string, patterns: string[]): string | undefined {
  let currentPath = resolve(startPath);
  const root = resolve('/');

  while (currentPath !== root) {
    for (const pattern of patterns) {
      const patternPath = join(currentPath, pattern);
      if (existsSync(patternPath)) {
        return currentPath;
      }
    }
    currentPath = dirname(currentPath);
  }

  return undefined;
}

// Check if command exists in PATH
function commandExists(command: string): boolean {
  try {
    const { execSync } = require('child_process');
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const LSP_SERVERS: Record<string, LSPServerInfo> = {
  typescript: {
    id: 'typescript',
    name: 'TypeScript Language Server',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],
    rootPatterns: ['package.json', 'tsconfig.json', 'jsconfig.json'],
    async spawn(workspaceRoot: string): Promise<LSPServerHandle | undefined> {
      try {
        // Try to find typescript-language-server
        if (!commandExists('typescript-language-server')) {
          console.log(chalk.yellow('📦 Installing typescript-language-server...'));
          const installProcess = spawn('yarn', ['global', 'add', 'typescript-language-server', 'typescript'], {
            cwd: workspaceRoot,
            stdio: 'inherit'
          });

          await new Promise((resolve, reject) => {
            installProcess.on('close', (code) => {
              if (code === 0) resolve(undefined);
              else reject(new Error(`Installation failed with code ${code}`));
            });
          });
        }

        const process = spawn('typescript-language-server', ['--stdio'], {
          cwd: workspaceRoot,
          stdio: ['pipe', 'pipe', 'inherit']
        });

        return {
          process,
          initialization: {
            preferences: {
              includeCompletionsForModuleExports: true,
              includeCompletionsWithInsertText: true,
            },
            typescript: {
              suggest: {
                autoImports: true,
              },
            },
          },
        };
      } catch (error) {
        console.log(chalk.red(`❌ Failed to start TypeScript LSP: ${error}`));
        return undefined;
      }
    },
  },

  python: {
    id: 'python',
    name: 'Pylsp (Python LSP Server)',
    extensions: ['.py', '.pyi'],
    rootPatterns: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt', 'Pipfile'],
    async spawn(workspaceRoot: string): Promise<LSPServerHandle | undefined> {
      try {
        // Check if pylsp is available
        if (!commandExists('pylsp')) {
          console.log(chalk.yellow('📦 Installing python-lsp-server...'));
          const installProcess = spawn('pip', ['install', 'python-lsp-server[all]'], {
            cwd: workspaceRoot,
            stdio: 'inherit'
          });

          await new Promise((resolve, reject) => {
            installProcess.on('close', (code) => {
              if (code === 0) resolve(undefined);
              else reject(new Error(`Installation failed with code ${code}`));
            });
          });
        }

        const process = spawn('pylsp', [], {
          cwd: workspaceRoot,
          stdio: ['pipe', 'pipe', 'inherit']
        });

        return {
          process,
          initialization: {
            plugins: {
              pycodestyle: { enabled: false },
              mccabe: { enabled: false },
              pyflakes: { enabled: true },
              autopep8: { enabled: true },
              yapf: { enabled: false },
            },
          },
        };
      } catch (error) {
        console.log(chalk.red(`❌ Failed to start Python LSP: ${error}`));
        return undefined;
      }
    },
  },

  rust: {
    id: 'rust',
    name: 'Rust Analyzer',
    extensions: ['.rs'],
    rootPatterns: ['Cargo.toml', 'Cargo.lock'],
    async spawn(workspaceRoot: string): Promise<LSPServerHandle | undefined> {
      try {
        if (!commandExists('rust-analyzer')) {
          console.log(chalk.yellow('📦 Installing rust-analyzer...'));
          const installProcess = spawn('rustup', ['component', 'add', 'rust-analyzer'], {
            cwd: workspaceRoot,
            stdio: 'inherit'
          });

          await new Promise((resolve, reject) => {
            installProcess.on('close', (code) => {
              if (code === 0) resolve(undefined);
              else reject(new Error(`Installation failed with code ${code}`));
            });
          });
        }

        const process = spawn('rust-analyzer', [], {
          cwd: workspaceRoot,
          stdio: ['pipe', 'pipe', 'inherit']
        });

        return { process };
      } catch (error) {
        console.log(chalk.red(`❌ Failed to start Rust Analyzer: ${error}`));
        return undefined;
      }
    },
  },

  go: {
    id: 'go',
    name: 'Gopls (Go Language Server)',
    extensions: ['.go'],
    rootPatterns: ['go.mod', 'go.sum', 'go.work'],
    async spawn(workspaceRoot: string): Promise<LSPServerHandle | undefined> {
      try {
        if (!commandExists('gopls')) {
          console.log(chalk.yellow('📦 Installing gopls...'));
          const installProcess = spawn('go', ['install', 'golang.org/x/tools/gopls@latest'], {
            cwd: workspaceRoot,
            stdio: 'inherit',
            env: { ...process.env, GO111MODULE: 'on' }
          });

          await new Promise((resolve, reject) => {
            installProcess.on('close', (code) => {
              if (code === 0) resolve(undefined);
              else reject(new Error(`Installation failed with code ${code}`));
            });
          });
        }

        const goplsProcess = spawn('gopls', [], {
          cwd: workspaceRoot,
          stdio: ['pipe', 'pipe', 'inherit']
        });

        return { process: goplsProcess };
      } catch (error) {
        console.log(chalk.red(`❌ Failed to start Gopls: ${error}`));
        return undefined;
      }
    },
  },

  java: {
    id: 'java',
    name: 'Eclipse JDT Language Server',
    extensions: ['.java'],
    rootPatterns: ['pom.xml', 'build.gradle', 'build.xml', '.project'],
    async spawn(workspaceRoot: string): Promise<LSPServerHandle | undefined> {
      try {
        // This is a simplified version - full Java LSP setup is complex
        console.log(chalk.yellow('⚠️ Java LSP requires manual Eclipse JDT Language Server setup'));
        return undefined;
      } catch (error) {
        console.log(chalk.red(`❌ Failed to start Java LSP: ${error}`));
        return undefined;
      }
    },
  },

  ruby: {
    id: 'ruby',
    name: 'Ruby LSP',
    extensions: ['.rb', '.rake', '.gemspec', '.ru'],
    rootPatterns: ['Gemfile', 'Rakefile'],
    async spawn(workspaceRoot: string): Promise<LSPServerHandle | undefined> {
      try {
        if (!commandExists('ruby-lsp')) {
          console.log(chalk.yellow('📦 Installing ruby-lsp...'));
          const installProcess = spawn('gem', ['install', 'ruby-lsp'], {
            cwd: workspaceRoot,
            stdio: 'inherit'
          });

          await new Promise((resolve, reject) => {
            installProcess.on('close', (code) => {
              if (code === 0) resolve(undefined);
              else reject(new Error(`Installation failed with code ${code}`));
            });
          });
        }

        const process = spawn('ruby-lsp', ['--stdio'], {
          cwd: workspaceRoot,
          stdio: ['pipe', 'pipe', 'inherit']
        });

        return { process };
      } catch (error) {
        console.log(chalk.red(`❌ Failed to start Ruby LSP: ${error}`));
        return undefined;
      }
    },
  }
};

// Get appropriate LSP servers for a file
export function getApplicableLSPServers(filePath: string): LSPServerInfo[] {
  const extension = extname(filePath);
  const servers: LSPServerInfo[] = [];

  for (const server of Object.values(LSP_SERVERS)) {
    if (server.extensions.includes(extension)) {
      servers.push(server);
    }
  }

  return servers;
}

// Find workspace root for a file using LSP server patterns
export function findLSPWorkspaceRoot(filePath: string, serverInfo?: LSPServerInfo): string | undefined {
  if (serverInfo) {
    return findWorkspaceRoot(dirname(filePath), serverInfo.rootPatterns);
  }

  // Try all server patterns
  for (const server of Object.values(LSP_SERVERS)) {
    const root = findWorkspaceRoot(dirname(filePath), server.rootPatterns);
    if (root) return root;
  }

  return undefined;
}

// Auto-install missing LSP dependencies
export async function ensureLSPDependencies(serverIds: string[]): Promise<void> {
  console.log(chalk.blue('🔍 Checking LSP server dependencies...'));

  const installPromises: Promise<void>[] = [];

  for (const serverId of serverIds) {
    const server = LSP_SERVERS[serverId];
    if (!server) continue;

    // Check if server command exists
    if (serverId === 'typescript' && !commandExists('typescript-language-server')) {
      installPromises.push(installTypeScriptLSP());
    } else if (serverId === 'python' && !commandExists('pylsp')) {
      installPromises.push(installPythonLSP());
    } else if (serverId === 'rust' && !commandExists('rust-analyzer')) {
      installPromises.push(installRustAnalyzer());
    } else if (serverId === 'go' && !commandExists('gopls')) {
      installPromises.push(installGopls());
    } else if (serverId === 'ruby' && !commandExists('ruby-lsp')) {
      installPromises.push(installRubyLSP());
    }
  }

  if (installPromises.length > 0) {
    await Promise.allSettled(installPromises);
    console.log(chalk.green('✅ LSP dependencies check completed'));
  }
}

// Individual LSP installer functions
async function installTypeScriptLSP(): Promise<void> {
  console.log(chalk.yellow('📦 Installing TypeScript Language Server...'));
  return new Promise((resolve, reject) => {
    const process = spawn('yarn', ['global', 'add', 'typescript-language-server', 'typescript'], {
      stdio: 'inherit'
    });
    process.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ TypeScript LSP installed'));
        resolve();
      } else {
        console.log(chalk.red('❌ TypeScript LSP installation failed'));
        reject(new Error(`Installation failed with code ${code}`));
      }
    });
  });
}

async function installPythonLSP(): Promise<void> {
  console.log(chalk.yellow('📦 Installing Python LSP Server...'));
  return new Promise((resolve, reject) => {
    const process = spawn('pip', ['install', 'python-lsp-server[all]'], {
      stdio: 'inherit'
    });
    process.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ Python LSP installed'));
        resolve();
      } else {
        console.log(chalk.red('❌ Python LSP installation failed'));
        reject(new Error(`Installation failed with code ${code}`));
      }
    });
  });
}

async function installRustAnalyzer(): Promise<void> {
  console.log(chalk.yellow('📦 Installing Rust Analyzer...'));
  return new Promise((resolve, reject) => {
    const process = spawn('rustup', ['component', 'add', 'rust-analyzer'], {
      stdio: 'inherit'
    });
    process.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ Rust Analyzer installed'));
        resolve();
      } else {
        console.log(chalk.red('❌ Rust Analyzer installation failed'));
        reject(new Error(`Installation failed with code ${code}`));
      }
    });
  });
}

async function installGopls(): Promise<void> {
  console.log(chalk.yellow('📦 Installing Gopls...'));
  return new Promise((resolve, reject) => {
    const childProcess = spawn('go', ['install', 'golang.org/x/tools/gopls@latest'], {
      stdio: 'inherit',
      env: { NODE_ENV: process.env.NODE_ENV }
    });
    childProcess.on('close', (code: number) => {
      if (code === 0) {
        console.log(chalk.green('✅ Gopls installed'));
        resolve();
      } else {
        console.log(chalk.red('❌ Gopls installation failed'));
        reject(new Error(`Installation failed with code ${code}`));
      }
    });
  });
}

async function installRubyLSP(): Promise<void> {
  console.log(chalk.yellow('📦 Installing Ruby LSP...'));
  return new Promise((resolve, reject) => {
    const process = spawn('gem', ['install', 'ruby-lsp'], {
      stdio: 'inherit'
    });
    process.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ Ruby LSP installed'));
        resolve();
      } else {
        console.log(chalk.red('❌ Ruby LSP installation failed'));
        reject(new Error(`Installation failed with code ${code}`));
      }
    });
  });
}
