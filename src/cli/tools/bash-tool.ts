import { z } from 'zod'
import { PromptManager } from '../prompts/prompt-manager'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import { readStreamWithLimit } from '../utils/bun-compat'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { prometheusExporter } from '../monitoring'
import {
  resolveShellConfig,
  type ShellConfiguration,
  SUPPORTED_SHELL_NAMES,
  type SupportedShellName,
} from './shell-support'

const MAX_OUTPUT_LENGTH = 30000
const DEFAULT_TIMEOUT = 60000 // 1 minuto
const MAX_TIMEOUT = 600000 // 10 minuti

/**
 * Enhanced BashTool - Esecuzione sicura comandi con whitelist e timeout
 * Basato su esempi con parsing AST e permission system
 */

const bashToolParamsSchema = z.object({
  command: z.string().trim().min(1, 'Command is required').max(1000).describe('The shell command to execute'),
  timeout: z.number().int().positive().max(MAX_TIMEOUT).optional().describe('Command timeout in milliseconds (max 10 minutes)'),
  description: z.string().trim().max(500).optional().describe('Human-readable description of what this command does'),
  workingDirectory: z.string().trim().min(1).optional().describe('Working directory for command execution'),
  environment: z.record(z.string()).optional().describe('Environment variables to set for this command'),
  allowDangerous: z.boolean().optional().describe('Allow execution of potentially dangerous commands (rm, chmod, etc.)'),
  shell: z.enum(SUPPORTED_SHELL_NAMES).optional().describe('Shell to use (bash, zsh, fish, sh, powershell, cmd)'),
})

export type BashToolParams = z.infer<typeof bashToolParamsSchema>

export interface BashResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  executionTime: number
  workingDirectory: string
  timedOut: boolean
  killed: boolean
  shell: SupportedShellName
}

// Whitelist comandi sicuri
const SAFE_COMMANDS = [
  'ls',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'wc',
  'sort',
  'uniq',
  'echo',
  'pwd',
  'whoami',
  'date',
  'which',
  'type',
  'npm',
  'yarn',
  'node',
  'python',
  'python3',
  'pip',
  'pip3',
  'git',
  'docker',
  'kubectl',
  'mkdir',
  'cp',
  'mv',
  'touch',
  'curl',
  'wget',
  'ping',
  'nslookup',
  'ps',
  'top',
  'df',
  'du',
  'free',
  'uptime',
]

// Comandi pericolosi vietati
const DANGEROUS_COMMANDS = [
  'rm',
  'rmdir',
  'dd',
  'mkfs',
  'fdisk',
  'sudo',
  'su',
  'chmod',
  'chown',
  'chgrp',
  'kill',
  'killall',
  'pkill',
  'reboot',
  'shutdown',
  'halt',
  'poweroff',
  'format',
  'del',
  'erase',
]

// Pattern pericolosi negli argomenti
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  />\s*\/dev\/null/i,
  /;\s*rm/i,
  /&&\s*rm/i,
  /\|\s*rm/i,
  /eval\s+/i,
  /exec\s+/i,
  /\/etc\/passwd/i,
  /\/etc\/shadow/i,
]

export class BashTool extends BaseTool {
  constructor(workingDirectory: string = process.cwd()) {
    super('bash-tool', workingDirectory)
  }

  async execute(params: BashToolParams): Promise<ToolExecutionResult> {
    let parsedParams: BashToolParams

    try {
      parsedParams = bashToolParamsSchema.parse(params)
    } catch (error: any) {
      const message = error instanceof Error ? error.message : 'Invalid parameters for bash tool'
      CliUI.logError(`Bash tool parameter validation failed: ${message}`)
      return {
        success: false,
        error: message,
        data: null,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      // Carica prompt specifico per questo tool
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'bash-tool',
        parameters: parsedParams,
      })

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      // Validazione sicurezza comando
      await this.validateCommandSafety(parsedParams.command, parsedParams.allowDangerous || false)

      const timeout = Math.min(parsedParams.timeout ?? DEFAULT_TIMEOUT, MAX_TIMEOUT)
      const workingDir = parsedParams.workingDirectory || this.workingDirectory
      const shellConfig = resolveShellConfig(parsedParams.shell)

      // Validazione working directory
      if (!this.isPathSafe(workingDir)) {
        throw new Error(`Working directory not safe: ${workingDir}`)
      }

      advancedUI.logInfo(`🔧 Executing command: ${CliUI.highlight(parsedParams.command)}`)
      if (parsedParams.description) {
        advancedUI.logInfo(`📝 Description: ${parsedParams.description}`)
      }
      CliUI.logDebug(`Shell selected for execution: ${shellConfig.displayName} (${shellConfig.executable})`)

      const result = await this.executeCommand(parsedParams.command, {
        timeout,
        workingDirectory: workingDir,
        environment: parsedParams.environment,
        shell: shellConfig,
      })

      if (result.exitCode === 0) {
        advancedUI.logSuccess(`✓ Command completed successfully (${result.executionTime}ms)`)
      } else {
        advancedUI.logWarning(`⚠︎ Command exited with code ${result.exitCode}`)
      }

      return {
        success: result.exitCode === 0,
        data: result,
        metadata: {
          executionTime: result.executionTime,
          toolName: this.name,
          parameters: {
            ...parsedParams,
            workingDirectory: workingDir,
            shell: shellConfig.name,
          },
        },
      }
    } catch (error: any) {
      CliUI.logError(`Bash tool failed: ${error.message}`)
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: parsedParams ?? params,
        },
      }
    }
  }

  /**
   * Valida la sicurezza del comando
   */
  private async validateCommandSafety(command: string, allowDangerous: boolean): Promise<void> {
    const commandLower = command.toLowerCase().trim()

    // Estrai comando principale
    const mainCommand = commandLower.split(/\s+/)[0]
    const commandWithoutPath = mainCommand.split('/').pop() || mainCommand

    // Verifica comandi pericolosi
    if (DANGEROUS_COMMANDS.includes(commandWithoutPath)) {
      if (!allowDangerous) {
        throw new Error(`Dangerous command not allowed: ${commandWithoutPath}. Use allowDangerous=true to override.`)
      }
      advancedUI.logWarning(`⚠︎ Executing dangerous command: ${commandWithoutPath}`)
    }

    // Verifica pattern pericolosi
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        if (!allowDangerous) {
          throw new Error(`Dangerous pattern detected in command: ${pattern}. Use allowDangerous=true to override.`)
        }
        advancedUI.logWarning(`⚠︎ Dangerous pattern detected: ${pattern}`)
      }
    }

    // Verifica se comando è in whitelist (solo se non pericoloso)
    if (!SAFE_COMMANDS.includes(commandWithoutPath) && !allowDangerous) {
      advancedUI.logWarning(
        `Command '${commandWithoutPath}' not in safe whitelist. Consider adding to SAFE_COMMANDS if appropriate.`
      )
    }

    // Validazioni aggiuntive
    const traversalPattern = /(^|[\s'"`])\.\.(\/|\\|\s|$)/
    if (traversalPattern.test(command)) {
      throw new Error('Directory traversal not allowed in commands')
    }

    if (command.length > 1000) {
      throw new Error('Command too long (max 1000 characters)')
    }
  }

  /**
   * Esegue il comando con Bun.spawn (5-10x più veloce di child_process)
   */
  private async executeCommand(
    command: string,
    options: {
      timeout: number
      workingDirectory: string
      environment?: Record<string, string>
      shell: ShellConfiguration
    }
  ): Promise<BashResult> {
    const startTime = Date.now()

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let killed = false

    // Prepara environment
    const env = {
      ...process.env,
      ...options.environment,
      PWD: options.workingDirectory,
    }

    // Setup AbortController per timeout (Bun-native)
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => {
      timedOut = true
      killed = true
      controller.abort()
    }, options.timeout)

    try {
      // Bun.spawn con streaming output (molto più veloce di child_process)
      const proc = Bun.spawn({
        cmd: [options.shell.executable, ...options.shell.args, command],
        cwd: options.workingDirectory,
        env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      })

      // Leggi stdout e stderr in parallelo usando Web Streams
      const [stdoutResult, stderrResult] = await Promise.all([
        readStreamWithLimit(proc.stdout, MAX_OUTPUT_LENGTH, '\n... [output truncated]'),
        readStreamWithLimit(proc.stderr, MAX_OUTPUT_LENGTH, '\n... [error output truncated]'),
      ])

      stdout = stdoutResult
      stderr = stderrResult

      // Check if aborted during stream reading
      if (controller.signal.aborted) {
        proc.kill()
        timedOut = true
        killed = true
      }

      // Attendi completamento
      const exitCode = await proc.exited

      clearTimeout(timeoutHandle)

      const executionTime = Date.now() - startTime
      const statusLabel = timedOut ? 'timeout' : exitCode === 0 ? 'success' : 'error'

      prometheusExporter.bunSpawnDuration.observe(
        { source: 'bash-tool', status: statusLabel },
        executionTime / 1000
      )

      return {
        command,
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        executionTime,
        workingDirectory: options.workingDirectory,
        timedOut,
        killed,
        shell: options.shell.name,
      }

    } catch (error: any) {
      clearTimeout(timeoutHandle)

      if (error.name === 'AbortError' || controller.signal.aborted) {
        // Timeout triggered
        prometheusExporter.bunSpawnDuration.observe(
          { source: 'bash-tool', status: 'timeout' },
          (Date.now() - startTime) / 1000
        )
        return {
          command,
          exitCode: -1,
          stdout: stdout.trim(),
          stderr: (stderr.trim() + `\nCommand timed out after ${options.timeout}ms`).trim(),
          executionTime: Date.now() - startTime,
          workingDirectory: options.workingDirectory,
          timedOut: true,
          killed: true,
          shell: options.shell.name,
        }
      }

      prometheusExporter.bunSpawnDuration.observe(
        { source: 'bash-tool', status: 'error' },
        (Date.now() - startTime) / 1000
      )
      throw new Error(`Failed to execute command: ${error.message}`)
    }
  }

  /**
   * Lista comandi sicuri disponibili
   */
  static getSafeCommands(): string[] {
    return [...SAFE_COMMANDS]
  }

  /**
   * Lista comandi pericolosi vietati
   */
  static getDangerousCommands(): string[] {
    return [...DANGEROUS_COMMANDS]
  }

  /**
   * Verifica se un comando è considerato sicuro
   */
  static isCommandSafe(command: string): boolean {
    const commandLower = command.toLowerCase().trim()
    const mainCommand = commandLower.split(/\s+/)[0]
    const commandWithoutPath = mainCommand.split('/').pop() || mainCommand

    // Verifica se è in blacklist
    if (DANGEROUS_COMMANDS.includes(commandWithoutPath)) {
      return false
    }

    // Verifica pattern pericolosi
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return false
      }
    }

    // Verifica se è in whitelist
    return SAFE_COMMANDS.includes(commandWithoutPath)
  }
}
