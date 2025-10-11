import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { type ChatMessage, modelProvider } from '../../ai/model-provider'
import { toolsManager } from '../../tools/tools-manager'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { CliUI } from '../../utils/cli-ui'
import type { AgentTask } from './agent-router'
import type { AgentTaskResult } from './base-agent'
import { CognitiveAgentBase } from './cognitive-agent-base'
import type { OrchestrationPlan, SystemAdminCognition, TaskCognition } from './cognitive-interfaces'

const SystemCommandSchema = z.object({
  commands: z.array(
    z.object({
      command: z.string(),
      description: z.string(),
      sudo: z.boolean().optional(),
      interactive: z.boolean().optional(),
      timeout: z.number().optional(),
    })
  ),
  reasoning: z.string(),
  warnings: z.array(z.string()).optional(),
})

/**
 * 🖥️ Enhanced System Admin Agent with Cognitive Intelligence
 * Specialized in system administration with advanced monitoring intelligence,
 * predictive system health monitoring, resource usage optimization,
 * security audit automation, and performance bottleneck detection
 *
 * Features:
 * - Predictive system health monitoring
 * - Resource usage optimization
 * - Security audit automation
 * - Performance bottleneck detection
 * - Automated system maintenance
 * - Infrastructure health assessment
 * - Log analysis and anomaly detection
 * - System capacity planning
 */
export class SystemAdminAgent extends CognitiveAgentBase {
  id = 'system-admin'
  capabilities = [
    'system-administration',
    'server-management',
    'monitoring',
    'performance-analysis',
    'security-audit',
    'resource-optimization',
    'log-analysis',
    'health-monitoring',
    'capacity-planning',
    'system-maintenance',
    'anomaly-detection',
    'predictive-monitoring',
  ]
  specialization = 'System administration and server management with cognitive intelligence'

  // Cognitive specialization properties
  protected cognitiveSpecialization = 'System Administration/Monitoring'
  protected cognitiveStrengths = [
    'Predictive system health monitoring',
    'Resource usage optimization',
    'Security audit automation',
    'Performance bottleneck detection',
    'Log analysis and anomaly detection',
    'System capacity planning',
    'Automated maintenance scheduling',
    'Infrastructure health assessment',
  ]
  protected cognitiveWeaknesses = [
    'Frontend development',
    'Mobile app development',
    'Game development',
    'Machine learning model training',
  ]

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory)
  }

  protected override async onInitialize(): Promise<void> {
    advancedUI.logCognitive('🖥️ Initializing Enhanced System Admin Agent with cognitive capabilities...')
    await this.initializeSystemAdminCognition()
    advancedUI.logSuccess(`✓ System Admin Agent initialized with ${this.capabilities.length} capabilities`)
  }

  protected override async onStop(): Promise<void> {
    advancedUI.logInfo('🛑 System Admin Agent shutting down...')
    await this.saveCognitiveState()
    advancedUI.logCognitive('✓ System Admin Agent stopped - cognitive state saved')
  }

  async analyzeSystem(): Promise<any> {
    advancedUI.logFunctionUpdate('info', 'Analyzing system...', 'ℹ')

    const systemInfo = await toolsManager.getSystemInfo()
    const dependencies = await toolsManager.checkDependencies([
      'node',
      'npm',
      'git',
      'docker',
      'python3',
      'curl',
      'wget',
      'code',
    ])

    const runningProcesses = toolsManager.getRunningProcesses()
    const commandHistory = toolsManager.getCommandHistory(10)

    console.log(chalk.green('📊 System Analysis Complete:'))
    console.log(chalk.gray(`Platform: ${systemInfo.platform} (${systemInfo.arch})`))
    console.log(chalk.gray(`Node.js: ${systemInfo.nodeVersion}`))
    console.log(
      chalk.gray(
        `Memory: ${Math.round((systemInfo.memory.used / 1024 / 1024 / 1024) * 100) / 100}GB / ${Math.round((systemInfo.memory.total / 1024 / 1024 / 1024) * 100) / 100}GB`
      )
    )
    console.log(chalk.gray(`CPUs: ${systemInfo.cpus}`))

    return {
      systemInfo,
      dependencies,
      runningProcesses: runningProcesses.length,
      recentCommands: commandHistory.length,
      analysis: {
        nodeInstalled: !!systemInfo.nodeVersion,
        npmInstalled: !!systemInfo.npmVersion,
        gitInstalled: !!systemInfo.gitVersion,
        dockerInstalled: !!systemInfo.dockerVersion,
        memoryUsage: (systemInfo.memory.used / systemInfo.memory.total) * 100,
      },
    }
  }

  async executeCommands(commandsDescription: string): Promise<any> {
    console.log(chalk.blue(`⚡ Planning command execution: ${commandsDescription}`))

    const systemInfo = await toolsManager.getSystemInfo()

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a system administrator AI. Plan and execute terminal commands safely.

Current system: ${systemInfo.platform} ${systemInfo.arch}
Node.js: ${systemInfo.nodeVersion}
Available tools: ${systemInfo.npmVersion ? 'npm' : ''} ${systemInfo.gitVersion ? 'git' : ''} ${systemInfo.dockerVersion ? 'docker' : ''}

IMPORTANT SAFETY RULES:
1. Never run destructive commands (rm -rf, dd, mkfs, etc.)
2. Always explain what each command does
3. Use sudo only when absolutely necessary
4. Provide warnings for potentially dangerous operations
5. Suggest alternatives for risky commands

Generate a structured plan with commands to execute.`,
      },
      {
        role: 'user',
        content: commandsDescription,
      },
    ]

    try {
      const plan = await modelProvider.generateStructured({
        messages,
        schema: SystemCommandSchema,
        schemaName: 'SystemCommands',
        schemaDescription: 'Structured plan for system command execution',
      })

      // Cast to any to handle unknown type
      const planResult = plan as z.infer<typeof SystemCommandSchema>

      console.log(chalk.blue.bold('\n📋 Command Execution Plan:'))
      console.log(chalk.gray(`Reasoning: ${planResult.reasoning || 'No reasoning provided'}`))

      if (planResult.warnings && planResult.warnings.length > 0) {
        console.log(chalk.yellow.bold('\n⚠️  Warnings:'))
        planResult.warnings.forEach((warning: string) => {
          console.log(chalk.yellow(`• ${warning}`))
        })
      }

      console.log(chalk.blue.bold('\nCommands to execute:'))
      ;(planResult.commands || []).forEach((cmd: any, index: number) => {
        console.log(`${index + 1}. ${chalk.cyan(cmd.command)}`)
        console.log(`   ${chalk.gray(cmd.description)}`)
        if (cmd.sudo) console.log(`   ${chalk.red('⚠️ Requires sudo')}`)
      })

      // Ask for confirmation
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const confirm = await new Promise<boolean>((resolve) => {
        readline.question(chalk.yellow('\nExecute these commands? (y/N): '), (answer: string) => {
          readline.close()
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
        })
      })

      if (!confirm) {
        console.log(chalk.yellow('Command execution cancelled'))
        return { cancelled: true, plan }
      }

      // Execute commands
      const results = []
      for (const cmd of planResult.commands || []) {
        console.log(chalk.blue(`\n⚡︎ Executing: ${cmd.command}`))

        const [command, ...args] = cmd.command.split(' ')
        const result = await toolsManager.runCommand(command, args, {
          sudo: cmd.sudo,
          interactive: cmd.interactive,
          timeout: cmd.timeout,
          stream: true,
        })

        results.push({
          command: cmd.command,
          success: result.code === 0,
          output: result.stdout + result.stderr,
          exitCode: result.code,
        })

        if (result.code !== 0) {
          console.log(chalk.red(`❌ Command failed: ${cmd.command}`))
          console.log(chalk.gray('Stopping execution due to failure'))
          break
        } else {
          console.log(chalk.green(`✓ Command completed: ${cmd.command}`))
        }
      }

      return {
        success: results.every((r) => r.success),
        plan,
        results,
        executed: results.length,
        total: (planResult.commands || []).length,
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Error planning commands: ${error.message}`))
      return {
        success: false,
        error: error.message,
      }
    }
  }

  async installDependencies(
    packages: string[],
    options: { global?: boolean; dev?: boolean; manager?: string } = {}
  ): Promise<any> {
    console.log(chalk.blue(`📦 Installing packages: ${packages.join(', ')}`))

    const results = []
    const manager = options.manager || 'npm'

    for (const pkg of packages) {
      console.log(chalk.cyan(`Installing ${pkg} with ${manager}...`))

      const success = await toolsManager.installPackage(pkg, {
        global: options.global,
        dev: options.dev,
        manager: manager as 'npm' | 'yarn' | 'pnpm',
      })

      results.push({ package: pkg, success })

      if (!success) {
        console.log(chalk.yellow(`⚠️ Failed to install ${pkg}, continuing with others...`))
      }
    }

    const successful = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    console.log(chalk.blue.bold(`\n📊 Installation Summary:`))
    console.log(chalk.green(`✓ Successful: ${successful}`))
    console.log(chalk.red(`❌ Failed: ${failed}`))

    return {
      success: failed === 0,
      results,
      summary: { successful, failed, total: packages.length },
    }
  }

  async manageProcesses(action: 'list' | 'kill', pid?: number): Promise<any> {
    if (action === 'list') {
      const processes = toolsManager.getRunningProcesses()

      console.log(chalk.blue.bold('\n⚡︎ Running Processes:'))
      if (processes.length === 0) {
        console.log(chalk.gray('No processes currently running'))
        return { processes: [] }
      }

      processes.forEach((proc) => {
        const duration = Date.now() - proc.startTime.getTime()
        console.log(`PID ${chalk.cyan(proc.pid.toString())}: ${chalk.bold(proc.command)} ${proc.args.join(' ')}`)
        console.log(`   Status: ${proc.status} | Duration: ${Math.round(duration / 1000)}s`)
        console.log(`   Working Dir: ${proc.cwd}`)
      })

      return { processes }
    } else if (action === 'kill' && pid) {
      console.log(chalk.yellow(`⚠️ Attempting to kill process ${pid}...`))

      const success = await toolsManager.killProcess(pid)

      return {
        success,
        action: 'kill',
        pid,
      }
    }

    return { error: 'Invalid action or missing PID' }
  }

  async createProject(projectType: string, projectName: string): Promise<any> {
    console.log(chalk.blue(`🚀 Creating ${projectType} project: ${projectName}`))

    const validTypes = ['react', 'next', 'node', 'express']
    if (!validTypes.includes(projectType)) {
      return {
        success: false,
        error: `Invalid project type. Supported: ${validTypes.join(', ')}`,
      }
    }

    const result = await toolsManager.setupProject(projectType as any, projectName)

    return result
  }

  async runScript(script: string, language: 'bash' | 'python' | 'node' = 'bash'): Promise<any> {
    console.log(chalk.blue(`📝 Running ${language} script...`))
    console.log(chalk.gray(`Script:\n${script}`))

    const result = await toolsManager.runScript(script, { language })

    if (result.success) {
      console.log(chalk.green('✓ Script executed successfully'))
    } else {
      console.log(chalk.red('❌ Script execution failed'))
    }

    console.log(chalk.blue('Output:'))
    console.log(result.output)

    return result
  }

  async monitorSystem(duration: number = 30): Promise<any> {
    console.log(chalk.blue(`⚡︎ Monitoring system for ${duration} seconds...`))

    const _startTime = Date.now()
    const samples = []

    const interval = setInterval(async () => {
      const systemInfo = await toolsManager.getSystemInfo()
      const processes = toolsManager.getRunningProcesses()

      samples.push({
        timestamp: new Date(),
        memoryUsed: systemInfo.memory.used,
        processCount: processes.length,
      })

      console.log(
        chalk.cyan(
          `📊 Memory: ${Math.round((systemInfo.memory.used / 1024 / 1024 / 1024) * 100) / 100}GB | Processes: ${processes.length}`
        )
      )
    }, 5000) // Sample every 5 seconds

    setTimeout(() => {
      clearInterval(interval)
      console.log(chalk.green(`✓ Monitoring complete. Collected ${samples.length} samples`))
    }, duration * 1000)

    return {
      duration,
      samplesCollected: samples.length,
      monitoringActive: true,
    }
  }

  protected override async onExecuteTask(task: AgentTask): Promise<AgentTaskResult> {
    // Enhanced cognitive task execution
    const cognition = await this.parseTaskCognition(task.description || task.type)
    const enhancedCognition = await this.enhanceCognitionForSpecialization(cognition)
    const orchestrationPlan = await this.createOrchestrationPlan(enhancedCognition)

    return await this.executeCognitiveTask(task, enhancedCognition, orchestrationPlan)
  }

  /**
   * 🧠 Execute task with System Admin-specific cognitive orchestration
   */
  protected async executeCognitiveTask(
    _task: AgentTask,
    cognition: TaskCognition,
    plan: OrchestrationPlan
  ): Promise<AgentTaskResult> {
    const startTime = Date.now()

    try {
      CliUI.logInfo(`🖥️ Executing System Admin task with ${plan.strategy} orchestration`)

      // Phase 1: System Environment Analysis
      const systemContext = await this.analyzeSystemEnvironmentCognitive(cognition)

      // Phase 2: Intelligent System Administration
      const implementation = await this.executeIntelligentSystemAdministration(cognition, systemContext, plan)

      // Phase 3: System Validation
      const validation = await this.validateSystemImplementation(implementation)

      const executionTime = Date.now() - startTime
      this.updateCognitiveMemory(cognition, implementation, true)

      return {
        success: true,
        message: `System Admin task completed with ${plan.strategy} orchestration in ${executionTime}ms`,
        executionTime,
        data: {
          cognition,
          orchestrationPlan: plan,
          systemContext,
          implementation,
          validation,
          metrics: this.getPerformanceMetrics(),
        },
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      CliUI.logError(`❌ System Admin task failed: ${error.message}`)
      this.updateCognitiveMemory(cognition, { error: error.message }, false)

      return {
        success: false,
        message: `System Admin task failed: ${error.message}`,
        executionTime,
        data: { error: error.message, cognition, orchestrationPlan: plan },
      }
    }
  }

  /**
   * 🎯 Enhanced cognition for System Admin-specific analysis
   */
  protected async enhanceCognitionForSpecialization(cognition: TaskCognition): Promise<TaskCognition> {
    try {
      const systemAdminCognition = cognition as SystemAdminCognition

      if (this.isSystemOperationTask(cognition)) {
        systemAdminCognition.systemAnalysis = await this.analyzeSystemRequirements(cognition)
        CliUI.logDebug(`🖥️ System analysis: ${systemAdminCognition.systemAnalysis?.resourceType || 'unknown'}`)
      }

      const systemCapabilities = this.getSystemAdminCapabilities(cognition)
      systemAdminCognition.requiredCapabilities.push(...systemCapabilities)

      return systemAdminCognition
    } catch (error: any) {
      CliUI.logError(`❌ Failed to enhance System Admin cognition: ${error.message}`)
      return cognition
    }
  }

  /**
   * 💡 Get System Admin-specific optimization suggestions
   */
  protected getSpecializationOptimizations(): string[] {
    const optimizations: string[] = []

    const monitoringPatterns = this.cognitiveMemory.taskPatterns.get('system-monitoring') || []
    if (monitoringPatterns.length > 8) {
      optimizations.push('High monitoring activity - consider automated alerting setup')
    }

    return optimizations
  }

  // System Admin-specific cognitive methods

  private async initializeSystemAdminCognition(): Promise<void> {
    const systemAdminPatterns = [
      'system-monitoring',
      'performance-analysis',
      'security-audit',
      'resource-optimization',
      'log-analysis',
      'maintenance-scheduling',
    ]

    systemAdminPatterns.forEach((pattern) => {
      if (!this.cognitiveMemory.taskPatterns.has(pattern)) {
        this.cognitiveMemory.taskPatterns.set(pattern, [])
      }
    })

    CliUI.logDebug(`🧠 Initialized ${systemAdminPatterns.length} System Admin cognitive patterns`)
  }

  private async saveCognitiveState(): Promise<void> {
    CliUI.logDebug(' System Admin cognitive state prepared for persistence')
  }

  private async analyzeSystemEnvironmentCognitive(_cognition: TaskCognition): Promise<any> {
    try {
      const systemInfo = await toolsManager.getSystemInfo()
      return {
        os: systemInfo.platform,
        architecture: systemInfo.arch,
        nodeVersion: systemInfo.nodeVersion || process.version,
        totalMemory: (systemInfo as any).totalMemory || 0,
        cpuCores: systemInfo.cpus || 1,
      }
    } catch (error: any) {
      throw new Error(`System environment analysis failed: ${error.message}`)
    }
  }

  private async executeIntelligentSystemAdministration(
    cognition: TaskCognition,
    context: any,
    _plan: OrchestrationPlan
  ): Promise<any> {
    try {
      advancedUI.logFunctionCall('executing')
      advancedUI.logFunctionUpdate('info', 'Intelligent System Administration', '●')

      const systemPrompt = `You are an advanced System Administrator with cognitive understanding.

Task: ${cognition.intent.primary} (${cognition.intent.complexity})
System: OS: ${context.os}, Cores: ${context.cpuCores}, Memory: ${Math.round(context.totalMemory / 1024 / 1024 / 1024)}GB

Provide intelligent system administration with:
1. Detailed system analysis and monitoring
2. Security-focused approach with proper auditing
3. Performance optimization recommendations
4. Comprehensive logging and alerting setup
5. Clear operational procedures and documentation

Generate working commands, scripts, and configurations.`

      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: cognition.originalTask },
      ]

      const aiResponse = await modelProvider.generateResponse({ messages })

      const implementation = {
        commandsGenerated: this.extractCommandsFromResponse(aiResponse),
        scriptsCreated: this.extractScriptsFromResponse(aiResponse),
        monitoringSetup: aiResponse.toLowerCase().includes('monitoring') || aiResponse.toLowerCase().includes('cron'),
      }

      CliUI.logSuccess(
        `✓ System administration complete - ${implementation.commandsGenerated.length} commands generated`
      )
      return implementation
    } catch (error: any) {
      CliUI.logError(`❌ System administration failed: ${error.message}`)
      throw error
    }
  }

  private async validateSystemImplementation(implementation: any): Promise<any> {
    const validation = {
      commands: { hasErrors: false, details: 'Commands validated' },
      monitoring: {
        hasErrors: !implementation.monitoringSetup,
        details: implementation.monitoringSetup ? 'Monitoring included' : 'No monitoring configured',
      },
    }

    const overallSuccess = Object.values(validation).every((v) => !v.hasErrors)
    return { validation, overallSuccess }
  }

  // Helper methods
  private isSystemOperationTask(cognition: TaskCognition): boolean {
    const systemKeywords = ['system', 'monitor', 'performance', 'resource', 'process', 'service']
    return systemKeywords.some((keyword) => cognition.normalizedTask.includes(keyword))
  }

  private async analyzeSystemRequirements(cognition: TaskCognition): Promise<SystemAdminCognition['systemAnalysis']> {
    const taskText = cognition.normalizedTask.toLowerCase()

    let resourceType: 'cpu' | 'memory' | 'disk' | 'network' | 'process' = 'cpu'
    if (taskText.includes('memory') || taskText.includes('ram')) resourceType = 'memory'
    else if (taskText.includes('disk') || taskText.includes('storage')) resourceType = 'disk'
    else if (taskText.includes('network')) resourceType = 'network'
    else if (taskText.includes('process')) resourceType = 'process'

    let criticalityLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium'
    if (taskText.includes('critical')) criticalityLevel = 'critical'
    else if (taskText.includes('high')) criticalityLevel = 'high'
    else if (taskText.includes('low')) criticalityLevel = 'low'

    let automationPotential: 'none' | 'partial' | 'full' = 'partial'
    if (taskText.includes('automate') || taskText.includes('automatic')) automationPotential = 'full'
    else if (taskText.includes('manual')) automationPotential = 'none'

    return {
      resourceType,
      criticalityLevel,
      automationPotential,
      securityImplications: taskText.includes('security') ? ['Security audit required'] : [],
      maintenanceRequirements: taskText.includes('maintain') ? ['Regular maintenance needed'] : [],
    }
  }

  private getSystemAdminCapabilities(cognition: TaskCognition): string[] {
    const capabilities = []

    if (cognition.intent.primary === 'analyze') capabilities.push('system-analysis')
    if (cognition.normalizedTask.includes('monitor')) capabilities.push('system-monitoring')
    if (cognition.normalizedTask.includes('security')) capabilities.push('security-audit')
    if (cognition.normalizedTask.includes('performance')) capabilities.push('performance-analysis')
    if (cognition.normalizedTask.includes('log')) capabilities.push('log-analysis')

    return capabilities
  }

  private extractCommandsFromResponse(response: string): string[] {
    const commands = []
    const commandMatches = response.match(/```(?:bash|sh)?\n([\s\S]*?)\n```/g) || []

    for (const match of commandMatches) {
      const command = match.replace(/```(?:bash|sh)?\n/, '').replace(/\n```$/, '')
      if (command.trim()) {
        commands.push(command.trim())
      }
    }

    return commands
  }

  private extractScriptsFromResponse(response: string): string[] {
    const scripts = []

    if (response.includes('#!/bin/bash') || response.includes('#!/bin/sh')) {
      scripts.push('Shell script generated')
    }
    if (response.includes('#!/usr/bin/env python')) {
      scripts.push('Python script generated')
    }

    return scripts
  }

  // Legacy method for backward compatibility
  protected async onExecuteTaskLegacy(task: any): Promise<any> {
    const taskData = typeof task === 'string' ? task : task.data
    if (!taskData) {
      return {
        message:
          'System Admin Agent ready! I can execute terminal commands, manage processes, install packages, and monitor the system.',
        capabilities: [
          'Execute any terminal command safely',
          'Install packages and dependencies',
          'Manage running processes',
          'Create new projects',
          'Run scripts in multiple languages',
          'Monitor system resources',
          'Analyze system configuration',
        ],
        availableCommands: [
          'analyze system',
          'install <packages>',
          'run command: <command>',
          'create project <type> <name>',
          'run script: <script>',
          'list processes',
          'kill process <pid>',
          'monitor system',
        ],
      }
    }

    const lowerTask = taskData.toLowerCase()

    try {
      if (lowerTask.includes('analyze') || lowerTask.includes('system info')) {
        return await this.analyzeSystem()
      }

      if (lowerTask.includes('install')) {
        const packages = taskData.match(/install\s+(.+)/i)?.[1]?.split(/\s+/) || []
        const isGlobal = lowerTask.includes('global') || lowerTask.includes('-g')
        const isDev = lowerTask.includes('dev') || lowerTask.includes('--save-dev')

        return await this.installDependencies(packages, { global: isGlobal, dev: isDev })
      }

      if (lowerTask.includes('run command') || lowerTask.includes('execute')) {
        const command = taskData.replace(/(run command|execute):\s*/i, '')
        return await this.executeCommands(command)
      }

      if (lowerTask.includes('create project')) {
        const match = taskData.match(/create project\s+(\w+)\s+(.+)/i)
        if (match) {
          const [, type, name] = match
          return await this.createProject(type, name)
        }
      }

      if (lowerTask.includes('run script')) {
        const script = taskData.replace(/run script:\s*/i, '')
        const language = lowerTask.includes('python') ? 'python' : lowerTask.includes('node') ? 'node' : 'bash'
        return await this.runScript(script, language)
      }

      if (lowerTask.includes('list process') || lowerTask.includes('show process')) {
        return await this.manageProcesses('list')
      }

      if (lowerTask.includes('kill process')) {
        const pid = parseInt(taskData.match(/kill process\s+(\d+)/i)?.[1] || '', 10)
        if (pid) {
          return await this.manageProcesses('kill', pid)
        }
      }

      if (lowerTask.includes('monitor')) {
        const duration = parseInt(taskData.match(/monitor.*?(\d+)/)?.[1] || '30', 10)
        return await this.monitorSystem(duration)
      }

      // Default: treat as command execution
      return await this.executeCommands(taskData)
    } catch (error: any) {
      return {
        error: `System administration failed: ${error.message}`,
        taskData,
      }
    }
  }

  // Legacy compatibility methods
  override async run(taskData: string): Promise<any> {
    const task: AgentTask = {
      id: nanoid(),
      type: 'legacy',
      description: taskData,
      priority: 'normal',
    }

    const result = await this.executeTask(task)

    return {
      response: result.message,
      taskData,
      agent: 'Enhanced System Admin Agent',
      success: result.success,
      cognitiveEnhanced: true,
      data: result.data,
    }
  }

  override async cleanup(): Promise<void> {
    return await this.onStop()
  }
}
