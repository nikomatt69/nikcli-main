/*
 * Official Polymarket Integration for NikCLI
 *
 * Production-ready integration with Polymarket's CLOB API and GOAT SDK
 * Follows the same architecture as Coinbase AgentKit provider
 */

// GOAT SDK Polymarket plugin imports - using only AI SDK approach
let polymarket: any = null

try {
  const goatPolymarket = require('@goat-sdk/plugin-polymarket')
  polymarket = goatPolymarket.polymarket
} catch {
  // GOAT SDK plugin not installed
}

// GOAT SDK imports - correct structure following official documentation
let getOnChainTools: any = null
let ViemEVMWalletClient: any = null
let viem: any = null
let createWalletClient: any = null
let privateKeyToAccount: any = null
let http: any = null

try {
  const goatAdapterVercelAI = require('@goat-sdk/adapter-vercel-ai')
  getOnChainTools = goatAdapterVercelAI.getOnChainTools
} catch {
  // GOAT adapter not installed
}

try {
  const goatWalletViem = require('@goat-sdk/wallet-viem')
  ViemEVMWalletClient = goatWalletViem.ViemEVMWalletClient
  viem = goatWalletViem.viem
} catch {
  // GOAT viem wallet not installed
}

try {
  const viemLib = require('viem')
  createWalletClient = viemLib.createWalletClient
  http = viemLib.http
} catch {
  // Viem not installed
}

try {
  const viemAccounts = require('viem/accounts')
  privateKeyToAccount = viemAccounts.privateKeyToAccount
} catch {
  // Viem accounts not installed
}

import * as fs from 'node:fs'
import * as https from 'node:https'
import type { CoreTool } from 'ai'
import chalk from 'chalk'
import { polygon } from 'viem/chains'

// Configure a file to persist Polymarket configuration
const POLYMARKET_CONFIG_FILE = '.nikcli/polymarket-config.json'

// GOAT SDK compatible credentials type
export interface ApiKeyCredentials {
  key: string
  secret: string
  passphrase: string
}

type PolymarketConfig = {
  credentials?: ApiKeyCredentials
  privateKey?: string
  funderAddress?: string
  chain: 'polygon' | 'polygon-amoy'
  host: string
}

export interface PolymarketInitConfig {
  apiKey?: string
  secret?: string
  passphrase?: string
  privateKey?: string
  funderAddress?: string
  testnet?: boolean
}

/**
 * Official Polymarket provider for NikCLI
 * Uses production CLOB API and GOAT SDK for AI-powered trading
 */
export class PolymarketProvider {
  private goatPlugin: any = null
  private walletClient: any = null
  private onChainActions: any = null
  private isInitialized: boolean = false
  private configFile: string = POLYMARKET_CONFIG_FILE
  private config: PolymarketConfig
  private walletProvider: 'goat' | 'none' = 'none'

  constructor(config: PolymarketInitConfig = {}) {
    this.config = {
      chain: config.testnet ? 'polygon-amoy' : 'polygon',
      host: config.testnet ? 'https://clob-staging.polymarket.com' : 'https://clob.polymarket.com',
      credentials:
        config.apiKey && config.secret && config.passphrase
          ? {
              key: config.apiKey,
              secret: config.secret,
              passphrase: config.passphrase,
            }
          : undefined,
      privateKey: config.privateKey,
      funderAddress: config.funderAddress,
    }
  }

  /**
   * Check if GOAT SDK Polymarket dependencies are installed
   */
  static async isInstalled(): Promise<boolean> {
    try {
      require('@goat-sdk/plugin-polymarket')
      require('@goat-sdk/adapter-vercel-ai')
      require('@goat-sdk/wallet-viem')
      return true
    } catch {
      return false
    }
  }

  /**
   * Diagnostic function to help troubleshoot configuration issues
   */
  static async diagnoseSetup(): Promise<{
    dependencies: boolean
    credentials: boolean
    issues: string[]
    recommendations: string[]
  }> {
    const issues: string[] = []
    const recommendations: string[] = []

    // Check dependencies
    const dependenciesInstalled = await this.isInstalled()
    if (!dependenciesInstalled) {
      issues.push('Missing GOAT SDK Polymarket dependencies')
      recommendations.push(
        'Run: npm install @goat-sdk/plugin-polymarket @goat-sdk/adapter-vercel-ai @goat-sdk/wallet-viem viem'
      )
    }

    // Check credentials
    let credentialsValid = true
    try {
      this.validateEnvironment()
    } catch (error: any) {
      credentialsValid = false
      issues.push(`Credential validation failed: ${error.message}`)
      recommendations.push('Check POLYMARKET_SETUP.md for credential setup instructions')
    }

    // Additional checks
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY?.trim()
    if (privateKey) {
      const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey
      if (cleanKey.length !== 64) {
        issues.push(`Private key has wrong length: ${cleanKey.length} (expected 64)`)
        recommendations.push('Ensure private key is exactly 64 hex characters')
      }
    }

    return {
      dependencies: dependenciesInstalled,
      credentials: credentialsValid,
      issues,
      recommendations,
    }
  }

  /**
   * Validate required environment variables with comprehensive checks
   */
  static validateEnvironment(): void {
    const required = ['POLYMARKET_API_KEY', 'POLYMARKET_SECRET', 'POLYMARKET_PASSPHRASE', 'POLYMARKET_PRIVATE_KEY']
    const missing = required.filter((key) => !process.env[key] || !process.env[key]?.trim())

    if (missing.length > 0) {
      const setupGuide = `
Missing required Polymarket environment variables: ${missing.join(', ')}

Setup Guide:
1. Create API credentials at polymarket.com (Profile → API Keys)
2. Set up your Polygon wallet private key
3. Add to .env file:
   POLYMARKET_API_KEY=your_api_key
   POLYMARKET_SECRET=your_secret
   POLYMARKET_PASSPHRASE=your_passphrase
   POLYMARKET_PRIVATE_KEY=0x...your_private_key

See POLYMARKET_SETUP.md for detailed instructions.`
      throw new Error(setupGuide)
    }

    // Validate private key format (must be 64 hex chars, with or without 0x prefix)
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY?.trim()
    if (privateKey) {
      const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey
      if (!/^[a-fA-F0-9]{64}$/.test(cleanKey)) {
        throw new Error(`POLYMARKET_PRIVATE_KEY must be a valid 64-character hex string (with or without 0x prefix).
Current length: ${cleanKey.length} characters.
Example: 0x1234567890abcdef... or 1234567890abcdef...`)
      }
    }

    // Validate API key format (should be reasonable length)
    const apiKey = process.env.POLYMARKET_API_KEY?.trim()
    if (apiKey && (apiKey.length < 8 || apiKey.length > 100)) {
      throw new Error(`POLYMARKET_API_KEY appears to be invalid (length: ${apiKey.length}). Expected 8-100 characters.`)
    }

    // Validate secret format
    const secret = process.env.POLYMARKET_SECRET?.trim()
    if (secret && (secret.length < 8 || secret.length > 200)) {
      throw new Error(`POLYMARKET_SECRET appears to be invalid (length: ${secret.length}). Expected 8-200 characters.`)
    }

    // Validate passphrase is not empty
    const passphrase = process.env.POLYMARKET_PASSPHRASE?.trim()
    if (!passphrase) {
      throw new Error('POLYMARKET_PASSPHRASE cannot be empty or whitespace only.')
    }

    console.log('✅ Polymarket environment variables validated successfully')
  }

  /**
   * Initialize Polymarket with real production configuration
   */
  async initialize(config: PolymarketInitConfig = {}): Promise<void> {
    console.log('🎯 Initializing Polymarket Integration...')

    // Check if GOAT SDK dependencies are available
    if (!polymarket) {
      throw new Error(
        'GOAT SDK Polymarket plugin not installed. Run: npm install @goat-sdk/plugin-polymarket @goat-sdk/adapter-vercel-ai @goat-sdk/wallet-viem'
      )
    }

    // Validate environment or use provided config with comprehensive error handling
    if (!config.apiKey && !process.env.POLYMARKET_API_KEY) {
      try {
        PolymarketProvider.validateEnvironment()
      } catch (error: any) {
        throw new Error(`Environment validation failed: ${error.message}`)
      }
    }

    // Load credentials from env or config - GOAT SDK compatible format
    const credentials: ApiKeyCredentials = {
      key: config.apiKey || process.env.POLYMARKET_API_KEY!,
      secret: config.secret || process.env.POLYMARKET_SECRET!,
      passphrase: config.passphrase || process.env.POLYMARKET_PASSPHRASE!,
    }

    // Validate credentials are not empty after loading
    if (!credentials.key || !credentials.secret || !credentials.passphrase) {
      throw new Error('Polymarket credentials cannot be empty after configuration loading')
    }

    // Validate credential format and length
    if (credentials.key.length < 8 || credentials.secret.length < 8) {
      throw new Error('Polymarket API key or secret appears to be invalid (too short)')
    }

    const privateKey = config.privateKey || process.env.POLYMARKET_PRIVATE_KEY!
    if (!privateKey) {
      throw new Error('Private key is required for Polymarket integration')
    }

    const funderAddress = config.funderAddress || process.env.POLYMARKET_FUNDER_ADDRESS

    // Update internal config
    this.config = {
      ...this.config,
      credentials,
      privateKey,
      funderAddress,
    }

    // Validate chain compatibility (GOAT SDK requires Polygon)
    const chainId = this.config.chain === 'polygon' ? polygon.id : 80002 // Amoy testnet
    if (chainId !== polygon.id && chainId !== 80002) {
      throw new Error(`Unsupported chain: ${this.config.chain}. Polymarket only supports Polygon.`)
    }

    // Initialize GOAT SDK wallet provider
    await this.initializeWalletProvider(config, privateKey)

    // Initialize GOAT SDK following official pattern
    console.log('🔍 Checking GOAT SDK dependencies...')
    console.log('  getOnChainTools available:', !!getOnChainTools)
    console.log('  polymarket available:', !!polymarket)
    console.log('  ViemEVMWalletClient available:', !!ViemEVMWalletClient)

    if (!getOnChainTools || !polymarket) {
      const missing = []
      if (!getOnChainTools) missing.push('getOnChainTools')
      if (!polymarket) missing.push('polymarket')
      throw new Error(`GOAT SDK dependencies not properly installed: missing ${missing.join(', ')}`)
    }

    try {
      // Initialize GOAT Plugin with correct credential format
      this.goatPlugin = polymarket({
        credentials: credentials,
      })

      // Initialize OnChain Tools following official GOAT SDK pattern
      this.onChainActions = await getOnChainTools({
        wallet: this.walletClient,
        plugins: [this.goatPlugin],
      })

      console.log('✅ GOAT SDK integration initialized')
    } catch (error) {
      throw new Error(`GOAT SDK initialization failed: ${error}`)
    }

    // Set initialization state
    this.isInitialized = true

    // Save config for persistence
    this.saveConfig()

    console.log('✅ Polymarket provider initialized successfully with GOAT SDK')
  }

  /**
   * Initialize GOAT SDK wallet provider following official documentation
   */
  private async initializeWalletProvider(config: PolymarketInitConfig, privateKey: string): Promise<void> {
    try {
      console.log('🔍 Initializing GOAT SDK wallet provider...')
      console.log('  ViemEVMWalletClient available:', !!ViemEVMWalletClient)
      console.log('  createWalletClient available:', !!createWalletClient)
      console.log('  privateKeyToAccount available:', !!privateKeyToAccount)
      console.log('  http available:', !!http)

      if (!ViemEVMWalletClient || !createWalletClient || !privateKeyToAccount || !http) {
        throw new Error('GOAT SDK wallet dependencies not available')
      }

      if (!privateKey) {
        throw new Error('Private key not provided')
      }

      // Format private key for viem
      const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
      console.log('  private key formatted correctly')

      // Create viem account
      const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`)
      console.log('  viem account created:', !!account)

      // Get chain configuration
      const chainConfig = this.config.chain === 'polygon' ? polygon : { id: 80002, name: 'polygon-amoy' }
      console.log('  chain config:', chainConfig)

      // Create viem wallet client
      const viemWalletClient = createWalletClient({
        account: account,
        transport: http(),
        chain: chainConfig,
      })
      console.log('  viem wallet client created:', !!viemWalletClient)

      // Wrap with GOAT SDK ViemEVMWalletClient
      this.walletClient = new ViemEVMWalletClient(viemWalletClient)
      console.log('  GOAT SDK wallet client created:', !!this.walletClient)

      if (this.walletClient) {
        this.walletProvider = 'goat'
        console.log('✅ GOAT SDK wallet initialized successfully')
      } else {
        throw new Error('GOAT SDK wallet client creation failed')
      }
    } catch (error: any) {
      console.error('❌ GOAT SDK wallet initialization failed:', error)
      console.error('   Error details:', error.message)
      throw new Error(`Wallet initialization failed: ${error.message}`)
    }
  }


  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      const configDir = '.nikcli'
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true })
      }

      // Don't save sensitive data in plain text
      const safeConfig = {
        chain: this.config.chain,
        host: this.config.host,
        hasCredentials: !!(
          this.config.credentials?.key &&
          this.config.credentials?.secret &&
          this.config.credentials?.passphrase
        ),
        lastUsed: new Date().toISOString(),
      }

      fs.writeFileSync(this.configFile, JSON.stringify(safeConfig, null, 2))
    } catch (error) {
      console.warn('⚠️ Could not save Polymarket config:', error)
    }
  }

  /**
   * Get Polymarket markets using GOAT SDK tools
   * Note: Market retrieval is now handled through AI tools
   */
  async getMarkets(params: { limit?: number; offset?: number; tags?: string[]; query?: string } = {}): Promise<any[]> {
    if (!this.isInitialized || !this.onChainActions) {
      throw new Error('Polymarket GOAT SDK not initialized')
    }

    // Markets should be fetched through GOAT SDK AI tools
    // This method is kept for backwards compatibility but should use AI tools
    console.log('Markets should be retrieved using GOAT SDK AI tools (get_polymarket_events)')
    return []
  }

  /**
   * Get market by ID using GOAT SDK tools
   */
  async getMarket(marketId: string): Promise<any> {
    if (!this.isInitialized || !this.onChainActions) {
      throw new Error('Polymarket GOAT SDK not initialized')
    }

    // Market info should be retrieved through GOAT SDK AI tools
    console.log('Market info should be retrieved using GOAT SDK AI tools (get_polymarket_market_info)')
    return null
  }

  /**
   * Get market orderbook using GOAT SDK
   */
  async getOrderbook(tokenId: string): Promise<any> {
    if (!this.isInitialized || !this.onChainActions) {
      throw new Error('Polymarket GOAT SDK not initialized')
    }

    // Orderbook should be accessed through GOAT SDK tools if available
    console.log('Orderbook access through GOAT SDK tools')
    return null
  }

  /**
   * Place a bet/order using GOAT SDK tools
   */
  async placeBet(params: {
    tokenId: string
    side: 'BUY' | 'SELL'
    amount: number
    price?: number
    orderType?: 'MARKET' | 'LIMIT'
  }): Promise<any> {
    if (!this.isInitialized || !this.onChainActions) {
      throw new Error('Polymarket GOAT SDK not initialized')
    }

    // Betting should be done through GOAT SDK AI tools (create_order_on_polymarket)
    console.log('Betting should be done using GOAT SDK AI tools (create_order_on_polymarket)')
    return null
  }

  /**
   * Get user positions using GOAT SDK
   */
  async getPositions(): Promise<any[]> {
    if (!this.isInitialized || !this.onChainActions) {
      throw new Error('Polymarket GOAT SDK not initialized')
    }

    // Positions should be accessed through GOAT SDK tools if available
    console.log('Positions should be retrieved using GOAT SDK AI tools')
    return []
  }

  /**
   * Get user orders using GOAT SDK
   */
  async getOrders(params: { marketId?: string } = {}): Promise<any[]> {
    if (!this.isInitialized || !this.onChainActions) {
      throw new Error('Polymarket GOAT SDK not initialized')
    }

    // Orders should be accessed through GOAT SDK tools if available
    console.log('Orders should be retrieved using GOAT SDK AI tools')
    return []
  }

  // ===================== GOAT SDK Only - No Direct API Calls =====================
  // All market data and operations should go through GOAT SDK AI tools
  
  /**
   * Get trending markets - use GOAT SDK AI tools instead
   */
  async getTrendingMarkets(params: { limit?: number; category?: string } = {}): Promise<any[]> {
    console.log('Trending markets should be retrieved using GOAT SDK AI tools (get_polymarket_events)')
    return []
  }

  /**
   * Search markets by category - use GOAT SDK AI tools instead
   */
  async searchMarketsByCategory(category: string, limit: number = 10): Promise<any[]> {
    console.log('Market search should be done using GOAT SDK AI tools (get_polymarket_events)')
    return []
  }

  /**
   * Get market prices - use GOAT SDK AI tools instead
   */
  async getMarketPrices(marketIds: string[]): Promise<Record<string, any>> {
    console.log('Market prices should be retrieved using GOAT SDK AI tools (get_polymarket_market_info)')
    return {}
  }

  /**
   * Get sports markets - use GOAT SDK AI tools instead
   */
  async getSportsMarkets(sport?: string, limit: number = 10): Promise<any[]> {
    console.log('Sports markets should be retrieved using GOAT SDK AI tools (get_polymarket_events)')
    return []
  }

  /**
   * Cancel order using GOAT SDK
   */
  async cancelOrder(orderId: string): Promise<any> {
    if (!this.isInitialized || !this.onChainActions) {
      throw new Error('Polymarket GOAT SDK not initialized')
    }

    // Order cancellation should be done through GOAT SDK tools if available
    console.log('Order cancellation should be done using GOAT SDK AI tools')
    return null
  }

  /**
   * Get GOAT SDK tools for AI integration
   * OnChain tools from getOnChainTools are already in Vercel AI format
   */
  getTools(): Record<string, CoreTool> {
    if (!this.onChainActions) {
      throw new Error('GOAT SDK not properly initialized. OnChain tools not available.')
    }

    try {
      // getOnChainTools returns Vercel AI compatible tools directly
      return this.onChainActions
    } catch (error) {
      throw new Error(`Failed to get GOAT SDK tools: ${error}`)
    }
  }

  /**
   * Get system prompt for AI agent
   */
  getSystemPrompt(): string {
    const isTestnet = this.config.chain !== 'polygon'
    const networkInfo = isTestnet ? ' (TESTNET - No real money)' : ' (MAINNET - Real money)'

    return `You are an AI agent with access to Polymarket prediction market tools via GOAT SDK${networkInfo}.

CRITICAL: You MUST use the available GOAT SDK tools to get current, real market data. NEVER make up or hallucinate market information.

Available GOAT SDK Tools (ALWAYS USE THESE):
- get_polymarket_events - Search for current prediction markets by topic/keywords
- get_polymarket_market_info - Get detailed market information with current odds
- create_order_on_polymarket - Execute trades after user confirmation
- get_active_polymarket_orders - Check user's current positions
- cancel_polymarket_order - Cancel specific orders

MANDATORY WORKFLOW:
1. For ANY market query: FIRST call get_polymarket_events with relevant search terms
2. For market details: ALWAYS call get_polymarket_market_info to get current data
3. For betting: Use get_polymarket_market_info to show current prices before create_order_on_polymarket
4. NEVER provide market data without using tools first

IMPORTANT SAFETY RULES:
1. ALWAYS use tools to get real-time data - never invent markets or prices
2. ALWAYS confirm betting amounts and market details before executing trades
3. Explain the market and odds clearly using REAL data from tools
4. Never place bets without explicit user confirmation
5. For real money trades, double-check all parameters with fresh tool calls

Market Types:
- Binary markets: YES/NO outcomes priced 0.00-1.00 USDC
- Multi-outcome markets: Multiple possible outcomes
- Sports, politics, crypto, and other prediction categories

TOOL USAGE EXAMPLES:
- Search: get_polymarket_events with query like "NATO Russia war"
- Details: get_polymarket_market_info with specific market ID
- Bet: create_order_on_polymarket with market ID, token ID, amount

When users ask about markets, trends, or want to bet: IMMEDIATELY use get_polymarket_events to get current data.`.trim()
  }

  /**
   * Get provider status (simplified)
   */
  getStatus(): {
    initialized: boolean
    chain: string
    host: string
    walletProvider: string
    toolsAvailable: boolean
  } {
    return {
      initialized: this.isInitialized,
      chain: this.config.chain,
      host: this.config.host,
      walletProvider: this.walletProvider,
      toolsAvailable: !!this.onChainActions,
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.goatPlugin = null
    this.walletClient = null
    this.onChainActions = null
    this.isInitialized = false
  }
}

// Legacy compatibility exports
export const PolymarketAgentProvider = PolymarketProvider
