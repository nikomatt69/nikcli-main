import { exec } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import * as path from 'node:path'
import { promisify } from 'node:util'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { inputQueue } from '../core/input-queue'

const execAsync = promisify(exec)

/**
 * Safe commands that can be executed without user confirmation
 */
const SAFE_COMMANDS = new Set([
  'ls',
  'dir',
  'pwd',
  'whoami',
  'date',
  'echo',
  'cat',
  'head',
  'tail',
  'grep',
  'find',
  'which',
  'type',
  'node',
  'npm',
  'yarn',
  'pnpm',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git remote',
  'docker ps',
  'docker images',
  'docker version',
  'ps',
  'top',
  'df',
  'free',
  'uptime',
  'uname',
])

/**
 * Commands that should never be executed automatically
 */
const DANGEROUS_COMMANDS = new Set([
  'rm',
  'del',
  'rmdir',
  'mv',
  'cp',
  'chmod',
  'chown',
  'sudo',
  'curl',
  'wget',
  'ssh',
  'scp',
  'rsync',
  'dd',
  'fdisk',
  'format',
  'mkfs',
  'mount',
  'umount',
  'kill',
  'killall',
  'systemctl',
  'service',
  'crontab',
  'at',
  'batch',
])

/**
 * Result of command execution
 */
export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
  command: string
  duration: number
  safe: boolean
}

/**
 * Options for command execution
 */
export interface CommandOptions {
  cwd?: string
  timeout?: number
  env?: Record<string, string>
  skipConfirmation?: boolean
  allowDangerous?: boolean
}

/**
 * Batch execution session for one-time approval
 */
export interface BatchSession {
  id: string
  commands: string[]
  approved: boolean
  createdAt: Date
  expiresAt: Date
  results: CommandResult[]
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'expired'
  onProgress?: (command: string, index: number, total: number) => void
  onComplete?: (results: CommandResult[]) => void
  onError?: (error: Error, command: string, index: number) => void
}

/**
 * Secure command execution tool with allow-listing and user confirmation
 */
export class SecureCommandTool {
  private workingDirectory: string
  private commandHistory: Array<{
    command: string
    timestamp: Date
    success: boolean
    duration: number
  }> = []
  private batchSessions: Map<string, BatchSession> = new Map()

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || process.cwd()
  }

  /**
   * Check if a command is considered safe for automatic execution
   */
  private isSafeCommand(command: string): boolean {
    const baseCommand = command.trim().split(' ')[0]
    const fullCommand = command.trim()

    // Check if the base command or full command is in the safe list
    return SAFE_COMMANDS.has(baseCommand) || SAFE_COMMANDS.has(fullCommand)
  }

  /**
   * Check if a command is considered dangerous and should be blocked
   */
  private isDangerousCommand(command: string): boolean {
    const baseCommand = command.trim().split(' ')[0]
    return DANGEROUS_COMMANDS.has(baseCommand)
  }

  /**
   * Analyze command for potential security risks
   */
  private analyzeCommand(command: string): {
    safe: boolean
    dangerous: boolean
    risks: string[]
    suggestions: string[]
  } {
    const risks: string[] = []
    const suggestions: string[] = []

    const safe = this.isSafeCommand(command)
    const dangerous = this.isDangerousCommand(command)

    // Check for common risky patterns
    if (command.includes('rm -rf')) {
      risks.push('Recursive file deletion detected')
      suggestions.push('Consider using a more specific path or --interactive flag')
    }

    if (command.includes('sudo')) {
      risks.push('Elevated privileges requested')
      suggestions.push('Ensure you trust this command completely')
    }

    if (command.includes('curl') || command.includes('wget')) {
      risks.push('Network request detected')
      suggestions.push("Verify the URL and ensure it's from a trusted source")
    }

    if (command.includes('|') && command.includes('sh')) {
      risks.push('Potential pipe to shell execution')
      suggestions.push('Review the entire pipeline for security')
    }

    if (command.includes('$(') || command.includes('`')) {
      risks.push('Command substitution detected')
      suggestions.push('Verify all substituted commands are safe')
    }

    return { safe, dangerous, risks, suggestions }
  }

  /**
   * Create a batch session for one-time approval of multiple commands
   */
  async createBatchSession(
    commands: string[],
    options: {
      sessionDuration?: number // minutes, default 30
      allowDangerous?: boolean
      onProgress?: (command: string, index: number, total: number) => void
      onComplete?: (results: CommandResult[]) => void
      onError?: (error: Error, command: string, index: number) => void
    } = {}
  ): Promise<BatchSession> {
    const sessionId = `batch_${Date.now()}_${randomBytes(6).toString('base64url')}`
    const sessionDuration = options.sessionDuration || 30 // 30 minutes default
    const expiresAt = new Date(Date.now() + sessionDuration * 60 * 1000)

    console.log(chalk.blue.bold('\n🔄 Creating Batch Execution Session'))
    console.log(chalk.gray(`Session ID: ${sessionId}`))
    console.log(chalk.gray(`Commands: ${commands.length}`))
    console.log(chalk.gray(`Expires: ${expiresAt.toLocaleTimeString()}`))

    // Analyze all commands for security
    const analyses = commands.map((cmd) => ({ command: cmd, analysis: this.analyzeCommand(cmd) }))
    const dangerousCommands = analyses.filter((a) => a.analysis.dangerous)
    const riskyCommands = analyses.filter((a) => a.analysis.risks.length > 0)

    // Show security summary
    console.log(chalk.blue('\n📋 Batch Security Analysis:'))
    console.log(chalk.gray('─'.repeat(50)))

    commands.forEach((cmd, index) => {
      const analysis = analyses[index].analysis
      const icon = analysis.safe ? '✅' : analysis.dangerous ? '🚫' : '⚠️'
      const color = analysis.safe ? chalk.green : analysis.dangerous ? chalk.red : chalk.yellow
      console.log(color(`${icon} ${index + 1}. ${cmd}`))

      if (analysis.risks.length > 0) {
        analysis.risks.forEach((risk) => {
          console.log(chalk.gray(`     • ${risk}`))
        })
      }
    })

    // Block if dangerous commands present and not explicitly allowed
    if (dangerousCommands.length > 0 && !options.allowDangerous) {
      console.log(chalk.red(`\n🚫 Batch contains ${dangerousCommands.length} dangerous command(s)`))
      dangerousCommands.forEach(({ command }) => {
        console.log(chalk.red(`   • ${command}`))
      })
      throw new Error('Batch contains dangerous commands. Use allowDangerous: true to override.')
    }

    // Show warnings for risky commands
    if (riskyCommands.length > 0) {
      console.log(chalk.yellow(`\n⚠️  ${riskyCommands.length} command(s) have security risks`))
    }

    // Request one-time approval for the entire batch
    console.log(chalk.blue('\n🔐 One-Time Batch Approval'))
    console.log(chalk.gray('Once approved, all commands will execute asynchronously without further confirmation.'))

    // Suspend main prompt and enable bypass for interactive approval
    try { (global as any).__nikCLI?.suspendPrompt?.() } catch {}
    inputQueue.enableBypass()
    try {
      const { approved } = await inquirer.prompt([
        {
          type: 'list',
          name: 'approved',
          message: `Approve batch execution of ${commands.length} commands?`,
          choices: [
            { name: 'Yes', value: true },
            { name: 'No', value: false },
          ],
          default: 1,
        },
      ])

      const session: BatchSession = {
        id: sessionId,
        commands,
        approved,
        createdAt: new Date(),
        expiresAt,
        results: [],
        status: approved ? 'approved' : 'pending',
        onProgress: options.onProgress,
        onComplete: options.onComplete,
        onError: options.onError,
      }

      this.batchSessions.set(sessionId, session)

      if (approved) {
        console.log(chalk.green(`✅ Batch approved! Session ID: ${sessionId}`))
      } else {
        console.log(chalk.red('❌ Batch execution cancelled by user'))
      }

      return session
    } finally {
      inputQueue.disableBypass()
      // Proactively resume CLI prompt after approval interaction
      try { (global as any).__nikCLI?.resumePromptAndRender?.() } catch {}
    }
  }

  /**
   * Execute a batch session asynchronously
   */
  async executeBatchAsync(sessionId: string, options: CommandOptions = {}): Promise<void> {
    const session = this.batchSessions.get(sessionId)

    if (!session) {
      throw new Error(`Batch session not found: ${sessionId}`)
    }

    if (!session.approved) {
      throw new Error(`Batch session not approved: ${sessionId}`)
    }

    if (new Date() > session.expiresAt) {
      session.status = 'expired'
      throw new Error(`Batch session expired: ${sessionId}`)
    }

    if (session.status === 'executing') {
      console.log(chalk.yellow(`⚠️  Batch session already executing: ${sessionId}`))
      return
    }

    session.status = 'executing'
    console.log(chalk.blue.bold(`\n🚀 Starting Async Batch Execution: ${sessionId}`))
    console.log(chalk.gray(`Commands: ${session.commands.length}`))

    // Execute commands asynchronously
    setImmediate(async () => {
      try {
        for (let i = 0; i < session.commands.length; i++) {
          const command = session.commands[i]

          // Progress callback
          session.onProgress?.(command, i + 1, session.commands.length)
          console.log(chalk.blue(`[${i + 1}/${session.commands.length}] Executing: ${command}`))

          try {
            const result = await this.execute(command, { ...options, skipConfirmation: true })
            session.results.push(result)

            console.log(chalk.green(`✅ [${i + 1}/${session.commands.length}] Completed: ${command}`))

            // Stop on first failure unless continuing
            if (result.exitCode !== 0) {
              console.log(chalk.red(`❌ Command failed, stopping batch execution`))
              session.status = 'failed'
              session.onError?.(new Error(`Command failed: ${command}`), command, i)
              return
            }
          } catch (error: any) {
            console.log(chalk.red(`❌ [${i + 1}/${session.commands.length}] Failed: ${command}`))
            console.log(chalk.red(`Error: ${error.message}`))

            session.status = 'failed'
            session.onError?.(error, command, i)
            return
          }
        }

        session.status = 'completed'
        console.log(chalk.green.bold(`\n✅ Batch Execution Complete: ${sessionId}`))
        console.log(chalk.gray(`Executed: ${session.results.length}/${session.commands.length} commands`))

        // Completion callback
        session.onComplete?.(session.results)
      } catch (error: any) {
        session.status = 'failed'
        console.log(chalk.red.bold(`\n❌ Batch Execution Failed: ${sessionId}`))
        console.log(chalk.red(`Error: ${error.message}`))
      }
    })

    console.log(chalk.blue('⏳ Batch execution started in background...'))
  }

  /**
   * Get batch session status
   */
  getBatchSession(sessionId: string): BatchSession | undefined {
    return this.batchSessions.get(sessionId)
  }

  /**
   * List all batch sessions
   */
  listBatchSessions(): BatchSession[] {
    return Array.from(this.batchSessions.values())
  }

  /**
   * Clean up expired batch sessions
   */
  cleanupExpiredSessions(): number {
    const now = new Date()
    let cleaned = 0

    for (const [sessionId, session] of Array.from(this.batchSessions.entries())) {
      if (now > session.expiresAt) {
        this.batchSessions.delete(sessionId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(chalk.gray(`🧹 Cleaned up ${cleaned} expired batch session(s)`))
    }

    return cleaned
  }

  /**
   * Execute a command with security checks and user confirmation
   */
  async execute(command: string, options: CommandOptions = {}): Promise<CommandResult> {
    const startTime = Date.now()
    const analysis = this.analyzeCommand(command)

    console.log(chalk.blue(`🔍 Analyzing command: ${command}`))

    // Block dangerous commands unless explicitly allowed
    if (analysis.dangerous && !options.allowDangerous) {
      const error = `Dangerous command blocked: ${command}`
      console.log(chalk.red(`🚫 ${error}`))
      throw new Error(error)
    }

    // Show security analysis if there are risks
    if (analysis.risks.length > 0) {
      console.log(chalk.yellow('\n⚠️  Security Analysis:'))
      analysis.risks.forEach((risk) => {
        console.log(chalk.yellow(`  • ${risk}`))
      })

      if (analysis.suggestions.length > 0) {
        console.log(chalk.blue('\n💡 Suggestions:'))
        analysis.suggestions.forEach((suggestion) => {
          console.log(chalk.blue(`  • ${suggestion}`))
        })
      }
    }

    // Request user confirmation for non-safe commands
    if (!analysis.safe && !options.skipConfirmation) {
      console.log(chalk.yellow(`\n⚠️  Command requires confirmation: ${command}`))

      try { (global as any).__nikCLI?.suspendPrompt?.() } catch {}
      inputQueue.enableBypass()
      try {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'list',
            name: 'confirmed',
            message: 'Execute this command?',
            choices: [
              { name: 'Yes', value: true },
              { name: 'No', value: false },
            ],
            default: 1,
          },
        ])

        if (!confirmed) {
          console.log(chalk.yellow('✋ Command execution cancelled by user'))
          throw new Error('Command execution cancelled by user')
        }
      } finally {
        inputQueue.disableBypass()
        try { (global as any).__nikCLI?.resumePromptAndRender?.() } catch {}
      }
    }

    try {
      const cwd = options.cwd ? path.resolve(this.workingDirectory, options.cwd) : this.workingDirectory
      const env = { ...process.env, ...options.env }
      const timeout = options.timeout || 30000 // 30 second default timeout

      console.log(chalk.blue(`⚡ Executing: ${command}`))
      console.log(chalk.gray(`📁 Working directory: ${cwd}`))

      const { stdout, stderr } = await execAsync(command, {
        cwd,
        env,
        timeout,
        encoding: 'utf8',
      })

      const duration = Date.now() - startTime
      const success = true

      // Add to history
      this.commandHistory.push({
        command,
        timestamp: new Date(),
        success,
        duration,
      })

      console.log(chalk.green(`✅ Command completed in ${duration}ms`))

      if (stdout) {
        console.log(chalk.white('📤 Output:'))
        console.log(stdout)
      }

      if (stderr) {
        console.log(chalk.yellow('⚠️  Warnings:'))
        console.log(stderr)
      }

      return {
        stdout,
        stderr,
        exitCode: 0,
        command,
        duration,
        safe: analysis.safe,
      }
    } catch (error: any) {
      const duration = Date.now() - startTime

      // Add to history
      this.commandHistory.push({
        command,
        timestamp: new Date(),
        success: false,
        duration,
      })

      console.log(chalk.red(`❌ Command failed after ${duration}ms`))
      console.log(chalk.red(`Error: ${error.message}`))

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        command,
        duration,
        safe: analysis.safe,
      }
    }
  }

  /**
   * Execute multiple commands in sequence with confirmation
   */
  async executeSequence(commands: string[], options: CommandOptions = {}): Promise<CommandResult[]> {
    console.log(chalk.blue(`📋 Executing ${commands.length} commands in sequence`))

    // Show all commands for review
    console.log(chalk.blue('\nCommands to execute:'))
    commands.forEach((cmd, index) => {
      console.log(chalk.gray(`  ${index + 1}. ${cmd}`))
    })

    if (!options.skipConfirmation) {
      try { (global as any).__nikCLI?.suspendPrompt?.() } catch {}
      inputQueue.enableBypass()
      try {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'list',
            name: 'confirmed',
            message: 'Execute all commands?',
            choices: [
              { name: 'Yes', value: true },
              { name: 'No', value: false },
            ],
            default: 1,
          },
        ])

        if (!confirmed) {
          console.log(chalk.yellow('✋ Command sequence cancelled by user'))
          throw new Error('Command sequence cancelled by user')
        }
      } finally {
        inputQueue.disableBypass()
        try { (global as any).__nikCLI?.resumePromptAndRender?.() } catch {}
      }
    }

    const results: CommandResult[] = []

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]
      console.log(chalk.blue(`\n[${i + 1}/${commands.length}] ${command}`))

      try {
        const result = await this.execute(command, { ...options, skipConfirmation: true })
        results.push(result)

        // Stop on first failure unless explicitly continuing
        if (result.exitCode !== 0) {
          console.log(chalk.red(`❌ Command ${i + 1} failed, stopping sequence`))
          break
        }
      } catch (error) {
        console.log(chalk.red(`❌ Command ${i + 1} failed: ${error}`))
        break
      }
    }

    return results
  }

  /**
   * Get command execution history
   */
  getHistory(limit?: number): Array<{
    command: string
    timestamp: Date
    success: boolean
    duration: number
  }> {
    const history = this.commandHistory.slice().reverse()
    return limit ? history.slice(0, limit) : history
  }

  /**
   * Add a command to the safe list (runtime only)
   */
  addSafeCommand(command: string): void {
    SAFE_COMMANDS.add(command)
    console.log(chalk.green(`✅ Added to safe commands: ${command}`))
  }

  /**
   * Check if a command would be safe to execute
   */
  checkCommand(command: string): {
    safe: boolean
    analysis: {
      safe: boolean
      dangerous: boolean
      risks: string[]
      suggestions: string[]
    }
  } {
    const analysis = this.analyzeCommand(command)
    return { safe: analysis.safe, analysis }
  }
}
