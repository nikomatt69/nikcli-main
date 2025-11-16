import { EventEmitter } from 'node:events'
import chalk from 'chalk'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface Web3ToolchainConfig {
  name: string
  description: string
  tools: string[]
  pattern: 'sequential' | 'parallel' | 'conditional' | 'iterative'
  chains: ('polygon' | 'base' | 'ethereum' | 'arbitrum')[]
  protocols: string[]
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  requiredEnv: string[]
  estimatedDuration: number
}

export interface Web3ToolchainExecution {
  id: string
  toolchain: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  startTime: Date
  endTime?: Date
  results: any[]
  errors: string[]
  gasUsed?: string
  txHashes: string[]
  chainId?: number
}

/**
 * Web3 Toolchain Registry and Execution Engine
 * Specialized toolchains for blockchain development, DeFi operations, and on-chain analysis
 */
export class Web3ToolchainRegistry extends EventEmitter {
  private toolchains: Map<string, Web3ToolchainConfig> = new Map()
  private executions: Map<string, Web3ToolchainExecution> = new Map()
  private activeExecutions: Set<string> = new Set()

  constructor() {
    super()
    this.initializeWeb3Toolchains()
  }

  /**
   * Initialize specialized Web3 toolchains
   */
  private initializeWeb3Toolchains(): void {
    // DeFi Analysis Toolchain
    this.registerToolchain({
      name: 'defi-analysis',
      description: 'Comprehensive DeFi protocol analysis and yield optimization',
      tools: ['goat_finance', 'analyze_project', 'web_search', 'generate_report'],
      pattern: 'sequential',
      chains: ['polygon', 'base', 'ethereum'],
      protocols: ['uniswap', 'aave', 'compound', 'polymarket'],
      riskLevel: 'medium',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY'],
      estimatedDuration: 45000, // 45 seconds
    })

    // Polymarket Trading Strategy Toolchain (Enhanced)
    this.registerToolchain({
      name: 'polymarket-strategy',
      description: 'Automated Polymarket prediction market analysis and trading strategy with native API integration',
      tools: ['polymarket_agent', 'goat_finance', 'web_search', 'data_analysis', 'risk_assessment', 'websocket_monitor'],
      pattern: 'conditional',
      chains: ['polygon'],
      protocols: ['polymarket'],
      riskLevel: 'high',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY', 'POLYGON_RPC_URL'],
      estimatedDuration: 60000, // 60 seconds
    })

    // Polymarket Market Making Toolchain (New)
    this.registerToolchain({
      name: 'polymarket-market-making',
      description: 'Market making strategy with real-time orderbook analysis and automated order placement',
      tools: ['websocket_manager', 'polymarket_native_client', 'orderbook_analyzer', 'price_optimizer', 'risk_limiter'],
      pattern: 'iterative',
      chains: ['polygon'],
      protocols: ['polymarket'],
      riskLevel: 'critical',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY', 'POLYMARKET_BUILDER_API_KEY', 'POLYMARKET_BUILDER_SECRET', 'POLYMARKET_BUILDER_PASSPHRASE'],
      estimatedDuration: 300000, // 5 minutes continuous operation
    })

    // Polymarket Arbitrage Toolchain (New)
    this.registerToolchain({
      name: 'polymarket-arbitrage',
      description: 'Cross-market arbitrage detection and execution with builder attribution',
      tools: ['polymarket_native_client', 'multi_market_analyzer', 'builder_signing', 'execution_engine', 'profit_calculator'],
      pattern: 'iterative',
      chains: ['polygon'],
      protocols: ['polymarket'],
      riskLevel: 'high',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY', 'POLYMARKET_BUILDER_API_KEY'],
      estimatedDuration: 180000, // 3 minutes per cycle
    })

    // Polymarket Portfolio Management Toolchain (New)
    this.registerToolchain({
      name: 'polymarket-portfolio',
      description: 'Multi-market position management, rebalancing, and PnL tracking',
      tools: ['polymarket_native_client', 'position_manager', 'risk_calculator', 'pnl_tracker', 'rebalancer'],
      pattern: 'sequential',
      chains: ['polygon'],
      protocols: ['polymarket'],
      riskLevel: 'medium',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY'],
      estimatedDuration: 45000, // 45 seconds
    })

    // Multi-Chain Portfolio Management
    this.registerToolchain({
      name: 'portfolio-management',
      description: 'Cross-chain portfolio tracking and rebalancing automation',
      tools: ['goat_finance', 'coinbase_blockchain', 'data_visualization', 'risk_metrics'],
      pattern: 'parallel',
      chains: ['polygon', 'base', 'ethereum'],
      protocols: ['multiple'],
      riskLevel: 'high',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY', 'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET'],
      estimatedDuration: 90000, // 90 seconds
    })

    // NFT Collection Analysis
    this.registerToolchain({
      name: 'nft-analysis',
      description: 'NFT collection analytics, rarity analysis, and market trends',
      tools: ['web_search', 'data_analysis', 'image_analysis', 'market_data'],
      pattern: 'sequential',
      chains: ['ethereum', 'polygon', 'base'],
      protocols: ['opensea', 'blur', 'foundation'],
      riskLevel: 'low',
      requiredEnv: [],
      estimatedDuration: 30000, // 30 seconds
    })

    // Smart Contract Security Audit
    this.registerToolchain({
      name: 'contract-audit',
      description: 'Automated smart contract security analysis and vulnerability detection',
      tools: ['read_file', 'analyze_code', 'security_scan', 'generate_report'],
      pattern: 'sequential',
      chains: ['ethereum', 'polygon', 'base', 'arbitrum'],
      protocols: ['solidity'],
      riskLevel: 'critical',
      requiredEnv: [],
      estimatedDuration: 120000, // 2 minutes
    })

    // DeFi Yield Farming Optimizer
    this.registerToolchain({
      name: 'yield-optimizer',
      description: 'Automated yield farming strategy optimization across protocols',
      tools: ['goat_finance', 'yield_calculator', 'risk_assessment', 'execution_engine'],
      pattern: 'iterative',
      chains: ['polygon', 'base', 'ethereum'],
      protocols: ['aave', 'compound', 'uniswap', 'curve'],
      riskLevel: 'critical',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY', 'MIN_YIELD_THRESHOLD'],
      estimatedDuration: 180000, // 3 minutes
    })

    // Cross-Chain Bridge Analysis
    this.registerToolchain({
      name: 'bridge-analysis',
      description: 'Cross-chain bridge security analysis and optimal routing',
      tools: ['bridge_scanner', 'security_analysis', 'cost_calculator', 'route_optimizer'],
      pattern: 'conditional',
      chains: ['ethereum', 'polygon', 'base', 'arbitrum'],
      protocols: ['polygon-bridge', 'base-bridge', 'arbitrum-bridge'],
      riskLevel: 'high',
      requiredEnv: [],
      estimatedDuration: 45000, // 45 seconds
    })

    // MEV Protection Strategy
    this.registerToolchain({
      name: 'mev-protection',
      description: 'MEV analysis and protection strategy for transactions',
      tools: ['mev_analyzer', 'flashloan_detector', 'protection_strategy', 'execution_timing'],
      pattern: 'conditional',
      chains: ['ethereum', 'polygon', 'base'],
      protocols: ['flashbots', 'cow-protocol'],
      riskLevel: 'high',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY'],
      estimatedDuration: 30000, // 30 seconds
    })

    // Governance Analysis
    this.registerToolchain({
      name: 'governance-analysis',
      description: 'DAO governance proposal analysis and voting strategy',
      tools: ['governance_scanner', 'proposal_analyzer', 'voting_power', 'impact_assessment'],
      pattern: 'sequential',
      chains: ['ethereum', 'polygon'],
      protocols: ['snapshot', 'compound-governance', 'aave-governance'],
      riskLevel: 'medium',
      requiredEnv: [],
      estimatedDuration: 60000, // 60 seconds
    })

    // DeFi Protocol Integration
    this.registerToolchain({
      name: 'protocol-integration',
      description: 'Automated DeFi protocol integration and testing',
      tools: ['protocol_analyzer', 'integration_generator', 'test_runner', 'deployment_manager'],
      pattern: 'sequential',
      chains: ['polygon', 'base'],
      protocols: ['custom'],
      riskLevel: 'critical',
      requiredEnv: ['GOAT_EVM_PRIVATE_KEY', 'TESTNET_RPC_URL'],
      estimatedDuration: 300000, // 5 minutes
    })

    console.log(chalk.green('✅ Web3 toolchains initialized'))
    console.log(chalk.cyan(`📦 Registered ${this.toolchains.size} specialized Web3 toolchains`))
  }

  /**
   * Register a new Web3 toolchain
   */
  registerToolchain(config: Web3ToolchainConfig): void {
    this.toolchains.set(config.name, config)
    this.emit('toolchain-registered', config)

    if (!process.env.NIKCLI_QUIET_STARTUP) {
      advancedUI.logInfo(`🔗 Registered Web3 toolchain: ${config.name}`)
    }
  }

  /**
   * Execute a Web3 toolchain
   */
  async executeToolchain(
    name: string,
    params: any = {},
    options: {
      chain?: string
      dryRun?: boolean
      maxGasPrice?: string
      slippageTolerance?: number
    } = {}
  ): Promise<Web3ToolchainExecution> {
    const config = this.toolchains.get(name)
    if (!config) {
      throw new Error(`Web3 toolchain '${name}' not found`)
    }

    // Validate environment requirements
    this.validateEnvironment(config)

    // Create execution context
    const execution: Web3ToolchainExecution = {
      id: `web3-${name}-${Date.now()}`,
      toolchain: name,
      status: 'pending',
      progress: 0,
      startTime: new Date(),
      results: [],
      errors: [],
      txHashes: [],
      chainId: this.getChainId(options.chain || config.chains[0])
    }

    this.executions.set(execution.id, execution)
    this.activeExecutions.add(execution.id)

    try {
      execution.status = 'running'
      this.emit('execution-started', execution)

      console.log(chalk.blue(`🚀 Executing Web3 toolchain: ${config.name}`))
      console.log(chalk.gray(`📋 Description: ${config.description}`))
      console.log(chalk.gray(`⛓️ Chains: ${config.chains.join(', ')}`))
      console.log(chalk.gray(`🔧 Tools: ${config.tools.join(', ')}`))

      if (options.dryRun) {
        console.log(chalk.yellow('🔍 DRY RUN MODE - No transactions will be executed'))
      }

      // Execute based on pattern
      switch (config.pattern) {
        case 'sequential':
          await this.executeSequential(execution, config, params, options)
          break
        case 'parallel':
          await this.executeParallel(execution, config, params, options)
          break
        case 'conditional':
          await this.executeConditional(execution, config, params, options)
          break
        case 'iterative':
          await this.executeIterative(execution, config, params, options)
          break
        default:
          throw new Error(`Unknown execution pattern: ${config.pattern}`)
      }

      execution.status = 'completed'
      execution.endTime = new Date()
      execution.progress = 100

      console.log(chalk.green(`✅ Web3 toolchain completed: ${config.name}`))
      if (execution.txHashes.length > 0) {
        console.log(chalk.cyan(`📝 Transaction hashes: ${execution.txHashes.join(', ')}`))
      }
      if (execution.gasUsed) {
        console.log(chalk.yellow(`⛽ Gas used: ${execution.gasUsed}`))
      }

      this.emit('execution-completed', execution)

    } catch (error: any) {
      execution.status = 'failed'
      execution.endTime = new Date()
      execution.errors.push(error.message)

      console.log(chalk.red(`❌ Web3 toolchain failed: ${config.name}`))
      console.log(chalk.red(`Error: ${error.message}`))

      this.emit('execution-failed', execution, error)
      throw error
    } finally {
      this.activeExecutions.delete(execution.id)
    }

    return execution
  }

  /**
   * Execute tools sequentially
   */
  private async executeSequential(
    execution: Web3ToolchainExecution,
    config: Web3ToolchainConfig,
    params: any,
    options: any
  ): Promise<void> {
    const tools = config.tools
    const stepProgress = 100 / tools.length

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i]
      console.log(chalk.blue(`🔧 Executing tool ${i + 1}/${tools.length}: ${tool}`))

      try {
        const result = await this.executeTool(tool, params, options, config)
        execution.results.push({ tool, result, step: i + 1 })
        execution.progress = Math.round((i + 1) * stepProgress)

        this.emit('tool-completed', execution, tool, result)

        // Update params with previous results for next tool
        params = { ...params, previousResults: execution.results }

      } catch (error: any) {
        execution.errors.push(`Tool ${tool}: ${error.message}`)
        throw error
      }
    }
  }

  /**
   * Execute tools in parallel
   */
  private async executeParallel(
    execution: Web3ToolchainExecution,
    config: Web3ToolchainConfig,
    params: any,
    options: any
  ): Promise<void> {
    const tools = config.tools
    console.log(chalk.blue(`🔧 Executing ${tools.length} tools in parallel`))

    const promises = tools.map(async (tool, index) => {
      try {
        const result = await this.executeTool(tool, params, options, config)
        this.emit('tool-completed', execution, tool, result)
        return { tool, result, step: index + 1 }
      } catch (error: any) {
        execution.errors.push(`Tool ${tool}: ${error.message}`)
        throw error
      }
    })

    const results = await Promise.all(promises)
    execution.results = results
    execution.progress = 100
  }

  /**
   * Execute tools conditionally based on results
   */
  private async executeConditional(
    execution: Web3ToolchainExecution,
    config: Web3ToolchainConfig,
    params: any,
    options: any
  ): Promise<void> {
    const tools = config.tools
    let currentParams = params

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i]

      // Check condition based on previous results
      const shouldExecute = this.evaluateCondition(tool, execution.results, currentParams)

      if (shouldExecute) {
        console.log(chalk.blue(`🔧 Conditionally executing tool ${i + 1}/${tools.length}: ${tool}`))

        try {
          const result = await this.executeTool(tool, currentParams, options, config)
          execution.results.push({ tool, result, step: i + 1, conditional: true })
          execution.progress = Math.round(((i + 1) / tools.length) * 100)

          this.emit('tool-completed', execution, tool, result)

          // Update params for next iteration
          currentParams = { ...currentParams, previousResults: execution.results }

        } catch (error: any) {
          execution.errors.push(`Tool ${tool}: ${error.message}`)
          throw error
        }
      } else {
        console.log(chalk.yellow(`⏭️ Skipping tool ${i + 1}/${tools.length}: ${tool} (condition not met)`))
        execution.results.push({ tool, result: null, step: i + 1, skipped: true })
        execution.progress = Math.round(((i + 1) / tools.length) * 100)
      }
    }
  }

  /**
   * Execute tools iteratively until convergence
   */
  private async executeIterative(
    execution: Web3ToolchainExecution,
    config: Web3ToolchainConfig,
    params: any,
    options: any
  ): Promise<void> {
    const maxIterations = params.maxIterations || 5
    const convergenceThreshold = params.convergenceThreshold || 0.01
    let iteration = 0
    let converged = false
    let previousResult: any = null

    while (iteration < maxIterations && !converged) {
      console.log(chalk.blue(`🔄 Iteration ${iteration + 1}/${maxIterations}`))

      const iterationResults = []

      for (const tool of config.tools) {
        try {
          const result = await this.executeTool(tool, {
            ...params,
            iteration: iteration + 1,
            previousIteration: previousResult
          }, options, config)

          iterationResults.push({ tool, result, iteration: iteration + 1 })
          this.emit('tool-completed', execution, tool, result)

        } catch (error: any) {
          execution.errors.push(`Tool ${tool} (iteration ${iteration + 1}): ${error.message}`)
          throw error
        }
      }

      execution.results.push({ iteration: iteration + 1, results: iterationResults })

      // Check convergence
      if (previousResult && this.checkConvergence(previousResult, iterationResults, convergenceThreshold)) {
        converged = true
        console.log(chalk.green(`✅ Converged after ${iteration + 1} iterations`))
      }

      previousResult = iterationResults
      iteration++
      execution.progress = Math.round((iteration / maxIterations) * 100)
    }

    if (!converged) {
      console.log(chalk.yellow(`⚠️ Maximum iterations reached without convergence`))
    }
  }

  /**
   * Execute a single tool within the Web3 context
   */
  private async executeTool(tool: string, params: any, options: any, config: Web3ToolchainConfig): Promise<any> {
    // Import secure tools registry
    const { secureTools } = await import('../tools/secure-tools-registry')

    // Map Web3 toolchain tools to actual implementations
    switch (tool) {
      // Core GOAT SDK tools
      case 'goat_finance':
        return await secureTools.executeGoat(params.action || 'status', params, {
          skipConfirmation: options.dryRun
        })

      case 'coinbase_blockchain':
        return await secureTools.executeCoinbaseAgentKit(params.action || 'status', params, {
          skipConfirmation: options.dryRun
        })

      // Analysis tools (use GOAT for blockchain data)
      case 'analyze_project':
      case 'data_analysis':
      case 'market_data':
      case 'analyze_code':
        return await secureTools.executeGoat(params.action || 'status', params, {
          skipConfirmation: options.dryRun
        })

      // Search and research tools
      case 'web_search':
        return await this.executeWeb3Search(params.query || params, config.protocols)

      // Report generation
      case 'generate_report':
        return await this.generateWeb3Report(params, config)

      // Risk assessment tools (placeholder implementations)
      case 'risk_assessment':
      case 'risk_metrics':
        return { riskLevel: config.riskLevel, protocols: config.protocols, chains: config.chains }

      // Visualization tools (placeholder)
      case 'data_visualization':
        return { visualization: 'Chart data generated', data: params }

      // Polymarket specific (map to GOAT)
      case 'polymarket_analyzer':
        return await secureTools.executeGoat('polymarket-markets', params, {
          skipConfirmation: options.dryRun
        })

      // ERC20 specific (map to GOAT)
      case 'erc20_analyzer':
        return await secureTools.executeGoat('erc20-balance', params, {
          skipConfirmation: options.dryRun
        })

      // MEV tools (placeholder - not implemented yet)
      case 'mev_analyzer':
      case 'flashloan_detector':
      case 'protection_strategy':
      case 'execution_timing':
        return {
          tool,
          status: 'not_implemented',
          message: `${tool} is a placeholder - full MEV protection requires specialized infrastructure`,
          recommendation: 'Use Flashbots RPC or CoW Protocol for MEV protection'
        }

      // Bridge tools (placeholder)
      case 'bridge_scanner':
      case 'security_analysis':
      case 'cost_calculator':
      case 'route_optimizer':
        return {
          tool,
          status: 'not_implemented',
          message: `${tool} is a placeholder - bridge analysis requires real-time data`,
          recommendation: 'Manually verify bridge security and costs on official bridge UIs'
        }

      // Governance tools (placeholder)
      case 'governance_scanner':
      case 'proposal_analyzer':
      case 'voting_power':
      case 'impact_assessment':
        return {
          tool,
          status: 'not_implemented',
          message: `${tool} is a placeholder - governance analysis requires Snapshot/Tally integration`,
          recommendation: 'Use Snapshot.org or Tally.xyz for governance participation'
        }

      // Yield optimization tools (placeholder)
      case 'yield_calculator':
      case 'execution_engine':
        return {
          tool,
          status: 'not_implemented',
          message: `${tool} is a placeholder - yield optimization requires DeFi protocol integration`,
          recommendation: 'Use established yield aggregators like Yearn or Beefy'
        }

      // Contract audit tools (placeholder)
      case 'security_scan':
        return {
          tool,
          status: 'not_implemented',
          message: 'Smart contract security scanning requires specialized tools',
          recommendation: 'Use Slither, Mythril, or professional audit services'
        }

      // Protocol integration tools (placeholder)
      case 'protocol_analyzer':
      case 'integration_generator':
      case 'test_runner':
      case 'deployment_manager':
        return {
          tool,
          status: 'not_implemented',
          message: `${tool} is a placeholder - protocol integration requires custom development`,
          recommendation: 'Follow protocol documentation for integration'
        }

      // Image analysis (placeholder)
      case 'image_analysis':
        return {
          tool,
          status: 'not_implemented',
          message: 'NFT image analysis requires computer vision infrastructure'
        }

      // File operations
      case 'read_file':
        return { file: params.file, content: 'File reading not implemented in Web3 context' }

      default:
        throw new Error(`Unknown Web3 tool: ${tool}`)
    }
  }

  /**
   * Execute Web3-specific search
   */
  private async executeWeb3Search(query: string, protocols: string[]): Promise<any> {
    const searchQueries = [
      `${query} ${protocols.join(' OR ')} DeFi`,
      `${query} blockchain analysis`,
      `${query} smart contract security`
    ]

    const results = []
    for (const searchQuery of searchQueries) {
      // This would integrate with actual web search
      results.push({
        query: searchQuery,
        results: `Mock results for: ${searchQuery}`,
        timestamp: new Date().toISOString()
      })
    }

    return { searches: results }
  }

  /**
   * Generate Web3-specific report
   */
  private async generateWeb3Report(params: any, config: Web3ToolchainConfig): Promise<any> {
    const report = {
      toolchain: config.name,
      description: config.description,
      chains: config.chains,
      protocols: config.protocols,
      riskLevel: config.riskLevel,
      timestamp: new Date().toISOString(),
      results: params.previousResults || [],
      recommendations: this.generateRecommendations(config, params),
      riskAssessment: this.assessRisk(config, params)
    }

    return report
  }

  /**
   * Generate recommendations based on toolchain results
   */
  private generateRecommendations(config: Web3ToolchainConfig, params: any): string[] {
    const recommendations = []

    if (config.riskLevel === 'high' || config.riskLevel === 'critical') {
      recommendations.push('⚠️ High-risk operation detected - proceed with caution')
      recommendations.push('🔍 Consider additional security audits before execution')
    }

    if (config.chains.length > 1) {
      recommendations.push('🌉 Multi-chain operation - verify bridge security and costs')
    }

    if (config.protocols.includes('polymarket')) {
      recommendations.push('📊 Monitor market volatility and liquidity before trading')
    }

    return recommendations
  }

  /**
   * Assess risk for the operation
   */
  private assessRisk(config: Web3ToolchainConfig, params: any): any {
    return {
      level: config.riskLevel,
      factors: [
        `Protocol risk: ${config.protocols.join(', ')}`,
        `Chain risk: ${config.chains.join(', ')}`,
        `Execution pattern: ${config.pattern}`
      ],
      mitigation: [
        'Use testnet for initial testing',
        'Start with small amounts',
        'Monitor gas prices',
        'Verify contract addresses'
      ]
    }
  }

  /**
   * Evaluate condition for conditional execution
   */
  private evaluateCondition(tool: string, previousResults: any[], params: any): boolean {
    // Simple condition evaluation - can be extended
    if (previousResults.length === 0) return true

    const lastResult = previousResults[previousResults.length - 1]

    // Skip if previous tool failed
    if (lastResult.result?.success === false) {
      return false
    }

    // Tool-specific conditions
    if (tool === 'risk_assessment' && params.skipRiskAssessment) {
      return false
    }

    return true
  }

  /**
   * Check convergence for iterative execution
   */
  private checkConvergence(previous: any[], current: any[], threshold: number): boolean {
    // Simple convergence check - can be extended
    if (previous.length !== current.length) return false

    // Compare results (simplified)
    const prevSum = previous.reduce((sum, r) => sum + (r.result?.value || 0), 0)
    const currSum = current.reduce((sum, r) => sum + (r.result?.value || 0), 0)

    const difference = Math.abs(prevSum - currSum) / Math.max(prevSum, 1)
    return difference < threshold
  }

  /**
   * Validate environment requirements
   */
  private validateEnvironment(config: Web3ToolchainConfig): void {
    for (const envVar of config.requiredEnv) {
      if (!process.env[envVar]) {
        throw new Error(`Required environment variable missing: ${envVar}`)
      }
    }
  }

  /**
   * Get chain ID for chain name
   */
  private getChainId(chainName: string): number {
    const chainIds: Record<string, number> = {
      ethereum: 1,
      polygon: 137,
      base: 8453,
      arbitrum: 42161
    }
    return chainIds[chainName] || 1
  }

  /**
   * List available Web3 toolchains
   */
  listToolchains(): Web3ToolchainConfig[] {
    return Array.from(this.toolchains.values())
  }

  /**
   * Get toolchain by name
   */
  getToolchain(name: string): Web3ToolchainConfig | undefined {
    return this.toolchains.get(name)
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): Web3ToolchainExecution[] {
    return Array.from(this.activeExecutions)
      .map(id => this.executions.get(id))
      .filter(Boolean) as Web3ToolchainExecution[]
  }

  /**
   * Cancel execution
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId)
    if (execution && this.activeExecutions.has(executionId)) {
      execution.status = 'cancelled'
      execution.endTime = new Date()
      this.activeExecutions.delete(executionId)
      this.emit('execution-cancelled', execution)
      return true
    }
    return false
  }
}

// Export singleton instance
export const web3ToolchainRegistry = new Web3ToolchainRegistry()
