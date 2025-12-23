import { openai } from '@ai-sdk/openai'
import type { ModelMessage } from 'ai'
import { generateText } from 'ai'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'
import { GoatProvider } from '../onchain/goat-provider'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import {
  checksumAddress,
  isValidEVMAddress,
  isZeroAddress,
  normalizeEVMAddress,
  sanitizeAddress,
  validateERC20Approve,
  validateERC20Balance,
  validateERC20Transfer,
  validateGoatChatMessage,
  validatePolymarketBet,
  validatePolymarketSearch,
  validateWalletInfo,
} from './goat-validation-schemas'

/**
 * GoatTool - Official GOAT SDK Integration as NikCLI Tool
 *
 * This tool provides access to all GOAT SDK capabilities including:
 * - Polymarket prediction markets (on Polygon)
 * - ERC20 token operations (multi-chain: Polygon, Base)
 * - Multi-chain support (Polygon: 137, Base: 8453)
 * - User confirmation for all blockchain transactions
 * - Secure environment variable handling
 * - Audit logging for compliance
 * - Conversational AI interface for natural language blockchain operations
 * - Comprehensive help system with command categories
 *
 * Available actions: init, status, wallet-info, chat, help, tools, reset,
 * polymarket-*, erc20-*, builder-*, websocket-*, rtds-*, gamma-*, ctf-*
 */

// ============================================================
// BLOCKCHAIN CHAIN CONSTANTS
// ============================================================

const BLOCKCHAIN_CHAINS = {
  POLYGON: {
    chainId: 137,
    name: 'Polygon',
    symbol: 'MATIC',
  },
  BASE: {
    chainId: 8453,
    name: 'Base',
    symbol: 'ETH',
  },
} as const

const PLUGIN_DEFAULT_CHAINS = {
  polymarket: BLOCKCHAIN_CHAINS.POLYGON, // Polymarket ONLY on Polygon
  erc20: BLOCKCHAIN_CHAINS.POLYGON, // Default to Polygon
} as const

export class GoatTool extends BaseTool {
  private goatProvider: GoatProvider | null = null
  private isInitialized: boolean = false
  private conversationMessages: ModelMessage[] = []
  private toolHintInjected: boolean = false

  // GOAT agent configuration
  private agent: {
    tools: any
    system: string
    model: any
    maxSteps: number
  } | null = null

  constructor(workingDirectory: string) {
    super('goat', workingDirectory)
  }

  /**
   * Execute blockchain operations using GOAT SDK
   *
   * @param action - The action to perform: 'init', 'chat', 'wallet-info', 'polymarket-*', 'erc20-*', etc.
   * @param params - Parameters for the action
   */
  async execute(action: string, params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      switch (action.toLowerCase()) {
        case 'init':
        case 'initialize':
          return await this.initializeGoat(params)

        case 'chat':
        case 'message':
          return await this.processChatMessage(params.message || params, params.options)

        case 'wallet-info':
        case 'wallet':
          return await this.getWalletInfo(params)

        case 'status':
          return await this.getStatus(params)

        case 'tools':
        case 'list-tools':
          return await this.listTools(params)

        case 'reset':
          return await this.resetConversation(params)

        case 'help':
        case '?':
          return await this.displayHelp(params)

        // Polymarket specific actions
        case 'polymarket-markets':
        case 'markets':
          return await this.handlePolymarketAction('markets', params)

        case 'polymarket-bet':
        case 'bet':
          return await this.handlePolymarketAction('bet', params)

        // ERC20 specific actions
        case 'erc20-transfer':
        case 'transfer':
          return await this.handleERC20Action('transfer', params)

        case 'erc20-balance':
        case 'balance':
          return await this.handleERC20Action('balance', params)

        case 'erc20-approve':
        case 'approve':
          return await this.handleERC20Action('approve', params)

        // Builder program actions
        case 'builder-status':
          return await this.getBuilderStatus(params)

        case 'builder-metrics':
          return await this.getBuilderMetrics(params)

        case 'builder-sign-order':
        case 'sign-order':
          return await this.handleBuilderSignOrder(params)

        case 'builder-attribution':
          return await this.getBuilderAttribution(params)

        // WebSocket actions
        case 'ws-connect':
        case 'websocket-connect':
          return await this.connectWebSocket(params)

        case 'ws-disconnect':
        case 'websocket-disconnect':
          return await this.disconnectWebSocket(params)

        case 'ws-subscribe':
        case 'websocket-subscribe':
          return await this.subscribeWebSocket(params)

        case 'ws-stats':
        case 'websocket-stats':
          return await this.getWebSocketStats(params)

        // Native API actions
        case 'native-health':
        case 'api-health':
          return await this.checkNativeHealth(params)

        case 'native-status':
        case 'api-status':
          return await this.getNativeApiStatus(params)

        // Funder address management actions
        case 'set-funder':
        case 'funder-set':
          return await this.setFunderAddress(params)

        case 'get-funder':
        case 'funder-get':
          return await this.getFunderAddress(params)

        case 'clear-funder':
        case 'funder-clear':
          return await this.clearFunderAddress(params)

        case 'funder-status':
          return await this.getFunderStatus(params)

        // ===== RELAYER CLIENT (PHASE 2) =====
        case 'relayer-deploy':
          return await this.relayerDeploy(params)

        case 'relayer-execute':
          return await this.relayerExecute(params)

        case 'relayer-status':
          return await this.relayerStatus(params)

        // ===== GAMMA MARKETS API (PHASE 2) =====
        case 'gamma-trending':
          return await this.gammaTrendingMarkets(params)

        case 'gamma-search':
          return await this.gammaSearchMarkets(params)

        case 'gamma-details':
          return await this.gammaMarketDetails(params)

        case 'gamma-category':
          return await this.gammaMarketsByCategory(params)

        // ===== RTDS REAL-TIME DATA (PHASE 2) =====
        case 'rtds-connect':
          return await this.rtdsConnect(params)

        case 'rtds-disconnect':
          return await this.rtdsDisconnect(params)

        case 'rtds-subscribe-prices':
          return await this.rtdsSubscribePrices(params)

        case 'rtds-subscribe-comments':
          return await this.rtdsSubscribeComments(params)

        case 'rtds-stats':
          return await this.rtdsStats(params)

        // ===== CTF TOKEN OPERATIONS (PHASE 2) =====
        case 'ctf-create-condition':
          return await this.ctfCreateCondition(params)

        case 'ctf-split':
          return await this.ctfSplit(params)

        case 'ctf-merge':
          return await this.ctfMerge(params)

        case 'ctf-redeem':
          return await this.ctfRedeem(params)

        case 'ctf-positions':
          return await this.ctfGetPositions(params)

        default:
          // Treat unknown actions as chat messages
          return await this.processChatMessage(action, params)
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `GOAT tool failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }
  }

  /**
   * Initialize the GOAT SDK
   */
  private async initializeGoat(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      console.log(chalk.blue('🐐 Initializing GOAT SDK...'))

      // Load GOAT credentials from config if not in env
      try {
        if (!process.env.GOAT_EVM_PRIVATE_KEY) {
          const keyFromConfig =
            configManager.getApiKey('goat_private_key') ||
            configManager.getApiKey('goat-private-key') ||
            configManager.getApiKey('evm_private_key')
          if (keyFromConfig) process.env.GOAT_EVM_PRIVATE_KEY = keyFromConfig
        }

        if (!process.env.POLYGON_RPC_URL) {
          const polygonRpc = configManager.getApiKey('polygon_rpc_url')
          if (polygonRpc) process.env.POLYGON_RPC_URL = polygonRpc
        }

        if (!process.env.BASE_RPC_URL) {
          const baseRpc = configManager.getApiKey('base_rpc_url')
          if (baseRpc) process.env.BASE_RPC_URL = baseRpc
        }
      } catch { }

      // Check if dependencies are installed
      const isInstalled = await GoatProvider.isInstalled()
      if (!isInstalled) {
        const error =
          'GOAT SDK not installed. Run: bun add @goat-sdk/adapter-vercel-ai @goat-sdk/wallet-viem @goat-sdk/plugin-polymarket @goat-sdk/plugin-erc20'
        console.log(chalk.red(`✖ ${error}`))
        return {
          success: false,
          data: null,
          error,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      // Validate environment variables
      try {
        GoatProvider.validateEnvironment()
      } catch (envError: any) {
        console.log(chalk.yellow(`⚠︎ ${envError.message}`))
        console.log(chalk.gray('Required environment variables:'))
        console.log(chalk.gray('- GOAT_EVM_PRIVATE_KEY (0x prefix + 64-char hex)'))
        console.log(chalk.gray('- POLYGON_RPC_URL (optional, defaults to public RPC)'))
        console.log(chalk.gray('- BASE_RPC_URL (optional, defaults to public RPC)'))

        return {
          success: false,
          data: null,
          error: envError.message,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      // Initialize GOAT provider
      this.goatProvider = new GoatProvider()
      await this.goatProvider.initialize({
        chains: params.chains || ['polygon', 'base'],
        plugins: params.plugins || ['polymarket', 'erc20'],
        rpcUrls: params.rpcUrls,
      })

      // Create agent configuration
      const tools = this.goatProvider.getTools()
      const systemPrompt = this.goatProvider.getSystemPrompt()
      const model = openai(process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'gpt-3.5-turbo')

      this.agent = {
        tools,
        system: systemPrompt,
        model,
        maxSteps: 10,
      }

      this.isInitialized = true

      const walletInfo = await this.goatProvider.getWalletInfo()
      const chains = this.goatProvider.getSupportedChains()
      const plugins = this.goatProvider.getEnabledPlugins()

      console.log(chalk.green('✓ GOAT SDK initialized successfully'))
      console.log(chalk.cyan(`📍 Wallet: ${walletInfo.address}`))
      console.log(chalk.cyan(`⛓️ Chains: ${chains.map((c) => c.name).join(', ')}`))
      console.log(chalk.cyan(`🔌 Plugins: ${plugins.join(', ')}`))

      return {
        success: true,
        data: {
          wallet: walletInfo,
          chains: chains.map((c) => ({ name: c.name, chainId: c.chainId })),
          plugins,
          toolsCount: Object.keys(tools).length,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      console.log(chalk.red(`✖ Failed to initialize GOAT SDK: ${error.message}`))
      return {
        success: false,
        data: null,
        error: `GOAT initialization failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Process a chat message using GOAT tools
   */
  private async processChatMessage(message: string, options: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.agent) {
      return {
        success: false,
        data: null,
        error: 'GOAT SDK not initialized. Run the init action first.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { message, options },
        },
      }
    }

    try {
      // Inject tool hint once with EVM address instructions
      if (!this.toolHintInjected) {
        this.conversationMessages.push({
          role: 'system',
          content: `You have access to GOAT SDK tools for blockchain operations.
Available plugins: ${this.goatProvider!.getEnabledPlugins().join(', ')}
Available chains: ${this.goatProvider!.getSupportedChains()
              .map((c) => c.name)
              .join(', ')}

IMPORTANT INSTRUCTIONS FOR ETHEREUM ADDRESSES:
- ALWAYS generate valid Ethereum addresses in format: 0x followed by 40 hexadecimal characters (0-9, a-f)
- Valid example: 0x742d35Cc6634C0532925a3b844Bc029e4f94b4b0
- NEVER use short addresses like 0x0, 0x1, or similar
- If user provides a short address, pad it with leading zeros: 0x0 → 0x0000000000000000000000000000000000000000

BLOCKCHAIN CHAINS & TOKENS:
- Polymarket ALWAYS uses Polygon (chainId: 137) - NEVER use other chains for Polymarket
- Polymarket bets use USDC token on Polygon
- USDC on Polygon contract address: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 (checksummed)
- ERC20 operations can use Polygon (chainId: 137)
- Default to Polygon if not specified

POLYMARKET OPERATIONS:
- IMPORTANT: Always use USDC (0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174 - checksummed) on Polygon for Polymarket
- Market IDs must be actual market identifiers (hex string or market slug)
- Text-based market search by description DOES NOT WORK with Polymarket API
- To find markets, you MUST:
  1. Ask user for the EXACT market ID or market slug (available on polymarket.com)
  2. OR list active markets using list_markets() and show user the options
  3. Let user choose from the list
  4. Then use that market ID for placing bets with USDC
- NEVER attempt full-text search by market description (API doesn't support it)
- If user provides a description, tell them: "I need the exact market ID from polymarket.com or I can list available markets for you to choose from"
- NEVER try to use zero address (0x0000...) or invalid addresses as token contracts

ALWAYS confirm with user before executing any blockchain transaction.`,
        })
        this.toolHintInjected = true
      }

      // Add user message
      this.conversationMessages.push({
        role: 'user',
        content: message,
      })

      console.log(chalk.blue('🤖 Processing with GOAT SDK...'))

      // Generate response using GOAT tools
      const response = await generateText({
        model: this.agent.model,
        messages: this.conversationMessages,
        tools: this.agent.tools,
        system: this.agent.system,
      })

      // Add assistant response to conversation
      this.conversationMessages.push({
        role: 'assistant',
        content: response.text,
      })

      return {
        success: true,
        data: {
          response: response.text,
          toolCalls: response.steps?.filter((step) => step.toolCalls?.length > 0) || [],
          usage: response.usage,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { message, options },
        },
      }
    } catch (error: any) {
      console.log(chalk.red(`✖ Chat processing failed: ${error.message}`))
      return {
        success: false,
        data: null,
        error: `Chat processing failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { message, options },
        },
      }
    }
  }

  /**
   * Get wallet information
   */
  private async getWalletInfo(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT SDK not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const walletInfo = await this.goatProvider.getWalletInfo()
      const chains = this.goatProvider.getSupportedChains()
      const plugins = this.goatProvider.getEnabledPlugins()

      return {
        success: true,
        data: {
          wallet: walletInfo,
          chains: chains.map((c) => ({ name: c.name, chainId: c.chainId, rpcUrl: c.rpcUrl })),
          plugins,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to get wallet info: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get GOAT SDK status
   */
  private async getStatus(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const isInstalled = await GoatProvider.isInstalled()

      let envStatus = 'missing'
      try {
        GoatProvider.validateEnvironment()
        envStatus = 'valid'
      } catch {
        envStatus = 'invalid'
      }

      return {
        success: true,
        data: {
          installed: isInstalled,
          initialized: this.isInitialized,
          environment: envStatus,
          conversation: {
            messages: this.conversationMessages.length,
            toolHintInjected: this.toolHintInjected,
          },
          plugins: this.goatProvider?.getEnabledPlugins() || [],
          chains: this.goatProvider?.getSupportedChains().map((c) => c.name) || [],
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Status check failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * List available GOAT tools
   */
  private async listTools(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT SDK not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const tools = this.goatProvider.getTools()
      const toolList = Object.entries(tools).map(([name, tool]) => ({
        name,
        description: (tool as any).description || 'No description available',
      }))

      return {
        success: true,
        data: {
          tools: toolList,
          count: toolList.length,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to list tools: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get the appropriate blockchain chain for a plugin
   * Polymarket ALWAYS uses Polygon, others can be overridden
   */
  private getChainForPlugin(plugin: string, overrideChainId?: number): typeof BLOCKCHAIN_CHAINS.POLYGON {
    // Polymarket MUST use Polygon - no exceptions
    if (plugin === 'polymarket') {
      return PLUGIN_DEFAULT_CHAINS.polymarket
    }

    // For other plugins, check if chainId is provided
    if (overrideChainId === BLOCKCHAIN_CHAINS.BASE.chainId) {
      return PLUGIN_DEFAULT_CHAINS.erc20
    }

    // Default to Polygon for other operations
    return PLUGIN_DEFAULT_CHAINS[plugin as keyof typeof PLUGIN_DEFAULT_CHAINS] || BLOCKCHAIN_CHAINS.POLYGON
  }

  /**
   * Reset conversation history
   */
  private async resetConversation(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    this.conversationMessages = []
    this.toolHintInjected = false

    return {
      success: true,
      data: {
        message: 'Conversation history reset',
        messagesCleared: this.conversationMessages.length,
      },
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }

  /**
   * Handle Polymarket-specific actions with Zod validation
   *
   * IMPORTANT: Use market IDs (numeric), not descriptions
   * Example: market ID is "0x123abc", not "Which CEOs Will Be Out in 2025?"
   * Use /polymarket chat "search markets about CEOs" to find market IDs first
   */
  private async handlePolymarketAction(action: string, params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT SDK not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }

    const enabledPlugins = this.goatProvider.getEnabledPlugins()
    if (!enabledPlugins.includes('polymarket')) {
      return {
        success: false,
        data: null,
        error: 'Polymarket plugin not enabled',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }

    // Validate parameters based on action
    let validationResult: any
    switch (action.toLowerCase()) {
      case 'bet':
      case 'polymarket-bet':
        validationResult = validatePolymarketBet(params)
        break
      case 'markets':
      case 'polymarket-markets':
        // Markets listing doesn't require strict validation
        validationResult = { valid: true }
        break
      default:
        // For unknown actions, just create a message
        validationResult = { valid: true }
    }

    if (!validationResult.valid) {
      return {
        success: false,
        data: null,
        error: validationResult.error || 'Parameter validation failed',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }

    // ⛓️ Force Polygon chain for Polymarket (Polymarket ONLY operates on Polygon)
    const polymarketChain = PLUGIN_DEFAULT_CHAINS.polymarket
    const polymarketParams = {
      ...validationResult.data,
      chainId: polymarketChain.chainId,
      chain: 'polygon',
    }

    // Use chat interface for Polymarket operations with Polygon chain
    const message = `Execute Polymarket ${action} on ${polymarketChain.name} chain (chainId: ${polymarketChain.chainId}): ${JSON.stringify(polymarketParams)}`
    return await this.processChatMessage(message, {
      plugin: 'polymarket',
      chainId: polymarketChain.chainId,
      chain: 'polygon',
    })
  }

  /**
   * Handle ERC20-specific actions with Zod validation
   */
  private async handleERC20Action(action: string, params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT SDK not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }

    const enabledPlugins = this.goatProvider.getEnabledPlugins()
    if (!enabledPlugins.includes('erc20')) {
      return {
        success: false,
        data: null,
        error: 'ERC20 plugin not enabled',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }

    // Validate parameters based on action
    let validationResult: any
    switch (action.toLowerCase()) {
      case 'balance':
      case 'erc20-balance':
        validationResult = validateERC20Balance(params)
        break
      case 'transfer':
      case 'erc20-transfer':
        validationResult = validateERC20Transfer(params)
        break
      case 'approve':
      case 'erc20-approve':
        validationResult = validateERC20Approve(params)
        break
      default:
        // For unknown actions, just create a message
        validationResult = { valid: true }
    }

    if (!validationResult.valid) {
      return {
        success: false,
        data: null,
        error: validationResult.error || 'Parameter validation failed',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }

    // Use chat interface for ERC20 operations
    const message = `Execute ERC20 ${action}: ${JSON.stringify(validationResult.data || params)}`
    return await this.processChatMessage(message, { plugin: 'erc20' })
  }

  /**
   * Get builder program status
   */
  private async getBuilderStatus(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const signingService = this.goatProvider.getBuilderSigningService()
      if (!signingService) {
        return {
          success: true,
          data: {
            configured: false,
            message: 'Builder program not configured. Set POLYMARKET_BUILDER_API_KEY to enable.',
          },
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const summary = signingService.getSummary()
      return {
        success: true,
        data: {
          configured: true,
          summary,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get builder metrics and performance
   */
  private async getBuilderMetrics(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const signingService = this.goatProvider.getBuilderSigningService()
      if (!signingService) {
        return {
          success: false,
          data: null,
          error: 'Builder program not configured',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const report = signingService.exportMetricsReport()
      return {
        success: true,
        data: report,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Sign order with builder attribution
   */
  private async handleBuilderSignOrder(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const signingService = this.goatProvider.getBuilderSigningService()
      if (!signingService) {
        return {
          success: false,
          data: null,
          error: 'Builder program not configured',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const result = await signingService.signOrder({
        signedOrder: params.signedOrder,
        orderType: params.orderType || 'GTC',
      })

      return {
        success: result.success,
        data: result,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { orderType: params.orderType },
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get builder attribution log
   */
  private async getBuilderAttribution(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const signingService = this.goatProvider.getBuilderSigningService()
      if (!signingService) {
        return {
          success: false,
          data: null,
          error: 'Builder program not configured',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const log = signingService.getAttributionLog(params.limit || 100)
      return {
        success: true,
        data: { records: log, count: log.length },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Connect to WebSocket for real-time data
   */
  private async connectWebSocket(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const wsManager = this.goatProvider.getWebSocketManager()
      if (!wsManager) {
        return {
          success: false,
          data: null,
          error: 'WebSocket manager not available',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      await wsManager.connect()
      const stats = wsManager.getStats()

      return {
        success: true,
        data: { connected: true, stats },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Disconnect WebSocket
   */
  private async disconnectWebSocket(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const wsManager = this.goatProvider.getWebSocketManager()
      if (wsManager) {
        wsManager.disconnect()
      }

      return {
        success: true,
        data: { disconnected: true },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Subscribe to WebSocket market updates
   */
  private async subscribeWebSocket(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider || !params.assetId) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized or missing assetId',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const wsManager = this.goatProvider.getWebSocketManager()
      if (!wsManager) {
        return {
          success: false,
          data: null,
          error: 'WebSocket manager not available',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      wsManager.subscribe(params.assetId)
      const stats = wsManager.getStats()

      return {
        success: true,
        data: { subscribed: true, assetId: params.assetId, stats },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get WebSocket statistics
   */
  private async getWebSocketStats(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const wsManager = this.goatProvider.getWebSocketManager()
      if (!wsManager) {
        return {
          success: false,
          data: null,
          error: 'WebSocket manager not available',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const stats = wsManager.getStats()
      const health = await wsManager.healthCheck()

      return {
        success: true,
        data: { stats, healthy: health },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Check native API health
   */
  private async checkNativeHealth(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const nativeClient = this.goatProvider.getPolymarketNativeClient()
      const health = nativeClient ? await nativeClient.healthCheck() : false

      return {
        success: true,
        data: { healthy: health, timestamp: Date.now() },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get native API status
   */
  private async getNativeApiStatus(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const status = this.goatProvider.getNativeApiStatus()
      return {
        success: true,
        data: status,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Set funder address for Polymarket operations
   */
  private async setFunderAddress(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const address = params.address || params.funderAddress
      if (!address) {
        return {
          success: false,
          data: null,
          error: 'Funder address parameter required (address or funderAddress)',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const nativeClient = this.goatProvider.getPolymarketNativeClient()
      if (!nativeClient) {
        return {
          success: false,
          data: null,
          error: 'Polymarket native client not available',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      nativeClient.setFunderAddress(address)
      return {
        success: true,
        data: { funderAddress: address, message: 'Funder address set successfully' },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get current funder address
   */
  private async getFunderAddress(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const nativeClient = this.goatProvider.getPolymarketNativeClient()
      if (!nativeClient) {
        return {
          success: false,
          data: null,
          error: 'Polymarket native client not available',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const funderAddress = nativeClient.getFunderAddress()
      return {
        success: true,
        data: { funderAddress, isConfigured: !!funderAddress },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Clear funder address
   */
  private async clearFunderAddress(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const nativeClient = this.goatProvider.getPolymarketNativeClient()
      if (!nativeClient) {
        return {
          success: false,
          data: null,
          error: 'Polymarket native client not available',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      nativeClient.clearFunderAddress()
      return {
        success: true,
        data: { message: 'Funder address cleared successfully' },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get funder address status
   */
  private async getFunderStatus(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const nativeClient = this.goatProvider.getPolymarketNativeClient()
      if (!nativeClient) {
        return {
          success: false,
          data: null,
          error: 'Polymarket native client not available',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const funderAddress = nativeClient.getFunderAddress()
      const hasFunder = nativeClient.hasFunderAddress()

      return {
        success: true,
        data: {
          configured: hasFunder,
          funderAddress: funderAddress || 'Not set',
          status: hasFunder ? 'Active' : 'Not configured',
          actions: ['Use set-funder to configure', 'Use get-funder to retrieve current', 'Use clear-funder to remove'],
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  // ===== PHASE 2 TOOL ACTIONS =====

  /**
   * Relayer: Deploy Safe wallet
   */
  private async relayerDeploy(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const relayerClient = this.goatProvider.getPolymarketRelayerClient()
      if (!relayerClient) {
        return {
          success: false,
          data: null,
          error: 'Relayer client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const userAddress = params.address || process.env.GOAT_EVM_ADDRESS
      if (!userAddress) {
        return {
          success: false,
          data: null,
          error: 'User address required (address param or GOAT_EVM_ADDRESS env)',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const safeWallet = await relayerClient.deploySafe(userAddress)

      return {
        success: true,
        data: {
          walletAddress: safeWallet.address,
          chainId: safeWallet.chainId,
          status: 'Deployed',
          safeWallet: safeWallet,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * Relayer: Execute gasless transactions
   */
  private async relayerExecute(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const relayerClient = this.goatProvider.getPolymarketRelayerClient()
      if (!relayerClient) {
        return {
          success: false,
          data: null,
          error: 'Relayer client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const userAddress = params.address || process.env.GOAT_EVM_ADDRESS
      if (!userAddress) {
        return {
          success: false,
          data: null,
          error: 'User address required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const transactions = params.transactions || params.transaction ? [params.transaction] : []
      if (transactions.length === 0) {
        return {
          success: false,
          data: null,
          error: 'Transactions required in params',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const result = await relayerClient.executeSafeTransactions(userAddress, transactions)

      return {
        success: true,
        data: {
          transactionHash: result.transactionHash,
          status: result.status,
          result: result,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * Relayer: Get relayer status
   */
  private async relayerStatus(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const relayerClient = this.goatProvider.getPolymarketRelayerClient()
      if (!relayerClient) {
        return {
          success: false,
          data: null,
          error: 'Relayer client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const isHealthy = await relayerClient.healthCheck()

      return {
        success: true,
        data: {
          status: isHealthy ? 'Healthy' : 'Unhealthy',
          healthy: isHealthy,
          service: 'Polymarket Relayer',
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * Gamma: Get trending markets
   */
  private async gammaTrendingMarkets(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const gammaAPI = this.goatProvider.getGammaMarketsAPI()
      if (!gammaAPI) {
        return {
          success: false,
          data: null,
          error: 'Gamma Markets API not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const limit = params.limit || 20
      const markets = await gammaAPI.getTrendingMarkets(limit)

      return {
        success: true,
        data: {
          count: markets.length,
          markets: markets,
          limit: limit,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * Gamma: Search markets
   */
  private async gammaSearchMarkets(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const gammaAPI = this.goatProvider.getGammaMarketsAPI()
      if (!gammaAPI) {
        return {
          success: false,
          data: null,
          error: 'Gamma Markets API not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const searchTerm = params.query || params.searchTerm
      if (!searchTerm) {
        return {
          success: false,
          data: null,
          error: 'Search term required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const limit = params.limit || 20
      const markets = await gammaAPI.searchByTerm(searchTerm, limit)

      return {
        success: true,
        data: {
          searchTerm: searchTerm,
          count: markets.length,
          markets: markets,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * Gamma: Get market details
   */
  private async gammaMarketDetails(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const gammaAPI = this.goatProvider.getGammaMarketsAPI()
      if (!gammaAPI) {
        return {
          success: false,
          data: null,
          error: 'Gamma Markets API not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const marketId = params.marketId || params.id
      if (!marketId) {
        return {
          success: false,
          data: null,
          error: 'Market ID required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const details = await gammaAPI.getMarketDetails(marketId)

      return {
        success: true,
        data: {
          marketId: marketId,
          details: details,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * Gamma: Get markets by category
   */
  private async gammaMarketsByCategory(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const gammaAPI = this.goatProvider.getGammaMarketsAPI()
      if (!gammaAPI) {
        return {
          success: false,
          data: null,
          error: 'Gamma Markets API not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const category = params.category
      if (!category) {
        return {
          success: false,
          data: null,
          error: 'Category required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const limit = params.limit || 20
      const markets = await gammaAPI.getMarketsByCategory(category, limit)

      return {
        success: true,
        data: {
          category: category,
          count: markets.length,
          markets: markets,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * RTDS: Connect to real-time data stream
   */
  private async rtdsConnect(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const rtdsClient = this.goatProvider.getRTDSClient()
      if (!rtdsClient) {
        return {
          success: false,
          data: null,
          error: 'RTDS client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      await rtdsClient.connect()

      return {
        success: true,
        data: {
          status: 'Connected',
          connected: true,
          message: 'RTDS WebSocket connected successfully',
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * RTDS: Disconnect from real-time data stream
   */
  private async rtdsDisconnect(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const rtdsClient = this.goatProvider.getRTDSClient()
      if (!rtdsClient) {
        return {
          success: false,
          data: null,
          error: 'RTDS client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      rtdsClient.disconnect()

      return {
        success: true,
        data: {
          status: 'Disconnected',
          connected: false,
          message: 'RTDS WebSocket disconnected',
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * RTDS: Subscribe to crypto prices
   */
  private async rtdsSubscribePrices(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const rtdsClient = this.goatProvider.getRTDSClient()
      if (!rtdsClient) {
        return {
          success: false,
          data: null,
          error: 'RTDS client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const symbols =
        params.symbols || params.symbol ? (Array.isArray(params.symbol) ? params.symbol : [params.symbol]) : []
      if (symbols.length === 0) {
        return {
          success: false,
          data: null,
          error: 'Symbols required (symbols array or symbol string)',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      rtdsClient.subscribeToCryptoPrices(symbols)

      return {
        success: true,
        data: {
          status: 'Subscribed',
          symbols: symbols,
          message: `Subscribed to prices for: ${symbols.join(', ')}`,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * RTDS: Subscribe to market comments
   */
  private async rtdsSubscribeComments(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const rtdsClient = this.goatProvider.getRTDSClient()
      if (!rtdsClient) {
        return {
          success: false,
          data: null,
          error: 'RTDS client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const marketId = params.marketId || params.market
      if (!marketId) {
        return {
          success: false,
          data: null,
          error: 'Market ID required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      rtdsClient.subscribeToComments(marketId)

      return {
        success: true,
        data: {
          status: 'Subscribed',
          marketId: marketId,
          message: `Subscribed to comments for market: ${marketId}`,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * RTDS: Get connection statistics
   */
  private async rtdsStats(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const rtdsClient = this.goatProvider.getRTDSClient()
      if (!rtdsClient) {
        return {
          success: false,
          data: null,
          error: 'RTDS client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const stats = rtdsClient.getStats()

      return {
        success: true,
        data: {
          stats: stats,
          connected: stats.connected,
          uptime: stats.uptime,
          messageCount: stats.messageCount,
          subscriptions: Array.from(stats.subscriptions),
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * CTF: Create condition for market
   */
  private async ctfCreateCondition(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const ctfClient = this.goatProvider.getCTFClient()
      if (!ctfClient) {
        return {
          success: false,
          data: null,
          error: 'CTF client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const questionId = params.questionId || params.questionid
      if (!questionId) {
        return {
          success: false,
          data: null,
          error: 'Question ID required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      await ctfClient.initialize()
      const condition = await ctfClient.createCondition(questionId)

      return {
        success: true,
        data: {
          conditionId: condition.conditionId,
          questionId: condition.questionId,
          oracle: condition.oracle,
          condition: condition,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * CTF: Split collateral into outcome tokens
   */
  private async ctfSplit(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const ctfClient = this.goatProvider.getCTFClient()
      if (!ctfClient) {
        return {
          success: false,
          data: null,
          error: 'CTF client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const userAddress = params.address || params.userAddress || process.env.GOAT_EVM_ADDRESS
      const amount = params.amount || params.collateralAmount
      const conditionId = params.conditionId || params.condition

      if (!userAddress || !amount || !conditionId) {
        return {
          success: false,
          data: null,
          error: 'User address, amount, and condition ID required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      await ctfClient.initialize()
      const positions = await ctfClient.split(userAddress, amount.toString(), conditionId)

      return {
        success: true,
        data: {
          userAddress: userAddress,
          amount: amount,
          conditionId: conditionId,
          positions: positions,
          message: 'Split successful - created YES and NO positions',
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * CTF: Merge outcome tokens back to collateral
   */
  private async ctfMerge(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const ctfClient = this.goatProvider.getCTFClient()
      if (!ctfClient) {
        return {
          success: false,
          data: null,
          error: 'CTF client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const userAddress = params.address || params.userAddress || process.env.GOAT_EVM_ADDRESS
      const amount = params.amount || params.collateralAmount
      const conditionId = params.conditionId || params.condition

      if (!userAddress || !amount || !conditionId) {
        return {
          success: false,
          data: null,
          error: 'User address, amount, and condition ID required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      await ctfClient.initialize()
      const mergedAmount = await ctfClient.merge(userAddress, amount.toString(), conditionId)

      return {
        success: true,
        data: {
          userAddress: userAddress,
          mergedAmount: mergedAmount,
          conditionId: conditionId,
          message: 'Merge successful - positions converted back to collateral',
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * CTF: Redeem position after condition resolution
   */
  private async ctfRedeem(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const ctfClient = this.goatProvider.getCTFClient()
      if (!ctfClient) {
        return {
          success: false,
          data: null,
          error: 'CTF client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const userAddress = params.address || params.userAddress || process.env.GOAT_EVM_ADDRESS
      const positionId = params.positionId || params.position
      const conditionId = params.conditionId || params.condition
      const amount = params.amount
      const payouts = params.payoutNumerators || params.payouts || [1, 0]

      if (!userAddress || !positionId || !conditionId || !amount) {
        return {
          success: false,
          data: null,
          error: 'User address, position ID, condition ID, and amount required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      await ctfClient.initialize()
      const redeemAmount = await ctfClient.redeem(userAddress, positionId, conditionId, amount.toString(), payouts)

      return {
        success: true,
        data: {
          userAddress: userAddress,
          positionId: positionId,
          redeemAmount: redeemAmount,
          message: 'Redemption successful',
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * CTF: Get user positions for condition
   */
  private async ctfGetPositions(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.goatProvider) {
      return {
        success: false,
        data: null,
        error: 'GOAT provider not initialized',
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }

    try {
      const ctfClient = this.goatProvider.getCTFClient()
      if (!ctfClient) {
        return {
          success: false,
          data: null,
          error: 'CTF client not available',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      const userAddress = params.address || params.userAddress || process.env.GOAT_EVM_ADDRESS
      const conditionId = params.conditionId || params.condition

      if (!userAddress || !conditionId) {
        return {
          success: false,
          data: null,
          error: 'User address and condition ID required',
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      await ctfClient.initialize()
      const positions = await ctfClient.getUserPositions(userAddress, conditionId)

      return {
        success: true,
        data: {
          userAddress: userAddress,
          conditionId: conditionId,
          count: positions.length,
          positions: positions,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * Display comprehensive help for GOAT tool
   */
  private async displayHelp(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    const category = params.category || params.section || null

    const helpData = {
      title: '🐐 GOAT Tool - Complete Guide',
      description: 'Enterprise-grade blockchain operations with Polymarket prediction markets',
      version: '2.0.0',
      sections: this.getHelpSections(category),
    }

    console.log('\n' + chalk.cyan('═'.repeat(80)))
    console.log(chalk.bold.cyan(helpData.title))
    console.log(chalk.cyan('═'.repeat(80)))
    console.log(chalk.gray(helpData.description))
    console.log(chalk.gray(`Version: ${helpData.version}\n`))

    if (category) {
      console.log(chalk.bold.yellow(`📚 ${category.toUpperCase()}\n`))
      const section = helpData.sections.find((s) => s.name.toLowerCase() === category.toLowerCase())
      if (section) {
        this.printSection(section)
      } else {
        console.log(chalk.red(`✖ Category not found: ${category}`))
        console.log(chalk.yellow(`\nAvailable categories: ${helpData.sections.map((s) => s.name).join(', ')}\n`))
      }
    } else {
      // Print all sections
      for (const section of helpData.sections) {
        this.printSection(section)
        console.log()
      }
      console.log(chalk.cyan('═'.repeat(80)))
      console.log(chalk.gray(`Use: nikcli goat help --category <section> for detailed help\n`))
    }

    return {
      success: true,
      data: {
        message: 'Help displayed',
        sections: helpData.sections.map((s) => s.name),
        category: category || 'all',
      },
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }

  /**
   * Get help sections
   */
  private getHelpSections(category: string | null) {
    return [
      {
        name: 'GETTING_STARTED',
        title: '🚀 Getting Started',
        commands: [
          {
            cmd: 'nikcli goat init',
            desc: 'Initialize GOAT SDK with Polymarket and ERC20 plugins',
            example: 'Sets up wallet, chains, and blockchain plugins',
          },
          {
            cmd: 'nikcli goat wallet-info',
            desc: 'Display current wallet address and configuration',
            example: 'Shows address, chains, and enabled plugins',
          },
          {
            cmd: 'nikcli goat status',
            desc: 'Check GOAT SDK initialization status',
            example: 'Reports if GOAT is ready for operations',
          },
        ],
      },
      {
        name: 'MARKET_DISCOVERY',
        title: '📊 Market Discovery (Gamma API)',
        commands: [
          {
            cmd: 'nikcli goat gamma-trending [--limit 20]',
            desc: 'Get top trending prediction markets',
            example: 'nikcli goat gamma-trending --limit 10',
          },
          {
            cmd: 'nikcli goat gamma-search --query <term> [--limit 20]',
            desc: 'Search markets by keyword',
            example: 'nikcli goat gamma-search --query "Trump election"',
          },
          {
            cmd: 'nikcli goat gamma-details --marketId <id>',
            desc: 'Get detailed market information',
            example: 'nikcli goat gamma-details --marketId 0x123abc',
          },
          {
            cmd: 'nikcli goat gamma-category --category <name> [--limit 20]',
            desc: 'Get markets by category (elections, crypto, sports, etc)',
            example: 'nikcli goat gamma-category --category elections',
          },
        ],
      },
      {
        name: 'REAL_TIME_DATA',
        title: '⚡ Real-Time Data Streams (RTDS)',
        commands: [
          {
            cmd: 'nikcli goat rtds-connect',
            desc: 'Connect to real-time data WebSocket',
            example: 'Establishes live price and comment feeds',
          },
          {
            cmd: 'nikcli goat rtds-subscribe-prices --symbols BTC,ETH,SOL',
            desc: 'Subscribe to crypto price updates',
            example: 'nikcli goat rtds-subscribe-prices --symbols BTC,ETH',
          },
          {
            cmd: 'nikcli goat rtds-subscribe-comments --marketId <id>',
            desc: 'Subscribe to market comment stream',
            example: 'nikcli goat rtds-subscribe-comments --marketId 0x123',
          },
          {
            cmd: 'nikcli goat rtds-stats',
            desc: 'Get connection statistics and subscription info',
            example: 'Shows uptime, message count, active subscriptions',
          },
          {
            cmd: 'nikcli goat rtds-disconnect',
            desc: 'Disconnect from real-time data stream',
            example: 'Closes WebSocket and cleans up',
          },
        ],
      },
      {
        name: 'TRADING',
        title: '💰 Trading Operations',
        commands: [
          {
            cmd: 'nikcli goat place-order --tokenId <id> --price <0-1> --size <num> --side BUY|SELL',
            desc: 'Place limit order on Polymarket CLOB',
            example: 'nikcli goat place-order --tokenId TRUMP --price 0.55 --size 100 --side BUY',
          },
          {
            cmd: 'nikcli goat cancel-order --orderId <id>',
            desc: 'Cancel an existing order',
            example: 'nikcli goat cancel-order --orderId 0x123abc',
          },
          {
            cmd: 'nikcli goat set-funder --address 0x...',
            desc: 'Set funder address for order attribution',
            example: 'Enables builder program benefits and gas coverage',
          },
          {
            cmd: 'nikcli goat get-funder',
            desc: 'Get current funder address',
            example: 'Returns configured funder or "Not set"',
          },
          {
            cmd: 'nikcli goat funder-status',
            desc: 'Check funder configuration status',
            example: 'Shows if funder is active and configured',
          },
        ],
      },
      {
        name: 'GASLESS_TRANSACTIONS',
        title: '🔐 Gasless Transactions (Relayer)',
        commands: [
          {
            cmd: 'nikcli goat relayer-deploy --address 0x...',
            desc: 'Deploy Safe wallet for gasless operations',
            example: 'Creates Safe on Polygon for transaction batching',
          },
          {
            cmd: 'nikcli goat relayer-execute --transactions <json>',
            desc: 'Execute transactions without paying gas',
            example: 'Executes Safe transaction batches',
          },
          {
            cmd: 'nikcli goat relayer-status',
            desc: 'Check relayer service health',
            example: 'Verifies relayer infrastructure status',
          },
        ],
      },
      {
        name: 'TOKEN_OPERATIONS',
        title: '🎫 Token Operations (CTF)',
        commands: [
          {
            cmd: 'nikcli goat ctf-create-condition --questionId <id>',
            desc: 'Create market condition for token operations',
            example: 'Creates condition for YES/NO token split',
          },
          {
            cmd: 'nikcli goat ctf-split --amount 1000 --conditionId <id>',
            desc: 'Split collateral into YES and NO outcome tokens',
            example: 'Converts 1000 USDC into 1000 YES + 1000 NO tokens',
          },
          {
            cmd: 'nikcli goat ctf-merge --amount 1000 --conditionId <id>',
            desc: 'Merge outcome tokens back to collateral',
            example: 'Converts YES/NO tokens back to USDC',
          },
          {
            cmd: 'nikcli goat ctf-redeem --positionId <id> --amount 1000 --conditionId <id>',
            desc: 'Redeem position after market resolution',
            example: 'Claims payout based on market outcome',
          },
          {
            cmd: 'nikcli goat ctf-positions --conditionId <id>',
            desc: 'Get all user positions for condition',
            example: 'Lists YES/NO token holdings',
          },
        ],
      },
      {
        name: 'BUILDER_PROGRAM',
        title: '🏗️ Builder Program (Order Attribution)',
        commands: [
          {
            cmd: 'nikcli goat builder-status',
            desc: 'Check builder program configuration',
            example: 'Shows API key and builder credentials status',
          },
          {
            cmd: 'nikcli goat builder-sign-order --signedOrder <json>',
            desc: 'Add builder attribution to order',
            example: 'Signs order with builder credentials for gas coverage',
          },
          {
            cmd: 'nikcli goat builder-metrics',
            desc: 'Get builder program metrics',
            example: 'Shows orders, volume, gas fees saved',
          },
          {
            cmd: 'nikcli goat builder-attribution',
            desc: 'Get attribution log and revenue details',
            example: 'Lists all attributed orders and earnings',
          },
        ],
      },
      {
        name: 'WEBSOCKET',
        title: '📡 WebSocket Management',
        commands: [
          {
            cmd: 'nikcli goat ws-connect',
            desc: 'Connect to Polymarket orderbook WebSocket',
            example: 'Establishes real-time order book stream',
          },
          {
            cmd: 'nikcli goat ws-subscribe --topic <topic>',
            desc: 'Subscribe to specific orderbook topic',
            example: 'nikcli goat ws-subscribe --topic TRUMP',
          },
          {
            cmd: 'nikcli goat ws-stats',
            desc: 'Get WebSocket connection statistics',
            example: 'Shows message count, uptime, subscriptions',
          },
          {
            cmd: 'nikcli goat ws-disconnect',
            desc: 'Disconnect from WebSocket',
            example: 'Closes connection and cleans up',
          },
        ],
      },
      {
        name: 'AI_AGENT',
        title: '🤖 AI Agent (Autonomous Trading)',
        commands: [
          {
            cmd: 'nikcli goat chat "<natural language task>"',
            desc: 'Execute task using AI agent with reasoning',
            example: 'nikcli goat chat "Buy 100 shares at 0.55 on TRUMP"',
          },
          {
            cmd: 'nikcli goat register-agent polymarket',
            desc: 'Register PolymarketAgent for autonomous operations',
            example: 'Makes agent available system-wide',
          },
        ],
      },
      {
        name: 'ERC20',
        title: '💵 ERC20 Token Operations',
        commands: [
          {
            cmd: 'nikcli goat balance --token USDC',
            desc: 'Check ERC20 token balance',
            example: 'nikcli goat balance --token USDC',
          },
          {
            cmd: 'nikcli goat transfer --to 0x... --amount 100 --token USDC',
            desc: 'Transfer ERC20 tokens',
            example: 'nikcli goat transfer --to 0x123 --amount 100 --token USDC',
          },
          {
            cmd: 'nikcli goat approve --spender 0x... --amount 100 --token USDC',
            desc: 'Approve token spending',
            example: 'nikcli goat approve --spender 0xCLOB --amount 1000 --token USDC',
          },
        ],
      },
      {
        name: 'CONVERSATION',
        title: '💬 Conversation Management',
        commands: [
          {
            cmd: 'nikcli goat chat "<message>"',
            desc: 'Continue AI conversation about blockchain',
            example: 'Maintains context across multiple messages',
          },
          {
            cmd: 'nikcli goat reset',
            desc: 'Reset conversation history',
            example: 'Clears previous messages and context',
          },
          {
            cmd: 'nikcli goat tools',
            desc: 'List all available GOAT tools',
            example: 'Shows tool registry and capabilities',
          },
        ],
      },
      {
        name: 'EXAMPLES',
        title: '📋 Common Workflows',
        commands: [
          {
            cmd: 'Discovery & Trade',
            desc: 'nikcli goat gamma-trending | find market | nikcli goat place-order',
            example: 'Find trending market and place order',
          },
          {
            cmd: 'Real-Time Monitoring',
            desc: 'nikcli goat rtds-connect && nikcli goat rtds-subscribe-prices --symbols BTC,ETH',
            example: 'Stream live crypto prices',
          },
          {
            cmd: 'AI-Powered Trading',
            desc: 'nikcli goat chat "Buy low in trending markets, sell high"',
            example: 'AI agent analyzes and executes trades',
          },
          {
            cmd: 'Token Position Management',
            desc: 'nikcli goat ctf-split | monitor | nikcli goat ctf-redeem',
            example: 'Create positions, monitor, redeem after resolution',
          },
          {
            cmd: 'Gasless Execution',
            desc: 'nikcli goat relayer-deploy && nikcli goat relayer-execute',
            example: 'Deploy Safe and execute without gas costs',
          },
        ],
      },
    ]
  }

  /**
   * Print help section
   */
  private printSection(section: any) {
    console.log(chalk.bold.yellow(`\n${section.title}`))
    console.log(chalk.gray('─'.repeat(80)))

    for (const cmd of section.commands) {
      if (cmd.example && !cmd.example.includes('nikcli')) {
        // It's a workflow example
        console.log(chalk.cyan(`  ${cmd.cmd}`))
        console.log(chalk.gray(`    ${cmd.desc}`))
        console.log(chalk.blue(`    ⤷ ${cmd.example}\n`))
      } else {
        // It's a regular command
        console.log(chalk.cyan(`  ${cmd.cmd}`))
        console.log(chalk.gray(`    ${cmd.desc}`))
        if (cmd.example) {
          console.log(chalk.blue(`    📝 ${cmd.example}`))
        }
        console.log()
      }
    }
  }
}
