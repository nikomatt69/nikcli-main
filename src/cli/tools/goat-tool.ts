import { openai } from '@ai-sdk/openai'
import type { CoreMessage } from 'ai'
import { generateText } from 'ai'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'
import { GoatProvider } from '../onchain/goat-provider'
import {
  validateERC20Balance,
  validateERC20Transfer,
  validateERC20Approve,
  validatePolymarketBet,
  validatePolymarketSearch,
  validateWalletInfo,
  validateGoatChatMessage,
  checksumAddress,
  normalizeEVMAddress,
  isZeroAddress,
  sanitizeAddress,
  isValidEVMAddress,
} from './goat-validation-schemas'
import { BaseTool, type ToolExecutionResult } from './base-tool'

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
  private conversationMessages: CoreMessage[] = []
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
      } catch {}

      // Check if dependencies are installed
      const isInstalled = await GoatProvider.isInstalled()
      if (!isInstalled) {
        const error =
          'GOAT SDK not installed. Run: bun add @goat-sdk/adapter-vercel-ai @goat-sdk/wallet-viem @goat-sdk/plugin-polymarket @goat-sdk/plugin-erc20'
        console.log(chalk.red(`❌ ${error}`))
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
        console.log(chalk.yellow(`⚠️ ${envError.message}`))
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

      console.log(chalk.green('✅ GOAT SDK initialized successfully'))
      console.log(chalk.cyan(`📍 Wallet: ${walletInfo.address}`))
      console.log(chalk.cyan(`⛓️ Chains: ${chains.map(c => c.name).join(', ')}`))
      console.log(chalk.cyan(`🔌 Plugins: ${plugins.join(', ')}`))

      return {
        success: true,
        data: {
          wallet: walletInfo,
          chains: chains.map(c => ({ name: c.name, chainId: c.chainId })),
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
      console.log(chalk.red(`❌ Failed to initialize GOAT SDK: ${error.message}`))
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
Available chains: ${this.goatProvider!.getSupportedChains().map(c => c.name).join(', ')}

IMPORTANT INSTRUCTIONS FOR ETHEREUM ADDRESSES:
- ALWAYS generate valid Ethereum addresses in format: 0x followed by 40 hexadecimal characters (0-9, a-f)
- Valid example: 0x742d35Cc6634C0532925a3b844Bc029e4f94b4b0
- NEVER use short addresses like 0x0, 0x1, or similar
- If user provides a short address, pad it with leading zeros: 0x0 → 0x0000000000000000000000000000000000000000

BLOCKCHAIN CHAINS & TOKENS:
- Polymarket ALWAYS uses Polygon (chainId: 137) - NEVER use other chains for Polymarket
- Polymarket bets use USDC token on Polygon
- USDC on Polygon contract address: 0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174 (checksummed)
- ERC20 operations can use Base (chainId: 8453) or Polygon (chainId: 137)
- Default to Polygon if not specified

POLYMARKET OPERATIONS:
- IMPORTANT: Always use USDC (0x2791Bca1f2de4661ED88A30C99a7a9449Aa84174 - checksummed) on Polygon for Polymarket
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
        maxSteps: this.agent.maxSteps,
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
          toolCalls: response.steps?.filter(step => step.toolCalls?.length > 0) || [],
          usage: response.usage,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { message, options },
        },
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Chat processing failed: ${error.message}`))
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
          chains: chains.map(c => ({ name: c.name, chainId: c.chainId, rpcUrl: c.rpcUrl })),
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
          chains: this.goatProvider?.getSupportedChains().map(c => c.name) || [],
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
}
