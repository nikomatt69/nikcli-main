import chalk from 'chalk'
import type { OrchestrationPlan, TaskCognition } from '../automation/agents/universal-agent'
import { createDynamicToolSelector } from './dynamic-tool-selector'
import { type ToolRecommendation, toolRouter } from './tool-router'

/**
 * Cognitive Route Analyzer
 * Analizza le richieste dell'utente con intelligenza cognitiva e determina
 * il miglior percorso di esecuzione utilizzando tool routing avanzato
 */
export class CognitiveRouteAnalyzer {
  private workingDirectory: string
  private analysisHistory: Map<string, CognitiveAnalysisResult> = new Map()
  private dynamicSelector: ReturnType<typeof createDynamicToolSelector>

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory
    this.dynamicSelector = createDynamicToolSelector(workingDirectory)
  }

  /**
   * Analizza cognitivamente il messaggio dell'utente e determina il routing ottimale
   */
  async analyzeCognitiveRoute(
    userMessage: string,
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>
      taskType?: string
      previousCognition?: TaskCognition
      orchestrationPlan?: OrchestrationPlan
    }
  ): Promise<CognitiveAnalysisResult> {
    console.log(chalk.blue('🧠 Starting cognitive route analysis...'))

    try {
      // 1. Analisi cognitiva del task
      const taskCognition = await this.performTaskCognition(userMessage, context)

      // 2. Analisi dell'intento multi-dimensionale
      const intentAnalysis = this.analyzeIntentMultiDimensional(userMessage, taskCognition)

      // 3. Tool routing con cognitive awareness
      const toolRecommendations = await this.performCognitiveToolRouting(userMessage, taskCognition, intentAnalysis)

      // 4. Determina strategia di esecuzione
      const executionStrategy = this.determineExecutionStrategy(
        taskCognition,
        toolRecommendations,
        context?.orchestrationPlan
      )

      // 5. Genera piano di routing ottimizzato
      const routePlan = this.generateRoutePlan(taskCognition, toolRecommendations, executionStrategy)

      // 6. Valuta rischi e genera fallback
      const riskAssessment = this.assessRouteRisks(taskCognition, routePlan)
      const fallbackRoutes = this.generateFallbackRoutes(taskCognition, toolRecommendations)

      const result: CognitiveAnalysisResult = {
        id: `cognitive-${Date.now()}`,
        userMessage,
        taskCognition,
        intentAnalysis,
        toolRecommendations,
        executionStrategy,
        routePlan,
        riskAssessment,
        fallbackRoutes,
        confidence: this.calculateOverallConfidence(taskCognition, toolRecommendations),
        timestamp: new Date(),
      }

      // Store per learning
      this.analysisHistory.set(result.id, result)

      this.displayAnalysisResult(result)

      return result
    } catch (error: any) {
      console.log(chalk.red(`❌ Cognitive analysis failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Esegue l'analisi cognitiva del task
   */
  private async performTaskCognition(userMessage: string, context?: any): Promise<TaskCognition> {
    const normalizedMessage = this.normalizeMessage(userMessage)

    // Estrai intent primario
    const primaryIntent = this.extractPrimaryIntent(normalizedMessage)

    // Estrai intent secondari
    const secondaryIntents = this.extractSecondaryIntents(normalizedMessage)

    // Calcola complessità
    const complexity = this.calculateComplexity(normalizedMessage, context)

    // Estrai entità
    const entities = this.extractEntities(normalizedMessage)

    // Determina urgenza
    const urgency = this.determineUrgency(normalizedMessage, context)

    // Estrai dipendenze
    const dependencies = this.extractDependencies(normalizedMessage, entities)

    // Estrai contesti
    const contexts = this.extractContexts(normalizedMessage, context?.conversationHistory)

    // Calcola complessità stimata
    const estimatedComplexity = this.estimateTaskComplexity(primaryIntent, entities, dependencies, complexity)

    // Determina capacità richieste
    const requiredCapabilities = this.determineRequiredCapabilities(primaryIntent, secondaryIntents, entities)

    // Suggerisci agenti
    const suggestedAgents = this.suggestOptimalAgents(requiredCapabilities, estimatedComplexity)

    // Valuta rischio
    const riskLevel = this.assessRiskLevel(primaryIntent, complexity, entities)

    return {
      id: `cognition-${Date.now()}`,
      originalTask: userMessage,
      normalizedTask: normalizedMessage,
      intent: {
        primary: primaryIntent,
        secondary: secondaryIntents,
        confidence: this.calculateIntentConfidence(normalizedMessage),
        complexity,
        urgency,
      },
      entities,
      dependencies,
      contexts,
      estimatedComplexity,
      requiredCapabilities,
      suggestedAgents,
      riskLevel,
    }
  }

  /**
   * Analisi multi-dimensionale dell'intento
   */
  private analyzeIntentMultiDimensional(message: string, cognition: TaskCognition): IntentAnalysis {
    const dimensions: IntentDimension[] = []

    // Dimensione tecnica
    if (this.hasTechnicalIndicators(message)) {
      dimensions.push({
        type: 'technical',
        score: this.calculateTechnicalScore(message, cognition),
        indicators: this.extractTechnicalIndicators(message),
      })
    }

    // Dimensione creativa
    if (this.hasCreativeIndicators(message)) {
      dimensions.push({
        type: 'creative',
        score: this.calculateCreativeScore(message, cognition),
        indicators: this.extractCreativeIndicators(message),
      })
    }

    // Dimensione analitica
    if (this.hasAnalyticalIndicators(message)) {
      dimensions.push({
        type: 'analytical',
        score: this.calculateAnalyticalScore(message, cognition),
        indicators: this.extractAnalyticalIndicators(message),
      })
    }

    // Dimensione operativa
    if (this.hasOperationalIndicators(message)) {
      dimensions.push({
        type: 'operational',
        score: this.calculateOperationalScore(message, cognition),
        indicators: this.extractOperationalIndicators(message),
      })
    }

    // Determina dimensione dominante
    const dominantDimension = dimensions.reduce((prev, current) => (current.score > prev.score ? current : prev))

    return {
      dimensions,
      dominantDimension: dominantDimension.type,
      confidence: this.calculateIntentAnalysisConfidence(dimensions),
      suggestedApproach: this.suggestApproachForDimension(dominantDimension.type),
    }
  }

  /**
   * Tool routing con cognitive awareness
   */
  private async performCognitiveToolRouting(
    message: string,
    cognition: TaskCognition,
    intentAnalysis: IntentAnalysis
  ): Promise<ToolRecommendation[]> {
    // Usa il tool router con cognitive context
    const _routingContext = {
      userIntent: message,
      projectType: this.detectProjectType(),
      currentWorkspace: this.workingDirectory,
      availableTools: toolRouter.getAllTools().map((t) => t.tool),
      securityMode: 'normal' as const,
      cognition,
      orchestrationPlan: cognition.orchestrationPlan,
    }

    // Ottieni recommendations base dal router (non-cognitive to avoid recursion)
    const baseRecommendations = toolRouter.analyzeMessage({ role: 'user', content: message })

    // Applica enhancement basato su intent analysis
    const enhancedRecommendations = this.enhanceWithIntentAnalysis(baseRecommendations, intentAnalysis)

    // Usa dynamic selector per diversità
    const dynamicRecommendations = this.dynamicSelector.selectToolsDynamically(message, {
      taskType: this.mapIntentToTaskType(cognition.intent.primary),
      preferredTools: enhancedRecommendations.slice(0, 3).map((r) => r.tool),
      maxTools: 7,
    })

    // Merge e deduplica
    const mergedRecommendations = this.mergeRecommendations(enhancedRecommendations, dynamicRecommendations)

    return mergedRecommendations
  }

  /**
   * Determina la strategia di esecuzione ottimale
   */
  private determineExecutionStrategy(
    cognition: TaskCognition,
    tools: ToolRecommendation[],
    orchestrationPlan?: OrchestrationPlan
  ): ExecutionStrategy {
    // Se c'è un orchestration plan, usalo
    if (orchestrationPlan) {
      return {
        type: orchestrationPlan.strategy,
        phases: orchestrationPlan.phases.length,
        parallel: orchestrationPlan.strategy === 'parallel' || orchestrationPlan.strategy === 'hybrid',
        estimatedDuration: orchestrationPlan.estimatedDuration,
        resourceIntensive: orchestrationPlan.resourceRequirements.complexity > 7,
      }
    }

    // Altrimenti determina in base a cognition e tools
    const isParallelizable = this.isTaskParallelizable(cognition, tools)
    const isResourceIntensive = cognition.estimatedComplexity > 7 || tools.length > 5

    let strategyType: 'sequential' | 'parallel' | 'hybrid' | 'adaptive' = 'sequential'

    if (isParallelizable && tools.length > 3) {
      strategyType = 'hybrid'
    } else if (isParallelizable) {
      strategyType = 'parallel'
    } else if (cognition.estimatedComplexity > 8) {
      strategyType = 'adaptive'
    }

    return {
      type: strategyType,
      phases: Math.ceil(tools.length / 3),
      parallel: strategyType === 'parallel' || strategyType === 'hybrid',
      estimatedDuration: this.estimateDuration(cognition, tools, strategyType),
      resourceIntensive: isResourceIntensive,
    }
  }

  /**
   * Genera piano di routing dettagliato
   */
  private generateRoutePlan(
    _cognition: TaskCognition,
    tools: ToolRecommendation[],
    strategy: ExecutionStrategy
  ): RoutePlan {
    const steps: RouteStep[] = []

    if (strategy.type === 'sequential') {
      // Sequential routing - uno dopo l'altro
      tools.forEach((tool, index) => {
        steps.push({
          id: `step-${index + 1}`,
          type: 'tool-execution',
          tool: tool.tool,
          confidence: tool.confidence,
          dependencies: index > 0 ? [`step-${index}`] : [],
          estimatedDuration: this.estimateToolDuration(tool.tool),
          fallback: this.findFallbackTool(tool.tool, tools),
        })
      })
    } else if (strategy.type === 'parallel') {
      // Parallel routing - tutti insieme
      const parallelGroup: RouteStep = {
        id: 'parallel-group-1',
        type: 'parallel-execution',
        tools: tools.map((t) => t.tool),
        confidence: tools.reduce((sum, t) => sum + t.confidence, 0) / tools.length,
        dependencies: [],
        estimatedDuration: Math.max(...tools.map((t) => this.estimateToolDuration(t.tool))),
      }
      steps.push(parallelGroup)
    } else if (strategy.type === 'hybrid') {
      // Hybrid - gruppi paralleli in sequenza
      const toolGroups = this.groupToolsForHybrid(tools)
      toolGroups.forEach((group, index) => {
        steps.push({
          id: `hybrid-group-${index + 1}`,
          type: 'parallel-execution',
          tools: group.map((t) => t.tool),
          confidence: group.reduce((sum, t) => sum + t.confidence, 0) / group.length,
          dependencies: index > 0 ? [`hybrid-group-${index}`] : [],
          estimatedDuration: Math.max(...group.map((t) => this.estimateToolDuration(t.tool))),
        })
      })
    } else {
      // Adaptive - decide dinamicamente
      steps.push({
        id: 'adaptive-routing',
        type: 'adaptive-execution',
        tools: tools.map((t) => t.tool),
        confidence: 0.7,
        dependencies: [],
        estimatedDuration: strategy.estimatedDuration,
        adaptive: true,
      })
    }

    return {
      id: `route-plan-${Date.now()}`,
      strategy: strategy.type,
      steps,
      totalSteps: steps.length,
      estimatedDuration: steps.reduce((sum, step) => sum + step.estimatedDuration, 0),
      parallelizable: strategy.parallel,
      criticalPath: this.identifyCriticalPath(steps),
    }
  }

  /**
   * Valuta i rischi del routing
   */
  private assessRouteRisks(_cognition: TaskCognition, plan: RoutePlan): RiskAssessment {
    const risks: Risk[] = []

    // Rischio complessità
    if (cognition.estimatedComplexity > 8) {
      risks.push({
        type: 'complexity',
        level: 'high',
        description: 'Task molto complesso, possibili errori',
        mitigation: 'Aumentare validazione e monitoraggio',
      })
    }

    // Rischio dipendenze
    if (cognition.dependencies.length > 5) {
      risks.push({
        type: 'dependencies',
        level: 'medium',
        description: 'Molte dipendenze potrebbero causare fallimenti a cascata',
        mitigation: 'Implementare fallback robusti',
      })
    }

    // Rischio tool
    const lowConfidenceTools = plan.steps.filter((s) => s.confidence < 0.6)
    if (lowConfidenceTools.length > 0) {
      risks.push({
        type: 'tool-confidence',
        level: 'medium',
        description: `${lowConfidenceTools.length} tool con bassa confidence`,
        mitigation: 'Preparare tool alternativi',
      })
    }

    // Rischio tempo
    if (plan.estimatedDuration > 60000) {
      // > 1 minuto
      risks.push({
        type: 'duration',
        level: 'low',
        description: 'Esecuzione potenzialmente lunga',
        mitigation: 'Implementare progress feedback',
      })
    }

    const overallRiskLevel = this.calculateOverallRiskLevel(risks)

    return {
      overallLevel: overallRiskLevel,
      risks,
      mitigationStrategies: risks.map((r) => r.mitigation),
      requiresApproval: overallRiskLevel === 'high' || cognition.riskLevel === 'high',
    }
  }

  /**
   * Genera route di fallback
   */
  private generateFallbackRoutes(_cognition: TaskCognition, tools: ToolRecommendation[]): FallbackRoute[] {
    const fallbacks: FallbackRoute[] = []

    // Fallback 1: Tool alternativi
    const alternativeTools = this.findAlternativeTools(tools)
    if (alternativeTools.length > 0) {
      fallbacks.push({
        id: 'fallback-alternative-tools',
        type: 'alternative-tools',
        description: 'Usa tool alternativi se i primari falliscono',
        tools: alternativeTools.map((t) => t.tool),
        confidence: 0.6,
      })
    }

    // Fallback 2: Strategia semplificata
    if (cognition.estimatedComplexity > 7) {
      fallbacks.push({
        id: 'fallback-simplified',
        type: 'simplified-strategy',
        description: 'Semplifica approccio riducendo complessità',
        confidence: 0.7,
      })
    }

    // Fallback 3: Manual intervention
    fallbacks.push({
      id: 'fallback-manual',
      type: 'manual-intervention',
      description: "Richiedi intervento manuale dell'utente",
      confidence: 1.0,
    })

    return fallbacks
  }

  /**
   * Display analysis result
   */
  private displayAnalysisResult(result: CognitiveAnalysisResult): void {
    if (process.env.NIKCLI_DEBUG_COGNITIVE === '1') {
      console.log(chalk.blue('\n╔══════════════════════════════════════════════════════════════╗'))
      console.log(chalk.blue('║           🧠 COGNITIVE ROUTE ANALYSIS RESULT                ║'))
      console.log(chalk.blue('╚══════════════════════════════════════════════════════════════╝\n'))

      console.log(chalk.cyan('📋 Task Cognition:'))
      console.log(chalk.gray(`   Intent: ${result.taskCognition.intent.primary}`))
      console.log(chalk.gray(`   Complexity: ${result.taskCognition.estimatedComplexity}/10`))
      console.log(chalk.gray(`   Risk: ${result.taskCognition.riskLevel}`))
      console.log(chalk.gray(`   Entities: ${result.taskCognition.entities.length}`))

      console.log(chalk.cyan('\n🎯 Intent Analysis:'))
      console.log(chalk.gray(`   Dominant: ${result.intentAnalysis.dominantDimension}`))
      console.log(
        chalk.gray(
          `   Dimensions: ${result.intentAnalysis.dimensions.map((d) => `${d.type}(${(d.score * 100).toFixed(0)}%)`).join(', ')}`
        )
      )

      console.log(chalk.cyan('\n🔧 Tool Recommendations:'))
      result.toolRecommendations.slice(0, 5).forEach((tool, i) => {
        console.log(chalk.gray(`   ${i + 1}. ${tool.tool} (${(tool.confidence * 100).toFixed(0)}%) - ${tool.reason}`))
      })

      console.log(chalk.cyan('\n📊 Execution Strategy:'))
      console.log(chalk.gray(`   Type: ${result.executionStrategy.type}`))
      console.log(chalk.gray(`   Phases: ${result.executionStrategy.phases}`))
      console.log(chalk.gray(`   Duration: ${(result.executionStrategy.estimatedDuration / 1000).toFixed(1)}s`))

      console.log(chalk.cyan('\n⚠️  Risk Assessment:'))
      console.log(chalk.gray(`   Level: ${result.riskAssessment.overallLevel}`))
      console.log(chalk.gray(`   Risks: ${result.riskAssessment.risks.length}`))

      console.log(chalk.cyan(`\n✅ Overall Confidence: ${(result.confidence * 100).toFixed(0)}%\n`))
    }
  }

  // ============= HELPER METHODS =============

  private normalizeMessage(message: string): string {
    return message.toLowerCase().trim()
  }

  private extractPrimaryIntent(
    message: string
  ): 'create' | 'read' | 'update' | 'delete' | 'analyze' | 'optimize' | 'deploy' | 'test' | 'debug' | 'refactor' {
    const intentPatterns = {
      create: /\b(create|generate|make|build|add|new)\b/i,
      read: /\b(read|show|display|view|get|find|search|list)\b/i,
      update: /\b(update|modify|change|edit|fix|patch)\b/i,
      delete: /\b(delete|remove|drop|clear)\b/i,
      analyze: /\b(analyze|examine|inspect|check|review|investigate)\b/i,
      optimize: /\b(optimize|improve|enhance|refactor|clean)\b/i,
      deploy: /\b(deploy|release|publish|ship)\b/i,
      test: /\b(test|verify|validate|check)\b/i,
      debug: /\b(debug|fix|troubleshoot|diagnose)\b/i,
      refactor: /\b(refactor|restructure|reorganize)\b/i,
    }

    for (const [intent, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(message)) {
        return intent as any
      }
    }

    return 'analyze' // default
  }

  private extractSecondaryIntents(message: string): string[] {
    const intents: string[] = []
    const patterns = {
      documentation: /\b(document|comment|explain)\b/i,
      testing: /\b(test|spec|coverage)\b/i,
      validation: /\b(validate|verify|check)\b/i,
      optimization: /\b(optimize|performance|fast)\b/i,
      security: /\b(secure|safe|protect|auth)\b/i,
    }

    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(message)) {
        intents.push(intent)
      }
    }

    return intents
  }

  private calculateComplexity(message: string, context?: any): 'low' | 'medium' | 'high' | 'extreme' {
    let score = 0

    if (message.length > 200) score += 2
    if (message.length > 500) score += 2

    if (/\b(complex|difficult|advanced|intricate)\b/i.test(message)) score += 3
    if (/\b(multiple|many|several|various)\b/i.test(message)) score += 2
    if (/\b(entire|whole|all|complete)\b/i.test(message)) score += 2

    if (context?.conversationHistory && context.conversationHistory.length > 10) score += 1

    if (score <= 2) return 'low'
    if (score <= 5) return 'medium'
    if (score <= 8) return 'high'
    return 'extreme'
  }

  private extractEntities(message: string): Array<{
    type: 'file' | 'directory' | 'function' | 'class' | 'component' | 'api' | 'database'
    name: string
    confidence: number
    location?: string
  }> {
    const entities: any[] = []

    // File patterns
    const filePattern = /([a-zA-Z0-9_-]+\.(ts|js|tsx|jsx|json|md|css|html|py))/g
    let match: any
    while ((match = filePattern.exec(message)) !== null) {
      entities.push({
        type: 'file',
        name: match[1],
        confidence: 0.9,
      })
    }

    // Component patterns
    const componentPattern = /\b([A-Z][a-zA-Z0-9]*(?:Component|Widget|View|Screen))\b/g
    while ((match = componentPattern.exec(message)) !== null) {
      entities.push({
        type: 'component',
        name: match[1],
        confidence: 0.8,
      })
    }

    // API patterns
    if (/\bapi\b/i.test(message)) {
      entities.push({
        type: 'api',
        name: 'API',
        confidence: 0.7,
      })
    }

    return entities
  }

  private determineUrgency(message: string, _context?: any): 'low' | 'normal' | 'high' | 'critical' {
    if (/\b(urgent|asap|immediately|critical|emergency)\b/i.test(message)) return 'critical'
    if (/\b(soon|quickly|priority|important)\b/i.test(message)) return 'high'
    if (/\b(later|eventually|when possible)\b/i.test(message)) return 'low'
    return 'normal'
  }

  private extractDependencies(message: string, entities: any[]): string[] {
    const deps: string[] = []

    if (/\brequire|need|depend|use\b/i.test(message)) {
      entities.forEach((e) => deps.push(e.name))
    }

    return deps
  }

  private extractContexts(message: string, _history?: any[]): string[] {
    const contexts: string[] = []

    if (/\breact|frontend|ui|component\b/i.test(message)) contexts.push('frontend')
    if (/\bbackend|api|server|database\b/i.test(message)) contexts.push('backend')
    if (/\bdevops|deploy|docker|kubernetes\b/i.test(message)) contexts.push('devops')
    if (/\btest|spec|coverage\b/i.test(message)) contexts.push('testing')

    return contexts
  }

  private estimateTaskComplexity(_intent: string, entities: any[], dependencies: string[], complexity: string): number {
    let score = 0

    // Base complexity
    const complexityScores = { low: 2, medium: 5, high: 8, extreme: 10 }
    score += complexityScores[complexity as keyof typeof complexityScores] || 5

    // Entities impact
    score += Math.min(entities.length * 0.5, 3)

    // Dependencies impact
    score += Math.min(dependencies.length * 0.3, 2)

    return Math.min(Math.round(score), 10)
  }

  private determineRequiredCapabilities(primary: string, secondary: string[], entities: any[]): string[] {
    const caps = new Set<string>()

    // From intent
    if (primary === 'create') caps.add('code-generation')
    if (primary === 'analyze') caps.add('code-analysis')
    if (primary === 'test') caps.add('testing')

    // From secondary
    secondary.forEach((s) => caps.add(s))

    // From entities
    entities.forEach((e) => {
      if (e.type === 'component') caps.add('frontend')
      if (e.type === 'api') caps.add('backend')
    })

    return Array.from(caps)
  }

  private suggestOptimalAgents(capabilities: string[], complexity: number): string[] {
    const agents: string[] = []

    if (complexity > 8) agents.push('universal-agent')
    if (capabilities.includes('frontend')) agents.push('react-agent')
    if (capabilities.includes('backend')) agents.push('backend-agent')
    if (capabilities.includes('devops')) agents.push('devops-agent')
    if (capabilities.includes('code-generation')) agents.push('code-generator-agent')

    return agents.length > 0 ? agents : ['universal-agent']
  }

  private assessRiskLevel(intent: string, complexity: string, entities: any[]): 'low' | 'medium' | 'high' {
    let riskScore = 0

    if (intent === 'delete') riskScore += 3
    if (intent === 'deploy') riskScore += 2
    if (complexity === 'extreme') riskScore += 3
    if (complexity === 'high') riskScore += 2
    if (entities.length > 5) riskScore += 1

    if (riskScore >= 5) return 'high'
    if (riskScore >= 3) return 'medium'
    return 'low'
  }

  private calculateIntentConfidence(message: string): number {
    // Simple confidence based on clarity
    if (message.length < 20) return 0.5
    if (message.length > 100) return 0.9
    return 0.7
  }

  // Intent analysis helpers
  private hasTechnicalIndicators(message: string): boolean {
    return /\b(code|function|class|api|database|algorithm|implement|build)\b/i.test(message)
  }

  private hasCreativeIndicators(message: string): boolean {
    return /\b(design|create|generate|imagine|innovative|new|unique)\b/i.test(message)
  }

  private hasAnalyticalIndicators(message: string): boolean {
    return /\b(analyze|examine|investigate|review|assess|evaluate|compare)\b/i.test(message)
  }

  private hasOperationalIndicators(message: string): boolean {
    return /\b(deploy|run|execute|operate|manage|maintain|monitor)\b/i.test(message)
  }

  private calculateTechnicalScore(message: string, cognition: TaskCognition): number {
    let score = 0
    if (cognition.entities.length > 0) score += 0.3
    if (cognition.requiredCapabilities.includes('code-generation')) score += 0.4
    if (/\b(typescript|javascript|python|java)\b/i.test(message)) score += 0.3
    return Math.min(score, 1.0)
  }

  private calculateCreativeScore(message: string, cognition: TaskCognition): number {
    let score = 0
    if (cognition.intent.primary === 'create') score += 0.5
    if (/\b(new|innovative|creative|design)\b/i.test(message)) score += 0.5
    return Math.min(score, 1.0)
  }

  private calculateAnalyticalScore(_message: string, cognition: TaskCognition): number {
    let score = 0
    if (cognition.intent.primary === 'analyze') score += 0.6
    if (cognition.requiredCapabilities.includes('code-analysis')) score += 0.4
    return Math.min(score, 1.0)
  }

  private calculateOperationalScore(_message: string, cognition: TaskCognition): number {
    let score = 0
    if (['deploy', 'test'].includes(cognition.intent.primary)) score += 0.5
    if (cognition.contexts.includes('devops')) score += 0.5
    return Math.min(score, 1.0)
  }

  private extractTechnicalIndicators(message: string): string[] {
    const indicators: string[] = []
    const patterns = ['code', 'function', 'class', 'api', 'database', 'algorithm']
    patterns.forEach((p) => {
      if (new RegExp(`\\b${p}\\b`, 'i').test(message)) indicators.push(p)
    })
    return indicators
  }

  private extractCreativeIndicators(message: string): string[] {
    const indicators: string[] = []
    const patterns = ['design', 'create', 'generate', 'innovative', 'new']
    patterns.forEach((p) => {
      if (new RegExp(`\\b${p}\\b`, 'i').test(message)) indicators.push(p)
    })
    return indicators
  }

  private extractAnalyticalIndicators(message: string): string[] {
    const indicators: string[] = []
    const patterns = ['analyze', 'examine', 'investigate', 'review', 'assess']
    patterns.forEach((p) => {
      if (new RegExp(`\\b${p}\\b`, 'i').test(message)) indicators.push(p)
    })
    return indicators
  }

  private extractOperationalIndicators(message: string): string[] {
    const indicators: string[] = []
    const patterns = ['deploy', 'run', 'execute', 'operate', 'manage']
    patterns.forEach((p) => {
      if (new RegExp(`\\b${p}\\b`, 'i').test(message)) indicators.push(p)
    })
    return indicators
  }

  private calculateIntentAnalysisConfidence(dimensions: IntentDimension[]): number {
    if (dimensions.length === 0) return 0.5
    const avgScore = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
    return avgScore
  }

  private suggestApproachForDimension(dimension: string): string {
    const approaches: Record<string, string> = {
      technical: 'Focus on code quality, best practices, and technical implementation',
      creative: 'Emphasize innovative solutions and user experience',
      analytical: 'Prioritize thorough analysis and data-driven decisions',
      operational: 'Concentrate on reliability, deployment, and maintenance',
    }
    return approaches[dimension] || 'Balanced approach'
  }

  private enhanceWithIntentAnalysis(tools: any[], intentAnalysis: IntentAnalysis): ToolRecommendation[] {
    return tools.map((tool) => {
      let enhancedConfidence = tool.confidence

      // Boost based on dominant dimension
      if (intentAnalysis.dominantDimension === 'technical' && /code|analysis/.test(tool.tool)) {
        enhancedConfidence *= 1.2
      } else if (intentAnalysis.dominantDimension === 'creative' && /generate|create/.test(tool.tool)) {
        enhancedConfidence *= 1.2
      }

      return {
        ...tool,
        confidence: Math.min(enhancedConfidence, 1.0),
      }
    })
  }

  private mapIntentToTaskType(intent: string): 'read' | 'write' | 'search' | 'analyze' | 'execute' | 'mixed' {
    const mapping: Record<string, any> = {
      create: 'write',
      read: 'read',
      update: 'write',
      delete: 'write',
      analyze: 'analyze',
      optimize: 'analyze',
      deploy: 'execute',
      test: 'execute',
      debug: 'analyze',
      refactor: 'write',
    }
    return mapping[intent] || 'mixed'
  }

  private mergeRecommendations(enhanced: ToolRecommendation[], dynamic: ToolRecommendation[]): ToolRecommendation[] {
    const merged = [...enhanced]
    const existingTools = new Set(enhanced.map((t) => t.tool))

    dynamic.forEach((tool) => {
      if (!existingTools.has(tool.tool)) {
        merged.push(tool)
      }
    })

    return merged.sort((a, b) => b.confidence - a.confidence).slice(0, 10)
  }

  private isTaskParallelizable(_cognition: TaskCognition, tools: ToolRecommendation[]): boolean {
    // Se ci sono poche dipendenze e i tool sono indipendenti
    return cognition.dependencies.length <= 2 && tools.length > 2
  }

  private estimateDuration(_cognition: TaskCognition, tools: ToolRecommendation[], strategy: string): number {
    const baseTime = cognition.estimatedComplexity * 1000 // ms per complexity point
    const toolTime = tools.length * 2000 // 2s per tool

    if (strategy === 'parallel') {
      return baseTime + toolTime * 0.5
    } else if (strategy === 'hybrid') {
      return baseTime + toolTime * 0.7
    } else {
      return baseTime + toolTime
    }
  }

  private estimateToolDuration(toolName: string): number {
    const durations: Record<string, number> = {
      'read-file-tool': 1000,
      'write-file-tool': 2000,
      'bash-tool': 5000,
      'grep-tool': 2000,
      default: 3000,
    }
    return durations[toolName] || durations.default
  }

  private findFallbackTool(toolName: string, allTools: ToolRecommendation[]): string | undefined {
    // Trova tool simile con confidence più bassa
    const similar = allTools.find((t) => t.tool !== toolName && t.confidence > 0.5)
    return similar?.tool
  }

  private groupToolsForHybrid(tools: ToolRecommendation[]): ToolRecommendation[][] {
    const groups: ToolRecommendation[][] = []
    const groupSize = 3

    for (let i = 0; i < tools.length; i += groupSize) {
      groups.push(tools.slice(i, i + groupSize))
    }

    return groups
  }

  private identifyCriticalPath(steps: RouteStep[]): string[] {
    // Identifica la sequenza di step che determina il tempo totale
    return steps.map((s) => s.id)
  }

  private calculateOverallRiskLevel(risks: Risk[]): 'low' | 'medium' | 'high' {
    const highRisks = risks.filter((r) => r.level === 'high').length
    const mediumRisks = risks.filter((r) => r.level === 'medium').length

    if (highRisks > 0) return 'high'
    if (mediumRisks > 1) return 'medium'
    return 'low'
  }

  private findAlternativeTools(tools: ToolRecommendation[]): ToolRecommendation[] {
    // Prendi tool con confidence 0.4-0.7 come alternative
    return tools.filter((t) => t.confidence >= 0.4 && t.confidence <= 0.7)
  }

  private calculateOverallConfidence(_cognition: TaskCognition, tools: ToolRecommendation[]): number {
    const intentConfidence = cognition.intent.confidence
    const avgToolConfidence = tools.reduce((sum, t) => sum + t.confidence, 0) / tools.length
    const complexityFactor = 1 - (cognition.estimatedComplexity / 10) * 0.3

    return intentConfidence * 0.3 + avgToolConfidence * 0.5 + complexityFactor * 0.2
  }

  private detectProjectType(): string {
    // Analizza il working directory per determinare il tipo di progetto
    try {
      const fs = require('fs')
      const path = require('path')
      const packageJsonPath = path.join(this.workingDirectory, 'package.json')

      if (fs.existsSync(packageJsonPath)) {
        return 'nodejs'
      }

      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /**
   * Ottieni statistiche di routing
   */
  getRoutingStatistics(): RoutingStatistics {
    const analyses = Array.from(this.analysisHistory.values())

    return {
      totalAnalyses: analyses.length,
      averageConfidence: analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length || 0,
      intentDistribution: this.calculateIntentDistribution(analyses),
      toolUsage: this.calculateToolUsage(analyses),
      averageComplexity:
        analyses.reduce((sum, a) => sum + a.taskCognition.estimatedComplexity, 0) / analyses.length || 0,
      riskDistribution: this.calculateRiskDistribution(analyses),
    }
  }

  private calculateIntentDistribution(analyses: CognitiveAnalysisResult[]): Record<string, number> {
    const distribution: Record<string, number> = {}
    analyses.forEach((a) => {
      const intent = a.taskCognition.intent.primary
      distribution[intent] = (distribution[intent] || 0) + 1
    })
    return distribution
  }

  private calculateToolUsage(analyses: CognitiveAnalysisResult[]): Record<string, number> {
    const usage: Record<string, number> = {}
    analyses.forEach((a) => {
      a.toolRecommendations.forEach((t) => {
        usage[t.tool] = (usage[t.tool] || 0) + 1
      })
    })
    return usage
  }

  private calculateRiskDistribution(analyses: CognitiveAnalysisResult[]): Record<string, number> {
    const distribution: Record<string, number> = { low: 0, medium: 0, high: 0 }
    analyses.forEach((a) => {
      distribution[a.taskCognition.riskLevel]++
    })
    return distribution
  }
}

// ============= TYPES =============

export interface CognitiveAnalysisResult {
  id: string
  userMessage: string
  taskCognition: TaskCognition
  intentAnalysis: IntentAnalysis
  toolRecommendations: ToolRecommendation[]
  executionStrategy: ExecutionStrategy
  routePlan: RoutePlan
  riskAssessment: RiskAssessment
  fallbackRoutes: FallbackRoute[]
  confidence: number
  timestamp: Date
}

export interface IntentAnalysis {
  dimensions: IntentDimension[]
  dominantDimension: string
  confidence: number
  suggestedApproach: string
}

export interface IntentDimension {
  type: 'technical' | 'creative' | 'analytical' | 'operational'
  score: number
  indicators: string[]
}

export interface ExecutionStrategy {
  type: 'sequential' | 'parallel' | 'hybrid' | 'adaptive'
  phases: number
  parallel: boolean
  estimatedDuration: number
  resourceIntensive: boolean
}

export interface RoutePlan {
  id: string
  strategy: string
  steps: RouteStep[]
  totalSteps: number
  estimatedDuration: number
  parallelizable: boolean
  criticalPath: string[]
}

export interface RouteStep {
  id: string
  type: 'tool-execution' | 'parallel-execution' | 'adaptive-execution'
  tool?: string
  tools?: string[]
  confidence: number
  dependencies: string[]
  estimatedDuration: number
  fallback?: string
  adaptive?: boolean
}

export interface RiskAssessment {
  overallLevel: 'low' | 'medium' | 'high'
  risks: Risk[]
  mitigationStrategies: string[]
  requiresApproval: boolean
}

export interface Risk {
  type: string
  level: 'low' | 'medium' | 'high'
  description: string
  mitigation: string
}

export interface FallbackRoute {
  id: string
  type: string
  description: string
  tools?: string[]
  confidence: number
}

export interface RoutePerformanceMetrics {
  routeId: string
  executionTime: number
  success: boolean
  toolsUsed: string[]
  confidence: number
}

export interface RoutingStatistics {
  totalAnalyses: number
  averageConfidence: number
  intentDistribution: Record<string, number>
  toolUsage: Record<string, number>
  averageComplexity: number
  riskDistribution: Record<string, number>
}

// Export singleton factory
export function createCognitiveRouteAnalyzer(workingDirectory: string): CognitiveRouteAnalyzer {
  return new CognitiveRouteAnalyzer(workingDirectory)
}
