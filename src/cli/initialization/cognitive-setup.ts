import chalk from 'chalk'
import { StreamingOrchestrator } from '../streaming-orchestrator'
import { validatorManager } from '../core/validator-manager'
import { toolRouter } from '../core/tool-router'
import { agentFactory } from '../core/agent-factory'
import { agentService } from '../services/agent-service'
import { planningService } from '../services/planning-service'
import { advancedAIProvider } from '../ai/advanced-ai-provider'

const formatCognitive = chalk.hex('#4a4a4a')

export class CognitiveSetup {
  private nikCLI: any // Reference to main NikCLI instance

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  /**
   * Log cognitive messages
   */
  private logCognitive(message: string): void {
    console.log(formatCognitive(message))
  }

  /**
   * Initialize cognitive orchestration system with enhanced components
   */
  initializeCognitiveOrchestration(): void {
    try {
      if (!process.env.NIKCLI_QUIET_STARTUP) {
        this.logCognitive('⚡︎ Initializing cognitive orchestration system...')
      }

      // Initialize streaming orchestrator with adaptive supervision
      this.nikCLI.streamingOrchestrator = new StreamingOrchestrator()

      // Configure cognitive features
      this.nikCLI.streamingOrchestrator.configureAdaptiveSupervision({
        adaptiveSupervision: this.nikCLI.cognitiveMode,
        intelligentPrioritization: true,
        cognitiveFiltering: true,
        orchestrationAwareness: true,
      })

      // Setup cognitive event listeners
      this.setupCognitiveEventListeners()

      // Integrate with existing systems
      this.integrateCognitiveComponents()

      this.logCognitive('✓ Cognitive orchestration system initialized')
    } catch (error: any) {
      this.logCognitive(`⚠️ Cognitive orchestration initialization warning: ${error.message}`)
      this.nikCLI.cognitiveMode = false // Fallback to standard mode
    }
  }

  /**
   * Setup cognitive event listeners for system coordination
   */
  setupCognitiveEventListeners(): void {
    if (!this.nikCLI.streamingOrchestrator) return

    // Listen to supervision events
    this.nikCLI.streamingOrchestrator.on('supervision:updated', (cognition: any) => {
      this.nikCLI.handleSupervisionUpdate(cognition)
    })

    // Listen to validation events
    validatorManager.on('validation:completed', (event: any) => {
      this.nikCLI.handleValidationEvent(event)
    })

    // Listen to tool routing events
    toolRouter.on('routing:optimized', (event: any) => {
      this.nikCLI.handleRoutingOptimization(event)
    })

    // Listen to agent factory events
    agentFactory.on('selection:optimized', (event: any) => {
      this.nikCLI.handleAgentSelectionOptimization(event)
    })
  }

  /**
   * Integrate cognitive components with existing systems
   */
  integrateCognitiveComponents(): void {
    // Enhance agent service with cognitive awareness
    this.enhanceAgentServiceWithCognition()

    // Integrate validation manager with planning
    this.integrateValidationWithPlanning()

    // Setup tool router coordination
    this.setupToolRouterCoordination()

    // Configure advanced AI provider cognitive features
    this.configureAdvancedAIProviderCognition()
  }

  /**
   * Enhance agent service with cognitive awareness
   */
  enhanceAgentServiceWithCognition(): void {
    const originalExecuteTask = agentService.executeTask.bind(agentService)

    agentService.executeTask = async (agentType: string, task: string, options?: any) => {
      // Apply cognitive enhancement to task execution
      const enhancedOptions = {
        ...options,
        cognitiveMode: this.nikCLI.cognitiveMode,
        orchestrationLevel: this.nikCLI.orchestrationLevel,
        validatorManager: validatorManager,
        toolRouter: toolRouter,
      }

      return originalExecuteTask(agentType, task, enhancedOptions)
    }
  }

  /**
   * Integrate validation manager with planning service
   */
  integrateValidationWithPlanning(): void {
    const originalCreatePlan = planningService.createPlan.bind(planningService)

    planningService.createPlan = async (task: string, options?: any) => {
      // Apply cognitive validation to plan creation
      const enhancedOptions = {
        ...options,
        validationConfig: {
          cognitiveValidation: this.nikCLI.cognitiveMode,
          orchestrationAware: true,
          intelligentCaching: true,
        },
      }

      return originalCreatePlan(task, enhancedOptions)
    }
  }

  /**
   * Setup tool router coordination with other components
   */
  setupToolRouterCoordination(): void {
    // Tool router is now cognitive-aware by default
    this.logCognitive(' Tool router cognitive coordination active')
  }

  /**
   * Configure advanced AI provider cognitive features
   */
  configureAdvancedAIProviderCognition(): void {
    advancedAIProvider.configureCognitiveFeatures({
      enableCognition: this.nikCLI.cognitiveMode,
      orchestrationLevel: this.nikCLI.orchestrationLevel,
      intelligentCommands: true,
      adaptivePlanning: true,
    })
  }

  /**
   * Initialize notification service (silent)
   */
  initializeNotificationService(): void {
    try {
      const { getNotificationService } = require('../services/notification-service')
      const notificationConfig = this.nikCLI.configManager.getNotificationConfig()
      this.nikCLI.notificationService = getNotificationService(notificationConfig)
    } catch (error: any) {
      // Silent fail - notifications are optional
    }
  }
}
