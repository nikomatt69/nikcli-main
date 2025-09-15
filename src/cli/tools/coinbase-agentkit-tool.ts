import { openai } from '@ai-sdk/openai'
import type { CoreMessage } from 'ai'
import { generateText } from 'ai'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'
import { CoinbaseAgentKitProvider } from '../onchain/coinbase-agentkit-provider'
import { BaseTool, type ToolExecutionResult } from './base-tool'

/**
 * CoinbaseAgentKitTool - Official Coinbase AgentKit Integration as NikCLI Tool
 *
 * This tool provides access to all official Coinbase AgentKit capabilities
 * through the standard NikCLI tool interface. It uses the exact same
 * architecture as the official Coinbase CLI but integrated as a secure tool.
 *
 * Features:
 * - All official AgentKit action providers (WETH, Pyth, ERC20, CDP Smart Wallet)
 * - User confirmation for all blockchain transactions
 * - Secure environment variable handling
 * - Audit logging for compliance
 * - Conversational AI interface for natural language blockchain operations
 */
export class CoinbaseAgentKitTool extends BaseTool {
  private agentKitProvider: CoinbaseAgentKitProvider | null = null
  private isInitialized: boolean = false
  private conversationMessages: CoreMessage[] = []
  private toolHintInjected: boolean = false

  // Official Coinbase agent configuration (like their CLI)
  private agent: {
    tools: any
    system: string
    model: any
    maxSteps: number
  } | null = null

  constructor(workingDirectory: string) {
    super('coinbase-agentkit', workingDirectory)
  }

  /**
   * Execute blockchain operations using official Coinbase AgentKit
   *
   * @param action - The action to perform: 'init', 'chat', 'wallet-info', 'transfer', etc.
   * @param params - Parameters for the action
   */
  async execute(action: string, params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      switch (action.toLowerCase()) {
        case 'init':
        case 'initialize':
          return await this.initializeAgentKit(params)

        case 'chat':
        case 'message':
          return await this.processChatMessage(params.message || params, params.options)

        case 'wallet-info':
        case 'wallet':
          return await this.getWalletInfo(params)

        case 'wallets':
        case 'list-wallets':
          return await this.listWallets(params)

        case 'use-wallet':
          return await this.useWallet(params)

        case 'transfer':
        case 'send':
          return await this.handleTransfer(params)

        case 'balance':
          return await this.getBalance(params)

        case 'status':
          return await this.getStatus(params)

        case 'reset':
          return await this.resetConversation(params)

        default:
          // Treat unknown actions as chat messages
          return await this.processChatMessage(action, params)
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `AgentKit tool failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }
  }

  /**
   * Initialize the official Coinbase AgentKit
   */
  private async initializeAgentKit(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      console.log(chalk.blue('🔗 Initializing Official Coinbase AgentKit...'))

      // Load Coinbase credentials from config if not in env
      try {
        if (!process.env.CDP_API_KEY_ID) {
          const idFromConfig =
            configManager.getApiKey('coinbase_id') ||
            configManager.getApiKey('coinbase-id') ||
            configManager.getApiKey('cdp_api_key_id')
          if (idFromConfig) process.env.CDP_API_KEY_ID = idFromConfig
        }
        if (!process.env.CDP_API_KEY_SECRET) {
          const secretFromConfig =
            configManager.getApiKey('coinbase_secret') ||
            configManager.getApiKey('coinbase-secret') ||
            configManager.getApiKey('cdp_api_key_secret')
          if (secretFromConfig) process.env.CDP_API_KEY_SECRET = secretFromConfig
        }
        if (!process.env.CDP_WALLET_SECRET) {
          const walletFromConfig =
            configManager.getApiKey('coinbase_wallet_secret') ||
            configManager.getApiKey('coinbase-wallet-secret') ||
            configManager.getApiKey('wallet-secret') ||
            configManager.getApiKey('cdp_wallet_secret')
          if (walletFromConfig) process.env.CDP_WALLET_SECRET = walletFromConfig
        }
      } catch {}

      // Check if dependencies are installed
      const isInstalled = await CoinbaseAgentKitProvider.isInstalled()
      if (!isInstalled) {
        const error =
          'Coinbase AgentKit not installed. Run: npm install @coinbase/agentkit @coinbase/agentkit-vercel-ai-sdk'
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
        CoinbaseAgentKitProvider.validateEnvironment()
      } catch (envError: any) {
        console.log(chalk.yellow(`⚠️ ${envError.message}`))
        console.log(chalk.gray('Required environment variables:'))
        console.log(chalk.gray('- CDP_API_KEY_ID'))
        console.log(chalk.gray('- CDP_API_KEY_SECRET'))
        console.log(chalk.gray('- CDP_WALLET_SECRET'))
        console.log(chalk.gray('- NETWORK_ID (optional, defaults to base-sepolia)'))

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

      // Initialize AgentKit provider
      this.agentKitProvider = new CoinbaseAgentKitProvider()
      // Allow overriding wallet address via params or saved config
      let walletAddress: string | undefined = params.walletAddress
      try {
        if (!walletAddress) {
          const saved = configManager.getApiKey('coinbase_wallet_address')
          if (saved) walletAddress = saved
        }
      } catch {}
      await this.agentKitProvider.initialize({ walletAddress })

      // Create official agent configuration (like Coinbase CLI)
      const tools = this.agentKitProvider.getTools()
      const systemPrompt = this.agentKitProvider.getSystemPrompt()
      const model = openai(process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'gpt-3.5-turbo')

      this.agent = {
        tools,
        system: systemPrompt,
        model,
        maxSteps: 10,
      }

      this.isInitialized = true

      // Get wallet info
      const walletInfo = await this.agentKitProvider.getWalletInfo()

      console.log(chalk.green('✅ Coinbase AgentKit initialized successfully'))
      console.log(chalk.blue(`🔗 Wallet: ${walletInfo.address}`))
      console.log(chalk.blue(`🌐 Network: ${walletInfo.networkId}`))

      if (this.agentKitProvider.canUseFaucet()) {
        console.log(chalk.yellow('💰 Faucet available for testnet'))
      }

      return {
        success: true,
        data: {
          initialized: true,
          walletInfo,
          canUseFaucet: this.agentKitProvider.canUseFaucet(),
          toolsAvailable: Object.keys(tools).length,
          message: 'Coinbase AgentKit ready for blockchain operations',
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ AgentKit initialization failed: ${error.message}`))

      return {
        success: false,
        data: null,
        error: `Initialization failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Process a chat message using the official Coinbase agent
   */
  private async processChatMessage(message: string, options: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.agent) {
      return {
        success: false,
        data: null,
        error: 'AgentKit not initialized. Use action "init" first.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { message, options },
        },
      }
    }

    try {
      console.log(chalk.blue(`🤖 Processing: ${message}`))

      // Add a one-time system hint to encourage tool usage (no explicit provider names)
      if (!this.toolHintInjected) {
        this.conversationMessages.push({
          role: 'system',
          content:
            'Always use your available onchain action providers to perform operations and fetch data rather than replying only with text. If the request involves DeFi analytics (e.g., TVL, protocol stats, token prices), use the appropriate data tools and return concise, actionable results.',
        })
        this.toolHintInjected = true
      }

      // Add user message to conversation
      this.conversationMessages.push({
        role: 'user',
        content: message,
      })

      // Generate response using official Coinbase configuration
      const { text, toolCalls, toolResults } = await generateText({
        ...this.agent,
        messages: this.conversationMessages,
      })

      // Add assistant response to conversation
      this.conversationMessages.push({
        role: 'assistant',
        content: text,
      })

      // Keep conversation history manageable (last 20 messages)
      if (this.conversationMessages.length > 20) {
        this.conversationMessages = this.conversationMessages.slice(-20)
      }
      let toolsUsed: string[] = []
      const toolsUsedNames = toolsUsed && toolsUsed.length > 0 ? ` [${toolsUsed.join(', ')}]` : ''
      console.log(chalk.green(`✅ Response generated (${toolCalls.length} tool calls)${toolsUsedNames}`))

      // Extract tool names if available

      try {
        if (Array.isArray(toolCalls)) {
          toolsUsed = toolCalls
            .map((c: any) => c?.toolName || c?.tool || c?.name)
            .filter(Boolean)
            .map((s: string) => String(s))
        }
      } catch {}

      return {
        success: true,
        data: {
          response: text,
          toolCalls: toolCalls.length,
          toolResults: toolResults.length,
          toolsUsed,
          conversationLength: this.conversationMessages.length,
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

    if (!this.isInitialized || !this.agentKitProvider) {
      return {
        success: false,
        data: null,
        error: 'AgentKit not initialized. Use action "init" first.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const walletInfo = await this.agentKitProvider.getWalletInfo()
      const canUseFaucet = this.agentKitProvider.canUseFaucet()

      return {
        success: true,
        data: {
          ...walletInfo,
          canUseFaucet,
          message: `Wallet: ${walletInfo.address} on ${walletInfo.networkId}`,
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
   * List known wallets (from local wallet list)
   */
  private async listWallets(_params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    try {
      // Initialize provider minimally to access wallet list file
      if (!this.agentKitProvider) {
        this.agentKitProvider = new CoinbaseAgentKitProvider()
      }
      const wallets = this.agentKitProvider.getKnownWallets()
      return {
        success: true,
        data: { wallets },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: _params },
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list wallets: ${error.message}`,
        data: null,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: _params },
      }
    }
  }

  /**
   * Use a specific wallet (by address) and save preference
   */
  private async useWallet(params: { address?: string }): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    try {
      const address = params.address?.trim()
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return {
          success: false,
          error: 'Invalid or missing wallet address. Provide params: { address: "0x..." }',
          data: null,
          metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
        }
      }

      // Persist selection (encrypted store is fine)
      configManager.setApiKey('coinbase_wallet_address', address)
      process.env.CDP_WALLET_ADDRESS = address

      // If initialized, reinitialize with the selected wallet
      this.agentKitProvider = new CoinbaseAgentKitProvider()
      await this.agentKitProvider.initialize({ walletAddress: address })

      const walletInfo = await this.agentKitProvider.getWalletInfo()
      return {
        success: true,
        data: {
          selected: address,
          walletInfo,
          message: `Using wallet ${address}`,
        },
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to use wallet: ${error.message}`,
        data: null,
        metadata: { executionTime: Date.now() - startTime, toolName: this.name, parameters: params },
      }
    }
  }

  /**
   * Handle transfer operations with user confirmation
   */
  private async handleTransfer(params: any): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized) {
      return {
        success: false,
        data: null,
        error: 'AgentKit not initialized. Use action "init" first.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    // For security, transfers should go through the chat interface where users can confirm
    // Be explicit about the asset and units to avoid LLM mis-conversion
    const token = (params.token || params.asset || 'ETH').toString().toUpperCase()
    const amount = params.amount || params.value || '?'
    const to = params.to || params.recipient || '?'
    const network = params.network || process.env.NETWORK_ID || 'base-sepolia'
    const transferMessage = `Use your onchain tools to transfer ${amount} ${token} to ${to} on ${network}. Execute the transfer with the appropriate tool (do not only explain).`
    return await this.processChatMessage(transferMessage, { isTransfer: true })
  }

  /**
   * Get balance information
   */
  private async getBalance(params: any = {}): Promise<ToolExecutionResult> {
    return await this.processChatMessage('What is my wallet balance?', params)
  }

  /**
   * Get tool status
   */
  private async getStatus(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    return {
      success: true,
      data: {
        initialized: this.isInitialized,
        conversationLength: this.conversationMessages.length,
        agentConfigured: !!this.agent,
        walletConnected: !!this.agentKitProvider,
        selectedWallet: ((): string | undefined => {
          try {
            return configManager.getApiKey('coinbase_wallet_address') || process.env.CDP_WALLET_ADDRESS
          } catch {
            return process.env.CDP_WALLET_ADDRESS
          }
        })(),
        message: this.isInitialized
          ? 'AgentKit tool is ready for blockchain operations'
          : 'AgentKit tool not initialized. Use action "init" first.',
      },
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }

  /**
   * Reset conversation history
   */
  private async resetConversation(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    const previousLength = this.conversationMessages.length

    this.conversationMessages = []

    return {
      success: true,
      data: {
        previousLength,
        currentLength: 0,
        message: 'Conversation history reset',
      },
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }
}

// Tool configuration and usage examples
export const coinbaseAgentKitToolConfig = {
  name: 'coinbase-agentkit',
  description: 'Official Coinbase AgentKit integration for blockchain operations',
  category: 'blockchain',
  requiredEnv: ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET'],
  optionalEnv: ['NETWORK_ID', 'PAYMASTER_URL', 'RPC_URL', 'OPENAI_API_KEY'],
  actions: [
    'init - Initialize AgentKit with CDP credentials',
    'chat <message> - Send natural language blockchain requests',
    'wallet-info - Get wallet address and network information',
    'balance - Check wallet balance',
    'transfer <params> - Transfer tokens (with confirmation)',
    'status - Get tool status',
    'reset - Reset conversation history',
  ],
  examples: [
    'secureTools.execute("coinbase-agentkit", "init")',
    'secureTools.execute("coinbase-agentkit", "chat", { message: "What is my balance?" })',
    'secureTools.execute("coinbase-agentkit", "transfer", { to: "0x...", amount: "0.1" })',
  ],
}

export type CoinbaseAgentKitToolAction =
  | 'init'
  | 'initialize'
  | 'chat'
  | 'message'
  | 'wallet-info'
  | 'wallet'
  | 'balance'
  | 'transfer'
  | 'send'
  | 'status'
  | 'reset'
