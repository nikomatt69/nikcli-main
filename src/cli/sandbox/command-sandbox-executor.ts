/**
 * Command Sandbox Executor
 * Executes commands in isolated temporary directories with proper cleanup
 * Provides real-time output streaming and error handling
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bunSpawn, readStreamToString, remove } from '../utils/bun-compat'
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
  private activeSessions: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private sandboxDirs: Map<string, string> = new Map()
  private activeProcs: Map<string, ReturnType<typeof bunSpawn>> = new Map()

  /**
   * Execute command in isolated sandbox using Bun.spawn
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
      const cmd = options.shell
        ? ['sh', '-c', options.command]
        : [options.command, ...(options.args || [])]

      // Spawn child process in sandbox directory using Bun.spawn
      const proc = bunSpawn({
        cmd,
        cwd: options.cwd || sandboxDir,
        env: {
          ...process.env,
          ...options.env,
          SANDBOX_DIR: sandboxDir,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })

      this.activeProcs.set(options.sessionId, proc)

      // Handle timeout if specified
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          proc.kill()
          error = `Command timeout after ${options.timeout}ms`
        }, options.timeout)
        this.activeSessions.set(options.sessionId, timeoutId)
      }

      // Read stdout and stderr in parallel using Bun streams
      const [stdoutContent, stderrContent] = await Promise.all([
        readStreamToString(proc.stdout as ReadableStream),
        readStreamToString(proc.stderr as ReadableStream),
      ])

      stdout = stdoutContent
      stderr = stderrContent

      // Stream output
      if (stdout) process.stdout.write(stdout)
      if (stderr) process.stderr.write(stderr)

      // Wait for process to exit
      exitCode = await proc.exited

      // Clean up timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeSessions.delete(options.sessionId)
      }

      this.activeProcs.delete(options.sessionId)

      // Stream final status
      const status = exitCode === 0 ? '✓ Success' : `✖ Failed (code: ${exitCode})`
      advancedUI.addLiveUpdate({
        type: exitCode === 0 ? 'result' : 'error',
        content: `${status}`,
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
   * Create isolated sandbox directory using Bun Shell
   */
  private async createSandboxDirectory(): Promise<string> {
    try {
      const { $ } = await import('../utils/bun-compat')
      const sandboxDir = join(tmpdir(), `nikcli-sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      await $`mkdir -p ${sandboxDir}`.quiet()
      advancedUI.logInfo(`🏝️  Sandbox created: ${sandboxDir}`)
      return sandboxDir
    } catch (error: any) {
      throw new Error(`Failed to create sandbox: ${error.message}`)
    }
  }

  /**
   * Cleanup sandbox directory using Bun Shell
   */
  private async cleanupSandbox(sessionId: string, sandboxDir: string): Promise<void> {
    try {
      // Remove timeout if active
      const timeoutId = this.activeSessions.get(sessionId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        this.activeSessions.delete(sessionId)
      }

      // Kill active process if any
      const proc = this.activeProcs.get(sessionId)
      if (proc) {
        proc.kill()
        this.activeProcs.delete(sessionId)
      }

      // Remove sandbox directory using Bun Shell
      await remove(sandboxDir, true)
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
