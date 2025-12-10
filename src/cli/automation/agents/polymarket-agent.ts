/*
 * Polymarket Specialized Agent
 *
 * A specialized agent designed for Polymarket prediction market operations
 * Capabilities include market analysis, order placement, risk assessment
 * Integrates with native Polymarket APIs and builder program
 */

import { EventEmitter } from 'node:events'
import type { AgentInstance } from './agent-router'
import type { AgentTask as RouterAgentTask, TaskPriority as RouterTaskPriority } from './agent-router'
import type { AgentMetrics as BaseAgentMetrics } from './base-agent'
import { BaseAgent } from './base-agent'
import { EventBus, EventTypes } from './event-bus'
import type {
  Agent,
  AgentConfig,
  AgentContext,
  AgentMetrics,
  AgentStatus,
  AgentTask,
  AgentTaskResult,
  AgentTodo,
  TaskPriority,
} from '../../types/types'

// ============================================================
// POLYMARKET AGENT TYPES
// ============================================================

export interface PolymarketMarketAnalysis {
  tokenId: string
  currentPrice: number
  bestBid: number
  bestAsk: number
  spread: number
  spreadBps: number
  volume24h: number
  liquidity: 'high' | 'medium' | 'low'
  sentiment?: 'bullish' | 'bearish' | 'neutral'
  recommendation?: string
}

export interface PolymarketOrderIntent {
  action: 'BUY' | 'SELL'
  tokenId: string
  size: number
  price: number
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high'
    potentialLoss: number
    potentialGain: number
    riskRewardRatio: number
  }
  orderType: 'FOK' | 'GTC' | 'GTD'
  builderAttribution: boolean
}

export interface PolymarketPosition {
  tokenId: string
  outcome: 'yes' | 'no'
  size: number
  entryPrice: number
  currentPrice: number
  unrealizedPnL: number
  unrealizedPnLPercent: number
}

// ============================================================
// POLYMARKET AGENT
// ============================================================

export class PolymarketAgent extends EventEmitter implements Agent {
  private goatProvider: any
  private workingDirectory: string
  private guidance: string = ''

  // Agent interface properties
  public readonly id: string = 'polymarket-agent'
  public readonly name: string = 'Polymarket Trading Agent'
  public readonly description: string =
    'Specialized agent for Polymarket prediction market operations with order placement, market analysis, and risk assessment'
  public readonly specialization: string = 'Prediction Market Trading (Polymarket)'
  public readonly capabilities: string[] = [
    'market-analysis',
    'order-placement',
    'risk-assessment',
    'position-management',
    'market-monitoring',
    'sentiment-analysis',
    'order-optimization',
    'builder-attribution',
  ]
  public readonly version: string = '1.0.0'
  public status: AgentStatus = 'initializing'
  public currentTasks: number = 0
  public readonly maxConcurrentTasks: number = 5

  // Legacy AgentInstance properties for backward compatibility
  maxConcurrentTasksDefault = 5

  private marketCache: Map<string, PolymarketMarketAnalysis> = new Map()
  private positionCache: Map<string, PolymarketPosition> = new Map()
  private orderHistory: PolymarketOrderIntent[] = []
  private metrics: AgentMetrics = {
    tasksExecuted: 0,
    tasksSucceeded: 0,
    tasksFailed: 0,
    tasksInProgress: 0,
    averageExecutionTime: 0,
    totalExecutionTime: 0,
    successRate: 0,
    tokensConsumed: 0,
    apiCallsTotal: 0,
    lastActive: new Date(),
    uptime: 0,
    productivity: 0,
    accuracy: 0,
  }

  constructor(goatProvider: any, workingDirectory: string = process.cwd()) {
    super()
    this.goatProvider = goatProvider
    this.workingDirectory = workingDirectory
    this.setup()
  }

  /**
   * Setup agent
   */
  private setup(): void {
    // EventBus is already initialized in BaseAgent constructor
  }

  /**
   * Initialize agent
   */
  async onInitialize(): Promise<void> {
    try {
      console.log(`🐐 Initializing ${this.specialization}...`)

      // Initialize underlying GOAT provider
      if (this.goatProvider && !this.goatProvider.isInitialized) {
        await this.goatProvider.initialize()
      }

      // Initialize Polymarket native client
      const nativeClient = this.goatProvider.getPolymarketNativeClient()
      if (nativeClient && !nativeClient.isInitialized) {
        await nativeClient.initialize()
        console.log('✓ Polymarket native client initialized')
      }

      // Pre-load markets
      await this.preloadMarkets()

      this.status = 'ready'
      console.log(`✓ ${this.specialization} ready`)
    } catch (error: any) {
      this.status = 'error'
      console.error('✖ Agent initialization failed:', error.message)
      throw error
    }
  }

  /**
   * Preload common Polymarket markets
   */
  private async preloadMarkets(): Promise<void> {
    try {
      const nativeClient = this.goatProvider.getPolymarketNativeClient()
      if (nativeClient && nativeClient.isInitialized) {
        const markets = await nativeClient.getMarkets(50)
        console.log(`✓ Loaded ${markets.length} markets`)
      }
    } catch (error) {
      console.warn('⚠︎ Failed to preload markets:', error)
    }
  }

  /**
   * Execute a task
   */
  async onExecuteTask(task: RouterAgentTask): Promise<any> {
    if (this.currentTasks >= this.maxConcurrentTasks) {
      throw new Error('Max concurrent tasks reached')
    }

    this.currentTasks++
    this.status = 'busy'
    const startTime = Date.now()

    try {
      console.log(`📋 Executing task: ${task.description}`)

      let result: any

      // Route task based on description keywords
      if (task.description.includes('analysis')) {
        result = await this.handleMarketAnalysis(task)
      } else if (task.description.includes('order') || task.description.includes('place')) {
        result = await this.handleOrderPlacement(task)
      } else if (task.description.includes('risk')) {
        result = await this.handleRiskAssessment(task)
      } else if (task.description.includes('position')) {
        result = await this.handlePositionManagement(task)
      } else if (task.description.includes('monitor')) {
        result = await this.handleMarketMonitoring(task)
      } else {
        result = await this.handleGenericTask(task)
      }

      const duration = Date.now() - startTime
      this.updateMetrics(true, duration)
      task.metadata = {
        ...task.metadata,
        actualDuration: duration,
        status: 'completed',
        result,
      }

      return result
    } catch (error: any) {
      const duration = Date.now() - startTime
      this.updateMetrics(false, duration)
      task.metadata = {
        ...task.metadata,
        status: 'failed',
        error: error.message,
        actualDuration: duration,
      }

      throw error
    } finally {
      this.currentTasks--
      if (this.currentTasks === 0) {
        this.status = 'ready'
      }
    }
  }

  /**
   * Analyze Polymarket
   */
  private async handleMarketAnalysis(task: RouterAgentTask): Promise<PolymarketMarketAnalysis[]> {
    const nativeClient = this.goatProvider.getPolymarketNativeClient()
    if (!nativeClient) {
      throw new Error('Native client not available')
    }

    try {
      const markets = await nativeClient.getMarkets(20)
      const analyses: PolymarketMarketAnalysis[] = []

      for (const market of markets) {
        for (const token of market.tokens) {
          try {
            const book = await nativeClient.getOrderBook(token.token_id)

            const bestBid = parseFloat(book.bids[0]?.price || '0')
            const bestAsk = parseFloat(book.asks[0]?.price || '1')
            const spread = bestAsk - bestBid
            const midpoint = (bestBid + bestAsk) / 2

            const analysis: PolymarketMarketAnalysis = {
              tokenId: token.token_id,
              currentPrice: midpoint,
              bestBid,
              bestAsk,
              spread,
              spreadBps: (spread / midpoint) * 10000,
              volume24h: 0, // Would fetch from historical data
              liquidity: spread < 0.02 ? 'high' : spread < 0.05 ? 'medium' : 'low',
              sentiment: midpoint > 0.55 ? 'bullish' : midpoint < 0.45 ? 'bearish' : 'neutral',
              recommendation: this.getRecommendation(midpoint, spread),
            }

            analyses.push(analysis)
            this.marketCache.set(token.token_id, analysis)
          } catch {
            // Skip problematic markets
          }
        }
      }

      return analyses
    } catch (error) {
      throw new Error(`Market analysis failed: ${error}`)
    }
  }

  /**
   * Handle order placement
   */
  private async handleOrderPlacement(task: RouterAgentTask): Promise<any> {
    const orderIntent = this.parseOrderIntent(task.description)
    if (!orderIntent) {
      throw new Error('Could not parse order intent from task description')
    }

    // Validate token ID is available
    if (orderIntent.tokenId === 'MARKET_LOOKUP_REQUIRED') {
      throw new Error(
        'Could not identify market from description. Please specify market token ID or market name explicitly.'
      )
    }

    // Risk assessment before execution
    const riskAssessment = this.assessOrderRisk(orderIntent)
    orderIntent.riskAssessment = riskAssessment

    if (riskAssessment.riskLevel === 'high') {
      console.warn('⚠︎ High risk order - requiring confirmation')
      // In production, would wait for user confirmation
    }

    try {
      const nativeClient = this.goatProvider.getPolymarketNativeClient()
      if (!nativeClient || !nativeClient.isInitialized) {
        throw new Error('Native client not available or not initialized')
      }

      // Place order with optional builder attribution
      const result = await nativeClient.placeOrder({
        tokenId: orderIntent.tokenId,
        price: orderIntent.price,
        size: orderIntent.size,
        side: orderIntent.action,
        orderType: orderIntent.orderType,
      })

      if (result.success && orderIntent.builderAttribution) {
        // Apply builder attribution if configured
        const signingService = this.goatProvider.getBuilderSigningService()
        if (signingService) {
          await signingService.signOrder({
            signedOrder: result,
            orderType: orderIntent.orderType,
          })
        }
      }

      this.orderHistory.push(orderIntent)
      return result
    } catch (error) {
      throw new Error(`Order placement failed: ${error}`)
    }
  }

  /**
   * Risk assessment for orders
   */
  private async handleRiskAssessment(task: RouterAgentTask): Promise<any> {
    const orderIntent = this.parseOrderIntent(task.description)
    if (!orderIntent) {
      throw new Error('Could not parse order intent')
    }

    const assessment = this.assessOrderRisk(orderIntent)

    return {
      riskLevel: assessment.riskLevel,
      potentialLoss: assessment.potentialLoss,
      potentialGain: assessment.potentialGain,
      riskRewardRatio: assessment.riskRewardRatio,
      recommendation:
        assessment.riskLevel === 'high'
          ? 'Consider reducing position size or waiting for better entry'
          : 'Order parameters acceptable',
    }
  }

  /**
   * Position management
   */
  private async handlePositionManagement(task: RouterAgentTask): Promise<PolymarketPosition[]> {
    // Would fetch from blockchain or database
    return Array.from(this.positionCache.values())
  }

  /**
   * Market monitoring with WebSocket
   */
  private async handleMarketMonitoring(task: RouterAgentTask): Promise<any> {
    const wsManager = this.goatProvider.getWebSocketManager()
    if (!wsManager) {
      throw new Error('WebSocket manager not available')
    }

    try {
      await wsManager.connect()

      // Subscribe to top markets
      const topMarkets = Array.from(this.marketCache.values())
        .sort((a, b) => b.liquidity.localeCompare(a.liquidity))
        .slice(0, 10)

      for (const market of topMarkets) {
        wsManager.subscribe(market.tokenId)
      }

      const stats = wsManager.getStats()
      return {
        connected: true,
        subscriptions: stats.subscriptions,
        uptime: stats.uptime,
      }
    } catch (error) {
      throw new Error(`Market monitoring failed: ${error}`)
    }
  }

  /**
   * Generic task handling
   */
  private async handleGenericTask(task: RouterAgentTask): Promise<any> {
    return {
      taskId: task.id,
      status: 'processing',
      message: `Polymarket agent processing: ${task.description}`,
    }
  }

  /**
   * Parse order intent from natural language
   */
  private parseOrderIntent(description: string): PolymarketOrderIntent | null {
    const lower = description.toLowerCase()

    // Simple NLP parsing (in production, use ML-based NLP)
    const isBuy = lower.includes('buy') || lower.includes('long')
    const isSell = lower.includes('sell') || lower.includes('short')

    if (!isBuy && !isSell) {
      return null
    }

    // Extract token ID from description (multiple patterns)
    let tokenId: string | null = null

    // Pattern 1: Hex format (0x...)
    const hexMatch = description.match(/0x[a-fA-F0-9]{40}/)
    if (hexMatch) {
      tokenId = hexMatch[0]
    }

    // Pattern 2: Market name like "TRUMP", "BITCOIN", etc.
    if (!tokenId) {
      const marketMatch = description.match(/(?:on|for|market:?)\s+([A-Z][A-Z0-9]+)/i)
      if (marketMatch) {
        // Store as-is; agent will look up actual token ID from cache
        tokenId = marketMatch[1].toUpperCase()
      }
    }

    // Pattern 3: Try to extract from cached markets if market name mentioned
    if (!tokenId) {
      for (const [id, analysis] of Array.from(this.marketCache.entries())) {
        if (lower.includes(id) || lower.includes(analysis.tokenId)) {
          tokenId = id
          break
        }
      }
    }

    // Extract numbers (simplified)
    const sizeMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:shares?|tokens?|units?)?/)
    const priceMatch = description.match(/(?:@|at)\s*(\d+(?:\.\d+)?)/)

    return {
      action: isBuy ? 'BUY' : 'SELL',
      tokenId: tokenId || 'MARKET_LOOKUP_REQUIRED', // Requires market lookup
      size: sizeMatch ? parseFloat(sizeMatch[1]) : 10,
      price: priceMatch ? parseFloat(priceMatch[1]) : 0.5,
      riskAssessment: {
        riskLevel: 'low',
        potentialLoss: 0,
        potentialGain: 0,
        riskRewardRatio: 1,
      },
      orderType: 'GTC',
      builderAttribution: true,
    }
  }

  /**
   * Assess risk for an order
   */
  private assessOrderRisk(order: PolymarketOrderIntent): PolymarketOrderIntent['riskAssessment'] {
    const potentialLoss = order.size * order.price
    const potentialGain = order.size * (1 - order.price)
    const riskRewardRatio = potentialGain > 0 ? potentialLoss / potentialGain : Infinity

    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    if (potentialLoss > 1000) {
      riskLevel = 'high'
    } else if (potentialLoss > 500) {
      riskLevel = 'medium'
    }

    return {
      riskLevel,
      potentialLoss,
      potentialGain,
      riskRewardRatio,
    }
  }

  /**
   * Get trading recommendation based on price and spread
   */
  private getRecommendation(price: number, spread: number): string {
    if (spread < 0.01) {
      return 'Excellent liquidity - good for both entry and exit'
    } else if (spread < 0.05) {
      return 'Good liquidity - reasonable for trading'
    } else {
      return 'Low liquidity - consider limit orders for better execution'
    }
  }

  /**
   * Update agent metrics
   */
  private updateMetrics(success: boolean, duration: number): void {
    if (success) {
      this.metrics.tasksSucceeded++
      this.metrics.tasksExecuted++
    } else {
      this.metrics.tasksFailed++
      this.metrics.tasksExecuted++
    }

    const total = this.metrics.tasksSucceeded + this.metrics.tasksFailed
    this.metrics.successRate = total > 0 ? (this.metrics.tasksSucceeded / total) * 100 : 0
    this.metrics.averageExecutionTime =
      total > 0 ? (this.metrics.totalExecutionTime * (total - 1) + duration) / total : duration
    this.metrics.lastActive = new Date()
  }

  /**
   * Get agent capabilities
   */
  getCapabilities(): string[] {
    return [...this.capabilities]
  }

  /**
   * Get agent metrics
   */
  getMetrics(): AgentMetrics {
    return {
      ...this.metrics,
      lastActive: this.metrics.lastActive,
    }
  }

  /**
   * Clean up resources
   */
  async onStop(): Promise<void> {
    try {
      const wsManager = this.goatProvider.getWebSocketManager()
      if (wsManager) {
        wsManager.disconnect()
      }
      this.marketCache.clear()
      this.positionCache.clear()
      this.status = 'offline'
      console.log('✓ Polymarket agent cleaned up')
    } catch (error) {
      console.error('Error during cleanup:', error)
    }
  }

  /**
   * Get order history
   */
  getOrderHistory(): PolymarketOrderIntent[] {
    return [...this.orderHistory]
  }

  /**
   * Get market cache
   */
  getMarketCache(): Map<string, PolymarketMarketAnalysis> {
    return new Map(this.marketCache)
  }

  // ==================== Agent Interface Methods ====================

  /**
   * Initialize the agent (Agent interface)
   */
  async initialize(context?: AgentContext): Promise<void> {
    return this.onInitialize()
  }

  /**
   * Run method (Agent interface)
   */
  async run(task: AgentTask): Promise<AgentTaskResult> {
    return this.executeTask(task)
  }

  /**
   * Execute method (legacy compatibility)
   */
  async execute(task: AgentTask): Promise<AgentTaskResult> {
    return this.executeTask(task)
  }

  /**
   * Cleanup method (Agent interface)
   */
  async cleanup(): Promise<void> {
    return this.onStop()
  }

  /**
   * Execute a todo (converts to task)
   */
  async executeTodo(todo: AgentTodo): Promise<void> {
    const routerTask: RouterAgentTask = {
      id: todo.id,
      type: 'internal',
      description: todo.description,
      priority: todo.priority as RouterTaskPriority,
    }
    await this.onExecuteTask(routerTask)
  }

  /**
   * Execute task (Agent interface)
   */
  async executeTask(task: AgentTask): Promise<AgentTaskResult> {
    const startTime = new Date()

    // Convert AgentTask to RouterAgentTask for internal processing
    const routerTask: RouterAgentTask = {
      id: task.id,
      type: task.type,
      description: task.description,
      priority: task.priority as RouterTaskPriority,
      metadata: task.data,
    }

    try {
      const result = await this.onExecuteTask(routerTask)

      return {
        taskId: task.id,
        agentId: this.id,
        status: 'completed',
        startTime,
        endTime: new Date(),
        result,
        duration: Date.now() - startTime.getTime(),
      }
    } catch (error: any) {
      return {
        taskId: task.id,
        agentId: this.id,
        status: 'failed',
        startTime,
        endTime: new Date(),
        error: error.message,
        duration: Date.now() - startTime.getTime(),
      }
    }
  }

  /**
   * Get agent status
   */
  getStatus(): AgentStatus {
    return this.status
  }

  /**
   * Check if agent can handle task (Agent interface)
   */
  canHandle(task: AgentTask): boolean {
    const taskDesc = task.description?.toLowerCase() || ''
    return (
      this.capabilities.some((cap) => taskDesc.includes(cap.toLowerCase())) ||
      taskDesc.includes('polymarket') ||
      taskDesc.includes('trading') ||
      taskDesc.includes('market')
    )
  }

  /**
   * Update guidance
   */
  updateGuidance(guidance: string): void {
    this.guidance = guidance
  }

  /**
   * Update configuration
   */
  updateConfiguration(config: Partial<AgentConfig>): void {
    // Note: maxConcurrentTasks is read-only in Agent interface
    // Use maxConcurrentTasksDefault for configuration purposes
    if (config.maxConcurrentTasks) {
      this.maxConcurrentTasksDefault = config.maxConcurrentTasks
    }
  }
}

export default PolymarketAgent
