/**
 * Command Sandbox Executor
 * Executes commands in isolated temporary directories with proper cleanup
 * Provides real-time output streaming and error handling
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface SandboxExecutionOptions {
  command: string
  args?: string[]
  cwd?: string
  timeout?: number
  shell?: boolean
  env?: Record<string, string>
  sessionId: string
}

export interface SandboxExecutionResult {
  sessionId: string
  command: string
  exitCode: number | null
  signal: string | null
  stdout: string
  stderr: string
  duration: number
  success: boolean
  sandboxDir: string
  error?: string
}

export class CommandSandboxExecutor {
  private activeSessions: Map<string, NodeJS.Timeout> = new Map()
  private sandboxDirs: Map<string, string> = new Map()

  /**
   * Execute command in isolated sandbox
   */
  async execute(options: SandboxExecutionOptions): Promise<SandboxExecutionResult> {
    const startTime = Date.now()
    const sandboxDir = await this.createSandboxDirectory()
    this.sandboxDirs.set(options.sessionId, sandboxDir)

    let stdout = ''
    let stderr = ''
    let exitCode: number | null = null
    let signal: string | null = null
    let error: string | undefined

    try {
      advancedUI.addLiveUpdate({
        type: 'info',
        content: `🏝️  Sandbox: ${options.command}`,
      })

      // Determine command execution
      const [cmd, args] = options.shell ? ['/bin/sh', ['-c', options.command]] : [options.command, options.args || []]

      // Spawn child process in sandbox directory
      const child = spawn(cmd, args, {
        cwd: options.cwd || sandboxDir,
        shell: options.shell || false,
        env: {
          ...process.env,
          ...options.env,
          SANDBOX_DIR: sandboxDir,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      // Capture stdout
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          const output = data.toString()
          stdout += output
          // Stream output in real-time
          process.stdout.write(output)
        })
      }

      // Capture stderr
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          const output = data.toString()
          stderr += output
          // Stream stderr in real-time
          process.stderr.write(output)
        })
      }

      // Handle timeout if specified
      let timeoutId: NodeJS.Timeout | null = null
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM')
          error = `Command timeout after ${options.timeout}ms`
        }, options.timeout)
        this.activeSessions.set(options.sessionId, timeoutId)
      }

      // Wait for process to complete
      await new Promise<void>((resolve, reject) => {
        child.on('error', (err) => {
          error = err.message
          reject(err)
        })

        child.on('close', (code, sig) => {
          // Clean up timeout
          if (timeoutId) {
            clearTimeout(timeoutId)
            this.activeSessions.delete(options.sessionId)
          }

          exitCode = code
          signal = sig

          // Stream final status
          const status = code === 0 ? '✓ Success' : code ? `✖ Failed (code: ${code})` : `⚠︎  Terminated (signal: ${sig})`
          advancedUI.addLiveUpdate({
            type: code === 0 ? 'result' : 'error',
            content: `${status}`,
          })

          resolve()
        })
      })
    } catch (err: any) {
      error = err.message
      advancedUI.addLiveUpdate({
        type: 'error',
        content: `🔥 Sandbox Error: ${err.message}`,
      })
    } finally {
      // Cleanup sandbox directory
      await this.cleanupSandbox(options.sessionId, sandboxDir)
    }

    const duration = Date.now() - startTime

    return {
      sessionId: options.sessionId,
      command: options.command,
      exitCode,
      signal,
      stdout,
      stderr,
      duration,
      success: exitCode === 0 && !signal && !error,
      sandboxDir,
      error,
    }
  }

  /**
   * Create isolated sandbox directory
   */
  private async createSandboxDirectory(): Promise<string> {
    try {
      const sandboxDir = await mkdtemp(join(tmpdir(), 'nikcli-sandbox-'))
      advancedUI.logInfo(`🏝️  Sandbox created: ${sandboxDir}`)
      return sandboxDir
    } catch (error: any) {
      throw new Error(`Failed to create sandbox: ${error.message}`)
    }
  }

  /**
   * Cleanup sandbox directory
   */
  private async cleanupSandbox(sessionId: string, sandboxDir: string): Promise<void> {
    try {
      // Remove timeout if active
      const timeoutId = this.activeSessions.get(sessionId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeSessions.delete(sessionId)
      }

      // Remove sandbox directory
      await rm(sandboxDir, { recursive: true, force: true })
      this.sandboxDirs.delete(sessionId)
      advancedUI.logInfo(`🧹 Sandbox cleaned: ${sandboxDir}`)
    } catch (error: any) {
      console.error(`Failed to cleanup sandbox ${sandboxDir}: ${error.message}`)
    }
  }

  /**
   * Kill active session
   */
  async killSession(sessionId: string): Promise<void> {
    const timeoutId = this.activeSessions.get(sessionId)
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.activeSessions.delete(sessionId)
    }

    const sandboxDir = this.sandboxDirs.get(sessionId)
    if (sandboxDir) {
      await this.cleanupSandbox(sessionId, sandboxDir)
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys())
  }

  /**
   * Cleanup all sandboxes
   */
  async cleanupAll(): Promise<void> {
    const sessions = Array.from(this.sandboxDirs.entries())
    for (const [sessionId, sandboxDir] of sessions) {
      await this.cleanupSandbox(sessionId, sandboxDir)
    }
    advancedUI.logInfo('🧹 All sandboxes cleaned up')
  }
}

// Singleton instance
let executorInstance: CommandSandboxExecutor | null = null

export function getCommandSandboxExecutor(): CommandSandboxExecutor {
  if (!executorInstance) {
    executorInstance = new CommandSandboxExecutor()
  }
  return executorInstance
}

export const commandSandboxExecutor = getCommandSandboxExecutor()
