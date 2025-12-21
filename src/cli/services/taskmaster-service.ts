import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { nanoid } from 'nanoid'
import { advancedAIProvider } from '../ai/advanced-ai-provider'
import type { MutableExecutionPlan, MutablePlanTodo, PlanTodo } from '../planning/types'
import type {
  MutableTaskMasterTask,
  TaskMasterConfig,
  TaskMasterIntegrationConfig,
  TaskMasterModule,
  TaskMasterState,
  TaskMasterTask,
  TaskPriority,
  TaskStatus,
} from '../types/taskmaster-types'
import { advancedUI } from '../ui/advanced-cli-ui'

/**
 * TaskMaster AI Integration Service
 * Provides enterprise-grade task management and planning capabilities
 */
export class TaskMasterService extends EventEmitter {
  private taskMaster: any = null
  private initialized = false
  private config: TaskMasterIntegrationConfig
  private activePlans: Map<string, TaskMasterPlan> = new Map()
  private static instanceCount = 0
  private notificationService: any = null
  private registryToolNames: string[] = []

  constructor(config?: Partial<TaskMasterIntegrationConfig>) {
    super()
    TaskMasterService.instanceCount++

    advancedUI.logFunctionUpdate(
      'info',
      chalk.gray(`🔧 Creating TaskMasterService instance #${TaskMasterService.instanceCount}`)
    )

    // Initialize base config first
    this.config = {
      aiProvider: 'openrouter',
      model: 'openai/gpt-5',
      workspacePath: process.cwd(),
      persistStorage: true,
      enableAdvancedPlanning: true,
      maxConcurrentTasks: 5,
      ...config,
    }

    // Set API key after config is initialized
    this.config.apiKey = this.config.apiKey || this.getApiKey()

    // Initialize notification service
    this.initializeNotificationService()
  }

  /**
   * Initialize notification service
   */
  private initializeNotificationService(): void {
    try {
      const { simpleConfigManager } = require('../core/config-manager')
      const { getNotificationService } = require('./notification-service')
      const notificationConfig = simpleConfigManager.getNotificationConfig()
      this.notificationService = getNotificationService(notificationConfig)
    } catch (error: any) {
      // Notification service initialization is optional - silent fail
    }
  }

  /**
   * Load available tools from the unified ToolRegistry (cached)
   */
  private getRegistryTools(): string[] {
    if (this.registryToolNames.length > 0) {
      return this.registryToolNames
    }

    try {
      const { ToolRegistry } = require('../tools/tool-registry')
      const registry = new ToolRegistry(this.config.workspacePath || process.cwd())
      this.registryToolNames = registry.listTools()
    } catch (error: any) {
      // Fallback to a conservative default set if registry fails
      this.registryToolNames = [
        'read-file-tool',
        'write-file-tool',
        'edit-tool',
        'multi-read-tool',
        'rag-search-tool',
        'grep-tool',
        'find-files-tool',
        'glob-tool',
        'run-command-tool',
        'json-patch-tool',
      ]

      advancedUI.logFunctionUpdate('info', chalk.gray(`ℹ️ Using fallback tool list: ${error.message}`))
    }

    return this.registryToolNames
  }

  /**
   * Initialize TaskMaster with lazy loading
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Dynamic import of TaskMaster to avoid startup delays
      // Using require to avoid TypeScript module resolution issues at runtime
      const TaskMasterModule = require('task-master-ai') as TaskMasterModule

      // TaskMaster provides programmatic access via exported functions
      this.taskMaster = {
        initProject: TaskMasterModule.initProject,
        runInitCLI: TaskMasterModule.runInitCLI,
        version: TaskMasterModule.version,
        devScriptPath: TaskMasterModule.devScriptPath,
      }

      // Skip automatic TaskMaster initialization to prevent unwanted directory creation
      // We'll manually manage TaskMaster files in .nikcli directory

      this.initialized = true

      advancedUI.logFunctionCall(chalk.green('✓ TaskMaster service initialized'))
      this.emit('initialized')

      // Log initialization success with provider info
      advancedUI.logFunctionUpdate('info', chalk.gray(`   Provider: ${this.config.aiProvider}`))
      advancedUI.logFunctionUpdate('info', chalk.gray(`   Model: ${this.config.model}`))
    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', chalk.yellow('⚠︎ TaskMaster initialization failed, using fallback mode'))
      advancedUI.logFunctionUpdate('info', chalk.gray(`   Provider: ${this.config.aiProvider}`))
      advancedUI.logFunctionUpdate('info', chalk.gray(`   Error: ${error.message}`))

      // Set up fallback mode
      this.setupFallbackMode()
      this.emit('fallback')
    }
  }

  /**
   * Initialize TaskMaster directory structure only when needed
   */
  private async ensureNikCLIStructure(): Promise<void> {
    try {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      const nikCLIDir = path.join(this.config.workspacePath, '.nikcli')
      const taskMasterDir = path.join(nikCLIDir, 'taskmaster')

      // Create .nikcli/taskmaster directory structure
      await fs.mkdir(taskMasterDir, { recursive: true })

      advancedUI.logFunctionUpdate('info', chalk.green('✓ NikCLI TaskMaster structure initialized'))
    } catch (error: any) {
      advancedUI.logFunctionUpdate(
        'info',
        chalk.gray(`ℹ️ Directory structure already exists or error: ${error.message}`)
      )
    }
  }

  /**
   * Create a new plan using TaskMaster AI
   */
  async createPlan(userRequest: string, context?: PlanningContext): Promise<TaskMasterPlan> {
    await this.initialize()
    await this.ensureNikCLIStructure()

    const planId = nanoid()
    const availableTools = this.getRegistryTools()
    const planningContext: PlanningContext = {
      ...context,
      availableTools,
    }

    try {
      if (this.taskMaster && this.initialized) {
        // Since TaskMaster is primarily a CLI tool, we'll create a basic plan
        // and use TaskMaster's project management capabilities
        advancedUI.logFunctionUpdate('info', chalk.cyan('🔌 Using TaskMaster for project organization...'))

        // Create a TaskMaster-compatible plan structure
        const plan = await this.createTaskMasterCompatiblePlan(planId, userRequest, planningContext)
        this.activePlans.set(planId, plan)

        advancedUI.logFunctionUpdate('info', chalk.green(`✓ Plan ${planId} created and stored`))
        advancedUI.logFunctionUpdate('info', chalk.gray(`📋 Total active plans: ${this.activePlans.size}`))

        // Try to write the plan to TaskMaster's task format if possible
        await this.syncWithTaskMasterProject(plan)

        return plan
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', chalk.yellow(`⚠︎ TaskMaster plan generation failed: ${error.message}`))
    }

    // Fallback to rule-based planning
    const fallbackPlan = this.createFallbackPlan(planId, userRequest, planningContext)
    this.activePlans.set(planId, fallbackPlan)
    advancedUI.logFunctionUpdate('warning', chalk.yellow(`⚠︎ Using fallback plan ${planId}`))
    return fallbackPlan
  }

  /**
   * Execute a plan using TaskMaster's execution engine
   */
  async executePlan(planId: string): Promise<TaskMasterExecutionResult> {
    advancedUI.logFunctionUpdate('info', chalk.gray(`🔍 Looking for plan ${planId}`))
    advancedUI.logFunctionUpdate(
      'info',
      chalk.gray(`📋 Active plans: ${Array.from(this.activePlans.keys()).join(', ')}`)
    )

    const plan = this.activePlans.get(planId)
    if (!plan) {
      advancedUI.logFunctionUpdate('error', chalk.red(`✖ Plan ${planId} not found in active plans`))
      advancedUI.logFunctionUpdate(
        'info',
        chalk.gray(`Available plans: ${JSON.stringify(Array.from(this.activePlans.keys()))}`)
      )
      throw new Error(`Plan not found: ${planId}`)
    }

    try {
      if (this.taskMaster && this.initialized) {
        // Use TaskMaster's execution engine
        const result = await this.taskMaster.executePlan(plan.taskMasterData)
        return this.convertExecutionResult(result)
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', chalk.yellow(`⚠︎ TaskMaster execution failed: ${error.message}`))
    }

    // Fallback execution
    return this.executeFallbackPlan(plan)
  }

  /**
   * Get plan status and progress
   */
  async getPlanStatus(planId: string): Promise<TaskMasterPlanStatus | null> {
    const plan = this.activePlans.get(planId)
    if (!plan) return null

    try {
      if (this.taskMaster && this.initialized) {
        return await this.taskMaster.getPlanStatus(planId)
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate('info', chalk.yellow(`⚠︎ TaskMaster status check failed: ${error.message}`))
    }

    // Fallback status
    return {
      planId,
      status: plan.status,
      progress: this.calculateFallbackProgress(plan),
      currentTask: plan.todos.find((t) => t.status === 'in_progress')?.title || null,
      completedTasks: plan.todos.filter((t) => t.status === 'completed').length,
      totalTasks: plan.todos.length,
    }
  }

  /**
   * List all active plans
   */
  listPlans(): TaskMasterPlan[] {
    return Array.from(this.activePlans.values())
  }

  /**
   * Update plan with new tasks or modifications
   */
  async updatePlan(planId: string, updates: Partial<TaskMasterPlan>): Promise<void> {
    const plan = this.activePlans.get(planId)
    if (!plan) return

    try {
      if (this.taskMaster && this.initialized) {
        await this.taskMaster.updatePlan(planId, updates)
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠︎ TaskMaster plan update failed: ${error.message}`))
    }

    // Update local plan
    Object.assign(plan, updates)
    this.activePlans.set(planId, plan)
    this.emit('planUpdated', { planId, updates })
  }

  /**
   * Create TaskMaster-compatible plan using actual TaskMaster task structure
   */
  private async createTaskMasterCompatiblePlan(
    planId: string,
    userRequest: string,
    context?: PlanningContext
  ): Promise<TaskMasterPlan> {
    // Generate NikCLI todos that map to TaskMaster task structure
    const todos = await this.generateSmartTodos(userRequest, context)

    // Convert to TaskMaster task format using proper mappings
    const taskMasterTasks: MutableTaskMasterTask[] = todos.map((todo) => ({
      id: todo.id,
      title: todo.title,
      description: todo.description || '',
      status: this.mapToTaskMasterStatus(todo.status),
      priority: this.mapPriority(todo.priority) as TaskPriority,
      tags: todo.tools ? [...todo.tools] : [],
      estimatedHours: (todo.estimatedDuration || 5) / 60, // Convert minutes to hours
      createdAt: todo.createdAt.toISOString(),
      updatedAt: todo.updatedAt.toISOString(),
      context: {
        nikCLIData: {
          progress: todo.progress,
          reasoning: todo.reasoning,
          tools: todo.tools,
          estimatedDuration: todo.estimatedDuration,
        },
        userRequest,
        planningContext: context,
      },
    }))

    return {
      id: planId,
      title: `TaskMaster Plan: ${userRequest}`,
      description: userRequest,
      userRequest,
      todos,
      status: 'pending',
      createdAt: new Date(),
      estimatedDuration: todos.reduce((sum, t) => sum + (t.estimatedDuration || 5), 0),
      taskMasterData: {
        id: planId,
        title: `Plan: ${userRequest}`,
        description: userRequest,
        tasks: taskMasterTasks,
        status: 'pending' as TaskStatus,
        progress: 0,
        currentTask: null,
        completedTasks: 0,
        totalTasks: taskMasterTasks.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      riskAssessment: {
        overallRisk: 'medium',
        destructiveOperations: this.countDestructiveOps(todos),
        fileModifications: this.countFileOps(todos),
        externalCalls: this.countExternalOps(todos),
      },
    }
  }

  /**
   * Generate smart todos based on user request
   */
  private async generateSmartTodos(userRequest: string, context?: PlanningContext): Promise<PlanTodo[]> {
    // SEMPRE usa l'AI per generare i todo, indipendentemente dal tipo di richiesta
    advancedUI.logFunctionUpdate('info', chalk.cyan('⚡︎ Using AI for todo generation (all requests)'))

    const availableTools =
      context?.availableTools && context.availableTools.length > 0
        ? Array.from(new Set(context.availableTools))
        : this.getRegistryTools()

    try {
      const aiTasks = await this.generateTasksWithAI(userRequest, { ...context, availableTools })
      if (aiTasks.length > 0) {
        return aiTasks
      }
    } catch (error: any) {
      advancedUI.logFunctionUpdate(
        'info',
        chalk.yellow(`⚠︎ AI generation failed, using enhanced fallback: ${error.message}`)
      )
    }

    // Fallback più intelligente solo se l'AI non funziona
    const todos: PlanTodo[] = []
    const request = userRequest.toLowerCase()

    if (request.includes('create') || request.includes('build') || request.includes('implement')) {
      todos.push(
        {
          id: nanoid(),
          title: 'Project Analysis',
          description: 'Analyze project structure and requirements',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 10,
          progress: 0,
          tools: availableTools,
          reasoning: 'Understanding project context is crucial for successful implementation',
          metadata: { suggestedTools: ['analyze_project', 'rag-search-tool', 'multi-read-tool'] },
        },
        {
          id: nanoid(),
          title: 'Design Planning',
          description: 'Create architectural design and implementation plan',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 15,
          progress: 0,
          tools: availableTools,
          reasoning: 'Proper planning reduces implementation complexity',
          metadata: { suggestedTools: ['analyze_project', 'rag-search-tool', 'multi-read-tool'] },
        },
        {
          id: nanoid(),
          title: 'Implementation',
          description: `Implement ${userRequest}`,
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 30,
          progress: 0,
          tools: availableTools,
          reasoning: 'Core implementation task',
          metadata: { suggestedTools: ['generate_code', 'write_file', 'rag-search-tool', 'multi-read-tool'] },
        },
        {
          id: nanoid(),
          title: 'Testing & Validation',
          description: 'Test implementation and validate functionality',
          status: 'pending',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 15,
          progress: 0,
          tools: availableTools,
          reasoning: 'Ensure quality and functionality',
          metadata: { suggestedTools: ['execute_command', 'analyze_project', 'rag-search-tool', 'multi-read-tool'] },
        }
      )
    } else if (request.includes('fix') || request.includes('debug')) {
      todos.push(
        {
          id: nanoid(),
          title: 'Issue Investigation',
          description: 'Investigate and identify root cause',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 15,
          progress: 0,
          tools: availableTools,
          reasoning: 'Investigate the issue using the available tools',
          metadata: { suggestedTools: ['read_file', 'rag-search-tool', 'multi-read-tool', 'grep-tool'] },
        },
        {
          id: nanoid(),
          title: 'Fix Implementation',
          description: 'Implement solution for the identified issue',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 20,
          progress: 0,
          tools: availableTools,
          reasoning: 'Implement the solution using the available tools',
          metadata: { suggestedTools: ['write_file', 'execute_command', 'rag-search-tool', 'multi-edit-tool'] },
        }
      )
    } else {
      // Fallback for other requests
      todos.push(
        {
          id: nanoid(),
          title: 'Task Execution',
          description: userRequest,
          status: 'pending',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 20,
          progress: 0,
          tools: availableTools,
          reasoning: 'Execute the task using the available tools',
          metadata: {
            suggestedTools: ['analyze_project', 'rag-search-tool', 'write_file', 'execute_command', 'multi-edit-tool'],
          },
        },
        {
          id: nanoid(),
          title: 'Task Execution',
          description: userRequest,
          status: 'pending',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 20,
          progress: 0,
          tools: availableTools,
          reasoning: 'Execute the task using the available tools',
          metadata: {
            suggestedTools: ['analyze_project', 'rag-search-tool', 'write_file', 'execute_command', 'multi-edit-tool'],
          },
        }
      )
    }

    return todos
  }

  /**
   * Generate dynamic tasks using AI based on user request
   */
  private async generateTasksWithAI(userRequest: string, context?: PlanningContext): Promise<PlanTodo[]> {
    const availableTools =
      context?.availableTools && context.availableTools.length > 0
        ? Array.from(new Set(context.availableTools))
        : this.getRegistryTools()
    const toolListForPrompt =
      availableTools.length > 0
        ? JSON.stringify(availableTools)
        : '["read-file-tool","write-file-tool","rag-search-tool","grep-tool","multi-read-tool"]'

    try {


      const prompt = `You are TaskMaster AI, an expert project planning assistant. Your job is to ALWAYS generate actionable tasks for ANY request.

USER REQUEST: "${userRequest}"

CRITICAL INSTRUCTIONS:
1. You MUST generate EXACTLY 5-8 tasks regardless of request complexity
2. Even for simple requests, break them into logical steps
3. For vague requests, interpret them intelligently and create concrete steps
4. NEVER respond with "I cannot" or refuse - always generate tasks

REQUIRED JSON FORMAT (respond ONLY with valid JSON):
[
  {
    "title": "Specific task name (max 60 chars)",
    "description": "Detailed step-by-step description",
    "priority": "high|medium|low",
    "estimatedDuration": 15,
    "tools": ["tool1", "tool2"],
    "reasoning": "Why this task is essential"
  }
]

AVAILABLE TOOLS: ${toolListForPrompt}

EXAMPLES OF TASK BREAKDOWN:
- Simple file edit → Analyze requirements + Plan changes + Implement + Test + Review
- Analysis request → Research + Collect data + Analyze + Document + Present findings
- Bug fix → Investigate + Identify root cause + Design solution + Implement + Validate

Generate tasks NOW (JSON only):`

      // Try to use advanced AI provider first, fallback to local Ollama
      let aiTasks: any[] = []
      let success = false

      try {
        const messages = [{ role: 'user' as const, content: prompt }]
        let accumulatedContent = ''

        for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
          if (ev.type === 'text_delta' && ev.content) {
            accumulatedContent += ev.content
          } else if (ev.type === 'complete') {
            // Try to parse accumulated content
            const contentToParse = accumulatedContent.trim() || (ev.content ? ev.content.trim() : '')
            if (contentToParse) {
              try {
                // Prova parsing diretto
                const parsed = JSON.parse(contentToParse)
                if (Array.isArray(parsed) && parsed.length > 0) {
                  aiTasks = parsed
                  success = true
                  break
                }
              } catch (_parseError) {
                // Prova a estrarre JSON da markdown o testo misto
                try {
                  const jsonMatch = contentToParse.match(/\[[\s\S]*\]/)
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0])
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      aiTasks = parsed
                      success = true
                      break
                    }
                  }
                } catch {
                  advancedUI.logFunctionUpdate('info', chalk.yellow(`⚠︎ Failed to extract JSON from AI response`))
                }
              }
            }
          }
        }
      } catch (error: any) {
        advancedUI.logFunctionUpdate('info', chalk.yellow(`⚠︎ Advanced AI provider failed: ${error.message}`))
      }

      if (!success) {
        try {
          // Fallback to Ollama if advanced provider fails
          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'llama3.2',
              prompt: prompt,
              stream: false,
              options: { temperature: 0.3 },
            }),
          })

          if (!response.ok) throw new Error(`Ollama service error: ${response.status}`)

          const data = await response.json()
          if (data && typeof data === 'object' && 'response' in data && data.response) {
            try {
              const parsed = JSON.parse((data.response as string).trim())
              if (Array.isArray(parsed) && parsed.length > 0) {
                aiTasks = parsed
                success = true
              } else {
                throw new Error('Invalid AI response format')
              }
            } catch (parseError) {
              throw new Error(`Failed to parse Ollama response: ${parseError}`)
            }
          } else {
            throw new Error('Empty response from Ollama')
          }
        } catch {
          throw new Error('Both AI services failed')
        }
      }

      // Convert AI tasks to PlanTodo format with validation
      const todos: PlanTodo[] = aiTasks
        .filter((task: any) => task && typeof task === 'object' && task.title && task.description)
        .map((task: any) => ({
          id: nanoid(),
          title: typeof task.title === 'string' ? task.title.substring(0, 80) : 'AI Generated Task',
          description: typeof task.description === 'string' ? task.description : 'AI generated task description',
          status: 'pending' as const,
          priority: ['high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration:
            typeof task.estimatedDuration === 'number' && task.estimatedDuration > 0
              ? Math.min(task.estimatedDuration, 120)
              : 15,
          progress: 0,
          tools: availableTools.length > 0 ? availableTools : ['analyze_project', 'read_file'],
          metadata:
            Array.isArray(task.tools) && task.tools.length > 0
              ? { suggestedTools: task.tools.filter((tool: any) => typeof tool === 'string') }
              : undefined,
          reasoning: typeof task.reasoning === 'string' ? task.reasoning : 'AI generated reasoning',
        }))

      // Assicurati che abbiamo sempre almeno 3 task validi
      if (todos.length < 3) {
        advancedUI.logFunctionUpdate(
          'info',
          chalk.yellow(`⚠︎ AI generated only ${todos.length} tasks, adding fallback tasks`)
        )

        // Aggiungi task generici basati sulla richiesta
        const fallbackTasks = this.generateFallbackTasks(userRequest, 5 - todos.length, availableTools)
        todos.push(...fallbackTasks)
      }

      advancedUI.logFunctionUpdate(
        'success',
        chalk.green(
          `✓ Generated ${todos.length} tasks with AI (${aiTasks.length} from AI, ${todos.length - aiTasks.length} fallback)`
        )
      )
      return todos
    } catch (error: any) {
      advancedUI.logFunctionUpdate('warning', chalk.yellow(`⚠︎ AI task generation failed: ${error.message}`))
      advancedUI.logFunctionUpdate('info', chalk.gray('⚡︎ Falling back to comprehensive analysis tasks...'))

      // Professional fallback tasks
      return [
        {
          id: nanoid(),
          title: 'Codebase Structure Analysis',
          description: 'Analyze overall project architecture, file structure, and dependencies',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 15,
          progress: 0,
          tools: availableTools,
          metadata: { suggestedTools: ['explore_directory', 'read_file', 'analyze_project', 'rag-search-tool'] },
          reasoning: 'Understanding the codebase structure is the foundation for comprehensive analysis',
        },
        {
          id: nanoid(),
          title: 'Code Quality Assessment',
          description: 'Evaluate code quality, patterns, best practices, and technical debt',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 20,
          progress: 0,
          tools: availableTools,
          metadata: { suggestedTools: ['read_file', 'analyze_project', 'execute_command', 'rag-search-tool'] },
          reasoning: 'Code quality assessment identifies areas for improvement and technical risks',
        },
        {
          id: nanoid(),
          title: 'Security & Performance Analysis',
          description: 'Review security practices and performance optimization opportunities',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 18,
          progress: 0,
          tools: availableTools,
          metadata: { suggestedTools: ['read_file', 'analyze_project', 'execute_command', 'rag-search-tool'] },
          reasoning: 'Security and performance are critical for production readiness',
        },
        {
          id: nanoid(),
          title: 'Documentation & Dependencies Review',
          description: 'Evaluate documentation quality and dependency management',
          status: 'pending',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 12,
          progress: 0,
          tools: availableTools,
          metadata: { suggestedTools: ['read_file', 'rag-search-tool', 'execute_command'] },
          reasoning: 'Good documentation and dependency management ensure maintainability',
        },
        {
          id: nanoid(),
          title: 'Comprehensive Report Generation',
          description: 'Compile analysis findings into a comprehensive report with recommendations',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 25,
          progress: 0,
          tools: availableTools,
          metadata: { suggestedTools: ['generate_code', 'write_file', 'rag-search-tool'] },
          reasoning: 'A comprehensive report provides actionable insights and strategic recommendations',
        },
      ]
    }
  }

  /**
   * Generate fallback tasks when AI doesn't provide enough
   */
  private generateFallbackTasks(userRequest: string, count: number, availableTools?: string[]): PlanTodo[] {
    const tasks: PlanTodo[] = []
    const registryTools = availableTools && availableTools.length > 0 ? availableTools : this.getRegistryTools()

    const baseTasks = [
      {
        title: 'Initial Analysis',
        description: `Analyze requirements for: ${userRequest}`,
        tools: ['analyze_project', 'read_file'],
        reasoning: 'Understanding requirements is essential for any task',
      },
      {
        title: 'Planning & Design',
        description: `Create implementation plan for: ${userRequest}`,
        tools: ['doc_search', 'analyze_project'],
        reasoning: 'Proper planning reduces implementation complexity',
      },
      {
        title: 'Implementation',
        description: `Execute the main task: ${userRequest}`,
        tools: ['write_file', 'execute_command', 'generate_code'],
        reasoning: 'Core implementation of the requested feature',
      },
      {
        title: 'Testing & Validation',
        description: `Test and validate the implementation`,
        tools: ['execute_command', 'read_file'],
        reasoning: 'Ensure the implementation works correctly',
      },
      {
        title: 'Documentation & Cleanup',
        description: `Document changes and clean up`,
        tools: ['write_file', 'doc_search'],
        reasoning: 'Maintain code quality and documentation',
      },
    ]

    for (let i = 0; i < Math.min(count, baseTasks.length); i++) {
      const baseTask = baseTasks[i]
      tasks.push({
        id: nanoid(),
        title: baseTask.title,
        description: baseTask.description,
        status: 'pending',
        priority: i === 0 || i === 2 ? 'high' : 'medium', // Analysis and Implementation are high priority
        createdAt: new Date(),
        updatedAt: new Date(),
        estimatedDuration: 15 + i * 5, // Vary duration slightly
        progress: 0,
        tools: registryTools,
        reasoning: baseTask.reasoning,
        metadata: { suggestedTools: baseTask.tools },
      })
    }

    return tasks
  }

  /**
   * Sync plan with TaskMaster project using proper file structure
   */
  private async syncWithTaskMasterProject(plan: TaskMasterPlan): Promise<void> {
    try {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')

      // Use .nikcli directory instead of .taskmaster
      const taskMasterDir = path.join(this.config.workspacePath, '.nikcli', 'taskmaster')

      try {
        await fs.mkdir(taskMasterDir, { recursive: true })
      } catch {
        // Directory might already exist
      }

      // Write tasks.json in TaskMaster's expected format
      const tasksFile = path.join(taskMasterDir, 'tasks.json')
      const taskMasterData = plan.taskMasterData || {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        tasks: plan.todos.map((todo) => ({
          id: todo.id,
          title: todo.title,
          description: todo.description || '',
          status: this.mapToTaskMasterStatus(todo.status),
          priority: todo.priority as TaskPriority,
          tags: todo.tools || [],
          estimatedHours: (todo.estimatedDuration || 5) / 60,
          createdAt: todo.createdAt.toISOString(),
          updatedAt: todo.updatedAt.toISOString(),
        })),
        status: 'pending' as TaskStatus,
        progress: 0,
        currentTask: null,
        completedTasks: 0,
        totalTasks: plan.todos.length,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await fs.writeFile(tasksFile, JSON.stringify(taskMasterData, null, 2))

      // Write state.json for TaskMaster state management
      const stateFile = path.join(taskMasterDir, 'state.json')
      const state: TaskMasterState = {
        currentPlan: plan.id,
        activeTasks: plan.todos.filter((t) => t.status === 'in_progress').map((t) => t.id),
        completedTasks: plan.todos.filter((t) => t.status === 'completed').map((t) => t.id),
        lastUpdated: new Date().toISOString(),
        statistics: {
          totalTasks: plan.todos.length,
          completedTasks: plan.todos.filter((t) => t.status === 'completed').length,
          pendingTasks: plan.todos.filter((t) => t.status === 'pending').length,
          averageCompletionTime: plan.estimatedDuration / Math.max(plan.todos.length, 1),
        },
      }

      await fs.writeFile(stateFile, JSON.stringify(state, null, 2))

      // Write config.json with AI provider settings
      const configFile = path.join(taskMasterDir, 'config.json')
      const config: TaskMasterConfig = {
        aiProvider: this.config.aiProvider,
        model: this.config.model,
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        maxTokens: 4000,
        temperature: 0.1,
        topP: 0.9,
        profiles: {
          nikcli: {
            name: 'NikCLI Integration',
            description: 'TaskMaster configuration for NikCLI autonomous development',
            aiProvider: this.config.aiProvider,
            model: this.config.model,
            taskMasterDir: '.nikcli', // Force TaskMaster to use .nikcli directory
          },
        },
        // Override TaskMaster's default directories to use .nikcli
        useNikCLIStructure: true,
      }

      await fs.writeFile(configFile, JSON.stringify(config, null, 2))

      advancedUI.logFunctionUpdate('info', chalk.green('✓ Plan synced with TaskMaster project structure'))
    } catch (error: any) {
      advancedUI.logFunctionUpdate('info', chalk.gray(`ℹ️ TaskMaster sync skipped: ${error.message}`))
    }
  }

  /**
   * Create fallback plan when TaskMaster is unavailable
   */
  private createFallbackPlan(planId: string, userRequest: string, context?: PlanningContext): TaskMasterPlan {
    const todos: PlanTodo[] = []
    const availableTools =
      context?.availableTools && context.availableTools.length > 0
        ? Array.from(new Set(context.availableTools))
        : this.getRegistryTools()

    // Rule-based plan generation (simplified version of existing logic)
    if (userRequest.toLowerCase().includes('create') || userRequest.toLowerCase().includes('build')) {
      todos.push(
        {
          id: nanoid(),
          title: 'Analyze requirements',
          description: 'Understand what needs to be created',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 10,
          progress: 0,
          tools: availableTools,
        },
        {
          id: nanoid(),
          title: 'Plan implementation',
          description: 'Create detailed implementation plan',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 15,
          progress: 0,
          tools: availableTools,
        },
        {
          id: nanoid(),
          title: 'Implement solution',
          description: 'Write code and create necessary files',
          status: 'pending',
          priority: 'high',
          createdAt: new Date(),
          updatedAt: new Date(),
          estimatedDuration: 30,
          progress: 0,
          tools: availableTools,
        }
      )
    } else {
      todos.push({
        id: nanoid(),
        title: 'Execute task',
        description: userRequest,
        status: 'pending',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date(),
        estimatedDuration: 15,
        progress: 0,
        tools: availableTools,
      })
    }

    return {
      id: planId,
      title: `Fallback Plan: ${userRequest}`,
      description: userRequest,
      userRequest,
      todos,
      status: 'pending',
      createdAt: new Date(),
      estimatedDuration: todos.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0),
      riskAssessment: {
        overallRisk: 'medium',
        destructiveOperations: 0,
        fileModifications: 1,
        externalCalls: 0,
      },
    }
  }

  /**
   * Execute plan with fallback logic
   */
  private async executeFallbackPlan(plan: TaskMasterPlan): Promise<TaskMasterExecutionResult> {
    // Convert to mutable version for internal use
    const mutablePlan: MutableTaskMasterPlan = {
      ...plan,
      todos: plan.todos.map((todo) => ({
        ...todo,
        status: todo.status,
        progress: todo.progress,
        updatedAt: todo.updatedAt,
        completedAt: todo.completedAt,
        actualDuration: todo.actualDuration,
        dependencies: todo.dependencies ? [...todo.dependencies] : undefined,
        tags: todo.tools ? [...todo.tools] : undefined,
        metadata: todo.metadata ? { ...todo.metadata } : undefined,
        tools: todo.tools ? [...todo.tools] : undefined,
      })),
    }
    const startTime = new Date()
    const results: TaskMasterStepResult[] = []

    // Notify plan started
    try {
      await this.sendPlanLifecycleNotification(plan, true, true)
    } catch { }

    for (const todo of mutablePlan.todos) {
      todo.status = 'in_progress'
      this.emit('stepStart', { planId: plan.id, taskId: todo.id })

      // Notify task started
      try {
        await this.sendTaskStartedNotification(plan, todo)
      } catch { }

      try {
        // Simulate task execution
        await new Promise((resolve) => setTimeout(resolve, 1000))

        todo.status = 'completed'
        todo.progress = 100

        results.push({
          taskId: todo.id,
          status: 'success',
          output: `Completed: ${todo.title}`,
          duration: 1000,
        })

        this.emit('stepComplete', { planId: plan.id, taskId: todo.id })

        // Send task completion notification
        this.sendTaskCompletionNotification(plan, todo, true, 1000)
      } catch (error: any) {
        todo.status = 'failed'
        results.push({
          taskId: todo.id,
          status: 'failed',
          error: error.message,
          duration: 1000,
        })

        this.emit('stepFailed', { planId: plan.id, taskId: todo.id, error: error.message })

        // Send task failure notification
        this.sendTaskCompletionNotification(plan, todo, false, 1000, error.message)
      }
    }

    plan.status = 'completed'

    // Notify plan completion
    try {
      const failedCount = plan.todos.filter((t) => t.status === 'failed').length
      await this.sendPlanLifecycleNotification(plan, failedCount === 0, false)
    } catch { }

    return {
      planId: plan.id,
      status: 'completed',
      startTime,
      endTime: new Date(),
      results,
      summary: {
        totalTasks: plan.todos.length,
        completedTasks: plan.todos.filter((t) => t.status === 'completed').length,
        failedTasks: plan.todos.filter((t) => t.status === 'failed').length,
      },
    }
  }

  /**
   * Setup fallback mode when TaskMaster is unavailable
   */
  private setupFallbackMode(): void {
    this.initialized = false
    console.log(chalk.cyan('⚡︎ Running in fallback mode - basic planning available'))
  }

  /**
   * Get appropriate API key for TaskMaster based on provider
   */
  private getApiKey(): string {
    switch (this.config.aiProvider) {
      case 'openrouter':
        return process.env.OPENROUTER_API_KEY || process.env.OPENROUTER || ''
      case 'anthropic':
        return process.env.ANTHROPIC_API_KEY || ''
      case 'openai':
        return process.env.OPENAI_API_KEY || ''
      case 'google':
        return process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''
      case 'azure':
        return process.env.AZURE_OPENAI_API_KEY || ''
      case 'bedrock':
        return process.env.AWS_ACCESS_KEY_ID || '' // Bedrock uses AWS credentials
      case 'groq':
        return process.env.GROQ_API_KEY || ''
      case 'perplexity':
        return process.env.PERPLEXITY_API_KEY || ''
      case 'xai':
        return process.env.XAI_API_KEY || ''
      case 'ollama':
        return '' // Ollama doesn't require API key
      case 'claude-code':
        return process.env.CLAUDE_CODE_API_KEY || ''
      case 'gemini-cli':
        return process.env.GEMINI_CLI_API_KEY || ''
      default:
        // Fallback: try common keys
        return (
          process.env.OPENROUTER_API_KEY ||
          process.env.ANTHROPIC_API_KEY ||
          process.env.OPENAI_API_KEY ||
          process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
          ''
        )
    }
  }

  /**
   * Map TaskMaster priority to NikCLI priority
   */
  private mapPriority(priority: string): 'low' | 'medium' | 'high' {
    switch (priority.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'high'
      case 'low':
        return 'low'
      default:
        return 'medium'
    }
  }

  /**
   * Map NikCLI todo status to TaskMaster status
   */
  private mapToTaskMasterStatus(nikCLIStatus: string): TaskStatus {
    switch (nikCLIStatus) {
      case 'completed':
        return 'done'
      case 'in_progress':
        return 'in-progress'
      case 'failed':
        return 'cancelled'
      default:
        return 'pending'
    }
  }

  /**
   * Convert TaskMaster execution result to NikCLI format
   */
  private convertExecutionResult(result: any): TaskMasterExecutionResult {
    return {
      planId: result.planId,
      status: result.status,
      startTime: new Date(result.startTime),
      endTime: result.endTime ? new Date(result.endTime) : undefined,
      results:
        result.tasks?.map((task: any) => ({
          taskId: task.id,
          status: task.status,
          output: task.output,
          error: task.error,
          duration: task.duration || 0,
        })) || [],
      summary: {
        totalTasks: result.summary?.totalTasks || 0,
        completedTasks: result.summary?.completedTasks || 0,
        failedTasks: result.summary?.failedTasks || 0,
      },
    }
  }

  /**
   * Calculate progress for fallback mode
   */
  private calculateFallbackProgress(plan: TaskMasterPlan): number {
    if (plan.todos.length === 0) return 0
    const completed = plan.todos.filter((t) => t.status === 'completed').length
    return Math.round((completed / plan.todos.length) * 100)
  }

  /**
   * Count destructive operations in todos
   */
  private countDestructiveOps(todos: PlanTodo[]): number {
    return todos.filter(
      (todo) =>
        todo.tools?.some((tool) => ['delete', 'remove', 'rm'].includes(tool.toLowerCase())) ||
        todo.description.toLowerCase().includes('delete') ||
        todo.description.toLowerCase().includes('remove')
    ).length
  }

  /**
   * Count file modification operations
   */
  private countFileOps(todos: PlanTodo[]): number {
    return todos.filter(
      (todo) =>
        todo.tools?.some((tool) => ['write', 'edit', 'create'].includes(tool.toLowerCase())) ||
        todo.description.toLowerCase().includes('file') ||
        todo.description.toLowerCase().includes('create') ||
        todo.description.toLowerCase().includes('modify')
    ).length
  }

  /**
   * Count external API calls
   */
  private countExternalOps(todos: PlanTodo[]): number {
    return todos.filter(
      (todo) =>
        todo.tools?.some((tool) => ['fetch', 'api', 'request'].includes(tool.toLowerCase())) ||
        todo.description.toLowerCase().includes('api') ||
        todo.description.toLowerCase().includes('fetch') ||
        todo.description.toLowerCase().includes('request')
    ).length
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.taskMaster && this.initialized) {
      try {
        await this.taskMaster.dispose()
      } catch (error: any) {
        console.log(chalk.yellow(`⚠︎ TaskMaster disposal error: ${error.message}`))
      }
    }

    this.activePlans.clear()
    this.removeAllListeners()
    this.initialized = false
  }

  /**
   * Send task completion/failure notification
   */
  private async sendTaskCompletionNotification(
    plan: TaskMasterPlan,
    todo: MutablePlanTodo,
    success: boolean,
    duration?: number,
    error?: string
  ): Promise<void> {
    if (!this.notificationService) return

    try {
      const { NotificationType, NotificationSeverity } = require('../types/notifications')
      const { authProvider } = require('../providers/supabase/auth-provider')

      const payload: any = {
        type: success ? NotificationType.TASK_COMPLETED : NotificationType.TASK_FAILED,
        severity: success ? NotificationSeverity.SUCCESS : NotificationSeverity.ERROR,
        timestamp: new Date(),
        sessionId: plan.id,
        workingDirectory: this.config.workspacePath,
        taskId: todo.id,
        taskTitle: todo.title,
        taskDescription: todo.description,
        agentName: 'TaskMaster',
        blueprintId: 'taskmaster',
        duration,
        success,
        error,
      }

      // Add user info if authenticated
      try {
        const profile = authProvider.getCurrentProfile()
        if (profile) {
          payload.userEmail = profile.email
          payload.userId = profile.id
        }
      } catch {
        // Auth not available
      }

      if (success) {
        await this.notificationService.sendTaskCompletion(payload)
      } else {
        await this.notificationService.sendTaskFailure(payload)
      }
    } catch (notifError: any) {
      // Silent fail - notifications should not break execution
    }
  }

  /**
   * Send task started notification
   */
  private async sendTaskStartedNotification(plan: TaskMasterPlan, todo: MutablePlanTodo): Promise<void> {
    if (!this.notificationService) return
    try {
      const { NotificationType, NotificationSeverity } = require('../types/notifications')
      const payload: any = {
        type: NotificationType.TASK_STARTED,
        severity: NotificationSeverity.INFO,
        timestamp: new Date(),
        sessionId: plan.id,
        workingDirectory: this.config.workspacePath,
        taskId: todo.id,
        taskTitle: todo.title,
        taskDescription: todo.description,
        agentName: 'TaskMaster',
        blueprintId: 'taskmaster',
        planId: plan.id,
        planTitle: plan.title,
      }
      await this.notificationService.sendTaskStarted(payload)
    } catch { }
  }

  /**
   * Send plan lifecycle notifications (start/complete)
   */
  private async sendPlanLifecycleNotification(plan: TaskMasterPlan, success: boolean, started: boolean): Promise<void> {
    if (!this.notificationService) return
    try {
      const { NotificationType, NotificationSeverity } = require('../types/notifications')
      if (started) {
        const payload: any = {
          type: NotificationType.PLAN_STARTED,
          severity: NotificationSeverity.INFO,
          timestamp: new Date(),
          sessionId: plan.id,
          workingDirectory: this.config.workspacePath,
          planId: plan.id,
          planTitle: plan.title,
          planDescription: plan.description,
          totalTasks: plan.todos.length,
        }
        await this.notificationService.sendPlanStarted(payload)
      } else {
        const payload: any = {
          type: success ? NotificationType.PLAN_COMPLETED : NotificationType.PLAN_FAILED,
          severity: success ? NotificationSeverity.SUCCESS : NotificationSeverity.ERROR,
          timestamp: new Date(),
          sessionId: plan.id,
          workingDirectory: this.config.workspacePath,
          planId: plan.id,
          planTitle: plan.title,
          planDescription: plan.description,
          totalTasks: plan.todos.length,
          completedTasks: plan.todos.filter((t) => t.status === 'completed').length,
          failedTasks: plan.todos.filter((t) => t.status === 'failed').length,
          agents: ['TaskMaster'],
          success,
        }
        await this.notificationService.sendPlanCompletion(payload)
      }
    } catch { }
  }
}

// Types for TaskMaster integration

export interface TaskMasterPlan {
  id: string
  title: string
  description: string
  userRequest: string
  todos: PlanTodo[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: Date
  estimatedDuration: number
  taskMasterData?: any // Original TaskMaster data
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high'
    destructiveOperations: number
    fileModifications: number
    externalCalls: number
  }
}

export interface MutableTaskMasterPlan {
  id: string
  title: string
  description: string
  userRequest: string
  todos: MutablePlanTodo[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: Date
  estimatedDuration: number
  taskMasterData?: any // Original TaskMaster data
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high'
    destructiveOperations: number
    fileModifications: number
    externalCalls: number
  }
}

export interface TaskMasterExecutionResult {
  planId: string
  status: 'completed' | 'failed' | 'cancelled' | 'partial'
  startTime: Date
  endTime?: Date
  results: TaskMasterStepResult[]
  summary: {
    totalTasks: number
    completedTasks: number
    failedTasks: number
  }
}

export interface TaskMasterStepResult {
  taskId: string
  status: 'success' | 'failed' | 'skipped'
  output?: string
  error?: string
  duration: number
}

export interface TaskMasterPlanStatus {
  planId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  currentTask: string | null
  completedTasks: number
  totalTasks: number
}

export interface PlanningContext {
  projectPath?: string
  relevantFiles?: string[]
  projectType?: string
  userPreferences?: Record<string, any>
  availableTools?: string[]
}

// Create singleton instance
// Create singleton instance with OpenRouter as default for better model access
export const taskMasterService = new TaskMasterService({
  aiProvider: 'openrouter',
  model: 'openai/gpt-5', // Use GPT-5 as default for TaskMaster
  enableAdvancedPlanning: true,
  maxConcurrentTasks: 3,
  persistStorage: true,
})
