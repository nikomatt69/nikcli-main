import { existsSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'
import chalk from 'chalk'
import type { BunSubprocess } from '../utils/bun-compat'

export interface LSPServerProcess {
  stdin: NodeJS.WritableStream | null
  stdout: NodeJS.ReadableStream | null
  kill: (signal?: number) => void
}

export interface LSPServerHandle {
  process: LSPServerProcess
  initialization?: Record<string, any>
}

export interface LSPServerInfo {
  id: string
  name: string
  extensions: string[]
  command?: string[]
  rootPatterns: string[]
  initializationOptions?: Record<string, any>
  spawn(workspaceRoot: string): Promise<LSPServerHandle | undefined>
}

// Find workspace root by walking up directory tree
function findWorkspaceRoot(startPath: string, patterns: string[]): string | undefined {
  let currentPath = resolve(startPath)
  const root = resolve('/')

  while (currentPath !== root) {
    for (const pattern of patterns) {
      const patternPath = join(currentPath, pattern)
      if (existsSync(patternPath)) {
        return currentPath
      }
    }
    currentPath = dirname(currentPath)
  }

  return undefined
}

// Check if command exists in PATH
function commandExists(command: string): boolean {
  try {
    return Boolean(Bun.which(command))
  } catch {
    return false
  }
}

function toLSPProcess(proc: BunSubprocess): LSPServerProcess {
  const stdout = proc.stdout ? (Readable.fromWeb(proc.stdout) as unknown as NodeJS.ReadableStream) : null
  const stdin = proc.stdin ? (Writable.fromWeb(proc.stdin) as unknown as NodeJS.WritableStream) : null

  return {
    stdin,
    stdout,
    kill: (signal?: number) => {
      proc.kill(signal)
    },
  }
}

async function runInstall(command: string, args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn({
    cmd: [command, ...args],
    cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`Installation failed with code ${exitCode}`)
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
          console.log(chalk.yellow('📦 Installing typescript-language-server...'))
          await runInstall('yarn', ['global', 'add', 'typescript-language-server', 'typescript'], workspaceRoot)
        }

        const process = Bun.spawn({
          cmd: ['typescript-language-server', '--stdio'],
          cwd: workspaceRoot,
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'inherit',
        })

        return {
          process: toLSPProcess(process),
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
        }
      } catch (error) {
        console.log(chalk.red(`✖ Failed to start TypeScript LSP: ${error}`))
        return undefined
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
          console.log(chalk.yellow('📦 Installing python-lsp-server...'))
          await runInstall('pip', ['install', 'python-lsp-server[all]'], workspaceRoot)
        }

        const process = Bun.spawn({
          cmd: ['pylsp'],
          cwd: workspaceRoot,
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'inherit',
        })

        return {
          process: toLSPProcess(process),
          initialization: {
            plugins: {
              pycodestyle: { enabled: false },
              mccabe: { enabled: false },
              pyflakes: { enabled: true },
              autopep8: { enabled: true },
              yapf: { enabled: false },
            },
          },
        }
      } catch (error) {
        console.log(chalk.red(`✖ Failed to start Python LSP: ${error}`))
        return undefined
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
          console.log(chalk.yellow('📦 Installing rust-analyzer...'))
          await runInstall('rustup', ['component', 'add', 'rust-analyzer'], workspaceRoot)
        }

        const process = Bun.spawn({
          cmd: ['rust-analyzer'],
          cwd: workspaceRoot,
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'inherit',
        })

        return { process: toLSPProcess(process) }
      } catch (error) {
        console.log(chalk.red(`✖ Failed to start Rust Analyzer: ${error}`))
        return undefined
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
          console.log(chalk.yellow('📦 Installing gopls...'))
          await runInstall('go', ['install', 'golang.org/x/tools/gopls@latest'], workspaceRoot)
        }

        const goplsProcess = Bun.spawn({
          cmd: ['gopls'],
          cwd: workspaceRoot,
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'inherit',
        })

        return { process: toLSPProcess(goplsProcess) }
      } catch (error) {
        console.log(chalk.red(`✖ Failed to start Gopls: ${error}`))
        return undefined
      }
    },
  },

  java: {
    id: 'java',
    name: 'Eclipse JDT Language Server',
    extensions: ['.java'],
    rootPatterns: ['pom.xml', 'build.gradle', 'build.xml', '.project'],
    async spawn(_workspaceRoot: string): Promise<LSPServerHandle | undefined> {
      try {
        // This is a simplified version - full Java LSP setup is complex
        console.log(chalk.yellow('⚠︎ Java LSP requires manual Eclipse JDT Language Server setup'))
        return undefined
      } catch (error) {
        console.log(chalk.red(`✖ Failed to start Java LSP: ${error}`))
        return undefined
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
          console.log(chalk.yellow('📦 Installing ruby-lsp...'))
          await runInstall('gem', ['install', 'ruby-lsp'], workspaceRoot)
        }

        const process = Bun.spawn({
          cmd: ['ruby-lsp', '--stdio'],
          cwd: workspaceRoot,
          stdin: 'pipe',
          stdout: 'pipe',
          stderr: 'inherit',
        })

        return { process: toLSPProcess(process) }
      } catch (error) {
        console.log(chalk.red(`✖ Failed to start Ruby LSP: ${error}`))
        return undefined
      }
    },
  },
}

// Get appropriate LSP servers for a file
export function getApplicableLSPServers(filePath: string): LSPServerInfo[] {
  const extension = extname(filePath)
  const servers: LSPServerInfo[] = []

  for (const server of Object.values(LSP_SERVERS)) {
    if (server.extensions.includes(extension)) {
      servers.push(server)
    }
  }

  return servers
}

// Find workspace root for a file using LSP server patterns
export function findLSPWorkspaceRoot(filePath: string, serverInfo?: LSPServerInfo): string | undefined {
  if (serverInfo) {
    return findWorkspaceRoot(dirname(filePath), serverInfo.rootPatterns)
  }

  // Try all server patterns
  for (const server of Object.values(LSP_SERVERS)) {
    const root = findWorkspaceRoot(dirname(filePath), server.rootPatterns)
    if (root) return root
  }

  return undefined
}

// Auto-install missing LSP dependencies
export async function ensureLSPDependencies(serverIds: string[]): Promise<void> {
  console.log(chalk.blue('🔍 Checking LSP server dependencies...'))

  const installPromises: Promise<void>[] = []

  for (const serverId of serverIds) {
    const server = LSP_SERVERS[serverId]
    if (!server) continue

    // Check if server command exists
    if (serverId === 'typescript' && !commandExists('typescript-language-server')) {
      installPromises.push(installTypeScriptLSP())
    } else if (serverId === 'python' && !commandExists('pylsp')) {
      installPromises.push(installPythonLSP())
    } else if (serverId === 'rust' && !commandExists('rust-analyzer')) {
      installPromises.push(installRustAnalyzer())
    } else if (serverId === 'go' && !commandExists('gopls')) {
      installPromises.push(installGopls())
    } else if (serverId === 'ruby' && !commandExists('ruby-lsp')) {
      installPromises.push(installRubyLSP())
    }
  }

  if (installPromises.length > 0) {
    await Promise.allSettled(installPromises)
    console.log(chalk.green('✓ LSP dependencies check completed'))
  }
}

// Individual LSP installer functions
async function installTypeScriptLSP(): Promise<void> {
  console.log(chalk.yellow('📦 Installing TypeScript Language Server...'))
  await runInstall('yarn', ['global', 'add', 'typescript-language-server', 'typescript'], process.cwd())
  console.log(chalk.green('✓ TypeScript LSP installed'))
}

async function installPythonLSP(): Promise<void> {
  console.log(chalk.yellow('📦 Installing Python LSP Server...'))
  await runInstall('pip', ['install', 'python-lsp-server[all]'], process.cwd())
  console.log(chalk.green('✓ Python LSP installed'))
}

async function installRustAnalyzer(): Promise<void> {
  console.log(chalk.yellow('📦 Installing Rust Analyzer...'))
  await runInstall('rustup', ['component', 'add', 'rust-analyzer'], process.cwd())
  console.log(chalk.green('✓ Rust Analyzer installed'))
}

async function installGopls(): Promise<void> {
  console.log(chalk.yellow('📦 Installing Gopls...'))
  await runInstall('go', ['install', 'golang.org/x/tools/gopls@latest'], process.cwd())
  console.log(chalk.green('✓ Gopls installed'))
}

async function installRubyLSP(): Promise<void> {
  console.log(chalk.yellow('📦 Installing Ruby LSP...'))
  await runInstall('gem', ['install', 'ruby-lsp'], process.cwd())
  console.log(chalk.green('✓ Ruby LSP installed'))
}
