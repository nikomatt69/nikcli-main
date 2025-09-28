import { agentFactory } from '../core/agent-factory'
import { ToolRegistry } from '../tools/tool-registry'
import { CliUI } from '../utils/cli-ui'
import { EventBus, EventTypes } from './agents/event-bus'

/**
 * WorkflowOrchestrator - Sistema per eseguire catene di tool calls automatiche
 * Gestisce l'esecuzione sequenziale, condizionale e parallela di tool per raggiungere obiettivi complessi
 */

export interface WorkflowStep {
  id: string
  toolName: string
  parameters: Record<string, any>
  condition?: (previousResults: any[]) => boolean
  retryCount?: number
  timeout?: number
  autoApprove?: boolean
  onSuccess?: (result: any) => WorkflowStep[]
  onError?: (error: any) => WorkflowStep[]
}

export interface WorkflowChain {
  id: string
  name: string
  description: string
  goal: string
  steps: WorkflowStep[]
  parallelSteps?: WorkflowStep[][]
  autoApprovalRules: AutoApprovalRule[]
  safetyChecks: SafetyCheck[]
}

export interface AutoApprovalRule {
  toolPattern: string
  parameterConditions?: Record<string, any>
  riskLevel: 'low' | 'medium' | 'high'
  autoApprove: boolean
}

export interface SafetyCheck {
  name: string
  check: (step: WorkflowStep, context: WorkflowContext) => boolean
  errorMessage: string
}

export interface WorkflowContext {
  workingDirectory: string
  previousResults: any[]
  currentStep: number
  totalSteps: number
  startTime: Date
  variables: Record<string, any>
}

export interface WorkflowResult {
  success: boolean
  chainId: string
  executedSteps: number
  totalSteps: number
  duration: number
  results: any[]
  errors: any[]
  logs: string[]
}

export class WorkflowOrchestrator {
  private eventBus: EventBus
  private toolRegistry: ToolRegistry
  private activeChains: Map<string, WorkflowContext> = new Map()
  private chainDefinitions: Map<string, WorkflowChain> = new Map()

  constructor(workingDirectory: string) {
    this.eventBus = EventBus.getInstance()
    this.toolRegistry = new ToolRegistry(workingDirectory)
    this.initializeDefaultChains()
  }

  /**
   * Esegue una catena di workflow con un agente specifico
   */
  async executeChainWithAgent(
    chainId: string,
    agentId: string,
    initialParams: Record<string, any> = {}
  ): Promise<WorkflowResult> {
    try {
      // Launch the specified agent
      const agent = await agentFactory.launchAgent(agentId)

      CliUI.logInfo(`🔌 Using agent: ${agent.id} (${agent.specialization})`)

      // Execute the workflow chain
      const result = await this.executeChain(chainId, initialParams)

      // Cleanup agent after workflow completion
      await agent.cleanup()

      return result
    } catch (error: any) {
      CliUI.logError(`❌ Failed to execute workflow with agent: ${error.message}`)
      throw error
    }
  }

  /**
   * Esegue una catena di workflow completa
   */
  async executeChain(chainId: string, initialParams: Record<string, any> = {}): Promise<WorkflowResult> {
    const chain = this.chainDefinitions.get(chainId)
    if (!chain) {
      throw new Error(`Workflow chain '${chainId}' not found`)
    }

    CliUI.logSection(`🔗 Executing Workflow Chain: ${chain.name}`)
    CliUI.logInfo(`Goal: ${chain.goal}`)

    const context: WorkflowContext = {
      workingDirectory: this.toolRegistry.getWorkingDirectory(),
      previousResults: [],
      currentStep: 0,
      totalSteps: chain.steps.length,
      startTime: new Date(),
      variables: { ...initialParams },
    }

    this.activeChains.set(chainId, context)

    try {
      // Publish chain start event
      await this.eventBus.publish(EventTypes.TASK_STARTED, {
        taskId: chainId,
        agentId: 'workflow-orchestrator',
        taskType: 'workflow-chain',
        chainName: chain.name,
      })

      const result = await this.executeSteps(chain, context)

      // Publish chain completion event
      await this.eventBus.publish(EventTypes.TASK_COMPLETED, {
        taskId: chainId,
        agentId: 'workflow-orchestrator',
        result,
        duration: result.duration,
      })

      return result
    } catch (error: any) {
      CliUI.logError(`Workflow chain failed: ${error.message}`)

      await this.eventBus.publish(EventTypes.TASK_FAILED, {
        taskId: chainId,
        agentId: 'workflow-orchestrator',
        error: error.message,
      })

      throw error
    } finally {
      this.activeChains.delete(chainId)
    }
  }

  /**
   * Esegue i step della catena sequenzialmente
   */
  private async executeSteps(chain: WorkflowChain, context: WorkflowContext): Promise<WorkflowResult> {
    const results: any[] = []
    const errors: any[] = []
    const logs: string[] = []

    for (let i = 0; i < chain.steps.length; i++) {
      const step = chain.steps[i]
      context.currentStep = i + 1

      try {
        CliUI.logInfo(`📋 Step ${context.currentStep}/${context.totalSteps}: ${step.toolName}`)

        // Verifica condizioni
        if (step.condition && !step.condition(context.previousResults)) {
          CliUI.logWarning(`⏭️ Skipping step ${step.id} - condition not met`)
          continue
        }

        // Safety checks
        await this.performSafetyChecks(step, context, chain.safetyChecks)

        // Verifica auto-approval
        const needsApproval = await this.checkApprovalRequired(step, chain.autoApprovalRules)
        if (needsApproval) {
          const approved = await this.requestHumanApproval(step, context)
          if (!approved) {
            throw new Error(`Step ${step.id} was not approved by human reviewer`)
          }
        }

        // Esegui il tool
        const result = await this.executeStep(step, context)
        results.push(result)
        context.previousResults.push(result)

        logs.push(`✓ Step ${step.id} completed successfully`)
        CliUI.logSuccess(`✓ Step completed: ${step.toolName}`)

        // Handle dynamic step generation
        if (step.onSuccess) {
          const additionalSteps = step.onSuccess(result)
          if (additionalSteps.length > 0) {
            chain.steps.splice(i + 1, 0, ...additionalSteps)
            context.totalSteps += additionalSteps.length
            CliUI.logInfo(`📈 Added ${additionalSteps.length} dynamic steps`)
          }
        }
      } catch (error: any) {
        CliUI.logError(`❌ Step ${step.id} failed: ${error.message}`)
        errors.push({ step: step.id, error: error.message })

        // Handle retry logic
        const retryCount = step.retryCount || 0
        if (retryCount > 0) {
          CliUI.logWarning(`⚡︎ Retrying step ${step.id} (${retryCount} attempts remaining)`)
          step.retryCount = retryCount - 1
          i-- // Retry current step
          continue
        }

        // Handle error recovery
        if (step.onError) {
          const recoverySteps = step.onError(error)
          if (recoverySteps.length > 0) {
            chain.steps.splice(i + 1, 0, ...recoverySteps)
            context.totalSteps += recoverySteps.length
            CliUI.logInfo(`🔧 Added ${recoverySteps.length} recovery steps`)
            continue
          }
        }

        // Se non c'è recovery, fallisce tutta la catena
        throw error
      }
    }

    const duration = Date.now() - context.startTime.getTime()

    return {
      success: errors.length === 0,
      chainId: chain.id,
      executedSteps: results.length,
      totalSteps: context.totalSteps,
      duration,
      results,
      errors,
      logs,
    }
  }

  /**
   * Esegue un singolo step del workflow
   */
  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const tool = this.toolRegistry.getTool(step.toolName)
    if (!tool) {
      throw new Error(`Tool '${step.toolName}' not found in registry`)
    }

    // Sostituisci variabili nei parametri
    const resolvedParams = this.resolveParameters(step.parameters, context)

    // Esegui il tool con timeout
    const timeout = step.timeout || 30000 // 30 secondi default
    const result = await Promise.race([
      tool.execute(resolvedParams),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Step ${step.id} timed out after ${timeout}ms`)), timeout)
      ),
    ])

    return result
  }

  /**
   * Risolve le variabili nei parametri usando il contesto
   */
  private resolveParameters(params: Record<string, any>, context: WorkflowContext): Record<string, any> {
    const resolved: Record<string, any> = {}

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('$')) {
        // Variabile da risolvere
        const varName = value.substring(1)
        if (varName === 'workingDirectory') {
          resolved[key] = context.workingDirectory
        } else if (varName.startsWith('result[')) {
          // Accesso a risultato precedente: $result[0].filePath
          const match = varName.match(/result\[(\d+)\]\.(.+)/)
          if (match) {
            const index = parseInt(match[1], 10)
            const property = match[2]
            resolved[key] = context.previousResults[index]?.[property]
          }
        } else if (context.variables[varName] !== undefined) {
          resolved[key] = context.variables[varName]
        } else {
          resolved[key] = value // Mantieni valore originale se non trovato
        }
      } else {
        resolved[key] = value
      }
    }

    return resolved
  }

  /**
   * Verifica se uno step richiede approvazione umana
   */
  private async checkApprovalRequired(step: WorkflowStep, rules: AutoApprovalRule[]): Promise<boolean> {
    if (step.autoApprove === true) return false
    if (step.autoApprove === false) return true

    for (const rule of rules) {
      if (this.matchesPattern(step.toolName, rule.toolPattern)) {
        if (rule.parameterConditions) {
          const matches = this.matchesParameterConditions(step.parameters, rule.parameterConditions)
          if (matches) return !rule.autoApprove
        } else {
          return !rule.autoApprove
        }
      }
    }

    // Default: richiedi approvazione per operazioni non specificate
    return true
  }

  /**
   * Verifica pattern matching per tool names
   */
  private matchesPattern(toolName: string, pattern: string): boolean {
    const regex = new RegExp(pattern.replace('*', '.*'))
    return regex.test(toolName)
  }

  /**
   * Verifica condizioni sui parametri
   */
  private matchesParameterConditions(params: Record<string, any>, conditions: Record<string, any>): boolean {
    for (const [key, expectedValue] of Object.entries(conditions)) {
      if (params[key] !== expectedValue) {
        return false
      }
    }
    return true
  }

  /**
   * Esegue safety checks prima dell'esecuzione
   */
  private async performSafetyChecks(
    step: WorkflowStep,
    context: WorkflowContext,
    checks: SafetyCheck[]
  ): Promise<void> {
    for (const check of checks) {
      if (!check.check(step, context)) {
        throw new Error(`Safety check failed: ${check.errorMessage}`)
      }
    }
  }

  /**
   * Richiede approvazione umana per step critici
   */
  private async requestHumanApproval(step: WorkflowStep, _context: WorkflowContext): Promise<boolean> {
    CliUI.logWarning(`🚨 Human approval required for step: ${step.id}`)
    CliUI.logInfo(`Tool: ${step.toolName}`)
    CliUI.logInfo(`Parameters: ${JSON.stringify(step.parameters, null, 2)}`)

    // In un'implementazione reale, questo dovrebbe aspettare input umano
    // Per ora, assumiamo approvazione automatica per step sicuri
    const safeTools = ['read-file-tool', 'grep-search', 'find-files-tool']
    return safeTools.includes(step.toolName)
  }

  /**
   * Inizializza catene di workflow predefinite
   */
  private initializeDefaultChains(): void {
    // Catena per implementare nuova feature
    this.chainDefinitions.set('implement-feature', {
      id: 'implement-feature',
      name: 'Implement New Feature',
      description: 'Complete workflow for implementing a new feature',
      goal: 'Implement, test, and document a new feature',
      steps: [
        {
          id: 'analyze-requirements',
          toolName: 'read-file-tool',
          parameters: { filePath: '$requirementsFile' },
          autoApprove: true,
        },
        {
          id: 'create-implementation',
          toolName: 'write-file-tool',
          parameters: {
            filePath: '$implementationFile',
            content: '$implementationCode',
          },
          autoApprove: false,
        },
        {
          id: 'create-tests',
          toolName: 'write-file-tool',
          parameters: {
            filePath: '$testFile',
            content: '$testCode',
          },
          autoApprove: true,
        },
        {
          id: 'run-tests',
          toolName: 'run-command-tool',
          parameters: { command: 'npm test' },
          autoApprove: true,
          retryCount: 2,
        },
      ],
      autoApprovalRules: [
        {
          toolPattern: 'read-*',
          riskLevel: 'low',
          autoApprove: true,
        },
        {
          toolPattern: 'write-file-tool',
          parameterConditions: { filePath: '*.test.*' },
          riskLevel: 'low',
          autoApprove: true,
        },
        {
          toolPattern: 'run-command-tool',
          parameterConditions: { command: 'npm test' },
          riskLevel: 'low',
          autoApprove: true,
        },
      ],
      safetyChecks: [
        {
          name: 'no-destructive-operations',
          check: (step) => !step.parameters.command?.includes('rm -rf'),
          errorMessage: 'Destructive operations not allowed',
        },
      ],
    })

    CliUI.logInfo(`🔗 Initialized ${this.chainDefinitions.size} workflow chains`)
  }

  /**
   * Registra una nuova catena di workflow
   */
  registerChain(chain: WorkflowChain): void {
    this.chainDefinitions.set(chain.id, chain)
    CliUI.logInfo(`📝 Registered workflow chain: ${chain.name}`)
  }

  /**
   * Lista tutte le catene disponibili
   */
  listChains(): WorkflowChain[] {
    return Array.from(this.chainDefinitions.values())
  }

  /**
   * Ottiene lo stato di una catena attiva
   */
  getChainStatus(chainId: string): WorkflowContext | null {
    return this.activeChains.get(chainId) || null
  }
}
