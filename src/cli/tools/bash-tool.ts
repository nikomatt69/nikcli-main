import { type ChildProcess, spawn } from 'node:child_process'
import { PromptManager } from '../prompts/prompt-manager'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'

/**
 * Enhanced BashTool - Esecuzione sicura comandi con whitelist e timeout
 * Basato su esempi con parsing AST e permission system
 */

export interface BashToolParams {
  command: string
  timeout?: number
  description?: string
  // Enterprise/bash options
  interactive?: boolean
  stream?: boolean
  loginShell?: boolean
  envInherit?: boolean
  retries?: number
  backoffMs?: number
  safeMode?: boolean
  environment?: Record<string, string>
  allowDangerous?: boolean
  // Cognitive pipeline
  cognitive?: boolean
  cognitiveContext?: any
}

export interface BashResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
  executionTime: number
  workingDirectory: string
  timedOut: boolean
  killed: boolean
  shell?: string
  pid?: number
  streamed?: boolean
  startTime?: number
  endTime?: number
  cognitive?: {
    intent?: string
    confidence?: number
    risks?: string[]
    suggestions?: string[]
    notes?: string
  }
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

const MAX_OUTPUT_LENGTH = 30000
const DEFAULT_TIMEOUT = 60000 // 1 minuto
const MAX_TIMEOUT = 600000 // 10 minuti

export class BashTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('bash-tool', workingDirectory)
  }

  async execute(params: BashToolParams): Promise<ToolExecutionResult> {
    try {
      // Carica prompt specifico per questo tool
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'bash-tool',
        parameters: params,
      })

      CliUI.logDebug(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)

      if (!params.command) {
        throw new Error('Command is required')
      }

      // Enterprise preflight + approval wrapper
      const result = await this.runWithEnterpriseGuard({
        operationType: 'exec',
        parameters: params,
        preflight: () => {
          const { SafetyAnalyzer } = require('./safety-analyzer')
          const report = SafetyAnalyzer.preflightCommand({
            toolName: this.name,
            operationType: 'exec',
            command: params.command,
            workingDirectory: this.workingDirectory,
          })
          return report
        },
        action: async () => {
          // Validazione sicurezza comando (legacy local checks)
          const allowDangerous = params.safeMode ? false : (params.allowDangerous || false)
          await this.validateCommandSafety(params.command, allowDangerous)

          const timeout = Math.min(params.timeout || DEFAULT_TIMEOUT, MAX_TIMEOUT)
          const workingDir = this.workingDirectory
          const interactive = !!params.interactive
          const stream = !!params.stream
          const loginShell = !!params.loginShell
          const envInherit = params.envInherit !== false
          const retries = Math.max(0, Math.min(params.retries ?? 0, 10))
          const baseBackoff = Math.max(0, params.backoffMs ?? 500)

          // Validazione working directory
          if (!this.isPathSafe(workingDir)) {
            throw new Error(`Working directory not safe: ${workingDir}`)
          }

          CliUI.logInfo(`🔧 Executing command: ${CliUI.highlight(params.command)}`)
          if (params.description) {
            CliUI.logInfo(`📝 Description: ${params.description}`)
          }

          const startOverall = Date.now()
          let attempt = 0
          let lastResult: BashResult | null = null
          let lastError: any = null

          while (attempt <= retries) {
            if (attempt > 0) {
              const delay = baseBackoff * Math.pow(2, attempt - 1)
              CliUI.logInfo(`⏳ Retry ${attempt}/${retries} in ${delay}ms`)
              await new Promise((r) => setTimeout(r, delay))
            }

            try {
              const result = await this.executeCommand(params.command, {
                timeout,
                workingDirectory: workingDir,
                environment: envInherit ? { ...params.environment } : { ...params.environment },
                interactive,
                stream,
                loginShell,
                safeMode: !!params.safeMode,
              })
              lastResult = result
              lastError = null
              break
            } catch (err: any) {
              lastError = err
              attempt += 1
              if (attempt > retries) break
            }
          }

          const result = lastResult
          if (!result && lastError) throw lastError
          if (!result) throw new Error('Unknown bash execution failure')

          if (result.exitCode === 0) {
            CliUI.logSuccess(`✓ Command completed successfully (${result.executionTime}ms)`)
          } else {
            CliUI.logWarning(`⚠️ Command exited with code ${result.exitCode}`)
          }

          // Cognitive (lightweight) analysis summary
          if (params.cognitive !== false) {
            const risks: string[] = []
            for (const p of DANGEROUS_PATTERNS) if (p.test(params.command)) risks.push(p.toString())
            const intent = params.command.trim().split(/\s+/)[0]
            result.cognitive = {
              intent,
              confidence: 0.7,
              risks,
              suggestions: risks.length ? ['Review risky patterns or run in safeMode'] : [],
              notes: typeof params.cognitiveContext === 'string' ? params.cognitiveContext : undefined,
            }
          }

          return {
            success: result.exitCode === 0,
            data: result,
            metadata: {
              executionTime: Date.now() - startOverall,
              toolName: this.name,
              parameters: params,
            },
          }
        },
        enterpriseOptions: {
          requireApproval: true,
          approveForSession: params.safeMode ? false : true,
          approvalScope: 'tool+opType',
          riskMax: 'high',
        },
      })

      return result
    } catch (error: any) {
      CliUI.logError(`Bash tool failed: ${error.message}`)
      return {
        success: false,
        error: error.message,
        data: null,
        metadata: {
          executionTime: 0,
          toolName: this.name,
          parameters: params,
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
      CliUI.logWarning(`⚠️ Executing dangerous command: ${commandWithoutPath}`)
    }

    // Verifica pattern pericolosi
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        if (!allowDangerous) {
          throw new Error(`Dangerous pattern detected in command: ${pattern}. Use allowDangerous=true to override.`)
        }
        CliUI.logWarning(`⚠️ Dangerous pattern detected: ${pattern}`)
      }
    }

    // Verifica se comando è in whitelist (solo se non pericoloso)
    if (!SAFE_COMMANDS.includes(commandWithoutPath) && !allowDangerous) {
      CliUI.logWarning(
        `Command '${commandWithoutPath}' not in safe whitelist. Consider adding to SAFE_COMMANDS if appropriate.`
      )
    }

    // Validazioni aggiuntive
    if (command.includes('..')) {
      throw new Error('Directory traversal not allowed in commands')
    }

    if (command.length > 1000) {
      throw new Error('Command too long (max 1000 characters)')
    }
  }

  /**
   * Esegue il comando con timeout e monitoring
   */
  private async executeCommand(
    command: string,
    options: {
      timeout: number
      workingDirectory: string
      environment?: Record<string, string>
      interactive?: boolean
      stream?: boolean
      loginShell?: boolean
      safeMode?: boolean
    }
  ): Promise<BashResult> {
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
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

      // Spawn processo (login shell if requested)
      const bashArgs = options.loginShell ? ['-lc', command] : ['-c', command]
      const stdio = options.interactive ? 'inherit' : ['ignore', 'pipe', 'pipe']
      const child: ChildProcess = spawn('bash', bashArgs, {
        cwd: options.workingDirectory,
        env,
        stdio: stdio as any,
      })

      // Setup timeout
      const timeoutHandle = setTimeout(() => {
        timedOut = true
        killed = true
        child.kill('SIGTERM')

        // Force kill dopo 5 secondi
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 5000)
      }, options.timeout)

      // Gestione output
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          const chunk = data.toString()
          stdout += chunk
          if (options.stream) {
            CliUI.logInfo(chunk)
          }
          // Limita output per evitare memory overflow
          if (stdout.length > MAX_OUTPUT_LENGTH) {
            stdout = `${stdout.substring(0, MAX_OUTPUT_LENGTH)}\n... [output truncated]`
            child.kill('SIGTERM')
          }
        })
      }

      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()

          if (stderr.length > MAX_OUTPUT_LENGTH) {
            stderr = `${stderr.substring(0, MAX_OUTPUT_LENGTH)}\n... [error output truncated]`
          }
        })
      }

      // Gestione completamento
      child.on('close', (exitCode: number | null) => {
        clearTimeout(timeoutHandle)

        const executionTime = Date.now() - startTime

        const result: BashResult = {
          command,
          exitCode: exitCode || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          executionTime,
          workingDirectory: options.workingDirectory,
          timedOut,
          killed,
          shell: options.loginShell ? 'bash -l -c' : 'bash -c',
          pid: child.pid || undefined,
          streamed: !!options.stream,
          startTime: startTime,
          endTime: Date.now(),
        }

        if (timedOut) {
          result.stderr += `\nCommand timed out after ${options.timeout}ms`
        }

        resolve(result)
      })

      // Gestione errori
      child.on('error', (error: Error) => {
        clearTimeout(timeoutHandle)
        reject(new Error(`Failed to execute command: ${error.message}`))
      })

      // Log processo avviato
      CliUI.logDebug(`Started process PID: ${child.pid}`)
    })
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
