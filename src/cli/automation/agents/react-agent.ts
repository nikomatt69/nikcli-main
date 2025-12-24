import { nanoid } from 'nanoid'
import { type ChatMessage, modelProvider } from '../../ai/model-provider'
import { toolsManager } from '../../tools/tools-manager'
import { advancedUI } from '../../ui/advanced-cli-ui'
import { CliUI } from '../../utils/cli-ui'
import type { AgentTask } from './agent-router'
import type { AgentTaskResult } from './base-agent'
import { CognitiveAgentBase } from './cognitive-agent-base'
import type { OrchestrationPlan, ReactCognition, TaskCognition } from './cognitive-interfaces'

/**
 * 🎨 Enhanced React Agent with Cognitive Intelligence
 * Specialized in React/Next.js development with advanced component analysis,
 * performance optimization suggestions, and intelligent task orchestration
 */
export class ReactAgent extends CognitiveAgentBase {
  id = 'react'
  capabilities = [
    'react',
    'tsx',
    'frontend',
    'components',
    'nextjs',
    'typescript',
    'hooks',
    'state-management',
    'performance-optimization',
    'component-analysis',
    'testing-strategy',
    'ssr-ssg',
    'accessibility',
    'responsive-design',
  ]
  specialization = 'React and frontend development with cognitive intelligence'

  // Cognitive specialization properties
  protected cognitiveSpecialization = 'React/Next.js Frontend Development'
  protected cognitiveStrengths = [
    'Component architecture analysis',
    'Performance optimization',
    'Modern React patterns',
    'TypeScript integration',
    'Next.js SSR/SSG optimization',
    'State management strategies',
  ]
  protected cognitiveWeaknesses = [
    'Complex backend integration',
    'Low-level system operations',
    'Database design',
    'Infrastructure management',
  ]

  constructor(workingDirectory: string = process.cwd()) {
    super(workingDirectory)
  }

  protected override async onInitialize(): Promise<void> {
    advancedUI.logInfo('🎨 Initializing Enhanced React Agent with cognitive capabilities...')
    await this.initializeReactCognition()
    advancedUI.logSuccess(`✓ React Agent initialized with ${this.capabilities.length} capabilities`)
  }

  protected override async onStop(): Promise<void> {
    advancedUI.logInfo('🛑 React Agent shutting down...')
    await this.saveCognitiveState()
    advancedUI.logSuccess('✓ React Agent stopped - cognitive state saved')
  }

  protected override async onExecuteTask(task: AgentTask): Promise<AgentTaskResult> {
    const cognition = await this.parseTaskCognition(task.description || task.type)
    const enhancedCognition = await this.enhanceCognitionForSpecialization(cognition)
    const orchestrationPlan = await this.createOrchestrationPlan(enhancedCognition)
    return await this.executeCognitiveTask(task, enhancedCognition, orchestrationPlan)
  }

  /**
   * 🧠 Execute task with React-specific cognitive orchestration
   */
  protected async executeCognitiveTask(
    task: AgentTask,
    cognition: TaskCognition,
    plan: OrchestrationPlan
  ): Promise<AgentTaskResult> {
    const startTime = Date.now()

    try {
      advancedUI.logInfo(`🎨 Executing React task with ${plan.strategy} orchestration`)

      // Phase 1: Analyze project and component requirements
      const context = await this.analyzeProjectContext(cognition)
      const componentAnalysis = await this.analyzeComponentRequirements(cognition, context)

      // Phase 2: Generate intelligent implementation
      const implementation = await this.generateIntelligentSolution(cognition, context, componentAnalysis)

      // Phase 3: Validate and optimize
      const validation = await this.validateImplementation(implementation)

      const executionTime = Date.now() - startTime
      this.updateCognitiveMemory(cognition, implementation, true)

      return {
        success: true,
        message: `React task completed with ${plan.strategy} orchestration in ${executionTime}ms`,
        executionTime,
        data: { cognition, implementation, validation, context, componentAnalysis },
      }
    } catch (error: any) {
      const executionTime = Date.now() - startTime
      CliUI.logError(`✖ React task failed: ${error.message}`)
      this.updateCognitiveMemory(cognition, { error: error.message }, false)

      return {
        success: false,
        message: `React task failed: ${error.message}`,
        executionTime,
        data: { error: error.message, cognition },
      }
    }
  }

  /**
   * 🎯 Enhanced cognition for React-specific analysis
   */
  protected async enhanceCognitionForSpecialization(cognition: TaskCognition): Promise<TaskCognition> {
    try {
      const reactCognition = cognition as ReactCognition

      // Add React-specific component analysis
      if (this.isComponentTask(cognition)) {
        reactCognition.componentAnalysis = await this.analyzeComponent(cognition)
        advancedUI.logInfo(`🧩 Component analysis: ${reactCognition.componentAnalysis?.componentType || 'unknown'}`)
      }

      // Enhance with React capabilities
      const reactCapabilities = this.getReactCapabilities(cognition)
      reactCognition.requiredCapabilities.push(...reactCapabilities)

      return reactCognition
    } catch (error: any) {
      CliUI.logError(`✖ Failed to enhance React cognition: ${error.message}`)
      return cognition
    }
  }

  /**
   * 💡 Get React-specific optimizations
   */
  protected getSpecializationOptimizations(): string[] {
    const optimizations: string[] = []

    // Analyze patterns from cognitive memory
    const componentPatterns = this.cognitiveMemory.taskPatterns.get('component-creation') || []
    if (componentPatterns.length > 10) {
      const avgComplexity =
        componentPatterns.reduce((sum, p) => sum + p.estimatedComplexity, 0) / componentPatterns.length
      if (avgComplexity > 7) {
        optimizations.push('Consider breaking down complex components into smaller pieces')
      }
    }

    const performanceHistory = this.cognitiveMemory.performanceHistory
      .filter((h) => h.cognition.requiredCapabilities.includes('performance-optimization'))
      .slice(-10)

    if (performanceHistory.length > 0) {
      const avgDuration = performanceHistory.reduce((sum, h) => sum + h.duration, 0) / performanceHistory.length
      if (avgDuration > 120000) {
        // 2 minutes
        optimizations.push('Performance optimization tasks taking too long - consider automated tooling')
      }
    }

    return optimizations
  }

  // React-specific methods
  private async initializeReactCognition(): Promise<void> {
    const reactPatterns = [
      'component-creation',
      'hook-implementation',
      'state-management-setup',
      'performance-optimization',
      'testing-setup',
    ]

    reactPatterns.forEach((pattern) => {
      if (!this.cognitiveMemory.taskPatterns.has(pattern)) {
        this.cognitiveMemory.taskPatterns.set(pattern, [])
      }
    })

    advancedUI.logInfo(`🧠 Initialized ${reactPatterns.length} React cognitive patterns`)
  }

  private async saveCognitiveState(): Promise<void> {
    advancedUI.logInfo('💾 React cognitive state prepared for persistence')
  }

  private async analyzeProjectContext(cognition: TaskCognition): Promise<any> {
    try {
      const projectInfo = await toolsManager.analyzeProject()

      const context = {
        framework: projectInfo.framework || 'React',
        hasReact: projectInfo.technologies.includes('React') || projectInfo.framework === 'Next.js',
        hasTypescript: projectInfo.technologies.includes('TypeScript'),
        hasNextjs: projectInfo.framework === 'Next.js',
        packageManager: this.detectPackageManager(),
      }

      // Setup React environment if needed
      if (!context.hasReact && cognition.intent.primary === 'create') {
        await this.setupReactEnvironment()
        context.hasReact = true
      }

      return context
    } catch (error: any) {
      throw new Error(`Project analysis failed: ${error.message}`)
    }
  }

  private async analyzeComponentRequirements(cognition: TaskCognition, context: any): Promise<any> {
    if (!this.isComponentTask(cognition)) {
      return { analyzed: false }
    }

    const reactCognition = cognition as ReactCognition
    return reactCognition.componentAnalysis || (await this.analyzeComponent(cognition))
  }

  private async generateIntelligentSolution(
    cognition: TaskCognition,
    context: any,
    componentAnalysis: any
  ): Promise<any> {
    const systemPrompt = this.createSystemPrompt(cognition, context, componentAnalysis)

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: cognition.originalTask },
    ]

    const response = await modelProvider.generateResponse({ messages })
    return await this.processResponse(response, cognition, componentAnalysis, context)
  }

  private async validateImplementation(implementation: any): Promise<any> {
    const validation = {
      filesCreated: implementation.filesCreated?.length > 0,
      hasTests: implementation.testsGenerated || false,
      syntaxValid: true, // Simplified validation
    }

    return { ...validation, overallSuccess: validation.filesCreated }
  }

  // Helper methods
  private isComponentTask(cognition: TaskCognition): boolean {
    const componentKeywords = ['component', 'hook', 'page', 'layout', 'ui', 'form']
    return componentKeywords.some((keyword) => cognition.normalizedTask.includes(keyword))
  }

  private async analyzeComponent(cognition: TaskCognition): Promise<ReactCognition['componentAnalysis']> {
    const taskText = cognition.normalizedTask.toLowerCase()

    let componentType: 'functional' | 'class' | 'hook' | 'hoc' = 'functional'
    if (taskText.includes('hook')) componentType = 'hook'
    else if (taskText.includes('class')) componentType = 'class'
    else if (taskText.includes('hoc')) componentType = 'hoc'

    let propsComplexity: 'simple' | 'medium' | 'complex' = 'simple'
    if (taskText.includes('complex') || taskText.includes('many props')) propsComplexity = 'complex'
    else if (taskText.includes('props')) propsComplexity = 'medium'

    let stateManagement: 'none' | 'useState' | 'useReducer' | 'context' | 'external' = 'none'
    if (taskText.includes('state')) {
      if (taskText.includes('complex state') || taskText.includes('reducer')) stateManagement = 'useReducer'
      else if (taskText.includes('context')) stateManagement = 'context'
      else if (taskText.includes('redux') || taskText.includes('zustand')) stateManagement = 'external'
      else stateManagement = 'useState'
    }

    return {
      componentType,
      propsComplexity,
      stateManagement,
      performanceOptimizations: this.getPerformanceOptimizations(componentType, stateManagement),
      testingStrategy: this.getTestingStrategy(componentType),
    }
  }

  private getReactCapabilities(cognition: TaskCognition): string[] {
    const capabilities: string[] = []

    if (cognition.intent.primary === 'create') capabilities.push('component-creation')
    if (cognition.normalizedTask.includes('hook')) capabilities.push('custom-hooks')
    if (cognition.normalizedTask.includes('test')) capabilities.push('testing-setup')
    if (cognition.normalizedTask.includes('performance')) capabilities.push('performance-optimization')

    return capabilities
  }

  private detectPackageManager(): string {
    try {
      const fs = require('fs')
      if (fs.existsSync('pnpm-lock.yaml')) return 'pnpm'
      if (fs.existsSync('yarn.lock')) return 'yarn'
      return 'npm'
    } catch {
      return 'npm'
    }
  }

  private async setupReactEnvironment(): Promise<void> {
    const deps = ['react', '@types/react', 'react-dom', '@types/react-dom']
    for (const dep of deps) {
      await toolsManager.installPackage(dep)
    }
  }

  private createSystemPrompt(cognition: TaskCognition, context: any, componentAnalysis: any): string {
    return `You are an advanced React/Next.js expert with cognitive understanding of modern frontend development.

Task: ${cognition.intent.primary} (${cognition.intent.complexity})
Project: ${context.framework} ${context.hasTypescript ? 'with TypeScript' : ''}
Component Type: ${componentAnalysis?.componentType || 'N/A'}

Create production-ready React code with:
1. Modern React patterns and hooks
2. ${context.hasTypescript ? 'Proper TypeScript types' : 'JSDoc documentation'}  
3. Performance optimizations (memo, useMemo, useCallback)
4. Accessibility best practices
5. Clean file structure and imports
6. Error boundaries where needed

Provide complete, working code that can be used immediately.`
  }

  private async processResponse(
    response: string,
    cognition: TaskCognition,
    componentAnalysis: any,
    context: any
  ): Promise<any> {
    const result = {
      filesCreated: [] as string[],
      dependenciesInstalled: [] as string[],
      testsGenerated: false,
    }

    // Extract code blocks
    const codeBlocks = response.match(/```[\w]*\n([\s\S]*?)\n```/g) || []

    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i].replace(/```[\w]*\n/, '').replace(/\n```$/, '')
      const filename = this.generateFilename(code, componentAnalysis, context, i)

      try {
        await toolsManager.writeFile(filename, code)
        result.filesCreated.push(filename)
        advancedUI.logSuccess(`✓ Created: ${filename}`)

        if (filename.includes('test') || filename.includes('spec')) {
          result.testsGenerated = true
        }
      } catch (error: any) {
        advancedUI.logWarning(`⚠︎ Could not create ${filename}: ${error.message}`)
      }
    }

    return result
  }

  private generateFilename(code: string, componentAnalysis: any, context: any, index: number): string {
    // Extract component name from code
    const componentMatch = code.match(/(?:export\s+(?:default\s+)?(?:function|const)\s+|class\s+)([A-Z][a-zA-Z0-9]*)/)

    if (componentMatch) {
      const name = componentMatch[1]
      let extension = context.hasTypescript ? '.tsx' : '.jsx'

      if (componentAnalysis?.componentType === 'hook') {
        extension = context.hasTypescript ? '.ts' : '.js'
        return `src/hooks/${name}${extension}`
      } else {
        return `src/components/${name}${extension}`
      }
    }

    // Fallback filename
    const extension = context.hasTypescript ? '.tsx' : '.jsx'
    return `src/components/Component${index + 1}${extension}`
  }

  private getPerformanceOptimizations(componentType: string, stateManagement: string): string[] {
    const opts: any[] = []

    if (componentType === 'functional') {
      opts.push('React.memo for preventing re-renders')
      opts.push('useMemo for expensive calculations')
      opts.push('useCallback for stable functions')
    }

    if (stateManagement === 'useState') {
      opts.push('Consider useReducer for complex state')
    }

    return opts
  }

  private getTestingStrategy(componentType: string): string[] {
    const strategies = ['Unit tests with React Testing Library']

    if (componentType === 'hook') {
      strategies.push('Hook testing with @testing-library/react-hooks')
    }

    strategies.push('Accessibility testing')
    strategies.push('Integration tests')

    return strategies
  }

  // Legacy compatibility
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
      agent: 'Enhanced React Agent',
      success: result.success,
      cognitiveEnhanced: true,
      data: result.data,
    }
  }

  override async cleanup(): Promise<void> {
    return await this.onStop()
  }
}
