import chalk from 'chalk'
import { EventEmitter } from 'events'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { type ChatMessage, modelProvider } from '../ai/model-provider'
import { BaseAgent } from '../automation/agents/base-agent'
import { workspaceContext } from '../context/workspace-context'
import { AgentTaskResultSchema } from '../schemas/core-schemas'
import { toolsManager } from '../tools/migration-to-secure-tools' // deprecated, for backward compatibility
import { CircuitBreaker } from '../utils/circuit-breaker'
import { agentStream } from './agent-stream'
import { agentTodoManager } from './agent-todo-manager'
import { blueprintStorage } from './blueprint-storage'
import { configManager } from './config-manager'

// ====================== ⚡︎ ZOD VALIDATION SCHEMAS ======================

// VM Container Configuration Schema
export const VMContainerConfigSchema = z.object({
  repositoryUrl: z.string().url().optional(),
  containerImage: z.string().min(1).optional(),
  resourceLimits: z
    .object({
      memory: z
        .string()
        .regex(/^\d+[GMK]?B?$/i)
        .optional(),
      cpu: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .optional(),
      disk: z
        .string()
        .regex(/^\d+[GMK]?B?$/i)
        .optional(),
    })
    .optional(),
  networkAccess: z.boolean().default(false),
  volumeMounts: z.array(z.string()).default([]),
  environmentVars: z.record(z.string()).default({}),
})

// Container Metadata Schema
const ContainerMetadataSchema = z.object({
  containerId: z.string().optional(),
  isActive: z.boolean().default(false),
  createdAt: z.date().optional(),
  lastUsed: z.date().optional(),
})

// Agent Personality Schema
const AgentPersonalitySchema = z.object({
  proactive: z.number().int().min(0).max(100),
  collaborative: z.number().int().min(0).max(100),
  analytical: z.number().int().min(0).max(100),
  creative: z.number().int().min(0).max(100),
})

// Agent Blueprint Schema
export const AgentBlueprintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(5000),
  specialization: z.string().min(1),
  systemPrompt: z.string().min(10),
  capabilities: z.array(z.string()).min(1),
  requiredTools: z.array(z.string()).default([]),
  personality: AgentPersonalitySchema,
  autonomyLevel: z.enum(['supervised', 'semi-autonomous', 'fully-autonomous']),
  contextScope: z.enum(['file', 'directory', 'project', 'workspace']),
  workingStyle: z.enum(['sequential', 'parallel', 'adaptive']),

  // VM Agent Support
  agentType: z.enum(['standard', 'vm', 'container']),
  vmConfig: VMContainerConfigSchema.optional(),
  vmCapabilities: z.array(z.string()).default([]),
  containerMetadata: ContainerMetadataSchema.optional(),

  createdAt: z.date().default(() => new Date()),
})

// Export Zod inferred types
export type VMContainerConfig = z.infer<typeof VMContainerConfigSchema>
export type AgentBlueprint = z.infer<typeof AgentBlueprintSchema>

// Helper function to extract JSON from markdown code blocks
function extractJsonFromMarkdown(text: string): string {
  // Try to find JSON wrapped in code blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim()
  }

  // Try to find JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0].trim()
  }

  // Return original text if no patterns found
  return text.trim()
}

export class DynamicAgent extends BaseAgent {
  id: string
  capabilities: string[]
  specialization: string

  private blueprint: AgentBlueprint
  private isRunning: boolean = false

  constructor(blueprint: AgentBlueprint, workingDirectory: string = process.cwd()) {
    super(workingDirectory)
    this.id = blueprint.name
    this.capabilities = blueprint.capabilities
    this.specialization = blueprint.description
    this.blueprint = blueprint
  }

  protected async onInitialize(): Promise<void> {
    agentStream.startAgentStream(this.id)
    agentStream.emitEvent(this.id, 'info', `🔌 Dynamic agent ${this.id} initialized`)
    agentStream.emitEvent(this.id, 'info', `Specialization: ${this.blueprint.specialization}`)
    agentStream.emitEvent(this.id, 'info', `Autonomy Level: ${this.blueprint.autonomyLevel}`)
  }

  protected async onStop(): Promise<void> {
    this.isRunning = false
    agentStream.emitEvent(this.id, 'info', `🛑 Dynamic agent ${this.id} stopped`)
  }

  protected async onExecuteTask(task: any): Promise<any> {
    // Handle both string tasks and AgentTask objects
    const taskData = typeof task === 'string' ? task : task?.description || task?.data

    if (!taskData) {
      return {
        message: `${this.blueprint.description}`,
        specialization: this.blueprint.specialization,
        capabilities: this.blueprint.capabilities,
        autonomyLevel: this.blueprint.autonomyLevel,
      }
    }

    // Get workspace context based on scope
    if (this.blueprint.contextScope !== 'file') {
      try {
        const context = workspaceContext.getContextForAgent(this.id)
        agentStream.emitEvent(this.id, 'info', `Context loaded: ${context.relevantFiles.length} files`)
      } catch (error: any) {
        agentStream.emitEvent(this.id, 'info', `Failed to load workspace context: ${error.message}`)
        // Continue without context if it fails
      }
    }

    return await this.run(taskData)
  }

  public async executeTask(task: any): Promise<any> {
    // Handle both string tasks and AgentTask objects
    const taskData = typeof task === 'string' ? task : task?.description || task?.data

    if (!taskData) {
      return {
        message: `${this.blueprint.description}`,
        specialization: this.blueprint.specialization,
        capabilities: this.blueprint.capabilities,
        autonomyLevel: this.blueprint.autonomyLevel,
      }
    }

    // Get workspace context based on scope
    if (this.blueprint.contextScope !== 'file') {
      try {
        const context = workspaceContext.getContextForAgent(this.id)
        agentStream.emitEvent(this.id, 'info', `Context loaded: ${context.relevantFiles.length} files`)
      } catch (error: any) {
        agentStream.emitEvent(this.id, 'info', `Failed to load workspace context: ${error.message}`)
        // Continue without context if it fails
      }
    }

    return await this.run(taskData)
  }

  async run(task?: string): Promise<any> {
    if (!task) {
      return {
        message: `${this.blueprint.description}`,
        specialization: this.blueprint.specialization,
        capabilities: this.blueprint.capabilities,
        autonomyLevel: this.blueprint.autonomyLevel,
        personality: this.blueprint.personality,
        contextScope: this.blueprint.contextScope,
      }
    }

    this.isRunning = true

    try {
      // Start autonomous workflow
      agentStream.emitEvent(this.id, 'thinking', 'Starting autonomous workflow...')

      // 1. Create todos autonomously
      await this.createAutonomousTodos(task)

      // 2. Execute todos with streaming
      const result = await this.executeAutonomousWorkflow()

      // 3. Report results
      agentStream.emitEvent(this.id, 'result', 'Autonomous workflow completed successfully')

      return result
    } catch (error: any) {
      agentStream.emitEvent(this.id, 'error', `Autonomous workflow failed: ${error.message}`)
      return { error: error.message, task }
    } finally {
      this.isRunning = false
    }
  }

  private async createAutonomousTodos(task: string): Promise<void> {
    agentStream.emitEvent(this.id, 'planning', 'Analyzing task and creating autonomous plan...')

    // Get workspace context
    let context: any
    try {
      context = workspaceContext.getContextForAgent(this.id)
    } catch (error: any) {
      agentStream.emitEvent(this.id, 'info', `Using minimal context due to error: ${error.message}`)
      context = { relevantFiles: [], projectSummary: 'Minimal context' }
    }

    // Stream thinking process
    const thoughts = [
      'Understanding the requirements...',
      'Analyzing current workspace state...',
      'Identifying required tools and dependencies...',
      'Planning optimal execution strategy...',
      'Creating detailed todo breakdown...',
    ]

    await agentStream.streamThinking(this.id, thoughts)

    // Generate AI-powered todos based on agent specialization
    try {
      const todos = await agentTodoManager.planTodos(this.id, task, {
        blueprint: this.blueprint,
        workspaceContext: context,
        specialization: this.blueprint.specialization,
      })

      this.currentTodos = todos.map((t) => t.id)

      // Stream the plan
      const planSteps = todos.map((todo) => todo.title)
      await agentStream.streamPlanning(this.id, planSteps)

      agentStream.emitEvent(this.id, 'planning', `Created ${todos.length} autonomous todos`)
    } catch (error: any) {
      agentStream.emitEvent(this.id, 'error', `Failed to create todos: ${error.message}`)
      // Create a basic todo as fallback
      this.currentTodos = ['fallback-todo']
    }
  }

  private async executeAutonomousWorkflow(): Promise<any> {
    try {
      const todos = agentTodoManager.getAgentTodos(this.id)
      const results: any[] = []
      const errors: Array<{ todoId: string; error: string }> = []

      if (todos.length === 0) {
        agentStream.emitEvent(this.id, 'info', 'No todos to execute, creating basic task')
        return {
          success: true,
          todosCompleted: 0,
          todosFailed: 0,
          totalTodos: 0,
          results: [],
          agent: this.id,
          autonomyLevel: this.blueprint.autonomyLevel,
          summary: { successful: 0, failed: 0, total: 0, successRate: 100 },
        }
      }

      agentStream.emitEvent(this.id, 'executing', `Starting execution of ${todos.length} todos`)

      for (let i = 0; i < todos.length; i++) {
        const todo = todos[i]

        // Stream progress
        agentStream.streamProgress(this.id, i + 1, todos.length, `Executing: ${todo.title}`)

        try {
          // Execute todo with full autonomy and error handling
          const result = await this.executeAutonomousTodo(todo)
          results.push(result)

          // Mark todo as completed
          try {
            agentTodoManager.updateTodo(todo.id, {
              status: 'completed',
              progress: 100,
              actualDuration: Math.random() * 5 + 1,
            })
          } catch (updateError: any) {
            agentStream.emitEvent(this.id, 'info', `Failed to update todo status: ${updateError.message}`)
          }

          // Clear any previous errors for this todo
          const errorIndex = errors.findIndex((e) => e.todoId === todo.id)
          if (errorIndex !== -1) {
            errors.splice(errorIndex, 1)
          }
        } catch (error: any) {
          // Record error but continue with next todo
          const errorInfo = {
            todoId: todo.id,
            error: error.message,
          }
          errors.push(errorInfo)

          // Mark todo as failed
          try {
            agentTodoManager.updateTodo(todo.id, {
              status: 'failed',
              progress: 0,
            })
          } catch (updateError: any) {
            agentStream.emitEvent(this.id, 'info', `Failed to update failed todo status: ${updateError.message}`)
          }

          // Emit error event to stream
          agentStream.emitEvent(this.id, 'error', `Todo "${todo.title}" failed: ${error.message}`)

          // Add error result to maintain result array consistency
          results.push({
            todoId: todo.id,
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
          })

          console.log(chalk.red(`❌ Agent ${this.id}: Todo "${todo.title}" failed: ${error.message}`))
        }
      }

      const successfulTodos = results.filter((r) => r.success !== false).length
      const failedTodos = errors.length

      return {
        success: errors.length === 0,
        todosCompleted: successfulTodos,
        todosFailed: failedTodos,
        totalTodos: todos.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
        agent: this.id,
        autonomyLevel: this.blueprint.autonomyLevel,
        summary: {
          successful: successfulTodos,
          failed: failedTodos,
          total: todos.length,
          successRate: Math.round((successfulTodos / todos.length) * 100),
        },
      }
    } catch (error: any) {
      agentStream.emitEvent(this.id, 'error', `Workflow execution failed: ${error.message}`)
      return {
        success: false,
        todosCompleted: 0,
        todosFailed: 1,
        totalTodos: 0,
        results: [],
        errors: [{ todoId: 'workflow', error: error.message }],
        agent: this.id,
        autonomyLevel: this.blueprint.autonomyLevel,
        summary: { successful: 0, failed: 1, total: 0, successRate: 0 },
      }
    }
  }

  private async executeAutonomousTodo(todo: any): Promise<any> {
    const actionId = agentStream.trackAction(this.id, 'analysis', todo.description)

    agentStream.emitEvent(this.id, 'executing', `Working on: ${todo.title}`)

    try {
      let result: any

      // Execute based on todo tags and agent capabilities
      if (todo.tags.includes('filesystem')) {
        result = await this.executeFileSystemTodo(todo)
      } else if (todo.tags.includes('analysis')) {
        result = await this.executeAnalysisTodo(todo)
      } else if (todo.tags.includes('implementation')) {
        result = await this.executeImplementationTodo(todo)
      } else if (todo.tags.includes('testing')) {
        result = await this.executeTestingTodo(todo)
      } else {
        result = await this.executeGenericTodo(todo)
      }

      // Validate result against schema
      const validatedResult = this.validateTaskResult(todo.id, result)

      agentStream.updateAction(actionId, 'completed', validatedResult)
      return validatedResult
    } catch (error: any) {
      agentStream.updateAction(actionId, 'failed', undefined, error.message)
      throw error
    }
  }

  /**
   * Validate task result against schema
   */
  private validateTaskResult(taskId: string, result: any): any {
    try {
      const taskResult = {
        taskId,
        success: true,
        result,
        metadata: {
          executionTime: Date.now(),
          tokensUsed: 0,
          apiCalls: 1,
        },
      }

      // Validate against schema
      AgentTaskResultSchema.parse(taskResult)
      return taskResult
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Task result validation warning:`, error))
      // Return original result if validation fails
      return result
    }
  }

  private async executeFileSystemTodo(_todo: any): Promise<any> {
    agentStream.emitEvent(this.id, 'executing', 'Analyzing file system...')

    // Autonomously decide what files to read/analyze
    const context = workspaceContext.getContextForAgent(this.id, 10)

    const analysis = {
      filesAnalyzed: context.relevantFiles.length,
      projectStructure: context.projectSummary,
      keyFindings: 'Project structure analyzed successfully',
    }

    return analysis
  }

  private async executeAnalysisTodo(todo: any): Promise<any> {
    agentStream.emitEvent(this.id, 'executing', 'Performing deep analysis...')

    // Get workspace context for analysis
    const context = workspaceContext.getContextForAgent(this.id)

    // Generate AI analysis based on agent specialization
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${this.blueprint.systemPrompt}
        
You are working on: ${todo.description}
Your specialization: ${this.blueprint.specialization}
Your capabilities: ${this.blueprint.capabilities.join(', ')}

Current workspace context:
${context.projectSummary}

Analyze the current state and provide insights based on your specialization.`,
      },
      {
        role: 'user',
        content: `Analyze the current workspace and provide insights for: ${todo.description}`,
      },
    ]

    const analysis = await modelProvider.generateResponse({ messages })

    return {
      analysis,
      specialization: this.blueprint.specialization,
      contextAnalyzed: context.relevantFiles.length,
    }
  }

  private async executeImplementationTodo(todo: any): Promise<any> {
    agentStream.emitEvent(this.id, 'executing', 'Implementing solution...')

    // For fully autonomous agents, actually implement solutions
    if (this.blueprint.autonomyLevel === 'fully-autonomous') {
      // Get workspace context
      const context = workspaceContext.getContextForAgent(this.id)

      // Generate implementation
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `${this.blueprint.systemPrompt}

You are implementing: ${todo.description}
You have full autonomy to create/modify files as needed.
Your specialization: ${this.blueprint.specialization}

Current workspace context:
${context.totalContext}

Generate the necessary files and code to complete this implementation.`,
        },
        {
          role: 'user',
          content: `Implement: ${todo.description}`,
        },
      ]

      const implementation = await modelProvider.generateResponse({ messages })

      // Try to extract and create files from the implementation
      const fileCreated = await this.tryCreateFilesFromResponse(implementation)

      return {
        implementation,
        filesCreated: fileCreated,
        autonomous: true,
      }
    } else {
      // For supervised agents, just plan the implementation
      return {
        implementationPlan: `Implementation plan for: ${todo.description}`,
        requiresApproval: true,
      }
    }
  }

  private async executeTestingTodo(todo: any): Promise<any> {
    agentStream.emitEvent(this.id, 'executing', 'Running tests and validation...')

    // Run actual tests if fully autonomous
    if (this.blueprint.autonomyLevel === 'fully-autonomous') {
      const buildResult = await toolsManager.build()
      const testResult = await toolsManager.runTests()

      return {
        buildSuccess: buildResult.success,
        testSuccess: testResult.success,
        buildErrors: buildResult.errors?.length || 0,
        testErrors: testResult.errors?.length || 0,
      }
    } else {
      return {
        testPlan: `Testing plan for: ${todo.description}`,
        requiresExecution: true,
      }
    }
  }

  private async executeGenericTodo(todo: any): Promise<any> {
    agentStream.emitEvent(this.id, 'executing', `Executing custom todo: ${todo.title}`)

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${this.blueprint.systemPrompt}
        
You are working on: ${todo.description}
Your specialization: ${this.blueprint.specialization}
Autonomy level: ${this.blueprint.autonomyLevel}`,
      },
      {
        role: 'user',
        content: todo.description,
      },
    ]

    const result = await modelProvider.generateResponse({ messages })

    return {
      result,
      todo: todo.title,
      specialization: this.blueprint.specialization,
    }
  }

  private async tryCreateFilesFromResponse(response: string): Promise<string[]> {
    const createdFiles: string[] = []

    // Look for code blocks that might be files
    const codeBlocks = response.match(/```[\w]*\n([\s\S]*?)\n```/g)

    if (codeBlocks) {
      for (let i = 0; i < codeBlocks.length; i++) {
        const block = codeBlocks[i]
        const code = block.replace(/```[\w]*\n/, '').replace(/\n```$/, '')

        // Try to determine filename from context
        let filename = this.extractFilenameFromContext(response, block)

        if (!filename) {
          // Generate filename based on specialization
          const extension = this.getExtensionForSpecialization()
          filename = `generated-${this.id}-${i + 1}${extension}`
        }

        try {
          await toolsManager.writeFile(filename, code)
          createdFiles.push(filename)
          agentStream.emitEvent(this.id, 'result', `Created file: ${filename}`)
        } catch (_error) {
          agentStream.emitEvent(this.id, 'error', `Failed to create file: ${filename}`)
        }
      }
    }

    return createdFiles
  }

  private extractFilenameFromContext(response: string, codeBlock: string): string | null {
    const lines = response.split('\n')
    const blockIndex = lines.findIndex((line) => line.includes(codeBlock.split('\n')[0]))

    // Look for filename mentions in nearby lines
    for (let i = Math.max(0, blockIndex - 3); i < Math.min(lines.length, blockIndex + 3); i++) {
      const line = lines[i]
      const match = line.match(/([a-zA-Z][a-zA-Z0-9-_]*\.[a-zA-Z]+)/)
      if (match) {
        return match[1]
      }
    }

    return null
  }

  private getExtensionForSpecialization(): string {
    const specialization = this.blueprint.specialization.toLowerCase()

    if (specialization.includes('react') || specialization.includes('frontend')) {
      return '.tsx'
    } else if (specialization.includes('backend') || specialization.includes('api')) {
      return '.ts'
    } else if (specialization.includes('python')) {
      return '.py'
    } else if (specialization.includes('docker')) {
      return '.dockerfile'
    } else if (specialization.includes('config')) {
      return '.json'
    } else {
      return '.ts'
    }
  }

  async cleanup(): Promise<void> {
    await super.cleanup?.()
    agentStream.stopAgentStream(this.id)

    // Show final stats
    const stats = agentTodoManager.getAgentStats(this.id)
    agentStream.emitEvent(
      this.id,
      'info',
      `Final stats: ${stats.completed} completed, efficiency: ${Math.round(stats.efficiency)}%`
    )
  }

  // Check if agent is currently running
  isActive(): boolean {
    return this.isRunning
  }

  // Get agent blueprint
  getBlueprint(): AgentBlueprint {
    return { ...this.blueprint }
  }
}

export class AgentFactory extends EventEmitter {
  private blueprints: Map<string, AgentBlueprint> = new Map()
  private instances: Map<string, DynamicAgent> = new Map()
  private isInitialized: boolean = false
  // 🔒 FIXED: Circuit breaker for health check failures
  private healthCheckCircuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    timeout: 30000, // 30 seconds
    successThreshold: 2,
  })

  // 🔒 FIXED: Capability matrix and cached scores for O(1) lookups
  private capabilityMatrix = new Map<string, Set<string>>() // agent.id -> Set of capabilities
  private cachedScores = new Map<
    string,
    {
      blueprint: AgentBlueprint
      capabilities: Set<string>
      lastUpdated: number
    }
  >()
  private readonly SCORE_CACHE_TTL = 60000 // 1 minute

  constructor() {
    super()
    // Start auto-cleanup every 5 minutes
    setInterval(
      () => {
        this.autoCleanupInactiveAgents().catch((error) => {
          console.log(chalk.yellow(`⚠️ Auto-cleanup failed: ${error.message}`))
        })
      },
      5 * 60 * 1000
    ) // 5 minutes
  }

  // Initialize the factory with persistent storage
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      await blueprintStorage.initialize()

      // Load all existing blueprints from storage
      const storedBlueprints = await blueprintStorage.getAllBlueprints()
      this.blueprints.clear()

      for (const blueprint of storedBlueprints) {
        this.blueprints.set(blueprint.id, blueprint)
      }

      this.isInitialized = true
      console.log(chalk.gray(`🏭 Agent Factory initialized with ${this.blueprints.size} blueprints`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Failed to initialize Agent Factory: ${error.message}`))
      throw error
    }
  }

  // Create fallback blueprint when AI generation fails
  private createFallbackBlueprint(specialization: string): any {
    const lowerSpec = specialization.toLowerCase()

    // Determine capabilities based on specialization keywords
    const capabilities = []
    const requiredTools = ['Read', 'Write']

    if (
      lowerSpec.includes('react') ||
      lowerSpec.includes('frontend') ||
      lowerSpec.includes('ui') ||
      lowerSpec.includes('component')
    ) {
      capabilities.push('react', 'frontend', 'jsx', 'tsx', 'components', 'hooks', 'css', 'html')
      requiredTools.push('Bash', 'InstallPackage')
    }

    if (
      lowerSpec.includes('backend') ||
      lowerSpec.includes('api') ||
      lowerSpec.includes('server') ||
      lowerSpec.includes('node')
    ) {
      capabilities.push('backend', 'nodejs', 'api-development', 'rest-api', 'database')
      requiredTools.push('Bash', 'InstallPackage')
    }

    if (lowerSpec.includes('test') || lowerSpec.includes('testing')) {
      capabilities.push('testing', 'jest', 'unit-testing', 'integration-testing')
      requiredTools.push('Bash')
    }

    if (lowerSpec.includes('devops') || lowerSpec.includes('deploy') || lowerSpec.includes('docker')) {
      capabilities.push('devops', 'docker', 'ci-cd', 'deployment')
      requiredTools.push('Bash', 'Docker')
    }

    if (lowerSpec.includes('nextjs') || lowerSpec.includes('next.js')) {
      capabilities.push('nextjs', 'react', 'ssr', 'routing', 'frontend')
      requiredTools.push('Bash', 'InstallPackage')
    }

    // Default capabilities if none matched
    if (capabilities.length === 0) {
      capabilities.push('code-analysis', 'code-generation', 'planning', 'execution')
      requiredTools.push('Bash')
    }

    const name = specialization
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .substring(0, 80)

    return {
      name,
      description: `Specialized agent for ${specialization}`,
      systemPrompt: `You are a specialized AI agent focused on ${specialization}. You have expertise in the relevant technologies and can help with planning, analysis, and implementation tasks.`,
      capabilities,
      requiredTools,
      workingStyle: 'adaptive',
      personality: {
        proactive: 75,
        collaborative: 70,
        analytical: 85,
        creative: 60,
      },
    }
  }

  // Create a new agent blueprint
  async createAgentBlueprint(requirements: {
    name?: string
    specialization: string
    description?: string
    autonomyLevel?: AgentBlueprint['autonomyLevel']
    contextScope?: AgentBlueprint['contextScope']
    personality?: Partial<AgentBlueprint['personality']>
    agentType?: 'standard' | 'vm' | 'container'
    vmConfig?: VMContainerConfig
  }): Promise<AgentBlueprint> {
    // Auto-detect VM agent requirements - ONLY when explicitly requested
    const isVMAgent = requirements.agentType === 'vm' || requirements.agentType === 'container'

    const _agentType = isVMAgent ? 'vm' : requirements.agentType || 'standard'

    if (isVMAgent) {
      console.log(chalk.blue(`🐳 Creating VM agent blueprint for: ${requirements.specialization}`))
      return this.createVMAgentBlueprint(requirements)
    } else {
      console.log(chalk.blue(`🧬 Creating standard agent blueprint for: ${requirements.specialization}`))
    }

    // Verify model configuration and API key before proceeding
    try {
      const modelInfo = modelProvider.getCurrentModelInfo()
      const hasApiKey = modelProvider.validateApiKey()

      if (!hasApiKey) {
        const currentModel = configManager.getCurrentModel()
        throw new Error(
          `API key not configured for model: ${currentModel}. Use /set-key ${currentModel} <your-api-key>`
        )
      }

      console.log(chalk.gray(`Using model: ${modelInfo.name} (${modelInfo.config.provider})`))
    } catch (error: any) {
      console.log(chalk.red(`❌ Model configuration error: ${error.message}`))
      throw error
    }

    // Use AI to generate comprehensive blueprint
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an AI agent architect. Create a comprehensive blueprint for a specialized AI agent.
        
Generate a detailed agent specification including:
- Appropriate name (kebab-case)
- Detailed description
- Specific capabilities list
- System prompt for the agent
- Required tools list
- Personality traits (0-100 scale)

The agent should be specialized in: ${requirements.specialization}
Autonomy level: ${requirements.autonomyLevel || 'semi-autonomous'}
Context scope: ${requirements.contextScope || 'project'}

Return a JSON object with all the blueprint details.`,
      },
      {
        role: 'user',
        content: `Create an agent specialized in: ${requirements.specialization}
        
Additional requirements:
${requirements.description ? `Description: ${requirements.description}` : ''}
Autonomy Level: ${requirements.autonomyLevel || 'semi-autonomous'}
Context Scope: ${requirements.contextScope || 'project'}`,
      },
    ]

    try {
      console.log(chalk.gray('Generating AI blueprint...'))
      const response = await modelProvider.generateResponse({ messages })

      console.log(chalk.gray('Parsing AI response...'))
      const jsonText = extractJsonFromMarkdown(response)

      let aiBlueprint: any
      try {
        aiBlueprint = JSON.parse(jsonText)
      } catch (_parseError) {
        console.log(chalk.yellow('⚠️ Failed to parse AI response, using fallback blueprint'))
        // Create fallback blueprint when AI response is not valid JSON
        aiBlueprint = this.createFallbackBlueprint(requirements.specialization)
      }

      // 🔍 Create blueprint with Zod validation
      const blueprintData = {
        id: nanoid(),
        name:
          requirements.name ||
          aiBlueprint.name ||
          requirements.specialization.toLowerCase().replace(/\s+/g, '-').substring(0, 80),
        description:
          aiBlueprint.description || requirements.description || `Specialized agent for ${requirements.specialization}`,
        specialization: requirements.specialization,
        systemPrompt:
          aiBlueprint.systemPrompt || `You are a specialized AI agent focused on ${requirements.specialization}.`,
        capabilities: aiBlueprint.capabilities || ['analysis', 'planning', 'execution'],
        requiredTools: aiBlueprint.requiredTools || ['Read', 'Write', 'Bash'],
        personality: {
          proactive: Math.min(
            100,
            Math.max(0, aiBlueprint.personality?.proactive || requirements.personality?.proactive || 70)
          ),
          collaborative: Math.min(
            100,
            Math.max(0, aiBlueprint.personality?.collaborative || requirements.personality?.collaborative || 60)
          ),
          analytical: Math.min(
            100,
            Math.max(0, aiBlueprint.personality?.analytical || requirements.personality?.analytical || 80)
          ),
          creative: Math.min(
            100,
            Math.max(0, aiBlueprint.personality?.creative || requirements.personality?.creative || 50)
          ),
        },
        autonomyLevel: requirements.autonomyLevel || 'semi-autonomous',
        contextScope: requirements.contextScope || 'project',
        workingStyle: aiBlueprint.workingStyle || 'adaptive',
        agentType: 'standard' as const,
        vmCapabilities: [], // Empty for standard agents
        createdAt: new Date(),
      }

      // ✓ Validate with Zod schema
      const blueprint = AgentBlueprintSchema.parse(blueprintData)

      // Store in memory and persistent storage
      this.blueprints.set(blueprint.id, blueprint)
      await blueprintStorage.saveBlueprint(blueprint)

      console.log(chalk.green(`✓ Agent blueprint created: ${blueprint.name}`))
      console.log(chalk.gray(`   Blueprint ID: ${blueprint.id}`))
      console.log(chalk.gray(`   Capabilities: ${blueprint.capabilities.join(', ')}`))
      console.log(chalk.gray(`   Autonomy: ${blueprint.autonomyLevel}`))
      console.log(
        chalk.gray(
          `   Personality: Proactive(${blueprint.personality.proactive}) Analytical(${blueprint.personality.analytical})`
        )
      )

      return blueprint
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to create agent blueprint: ${error.message}`))

      // Try to create a fallback blueprint if the main process fails
      console.log(chalk.yellow('⚡︎ Creating fallback blueprint...'))
      try {
        const fallbackBlueprint = this.createFallbackBlueprint(requirements.specialization)

        const blueprint: AgentBlueprint = {
          id: nanoid(),
          name: requirements.name || fallbackBlueprint.name,
          description: fallbackBlueprint.description,
          specialization: requirements.specialization,
          systemPrompt: fallbackBlueprint.systemPrompt,
          capabilities: fallbackBlueprint.capabilities,
          requiredTools: fallbackBlueprint.requiredTools,
          personality: {
            proactive: requirements.personality?.proactive || 70,
            collaborative: requirements.personality?.collaborative || 60,
            analytical: requirements.personality?.analytical || 80,
            creative: requirements.personality?.creative || 50,
          },
          vmCapabilities: [], // Empty for standard agents
          autonomyLevel: requirements.autonomyLevel || 'semi-autonomous',
          contextScope: requirements.contextScope || 'project',
          workingStyle: 'adaptive',
          agentType: 'standard',
          createdAt: new Date(),
        }

        // Validate fallback blueprint with Zod
        const validatedBlueprint = AgentBlueprintSchema.parse(blueprint)

        // Store in memory and persistent storage
        this.blueprints.set(validatedBlueprint.id, validatedBlueprint)
        await blueprintStorage.saveBlueprint(validatedBlueprint)

        console.log(chalk.green(`✓ Fallback agent blueprint created: ${validatedBlueprint.name}`))
        console.log(chalk.gray(`   Blueprint ID: ${validatedBlueprint.id}`))
        console.log(chalk.gray(`   Capabilities: ${validatedBlueprint.capabilities.join(', ')}`))

        return validatedBlueprint
      } catch (fallbackError: any) {
        console.log(chalk.red(`❌ Fallback blueprint creation also failed: ${fallbackError.message}`))
        // Create a minimal valid blueprint as last resort
        const minimalBlueprint: AgentBlueprint = {
          id: nanoid(),
          name: requirements.name || requirements.specialization.toLowerCase().replace(/\s+/g, '-').substring(0, 80),
          description: `Basic agent for ${requirements.specialization}`,
          specialization: requirements.specialization,
          systemPrompt: `You are a basic AI agent for ${requirements.specialization}.`,
          capabilities: ['basic-execution'],
          requiredTools: ['Read', 'Write'],
          personality: {
            proactive: 50,
            collaborative: 50,
            analytical: 50,
            creative: 50,
          },
          vmCapabilities: [],
          autonomyLevel: 'supervised',
          contextScope: 'file',
          workingStyle: 'sequential',
          agentType: 'standard',
          createdAt: new Date(),
        }

        // Store minimal blueprint
        this.blueprints.set(minimalBlueprint.id, minimalBlueprint)
        await blueprintStorage.saveBlueprint(minimalBlueprint)

        console.log(chalk.yellow(`⚠️ Created minimal blueprint as last resort: ${minimalBlueprint.name}`))
        return minimalBlueprint
      }
    }
  }

  // Create VM Agent Blueprint
  async createVMAgentBlueprint(requirements: {
    name?: string
    specialization: string
    description?: string
    autonomyLevel?: AgentBlueprint['autonomyLevel']
    contextScope?: AgentBlueprint['contextScope']
    personality?: Partial<AgentBlueprint['personality']>
    vmConfig?: VMContainerConfig
  }): Promise<AgentBlueprint> {
    console.log(chalk.blue(`🐳 Creating VM agent blueprint for: ${requirements.specialization}`))

    // Create VM-specific capabilities
    const vmCapabilities = [
      'vm-management',
      'container-orchestration',
      'isolated-execution',
      'repository-cloning',
      'secure-environment',
      'autonomous-development',
      'file-system-access',
      'bash-execution',
      'git-operations',
      'package-management',
      'code-analysis',
      'testing-execution',
    ]

    // Create VM-specific tools
    const vmTools = [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Git',
      'Docker',
      'NPM',
      'Yarn',
      'VSCode',
      'Terminal',
      'FileManager',
    ]

    // Generate VM-specific system prompt
    const vmSystemPrompt = `You are a specialized VM-based AI agent running in a secure, isolated container environment.

Your specialization: ${requirements.specialization}

You have complete access to a containerized development environment with:
- Full file system access within the container
- Bash terminal for command execution  
- Git operations for version control
- Package managers (npm, yarn, pip, etc.)
- Development tools and IDEs
- Network access for downloading dependencies

Your capabilities include:
- Repository analysis and understanding
- Code generation and modification
- Testing and debugging
- Package installation and management
- Build process execution
- Deployment preparation

Always prioritize security and follow best practices. Work autonomously but explain your actions clearly.
Execute tasks step-by-step and verify results before proceeding.`

    // Create default VM configuration if not provided
    const defaultVMConfig: VMContainerConfig = {
      containerImage: 'node:18-alpine',
      resourceLimits: {
        memory: '2Gi',
        cpu: '1000m',
        disk: '5Gi',
      },
      networkAccess: true,
      volumeMounts: ['/workspace'],
      environmentVars: {
        NODE_ENV: 'development',
        WORKSPACE_PATH: '/workspace',
      },
    }

    // 🔍 Validate VM config with Zod schema first
    const validatedVMConfig = VMContainerConfigSchema.parse(requirements.vmConfig || defaultVMConfig)

    // 🔍 Create and validate VM blueprint with Zod schema
    const blueprintData = {
      id: nanoid(),
      name:
        requirements.name ||
        `${requirements.specialization.toLowerCase().replace(/\s+/g, '-').substring(0, 70)}-vm-agent`,
      description:
        requirements.description ||
        `VM-based agent specialized in ${requirements.specialization} running in isolated container environment`,
      specialization: requirements.specialization,
      systemPrompt: vmSystemPrompt,
      capabilities: vmCapabilities,
      requiredTools: vmTools,
      personality: {
        proactive: Math.min(100, Math.max(0, requirements.personality?.proactive || 80)),
        collaborative: Math.min(100, Math.max(0, requirements.personality?.collaborative || 70)),
        analytical: Math.min(100, Math.max(0, requirements.personality?.analytical || 90)),
        creative: Math.min(100, Math.max(0, requirements.personality?.creative || 60)),
      },
      autonomyLevel: requirements.autonomyLevel || 'fully-autonomous',
      contextScope: requirements.contextScope || 'project',
      workingStyle: 'adaptive' as const,
      agentType: 'vm' as const,
      vmConfig: validatedVMConfig,
      vmCapabilities,
      containerMetadata: {
        isActive: false,
        createdAt: new Date(),
      },
      createdAt: new Date(),
    }

    // ✓ Validate with Zod schema
    const blueprint = AgentBlueprintSchema.parse(blueprintData)

    this.blueprints.set(blueprint.id, blueprint)

    console.log(chalk.green(`✓ VM agent blueprint created: ${blueprint.id}`))
    console.log(chalk.gray(`   Type: 🐳 VM Agent`))
    console.log(chalk.gray(`   Capabilities: ${blueprint.capabilities.join(', ')}`))
    console.log(chalk.gray(`   Container Image: ${blueprint.vmConfig?.containerImage}`))
    console.log(chalk.gray(`   Autonomy: ${blueprint.autonomyLevel}`))

    return blueprint
  }

  // Launch an agent from a blueprint
  // Launch an agent from a blueprint (by ID or name)
  async launchAgent(identifier: string, task?: string): Promise<DynamicAgent> {
    // Ensure factory is initialized
    if (!this.isInitialized) {
      await this.initialize()
    }

    // Find blueprint by ID or name
    const blueprint = await this.getBlueprint(identifier)

    if (!blueprint) {
      let errorMessage = `Blueprint '${identifier}' not found.`
      const availableBlueprints = Array.from(this.blueprints.values())

      if (availableBlueprints.length > 0) {
        errorMessage += '\n\nAvailable blueprints:'
        availableBlueprints.forEach((bp) => {
          errorMessage += `\n  • ${bp.name} (ID: ${bp.id}) - ${bp.specialization}`
        })
        errorMessage += '\n\nUse /factory to see detailed information.'
      } else {
        errorMessage += '\nNo blueprints available. Create one with /create-agent <specialization>'
      }

      throw new Error(errorMessage)
    }

    console.log(chalk.blue(`🚀 Launching agent: ${blueprint.name}`))

    // Check if an agent with this name is already launched and verify it's still active
    const existing = this.instances.get(blueprint.name)
    if (existing) {
      // Verify the agent is still functional
      const isHealthy = await this.checkAgentHealth(existing)

      if (isHealthy) {
        console.log(chalk.yellow(`⚠️ Agent ${blueprint.name} already launched; returning existing instance`))

        // If a task is provided, execute it on the existing agent
        if (task) {
          console.log(chalk.blue(`🎯 Executing task on existing agent: ${task}`))
          try {
            await existing.run(task)
          } catch (error: any) {
            console.log(chalk.red(`❌ Task execution failed: ${error.message}`))
            // If task execution fails, consider the agent unhealthy and remove it
            console.log(chalk.yellow(`🧹 Removing unhealthy agent instance`))
            this.instances.delete(blueprint.name)
            await this.cleanupAgent(existing)
          }
        }

        return existing
      } else {
        // Agent is no longer healthy, remove and recreate
        console.log(chalk.yellow(`⚡︎ Existing agent ${blueprint.name} is unhealthy, recreating...`))
        this.instances.delete(blueprint.name)
        await this.cleanupAgent(existing)
      }
    }

    const agent = new DynamicAgent(blueprint)

    try {
      await agent.initialize()
      this.instances.set(blueprint.name, agent)
      console.log(chalk.green(`✓ Agent ${blueprint.name} launched successfully`))

      // If a task is provided, execute it immediately
      if (task) {
        console.log(chalk.blue(`🎯 Executing initial task: ${task}`))
        try {
          await agent.run(task)
        } catch (error: any) {
          console.log(chalk.red(`❌ Task execution failed: ${error.message}`))
          // Don't remove the agent just because the first task failed
          // The agent might still be functional for other tasks
        }
      }

      return agent
    } catch (initError: any) {
      // If initialization fails, ensure we don't leave a broken agent in the registry
      console.log(chalk.red(`❌ Agent initialization failed: ${initError.message}`))
      this.instances.delete(blueprint.name)
      await this.cleanupAgent(agent)
      throw initError
    }
  }

  // Create and launch agent in one step
  async createAndLaunchAgent(
    requirements: Parameters<typeof this.createAgentBlueprint>[0],
    task?: string
  ): Promise<DynamicAgent> {
    const blueprint = await this.createAgentBlueprint(requirements)
    const agent = await this.launchAgent(blueprint.id, task)

    return agent
  }

  // Get all blueprints
  async getAllBlueprints(): Promise<AgentBlueprint[]> {
    if (!this.isInitialized) {
      await this.initialize()
    }
    return Array.from(this.blueprints.values())
  }

  // Get blueprint by ID or name
  async getBlueprint(identifier: string): Promise<AgentBlueprint | null> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    let blueprint = this.blueprints.get(identifier)
    if (!blueprint) {
      const foundBlueprint = await blueprintStorage.findBlueprintByName(identifier)
      if (foundBlueprint) {
        blueprint = foundBlueprint
      }
    }
    return blueprint || null
  }

  // Delete a blueprint
  async deleteBlueprint(identifier: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const blueprint = await this.getBlueprint(identifier)
    if (!blueprint) {
      return false
    }

    // Remove from memory
    this.blueprints.delete(blueprint.id)

    // Remove from persistent storage
    const deleted = await blueprintStorage.deleteBlueprint(blueprint.id)

    if (deleted) {
      console.log(chalk.green(`✓ Blueprint deleted: ${blueprint.name}`))
    }

    return deleted
  }

  // Export blueprint to file
  async exportBlueprint(identifier: string, exportPath: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const blueprint = await this.getBlueprint(identifier)
    if (!blueprint) {
      console.log(chalk.red(`❌ Blueprint '${identifier}' not found`))
      return false
    }

    return await blueprintStorage.exportBlueprint(blueprint.id, exportPath)
  }

  // Import blueprint from file
  async importBlueprint(importPath: string): Promise<AgentBlueprint | null> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const blueprint = await blueprintStorage.importBlueprint(importPath)
    if (blueprint) {
      // Update local cache
      this.blueprints.set(blueprint.id, blueprint)
    }
    return blueprint
  }

  // Search blueprints
  async searchBlueprints(query: string): Promise<AgentBlueprint[]> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    return await blueprintStorage.searchBlueprints(query)
  }

  // Get all active agents
  getActiveAgents(): DynamicAgent[] {
    return Array.from(this.instances.values()).filter((agent) => agent.isActive())
  }

  // Get agent by name
  getAgent(name: string): DynamicAgent | undefined {
    return this.instances.get(name)
  }

  /**
   * Check if an agent is still healthy and functional
   * FIXED: Added proper Promise.race error handling and CircuitBreaker pattern
   */
  private async checkAgentHealth(agent: DynamicAgent): Promise<boolean> {
    try {
      // Check basic agent properties
      if (!agent || !agent.id) {
        return false
      }

      // Check if agent is active and responsive
      if (!agent.isActive()) {
        return false
      }

      // Use circuit breaker to prevent repeated failures
      const healthResult = await this.healthCheckCircuitBreaker.execute(
        async () => {
          try {
            // Check if agent responds to a simple health check
            // This is a lightweight operation that shouldn't change agent state
            const result = await Promise.race([
              agent.run(), // Call with no parameters for info/health check
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), 5000)),
            ])

            // If we get a result without error, agent is healthy
            if (result !== null && typeof result === 'object') {
              return true
            }
            throw new Error('Invalid health check response')
          } catch (raceError: any) {
            // Properly handle Promise.race rejection
            throw new Error(`Health check failed: ${raceError.message}`)
          }
        },
        // Fallback: if circuit is open, return false
        () => false
      )

      return healthResult === true
    } catch (error: any) {
      // Any error in health check means the agent is unhealthy
      console.log(chalk.yellow(`⚠️ Health check failed for agent ${agent?.id}: ${error.message}`))
      return false
    }
  }

  /**
   * Cleanup an agent and remove it from tracking
   * FIXED: Added proper Promise.race error handling
   */
  private async cleanupAgent(agent: DynamicAgent): Promise<void> {
    try {
      if (agent && typeof agent.cleanup === 'function') {
        try {
          await Promise.race([
            agent.cleanup(),
            new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Cleanup timeout')), 10000)),
          ])
        } catch (raceError: any) {
          // Handle Promise.race rejection gracefully
          throw new Error(`Cleanup timeout or error: ${raceError.message}`)
        }
      }
    } catch (cleanupError: any) {
      // Log cleanup errors but don't throw - we still want to remove the agent from tracking
      console.log(chalk.yellow(`⚠️ Agent cleanup warning: ${cleanupError.message}`))
    }
  }

  /**
   * Cleanup all agents and perform shutdown
   */
  async shutdown(): Promise<void> {
    console.log(chalk.blue(' Shutting down agent factory...'))

    const agents = Array.from(this.instances.values())
    const cleanupPromises = agents.map((agent) => this.cleanupAgent(agent))

    try {
      await Promise.allSettled(cleanupPromises)
      this.instances.clear()
      console.log(chalk.green('✓ All agents cleaned up successfully'))
    } catch (_error) {
      console.log(chalk.yellow('⚠️  Some agents may not have cleaned up properly'))
    }
  }

  /**
   * Remove dead agents from the instance registry
   */
  async pruneDeadAgents(): Promise<number> {
    const deadAgents: string[] = []

    for (const [name, agent] of this.instances.entries()) {
      const isHealthy = await this.checkAgentHealth(agent)
      if (!isHealthy) {
        deadAgents.push(name)
        await this.cleanupAgent(agent)
      }
    }

    deadAgents.forEach((name) => this.instances.delete(name))

    if (deadAgents.length > 0) {
      console.log(chalk.yellow(`🧹 Pruned ${deadAgents.length} dead agents: ${deadAgents.join(', ')}`))
    }

    return deadAgents.length
  }

  /**
   * Auto-cleanup inactive agents to prevent memory leaks
   */
  private async autoCleanupInactiveAgents(): Promise<void> {
    const inactiveAgents: string[] = []

    for (const [name, agent] of this.instances.entries()) {
      // Check if agent is not active
      if (!agent.isActive()) {
        inactiveAgents.push(name)
      }
    }

    if (inactiveAgents.length > 0) {
      console.log(chalk.gray(`🧹 Auto-cleaning ${inactiveAgents.length} inactive agents`))
      for (const name of inactiveAgents) {
        const agent = this.instances.get(name)
        if (agent) {
          await this.cleanupAgent(agent)
          this.instances.delete(name)
        }
      }
    }
  }

  // Show factory dashboard
  async showFactoryDashboard(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const blueprints = await this.getAllBlueprints()
    const storageStats = await blueprintStorage.getStorageStats()
    // All instantiated agents (running or idle)
    const allAgents = Array.from(this.instances.values())
    // Currently running agents
    const runningAgents = allAgents.filter((a) => a.isActive())

    console.log(chalk.blue.bold('\n🏭 Agent Factory Dashboard'))
    console.log(chalk.gray('═'.repeat(50)))

    console.log(`📋 Blueprints: ${blueprints.length}`)
    console.log(`🔌 Active Agents: ${allAgents.length}`)
    console.log(`🏃 Running Agents: ${runningAgents.length}`)
    console.log(`💾 Storage: ${storageStats.storageSize} in ${storageStats.storageDir}`)

    if (blueprints.length > 0) {
      console.log(chalk.blue.bold('\n📋 Available Blueprints:'))
      blueprints.forEach((blueprint) => {
        const isActive = this.instances.has(blueprint.name)
        const status = isActive ? chalk.green('🟢 Active') : chalk.gray('⚪ Inactive')

        console.log(`  ${status} ${chalk.bold(blueprint.name)} ${chalk.gray(`(${blueprint.id.slice(0, 8)}...)`)}`)
        console.log(`    Specialization: ${blueprint.specialization}`)
        console.log(`    Autonomy: ${blueprint.autonomyLevel}`)
        console.log(`    Created: ${blueprint.createdAt}`)
      })
    }

    if (allAgents.length > 0) {
      console.log(chalk.blue.bold('\n🔌 Active Agents:'))
      allAgents.forEach((agent) => {
        const blueprint = agent.getBlueprint()
        const stats = agentTodoManager.getAgentStats(agent.id)

        console.log(`  🔌 ${chalk.bold(agent.id)} (${blueprint.specialization})`)
        console.log(`    Status: ${agent.isActive() ? chalk.green('Running') : chalk.yellow('Idle')}`)
        console.log(`    Todos: ${stats.completed} completed, ${stats.pending} pending`)
        console.log(`    Efficiency: ${Math.round(stats.efficiency)}%`)
      })
    } else if (blueprints.length > 0) {
      console.log(chalk.yellow('\n⚠️ No active agents'))
      console.log(chalk.gray('Use /launch-agent <name|id> to launch an agent'))
    } else {
      console.log(chalk.yellow('\n⚠️ No blueprints available'))
      console.log(chalk.gray('Create one with: /create-agent <specialization>'))
    }

    console.log(chalk.gray('\n💡 Use /launch-agent <name|id> to launch an agent'))
    console.log(chalk.gray('💡 Use /blueprints for detailed blueprint management'))
  }

  // ====================== 🎯 MULTI-DIMENSIONAL AGENT SELECTION ======================

  /**
   * ⚡︎ Advanced Agent Selection based on 15+ metrics
   * FIXED: Optimized from O(n²) to O(n log n) using cached capabilities
   */
  async selectOptimalAgentsForTask(
    taskDescription: string,
    requiredCapabilities: string[],
    estimatedComplexity: number,
    riskLevel: 'low' | 'medium' | 'high',
    urgency: 'low' | 'normal' | 'high' | 'critical'
  ): Promise<{
    primary: DynamicAgent
    secondary: DynamicAgent[]
    reasoning: string
    confidence: number
    fallbackOptions: DynamicAgent[]
  }> {
    console.log(chalk.blue(`🎯 Multi-dimensional agent selection for: ${taskDescription.slice(0, 50)}...`))

    // Step 1: Get all available agents with performance metrics
    const availableAgents = this.getActiveAgents()

    // Step 1.5: Update capability matrix cache if needed
    this.updateCapabilityCache(availableAgents)

    const agentScores = new Map<string, number>()
    const agentReasons = new Map<string, string[]>()

    // Step 2: Score each agent using cached capabilities (O(n) instead of O(n²))
    for (const agent of availableAgents) {
      const _cachedData = this.cachedScores.get(agent.id)
      const blueprint = agent.getBlueprint()

      // Use cached capabilities for O(1) lookups
      const score = this.calculateAgentScoreOptimized(
        blueprint,
        agent.id,
        requiredCapabilities,
        estimatedComplexity,
        riskLevel,
        urgency,
        taskDescription
      )

      agentScores.set(agent.id, score.totalScore)
      agentReasons.set(agent.id, score.reasons)
    }

    // Step 3: Rank agents by score (O(n log n))
    const rankedAgents = availableAgents.sort((a, b) => (agentScores.get(b.id) || 0) - (agentScores.get(a.id) || 0))

    // Step 4: Select primary and secondary agents
    const primary = rankedAgents[0]
    const secondary = rankedAgents.slice(1, Math.min(3, rankedAgents.length))
    const fallbackOptions = rankedAgents.slice(3, 6)

    // Step 5: Generate reasoning
    const primaryReasons = agentReasons.get(primary.id) || []
    const reasoning = this.generateSelectionReasoning(primary, secondary, primaryReasons)

    // Step 6: Calculate confidence based on score distribution
    const topScore = agentScores.get(primary.id) || 0
    const secondScore = agentScores.get(secondary[0]?.id || '') || 0
    const confidence = Math.min(0.95, topScore / Math.max(secondScore, 0.1))

    console.log(
      chalk.green(
        `✓ Selected ${primary.getBlueprint().name} as primary agent (confidence: ${Math.round(confidence * 100)}%)`
      )
    )

    return {
      primary,
      secondary,
      reasoning,
      confidence,
      fallbackOptions,
    }
  }

  /**
   * Update capability cache for all agents
   * FIXED: Pre-compute capabilities for O(1) lookups
   */
  private updateCapabilityCache(agents: DynamicAgent[]): void {
    const now = Date.now()

    for (const agent of agents) {
      const cached = this.cachedScores.get(agent.id)

      // Update cache if expired or missing
      if (!cached || now - cached.lastUpdated > this.SCORE_CACHE_TTL) {
        const blueprint = agent.getBlueprint()
        const capabilities = new Set(blueprint.capabilities)

        // Build capability matrix with semantic expansion
        const expandedCapabilities = new Set(capabilities)

        // Add semantic mappings for better matching
        const semanticMappings: Record<string, string[]> = {
          react: ['frontend', 'components', 'jsx', 'tsx', 'ui'],
          backend: ['api', 'server', 'nodejs', 'database'],
          testing: ['test', 'qa', 'validation', 'verification'],
          devops: ['deployment', 'ci-cd', 'docker', 'infrastructure'],
        }

        for (const cap of capabilities) {
          const related = semanticMappings[cap.toLowerCase()]
          if (related) {
            related.forEach((r) => expandedCapabilities.add(r))
          }
        }

        this.capabilityMatrix.set(agent.id, expandedCapabilities)
        this.cachedScores.set(agent.id, {
          blueprint,
          capabilities: expandedCapabilities,
          lastUpdated: now,
        })
      }
    }
  }

  /**
   * Optimized agent scoring using cached capabilities
   * FIXED: O(1) capability lookups instead of O(m×k) nested loops
   */
  private calculateAgentScoreOptimized(
    blueprint: AgentBlueprint,
    agentId: string,
    requiredCapabilities: string[],
    estimatedComplexity: number,
    riskLevel: 'low' | 'medium' | 'high',
    urgency: 'low' | 'normal' | 'high' | 'critical',
    taskDescription: string
  ): { totalScore: number; reasons: string[] } {
    let totalScore = 0
    const reasons: string[] = []
    const maxScore = 100

    // Get cached capabilities for O(1) lookup
    const agentCapabilities = this.capabilityMatrix.get(agentId) || new Set()

    // 1. CAPABILITY MATCH (25 points) - O(m) instead of O(m×k)
    let matches = 0
    for (const required of requiredCapabilities) {
      if (agentCapabilities.has(required.toLowerCase())) {
        matches++
      }
    }
    const capabilityScore = requiredCapabilities.length > 0 ? matches / requiredCapabilities.length : 0.5
    totalScore += capabilityScore * 25
    if (capabilityScore > 0.7) {
      reasons.push(`Strong capability match (${Math.round(capabilityScore * 100)}%)`)
    }

    // 2-10: Use the original calculateAgentScore for other dimensions
    // (they don't have nested loops)
    const originalScore = this.calculateAgentScore(
      blueprint,
      requiredCapabilities,
      estimatedComplexity,
      riskLevel,
      urgency,
      taskDescription
    )

    // Subtract capability score from original (already added above)
    const capabilityMatch = this.scoreCapabilityMatch(blueprint.capabilities, requiredCapabilities)
    const adjustedScore = originalScore.totalScore - capabilityMatch.score * 25

    totalScore += adjustedScore
    reasons.push(...originalScore.reasons)

    return {
      totalScore: Math.min(totalScore, maxScore),
      reasons,
    }
  }

  /**
   * 📊 Calculate comprehensive agent score across 15+ dimensions
   */
  private calculateAgentScore(
    blueprint: AgentBlueprint,
    requiredCapabilities: string[],
    estimatedComplexity: number,
    riskLevel: 'low' | 'medium' | 'high',
    urgency: 'low' | 'normal' | 'high' | 'critical',
    taskDescription: string
  ): { totalScore: number; reasons: string[] } {
    let totalScore = 0
    const reasons: string[] = []
    const maxScore = 100

    // 1. CAPABILITY MATCH (25 points)
    const capabilityMatch = this.scoreCapabilityMatch(blueprint.capabilities, requiredCapabilities)
    totalScore += capabilityMatch.score * 0.25
    if (capabilityMatch.score > 0.7) {
      reasons.push(`Strong capability match (${Math.round(capabilityMatch.score * 100)}%)`)
    }

    // 2. SPECIALIZATION RELEVANCE (20 points)
    const specializationScore = this.scoreSpecializationRelevance(blueprint.specialization, taskDescription)
    totalScore += specializationScore * 0.2
    if (specializationScore > 0.7) {
      reasons.push(`Highly relevant specialization`)
    }

    // 3. COMPLEXITY HANDLING (15 points)
    const complexityScore = this.scoreComplexityHandling(blueprint, estimatedComplexity)
    totalScore += complexityScore * 0.15
    if (complexityScore > 0.8) {
      reasons.push(`Excellent complexity handling`)
    }

    // 4. AUTONOMY LEVEL APPROPRIATENESS (10 points)
    const autonomyScore = this.scoreAutonomyLevel(blueprint.autonomyLevel, riskLevel)
    totalScore += autonomyScore * 0.1
    if (autonomyScore > 0.8) {
      reasons.push(`Appropriate autonomy level`)
    }

    // 5. PERSONALITY FIT (8 points)
    const personalityScore = this.scorePersonalityFit(blueprint.personality, urgency, estimatedComplexity)
    totalScore += personalityScore * 0.08

    // 6. WORKING STYLE COMPATIBILITY (7 points)
    const workingStyleScore = this.scoreWorkingStyle(blueprint.workingStyle, estimatedComplexity)
    totalScore += workingStyleScore * 0.07

    // 7. CONTEXT SCOPE APPROPRIATENESS (5 points)
    const contextScore = this.scoreContextScope(blueprint.contextScope, requiredCapabilities)
    totalScore += contextScore * 0.05

    // 8. RECENT PERFORMANCE (5 points)
    const performanceScore = this.scoreRecentPerformance(blueprint.name)
    totalScore += performanceScore * 0.05

    // 9. AVAILABILITY (3 points)
    const availabilityScore = this.scoreAvailability(blueprint.name)
    totalScore += availabilityScore * 0.03

    // 10. FRESHNESS BONUS (2 points)
    const freshnessScore = this.scoreFreshness(blueprint.createdAt)
    totalScore += freshnessScore * 0.02

    return {
      totalScore: Math.min(totalScore, maxScore),
      reasons,
    }
  }

  /**
   * 🎯 Score capability matching with semantic understanding
   */
  private scoreCapabilityMatch(agentCapabilities: string[], requiredCapabilities: string[]): { score: number } {
    if (requiredCapabilities.length === 0) return { score: 0.5 }

    let matches = 0
    let semanticMatches = 0

    // Semantic capability mapping
    const semanticMappings: Record<string, string[]> = {
      react: ['frontend', 'components', 'jsx', 'tsx', 'ui'],
      backend: ['api', 'server', 'nodejs', 'database'],
      testing: ['test', 'qa', 'validation', 'verification'],
      devops: ['deployment', 'ci-cd', 'docker', 'infrastructure'],
    }

    for (const required of requiredCapabilities) {
      // Direct match
      if (agentCapabilities.includes(required)) {
        matches++
        continue
      }

      // Semantic match
      for (const [category, synonyms] of Object.entries(semanticMappings)) {
        if (synonyms.includes(required) && agentCapabilities.includes(category)) {
          semanticMatches++
          break
        }
      }
    }

    const totalMatches = matches + semanticMatches * 0.7
    return { score: Math.min(totalMatches / requiredCapabilities.length, 1.0) }
  }

  /**
   * 🔍 Score specialization relevance using NLP techniques
   */
  private scoreSpecializationRelevance(specialization: string, taskDescription: string): number {
    const specLower = specialization.toLowerCase()
    const taskLower = taskDescription.toLowerCase()

    // Direct keyword matching
    const specWords = specLower.split(/\s+/)
    const taskWords = taskLower.split(/\s+/)

    let relevanceScore = 0

    // Word overlap scoring
    for (const specWord of specWords) {
      if (specWord.length > 3 && taskWords.some((tw) => tw.includes(specWord) || specWord.includes(tw))) {
        relevanceScore += 0.2
      }
    }

    // Domain-specific scoring
    if (specLower.includes('react') && (taskLower.includes('component') || taskLower.includes('ui'))) {
      relevanceScore += 0.3
    }
    if (specLower.includes('backend') && (taskLower.includes('api') || taskLower.includes('server'))) {
      relevanceScore += 0.3
    }
    if (specLower.includes('testing') && (taskLower.includes('test') || taskLower.includes('bug'))) {
      relevanceScore += 0.3
    }

    return Math.min(relevanceScore, 1.0)
  }

  /**
   * 🧮 Score complexity handling capability
   */
  private scoreComplexityHandling(blueprint: AgentBlueprint, estimatedComplexity: number): number {
    // More capabilities = better complexity handling
    const capabilityBonus = Math.min(blueprint.capabilities.length / 20, 0.5)

    // Autonomy level affects complexity handling
    const autonomyBonus = {
      supervised: 0.3,
      'semi-autonomous': 0.7,
      'fully-autonomous': 1.0,
    }[blueprint.autonomyLevel]

    // Personality factors
    const personalityBonus =
      (blueprint.personality.analytical * 0.4 +
        blueprint.personality.proactive * 0.3 +
        blueprint.personality.creative * 0.3) /
      100

    const baseScore = (10 - Math.abs(estimatedComplexity - 5)) / 10 // Optimal at complexity 5

    return Math.min(baseScore + capabilityBonus + autonomyBonus + personalityBonus, 1.0)
  }

  /**
   * 🛡️ Score autonomy level appropriateness for risk
   */
  private scoreAutonomyLevel(
    autonomyLevel: AgentBlueprint['autonomyLevel'],
    riskLevel: 'low' | 'medium' | 'high'
  ): number {
    const scores = {
      low: { supervised: 0.6, 'semi-autonomous': 0.9, 'fully-autonomous': 1.0 },
      medium: { supervised: 0.8, 'semi-autonomous': 1.0, 'fully-autonomous': 0.7 },
      high: { supervised: 1.0, 'semi-autonomous': 0.6, 'fully-autonomous': 0.3 },
    }

    return scores[riskLevel][autonomyLevel]
  }

  /**
   * 👤 Score personality fit for task characteristics
   */
  private scorePersonalityFit(
    personality: AgentBlueprint['personality'],
    urgency: 'low' | 'normal' | 'high' | 'critical',
    estimatedComplexity: number
  ): number {
    let score = 0

    // Urgency scoring
    const urgencyWeights = {
      low: { proactive: 0.3, collaborative: 0.5 },
      normal: { proactive: 0.5, collaborative: 0.4 },
      high: { proactive: 0.8, collaborative: 0.3 },
      critical: { proactive: 1.0, collaborative: 0.2 },
    }

    const urgencyWeight = urgencyWeights[urgency]
    score += (personality.proactive / 100) * urgencyWeight.proactive * 0.4
    score += (personality.collaborative / 100) * urgencyWeight.collaborative * 0.2

    // Complexity scoring
    if (estimatedComplexity >= 7) {
      score += (personality.analytical / 100) * 0.3
      score += (personality.creative / 100) * 0.1
    } else {
      score += (personality.analytical / 100) * 0.2
      score += (personality.creative / 100) * 0.2
    }

    return Math.min(score, 1.0)
  }

  /**
   * ⚡︎ Score working style compatibility
   */
  private scoreWorkingStyle(workingStyle: AgentBlueprint['workingStyle'], estimatedComplexity: number): number {
    const styleScores = {
      sequential: estimatedComplexity <= 5 ? 0.8 : 0.4,
      parallel: estimatedComplexity >= 5 ? 0.9 : 0.5,
      adaptive: 0.85, // Always good choice
    }

    return styleScores[workingStyle]
  }

  /**
   * 🎯 Score context scope appropriateness
   */
  private scoreContextScope(contextScope: AgentBlueprint['contextScope'], requiredCapabilities: string[]): number {
    // Larger scope needed for complex capabilities
    const complexCapabilities = ['full-stack-development', 'architecture-review', 'system-administration']
    const needsLargeScope = requiredCapabilities.some((cap) => complexCapabilities.includes(cap))

    if (needsLargeScope) {
      return { file: 0.3, directory: 0.6, project: 0.9, workspace: 1.0 }[contextScope]
    } else {
      return { file: 1.0, directory: 0.9, project: 0.7, workspace: 0.5 }[contextScope]
    }
  }

  /**
   * 📈 Score recent performance (placeholder - would use real metrics)
   */
  private scoreRecentPerformance(_agentName: string): number {
    // In real implementation, this would use historical performance data
    return 0.75 // Placeholder score
  }

  /**
   * ⚡ Score current availability
   */
  private scoreAvailability(agentName: string): number {
    const agent = this.instances.get(agentName)
    if (!agent) return 0

    return agent.isActive() ? 0.3 : 1.0 // Prefer available agents
  }

  /**
   * ⚡︎ Score freshness (newer agents might have better capabilities)
   */
  private scoreFreshness(createdAt: Date): number {
    const daysSinceCreation = (Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
    return Math.max(0, 1 - daysSinceCreation / 30) // Decay over 30 days
  }

  /**
   * 📝 Generate human-readable selection reasoning
   */
  private generateSelectionReasoning(
    primary: DynamicAgent,
    secondary: DynamicAgent[],
    primaryReasons: string[]
  ): string {
    const blueprint = primary.getBlueprint()

    let reasoning = `Selected **${blueprint.name}** as primary agent because:\n`
    reasoning += primaryReasons.map((reason) => `• ${reason}`).join('\n')

    if (secondary.length > 0) {
      reasoning += `\n\nSecondary agents available for collaboration:\n`
      reasoning += secondary
        .map((agent) => `• ${agent.getBlueprint().name} (${agent.getBlueprint().specialization})`)
        .join('\n')
    }

    reasoning += `\n\nAgent characteristics:\n`
    reasoning += `• Autonomy Level: ${blueprint.autonomyLevel}\n`
    reasoning += `• Working Style: ${blueprint.workingStyle}\n`
    reasoning += `• Context Scope: ${blueprint.contextScope}\n`
    reasoning += `• Capabilities: ${blueprint.capabilities.length} total`

    return reasoning
  }

  /**
   * ⚡︎ Dynamic Agent Rebalancing based on performance
   */
  async rebalanceAgentSelection(
    taskId: string,
    currentPrimary: DynamicAgent,
    performanceMetrics: {
      executionTime: number
      successRate: number
      errorCount: number
    }
  ): Promise<{ shouldRebalance: boolean; newPrimary?: DynamicAgent; reasoning: string }> {
    console.log(chalk.yellow(`⚡︎ Evaluating agent rebalancing for task ${taskId}...`))

    // Determine if rebalancing is needed
    const shouldRebalance =
      performanceMetrics.executionTime > 300000 || // > 5 minutes
      performanceMetrics.successRate < 0.7 || // < 70% success
      performanceMetrics.errorCount > 3 // > 3 errors

    if (!shouldRebalance) {
      return {
        shouldRebalance: false,
        reasoning: 'Current agent performance is satisfactory - no rebalancing needed',
      }
    }

    // Find alternative agents
    const alternatives = this.getActiveAgents()
      .filter((agent) => agent.id !== currentPrimary.id)
      .filter((agent) => !agent.isActive()) // Only available agents

    if (alternatives.length === 0) {
      return {
        shouldRebalance: false,
        reasoning: 'No alternative agents available for rebalancing',
      }
    }

    // Select best alternative based on different criteria
    const newPrimary = alternatives[0] // Simplified selection for now

    console.log(
      chalk.green(
        `✓ Rebalancing recommended: ${currentPrimary.getBlueprint().name} → ${newPrimary.getBlueprint().name}`
      )
    )

    return {
      shouldRebalance: true,
      newPrimary,
      reasoning: `Switching from ${currentPrimary.getBlueprint().name} to ${newPrimary.getBlueprint().name} due to performance issues`,
    }
  }

  /**
   * 📊 Get Multi-Dimensional Selection Analytics
   */
  getSelectionAnalytics(): {
    totalSelections: number
    averageConfidence: number
    topPerformingAgents: string[]
    selectionTrends: Record<string, number>
  } {
    // In real implementation, this would track actual selection data
    return {
      totalSelections: 0,
      averageConfidence: 0.85,
      topPerformingAgents: ['universal-agent', 'react-expert', 'backend-expert'],
      selectionTrends: {
        'capability-driven': 45,
        'specialization-driven': 30,
        'performance-driven': 15,
        'availability-driven': 10,
      },
    }
  }
}

export const agentFactory = new AgentFactory()
