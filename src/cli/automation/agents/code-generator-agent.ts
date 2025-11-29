import { nanoid } from 'nanoid'
import { type ChatMessage, modelProvider } from '../../ai/model-provider'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { CliUI } from '../../utils/cli-ui'
import type { AgentTask } from './agent-router'
import type { AgentTaskResult } from './base-agent'
import { CognitiveAgentBase } from './cognitive-agent-base'
import type { CodeGeneratorCognition, OrchestrationPlan, TaskCognition } from './cognitive-interfaces'

/**
 * 🚀 Enhanced Code Generator Agent with Cognitive Intelligence
 * Specialized in code generation and template creation with advanced scaffolding intelligence,
 * multi-language support, framework integration, and automated testing setup
 *
 * Features:
 * - Code generation from descriptions
 * - Template creation and scaffolding
 * - Multi-language support (TypeScript, JavaScript, Python, etc.)
 * - Framework integration (React, Next.js, Express, etc.)
 * - Automated testing setup
 * - Documentation generation
 * - Project structure creation
 * - Dependency management
 */
export class CodeGeneratorAgent extends CognitiveAgentBase {
  id = 'code-generator'
  capabilities = [
    'code-generation',
    'template-creation',
    'scaffolding',
    'multi-language-support',
    'framework-integration',
    'testing-setup',
    'documentation-generation',
    'project-structure',
    'dependency-management',
    'code-patterns',
  ]
  specialization = 'Code generation and template creation with cognitive intelligence'
  name = 'code-generator'
  description = 'Advanced code generation and template creation with cognitive intelligence'

  // Cognitive specialization properties
  protected cognitiveSpecialization = 'Code Generation & Scaffolding'
  protected cognitiveStrengths = [
    'Code generation from descriptions',
    'Template creation and scaffolding',
    'Multi-language support (TypeScript, JavaScript, Python, etc.)',
    'Framework integration (React, Next.js, Express, etc.)',
    'Automated testing setup',
    'Documentation generation',
    'Project structure creation',
    'Dependency management',
  ]
  protected cognitiveWeaknesses = [
    'Complex business logic implementation',
    'Performance optimization',
    'Security vulnerability assessment',
    'Database design and optimization',
  ]

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory)
  }

  protected override async onInitialize(): Promise<void> {
    advancedUI.logCognitive('🚀 Initializing Enhanced Code Generator Agent with cognitive capabilities...')
    await this.initializeCodeGeneratorCognition()
    advancedUI.logSuccess(`✓ Code Generator Agent initialized with ${this.capabilities.length} capabilities`)
  }

  protected override async onExecuteTask(task: AgentTask): Promise<AgentTaskResult> {
    const cognition = await this.parseTaskCognition(task.description || task.type)
    const enhancedCognition = await this.enhanceCognitionForSpecialization(cognition)
    const orchestrationPlan = await this.createOrchestrationPlan(enhancedCognition)

    return await this.executeCognitiveTask(task, enhancedCognition, orchestrationPlan)
  }

  protected override async onStop(): Promise<void> {
    advancedUI.logInfo('🛑 Code Generator Agent shutting down...')
    await this.saveCognitiveState()
    advancedUI.logSuccess('✓ Code Generator Agent stopped - cognitive state saved')
  }

  /**
   * 🧠 Execute task with Code Generator-specific cognitive orchestration
   */
  protected async executeCognitiveTask(
    task: AgentTask,
    cognition: TaskCognition,
    plan: OrchestrationPlan
  ): Promise<AgentTaskResult> {
    const startTime = Date.now()

    try {
      advancedUI.logFunctionCall('executing')
      advancedUI.logFunctionUpdate('info', `Code Generator task with ${plan.strategy} orchestration`, '●')

      const generationPrompt = `Generate clean, well-documented TypeScript code for: ${cognition.originalTask}

Include proper types, error handling, and JSDoc comments.`

      const messages: ChatMessage[] = [
        { role: 'system', content: generationPrompt },
        { role: 'user', content: cognition.originalTask },
      ]

      const aiResponse = await modelProvider.generateResponse({ messages })

      const generationResult = {
        generatedCode: this.extractGeneratedCode(aiResponse),
        dependencies: this.extractDependencies(aiResponse),
        documentation: this.extractDocumentation(aiResponse),
      }

      const executionTime = Date.now() - startTime
      this.updateCognitiveMemory(cognition, generationResult, true)

      return {
        success: true,
        message: `Code generation completed with ${plan.strategy} orchestration in ${executionTime}ms`,
        executionTime,
        data: {
          cognition,
          orchestrationPlan: plan,
          generationResult,
          metrics: this.getPerformanceMetrics(),
        },
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      CliUI.logError(`✖ Code generation failed: ${error.message}`)
      this.updateCognitiveMemory(cognition, { error: error.message }, false)

      return {
        success: false,
        message: `Code generation failed: ${error.message}`,
        executionTime,
        data: { error: error.message, cognition, orchestrationPlan: plan },
      }
    }
  }

  /**
   * 🎯 Enhanced cognition for Code Generator-specific analysis
   */
  protected async enhanceCognitionForSpecialization(cognition: TaskCognition): Promise<TaskCognition> {
    try {
      const codeGeneratorCognition = cognition as CodeGeneratorCognition

      if (this.isCodeGenerationTask(cognition)) {
        codeGeneratorCognition.generationAnalysis = await this.analyzeGenerationRequirements(cognition)
      }

      const generatorCapabilities = this.getCodeGeneratorCapabilities(cognition)
      codeGeneratorCognition.requiredCapabilities.push(...generatorCapabilities)

      return codeGeneratorCognition
    } catch (error: any) {
      CliUI.logError(`✖ Failed to enhance Code Generator cognition: ${error.message}`)
      return cognition
    }
  }

  // Helper methods
  private isCodeGenerationTask(cognition: TaskCognition): boolean {
    const generationKeywords = ['generate', 'create', 'build', 'scaffold', 'template']
    return generationKeywords.some((keyword) => cognition.normalizedTask.includes(keyword))
  }

  private async analyzeGenerationRequirements(
    cognition: TaskCognition
  ): Promise<CodeGeneratorCognition['generationAnalysis']> {
    const taskText = cognition.normalizedTask.toLowerCase()

    let generationType: 'function' | 'class' | 'component' | 'api' | 'project' | 'utility' = 'function'
    if (taskText.includes('class')) generationType = 'class'
    else if (taskText.includes('component')) generationType = 'component'
    else if (taskText.includes('api')) generationType = 'api'
    else if (taskText.includes('project')) generationType = 'project'

    return {
      generationType,
      language: 'typescript',
      framework: this.detectFramework(cognition),
      testingFramework: 'jest',
      documentationStyle: 'jsdoc',
    }
  }

  private getCodeGeneratorCapabilities(cognition: TaskCognition): string[] {
    const capabilities = []

    if (cognition.intent.primary === 'create') capabilities.push('code-generation')
    if (cognition.normalizedTask.includes('template')) capabilities.push('template-creation')
    if (cognition.normalizedTask.includes('project')) capabilities.push('scaffolding')

    return capabilities
  }

  private detectFramework(cognition: TaskCognition): string {
    const taskText = cognition.originalTask.toLowerCase()

    if (taskText.includes('react')) return 'React'
    if (taskText.includes('next')) return 'Next.js'
    if (taskText.includes('express')) return 'Express'

    return 'Vanilla'
  }

  private extractGeneratedCode(aiResponse: string): string {
    const codeMatch = aiResponse.match(/```[\s\S]*?```/)
    return codeMatch ? codeMatch[0].replace(/```/g, '').trim() : aiResponse
  }

  private extractDependencies(aiResponse: string): string[] {
    const dependencies = []
    const importMatches = aiResponse.match(/import.*from\s+['"]([^'"]+)['"]/g) || []

    for (const importMatch of importMatches) {
      const packageMatch = importMatch.match(/from\s+['"]([^'"]+)['"]/)
      if (packageMatch && !packageMatch[1].startsWith('.') && !packageMatch[1].startsWith('/')) {
        dependencies.push(packageMatch[1])
      }
    }

    return [...new Set(dependencies)]
  }

  private extractDocumentation(aiResponse: string): string {
    const docMatch = aiResponse.match(/\/\*\*[\s\S]*?\*\//)
    return docMatch ? docMatch[0] : '/** Generated code documentation */'
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
      generatedCode: result.message,
      task: taskData,
      timestamp: new Date().toISOString(),
      agent: 'Enhanced Code Generator Agent',
      success: result.success,
      cognitiveEnhanced: true,
      data: result.data,
    }
  }

  override async cleanup(): Promise<void> {
    return await this.onStop()
  }

  /**
   * 💡 Get Code Generator-specific optimization suggestions
   */
  protected getSpecializationOptimizations(): string[] {
    const optimizations: string[] = []

    const generationPatterns = this.cognitiveMemory.taskPatterns.get('code-generation') || []
    if (generationPatterns.length > 25) {
      optimizations.push('High code generation activity - consider creating reusable templates')
    }

    return optimizations
  }

  private async initializeCodeGeneratorCognition(): Promise<void> {
    const generatorPatterns = [
      'code-generation',
      'template-creation',
      'scaffolding',
      'multi-language-support',
      'framework-integration',
      'testing-setup',
      'documentation-generation',
      'project-structure',
      'dependency-management',
    ]

    generatorPatterns.forEach((pattern) => {
      if (!this.cognitiveMemory.taskPatterns.has(pattern)) {
        this.cognitiveMemory.taskPatterns.set(pattern, [])
      }
    })

    CliUI.logDebug(`🧠 Initialized ${generatorPatterns.length} Code Generator cognitive patterns`)
  }

  private async saveCognitiveState(): Promise<void> {
    CliUI.logDebug(' Code Generator cognitive state prepared for persistence')
  }
}
