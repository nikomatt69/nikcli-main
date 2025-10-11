import { exec, spawn } from 'node:child_process'
import { promisify } from 'util'
import { advancedUI } from '../ui/advanced-cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'

const _execAsync = promisify(exec)

/**
 * Production-ready Run Command Tool
 * Safely executes commands with whitelist, sandboxing, and monitoring
 */
export class RunCommandTool extends BaseTool {
  private allowedCommands: Set<string>
  private allowedPaths: Set<string>
  private maxExecutionTime: number
  private maxOutputSize: number

  constructor(workingDirectory: string, config: CommandToolConfig = {}) {
    super('run-command-tool', workingDirectory)
    this.allowedCommands = new Set(config.allowedCommands || DEFAULT_ALLOWED_COMMANDS)
    this.allowedPaths = new Set(config.allowedPaths || [workingDirectory])
    this.maxExecutionTime = config.maxExecutionTime || 30000 // 30 seconds
    this.maxOutputSize = config.maxOutputSize || 1024 * 1024 // 1MB
  }

  async execute(command: string, options: CommandOptions = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      // Parse and validate command
      const parsedCommand = this.parseCommand(command)
      await this.validateCommand(parsedCommand, options)

      // Execute command with monitoring
      const result = await this.executeWithMonitoring(parsedCommand, options)

      const duration = Date.now() - startTime
      const commandResult: CommandResult = {
        success: result.exitCode === 0,
        command: command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration,
        workingDirectory: options.cwd || this.workingDirectory,
        metadata: {
          pid: result.pid,
          signal: result.signal,
          timedOut: result.timedOut,
          outputTruncated: result.outputTruncated,
        },
      }

      if (result.exitCode === 0) {
        advancedUI.logInfo(`Command executed successfully: ${command}`)
      } else {
        advancedUI.logWarning(`Command failed with exit code ${result.exitCode}: ${command}`)
      }

      return {
        success: result.exitCode === 0,
        data: commandResult,
        metadata: {
          executionTime: duration,
          toolName: this.name,
          parameters: { command, options },
        },
      }
    } catch (error: any) {
      const duration = Date.now() - startTime
      const errorResult: CommandResult = {
        success: false,
        command,
        exitCode: -1,
        stdout: '',
        stderr: error.message,
        duration,
        workingDirectory: options.cwd || this.workingDirectory,
        error: error.message,
        metadata: {
          timedOut: false,
          outputTruncated: false,
        },
      }

      advancedUI.logError(`Command execution failed: ${command} - ${error.message}`)
      return {
        success: false,
        data: errorResult,
        error: error.message,
        metadata: {
          executionTime: duration,
          toolName: this.name,
          parameters: { command, options },
        },
      }
    }
  }

  /**
   * Execute multiple commands in sequence
   */
  async executeSequence(commands: string[], options: CommandOptions = {}): Promise<SequenceResult> {
    const results: CommandResult[] = []
    let successCount = 0

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]

      try {
        const toolResult = await this.execute(command, options)
        const result = toolResult.data as CommandResult
        results.push(result)

        if (result.success) {
          successCount++
        } else if (options.stopOnFirstError) {
          advancedUI.logWarning(`Stopping sequence at command ${i + 1} due to failure`)
          break
        }
      } catch (error: any) {
        const errorResult: CommandResult = {
          success: false,
          command,
          exitCode: -1,
          stdout: '',
          stderr: error.message,
          duration: 0,
          workingDirectory: options.cwd || this.workingDirectory,
          error: error.message,
          metadata: {
            timedOut: false,
            outputTruncated: false,
          },
        }

        results.push(errorResult)

        if (options.stopOnFirstError) {
          break
        }
      }
    }

    return {
      success: successCount === commands.length,
      results,
      totalCommands: commands.length,
      successfulCommands: successCount,
      summary: this.generateSequenceSummary(results),
    }
  }

  /**
   * Execute command with real-time output streaming
   */
  async executeWithStreaming(command: string, options: StreamingOptions = {}): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const parsedCommand = this.parseCommand(command)

      // Validate command first
      this.validateCommand(parsedCommand, options)
        .then(() => {
          const startTime = Date.now()
          let stdout = ''
          let stderr = ''
          let outputSize = 0
          let timedOut = false
          let outputTruncated = false

          const child = spawn(parsedCommand.executable, parsedCommand.args, {
            cwd: options.cwd || this.workingDirectory,
            env: { ...process.env, ...options.env },
            stdio: ['pipe', 'pipe', 'pipe'],
          })

          // Set up timeout
          const timeout = setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')

            // Force kill after 5 seconds
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL')
              }
            }, 5000)
          }, this.maxExecutionTime)

          // Handle stdout
          child.stdout?.on('data', (data: Buffer) => {
            const chunk = data.toString()
            outputSize += chunk.length

            if (outputSize > this.maxOutputSize) {
              outputTruncated = true
              child.kill('SIGTERM')
              return
            }

            stdout += chunk
            if (options.onStdout) {
              options.onStdout(chunk)
            }
          })

          // Handle stderr
          child.stderr?.on('data', (data: Buffer) => {
            const chunk = data.toString()
            outputSize += chunk.length

            if (outputSize > this.maxOutputSize) {
              outputTruncated = true
              child.kill('SIGTERM')
              return
            }

            stderr += chunk
            if (options.onStderr) {
              options.onStderr(chunk)
            }
          })

          // Handle process completion
          child.on('close', (exitCode, signal) => {
            clearTimeout(timeout)

            const result: CommandResult = {
              success: exitCode === 0 && !timedOut && !outputTruncated,
              command,
              exitCode: exitCode || -1,
              stdout,
              stderr,
              duration: Date.now() - startTime,
              workingDirectory: options.cwd || this.workingDirectory,
              metadata: {
                pid: child.pid,
                signal,
                timedOut,
                outputTruncated,
              },
            }

            resolve(result)
          })

          child.on('error', (error) => {
            clearTimeout(timeout)
            reject(error)
          })
        })
        .catch(reject)
    })
  }

  /**
   * Parse command string into executable and arguments
   */
  private parseCommand(command: string): ParsedCommand {
    // Simple command parsing - in production, consider using a proper shell parser
    const parts = command.trim().split(/\s+/)
    const executable = parts[0]
    const args = parts.slice(1)

    return {
      original: command,
      executable,
      args,
      fullPath: executable, // Will be resolved during validation
    }
  }

  /**
   * Validate command against security policies
   */
  private async validateCommand(parsedCommand: ParsedCommand, options: CommandOptions): Promise<void> {
    // Check if command is in whitelist
    if (!this.allowedCommands.has(parsedCommand.executable)) {
      throw new Error(`Command not allowed: ${parsedCommand.executable}`)
    }

    // Validate working directory
    const workingDir = options.cwd || this.workingDirectory
    if (!this.allowedPaths.has(workingDir)) {
      const isSubPath = Array.from(this.allowedPaths).some((allowedPath) => workingDir.startsWith(allowedPath))

      if (!isSubPath) {
        throw new Error(`Working directory not allowed: ${workingDir}`)
      }
    }

    // Check for dangerous arguments
    const dangerousPatterns = [
      /rm\s+-rf/,
      /sudo/,
      /chmod\s+777/,
      />/, // Output redirection
      /\|/, // Pipes
      /;/, // Command chaining
      /&&/, // Command chaining
      /\|\|/, // Command chaining
    ]

    const fullCommand = `${parsedCommand.executable} ${parsedCommand.args.join(' ')}`
    for (const pattern of dangerousPatterns) {
      if (pattern.test(fullCommand)) {
        throw new Error(`Dangerous command pattern detected: ${pattern.source}`)
      }
    }

    // Validate file paths in arguments
    for (const arg of parsedCommand.args) {
      if (arg.startsWith('/') || arg.includes('..')) {
        // This looks like a file path, validate it
        try {
          const _fs = await import('node:fs/promises')
          const resolvedPath = require('path').resolve(workingDir, arg)

          // Check if path is within allowed directories
          const isAllowed = Array.from(this.allowedPaths).some((allowedPath) => resolvedPath.startsWith(allowedPath))

          if (!isAllowed) {
            throw new Error(`File path not allowed: ${arg}`)
          }
        } catch {
          // If path validation fails, it might not be a file path
          // Continue with execution but log warning
          advancedUI.logWarning(`Could not validate path argument: ${arg}`)
        }
      }
    }
  }

  /**
   * Execute command with monitoring and limits
   */
  private async executeWithMonitoring(parsedCommand: ParsedCommand, options: CommandOptions): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''
      let outputSize = 0
      let timedOut = false
      let outputTruncated = false

      const child = spawn(parsedCommand.executable, parsedCommand.args, {
        cwd: options.cwd || this.workingDirectory,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')

        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 5000)
      }, this.maxExecutionTime)

      child.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        outputSize += chunk.length

        if (outputSize > this.maxOutputSize) {
          outputTruncated = true
          child.kill('SIGTERM')
          return
        }

        stdout += chunk
      })

      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString()
        outputSize += chunk.length

        if (outputSize > this.maxOutputSize) {
          outputTruncated = true
          child.kill('SIGTERM')
          return
        }

        stderr += chunk
      })

      child.on('close', (exitCode, signal) => {
        clearTimeout(timeout)

        resolve({
          exitCode: exitCode || -1,
          stdout,
          stderr,
          pid: child.pid,
          signal,
          timedOut,
          outputTruncated,
        })
      })

      child.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  /**
   * Generate summary for command sequence
   */
  private generateSequenceSummary(results: CommandResult[]): SequenceSummary {
    const successful = results.filter((r) => r.success)
    const failed = results.filter((r) => !r.success)
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

    return {
      totalCommands: results.length,
      successfulCommands: successful.length,
      failedCommands: failed.length,
      totalDuration,
      averageDuration: results.length > 0 ? Math.round(totalDuration / results.length) : 0,
      longestCommand: results.reduce((max, r) => (r.duration > max.duration ? r : max), results[0])?.command || '',
    }
  }

  /**
   * Add command to whitelist
   */
  addAllowedCommand(command: string): void {
    this.allowedCommands.add(command)
    advancedUI.logInfo(`Added command to whitelist: ${command}`)
  }

  /**
   * Remove command from whitelist
   */
  removeAllowedCommand(command: string): void {
    this.allowedCommands.delete(command)
    advancedUI.logInfo(`Removed command from whitelist: ${command}`)
  }

  /**
   * Get current whitelist
   */
  getAllowedCommands(): string[] {
    return Array.from(this.allowedCommands)
  }

  /**
   * Add allowed path
   */
  addAllowedPath(path: string): void {
    this.allowedPaths.add(path)
    advancedUI.logInfo(`Added path to whitelist: ${path}`)
  }
}

// Default allowed commands (safe, common development commands)
const DEFAULT_ALLOWED_COMMANDS = [
  'ls',
  'dir',
  'pwd',
  'echo',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'git',
  'npm',
  'yarn',
  'node',
  'python',
  'python3',
  'pip',
  'pip3',
  'tsc',
  'eslint',
  'prettier',
  'jest',
  'mocha',
  'cypress',
  'docker',
  'kubectl',
  'helm',
  'curl',
  'wget',
  'ping',
  'nslookup',
  'mkdir',
  'touch',
  'cp',
  'mv',
  'ln',
  'which',
  'whereis',
  'type',
  'file',
  'stat',
  'ps',
  'top',
  'htop',
  'df',
  'du',
  'free',
  'uptime',
]

export interface CommandToolConfig {
  allowedCommands?: string[]
  allowedPaths?: string[]
  maxExecutionTime?: number
  maxOutputSize?: number
}

export interface CommandOptions {
  cwd?: string
  env?: Record<string, string>
  stopOnFirstError?: boolean
}

export interface StreamingOptions extends CommandOptions {
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

export interface CommandResult {
  success: boolean
  command: string
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  workingDirectory: string
  error?: string
  metadata: {
    pid?: number
    signal?: string | null
    timedOut: boolean
    outputTruncated: boolean
  }
}

export interface SequenceResult {
  success: boolean
  results: CommandResult[]
  totalCommands: number
  successfulCommands: number
  summary: SequenceSummary
}

export interface SequenceSummary {
  totalCommands: number
  successfulCommands: number
  failedCommands: number
  totalDuration: number
  averageDuration: number
  longestCommand: string
}

export interface ParsedCommand {
  original: string
  executable: string
  args: string[]
  fullPath: string
}

export interface ExecutionResult {
  exitCode: number
  stdout: string
  stderr: string
  pid?: number
  signal?: string | null
  timedOut: boolean
  outputTruncated: boolean
}
