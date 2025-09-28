/*
 * Official Polymarket Integration for NikCLI
 *
 * Production-ready integration with Polymarket's CLOB API and GOAT SDK
 * Follows the same architecture as Coinbase AgentKit provider
 */

// Conditional imports for Polymarket dependencies
let ClobClient: any = null
let OrderType: any = null
let Side: any = null
let polymarket: any = null

try {
  const clobClient = require('@polymarket/clob-client')
  ClobClient = clobClient.ClobClient
  OrderType = clobClient.OrderType
  Side = clobClient.Side
} catch {
  // CLOB client not installed
}

try {
  const goatPolymarket = require('@goat-sdk/plugin-polymarket')
  polymarket = goatPolymarket.polymarket
} catch {
  // GOAT SDK not installed
}

// GOAT SDK core imports for proper integration
let getOnChainTools: any = null
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

// GOAT SDK Vercel AI adapter for tool conversion - using same module as getOnChainTools
let getVercelAITools: any = null
try {
  const goatAdapterVercelAI = require('@goat-sdk/adapter-vercel-ai')
  getVercelAITools = goatAdapterVercelAI.getVercelAITools
} catch {
  // Adapter not available
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
  private clobClient: any = null
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
   * Check if Polymarket dependencies are installed
   */
  static async isInstalled(): Promise<boolean> {
    try {
      require('@polymarket/clob-client')
      // GOAT SDK is optional - we can work without it
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
      issues.push('Missing Polymarket dependencies')
      recommendations.push(
        'Run: npm install @polymarket/clob-client @goat-sdk/plugin-polymarket @goat-sdk/adapter-vercel-ai @goat-sdk/wallet-viem viem'
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

    // Check if dependencies are available
    if (!ClobClient || !polymarket) {
      throw new Error(
        'Polymarket dependencies not installed. Run: npm install @polymarket/clob-client @goat-sdk/plugin-polymarket'
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

    // Initialize CLOB Client for direct trading
    this.clobClient = new ClobClient(this.config.host, chainId, credentials, privateKey, funderAddress)

    // Smart wallet provider selection and initialization
    await this.initializeWalletProvider(config, privateKey)

    // Initialize GOAT SDK following official pattern
    console.log('🔍 Checking GOAT SDK dependencies...')
    console.log('  getOnChainTools available:', !!getOnChainTools)
    console.log('  polymarket available:', !!polymarket)
    console.log('  getVercelAITools available:', !!getVercelAITools)

    if (!getOnChainTools || !polymarket) {
      const missing = []
      if (!getOnChainTools) missing.push('getOnChainTools')
      if (!polymarket) missing.push('polymarket')
      throw new Error(`GOAT SDK dependencies not properly installed: missing ${missing.join(', ')}`)
    }

    try {
      // Initialize GOAT Plugin
      this.goatPlugin = polymarket({
        credentials: credentials,
      })

      // Initialize OnChain Tools following viem pattern
      this.onChainActions = await getOnChainTools({
        wallet: this.walletClient,
        plugins: [this.goatPlugin],
      })

      console.log('✅ GOAT SDK integration initialized')
    } catch (error) {
      throw new Error(`GOAT SDK initialization failed: ${error}`)
    }

    // Test connection
    try {
      await this.testConnection()
      this.isInitialized = true

      // Save config for persistence
      this.saveConfig()

      console.log('✅ Polymarket provider initialized successfully')
    } catch (error) {
      throw new Error(`Polymarket initialization failed: ${error}`)
    }
  }

  /**
   * Initialize GOAT SDK wallet provider (simplified, following Coinbase pattern)
   */
  private async initializeWalletProvider(config: PolymarketInitConfig, privateKey: string): Promise<void> {
    try {
      console.log('🔍 Debugging wallet initialization with viem structure...')
      console.log('  viem available:', !!viem)
      console.log('  createWalletClient available:', !!createWalletClient)
      console.log('  privateKeyToAccount available:', !!privateKeyToAccount)
      console.log('  http available:', !!http)
      console.log('  privateKey provided:', !!privateKey)
      console.log('  privateKey length:', privateKey?.length || 0)

      if (!viem) {
        throw new Error('viem wrapper function not available from @goat-sdk/wallet-viem')
      }

      if (!createWalletClient || !privateKeyToAccount || !http) {
        throw new Error('viem dependencies not available (createWalletClient, privateKeyToAccount, http)')
      }

      if (!privateKey) {
        throw new Error('Private key not provided')
      }

      // Ensure private key has 0x prefix for viem
      const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
      console.log('  formattedPrivateKey length:', formattedPrivateKey.length)

      // Create account from private key
      const account = privateKeyToAccount(formattedPrivateKey as `0x${string}`)
      console.log('  account created:', !!account)

      // GOAT SDK uses viem chain objects
      const chainConfig = this.config.chain === 'polygon' ? polygon : { id: 80002, name: 'polygon-amoy' }
      console.log('  chain config:', chainConfig)

      console.log('🔧 Creating viem wallet client...')
      const walletClient = createWalletClient({
        account: account,
        transport: http(),
        chain: chainConfig,
      })

      console.log('🔧 Wrapping with GOAT SDK viem wrapper...')
      this.walletClient = viem(walletClient)

      if (this.walletClient) {
        this.walletProvider = 'goat'
        console.log('✅ GOAT SDK viem wallet initialized successfully')
      } else {
        throw new Error('viem wrapper returned null/undefined')
      }
    } catch (error: any) {
      console.error('❌ GOAT viem wallet initialization failed:', error)
      console.error('   Error details:', error.message)
      console.error('   Stack:', error.stack)
      throw new Error(`Wallet initialization failed: ${error.message}`)
    }
  }

  /**
   * Test connection to Polymarket CLOB
   */
  private async testConnection(): Promise<void> {
    try {
      // Test basic API connectivity
      await this.clobClient.getMarkets({ limit: 1 })
    } catch (error) {
      throw new Error(`CLOB connection test failed: ${error}`)
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
   * Get Polymarket markets
   */
  async getMarkets(params: { limit?: number; offset?: number; tags?: string[]; query?: string } = {}): Promise<any[]> {
    if (!this.isInitialized || !this.clobClient) {
      throw new Error('Polymarket not initialized')
    }

    try {
      console.log(chalk.blue(`🔍 Fetching ACTIVE markets from CLOB client (official method)...`))

      // Use CLOB client as primary method with ACTIVE filters at API level
      const currentDate = new Date()
      const currentYear = currentDate.getFullYear() // 2025
      const futureDate = new Date(currentYear, 0, 1) // 1 Jan 2025
      const futureTimestamp = Math.floor(futureDate.getTime() / 1000) // UNIX timestamp in seconds

      console.log(
        chalk.gray(`📅 Filtering markets with end_date >= ${futureDate.toISOString()} (timestamp: ${futureTimestamp})`)
      )

      const markets = await Promise.race([
        this.clobClient.getMarkets({
          limit: Math.min(params.limit || 50, 100),
          offset: params.offset || 0,
          tags: params.tags,
          ...(params.query && { search: params.query }),
          // API-level filters to exclude old markets at the source (UNIX timestamp format)
          active: true,
          closed: false,
          enable_order_book: true,
          endTs: futureTimestamp, // Only markets ending after 2025 (UNIX timestamp)
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('CLOB API timeout after 30 seconds')), 30000)),
      ])

      // Validate response structure
      if (!markets) {
        throw new Error('CLOB API returned null/undefined response')
      }

      const list: any[] = Array.isArray(markets) ? markets : markets.data || []

      if (!Array.isArray(list)) {
        throw new Error(`CLOB API returned invalid data structure. Expected array, got: ${typeof list}`)
      }

      console.log(chalk.gray(`📊 CLOB client returned ${list.length} markets`))

      // Filter for CURRENT markets (2025 onwards) and ACTIVE status
      // currentDate and currentYear already declared above

      const activeMarkets = list.filter((m) => {
        try {
          // Validate market object
          if (!m || typeof m !== 'object') {
            console.log(chalk.red(`  ❌ Invalid market object: ${JSON.stringify(m)}`))
            return false
          }

          // Check if market is active/open
          const isActive = m.active !== false && m.closed !== true && m.enable_order_book !== false

          // Check end date - should be in the future (2025+)
          const endDate = m.end_date || m.endDate || m.close_time || m.end_date_iso
          let isCurrent = true

          if (endDate) {
            try {
              const marketEndDate = new Date(endDate)

              // Validate date parsing
              if (isNaN(marketEndDate.getTime())) {
                console.log(chalk.yellow(`  ⚠️ Invalid date format: "${endDate}" for market "${m.title || m.question}"`))
                isCurrent = false
              } else {
                isCurrent = marketEndDate > currentDate && marketEndDate.getFullYear() >= currentYear
              }
            } catch (dateError) {
              console.log(chalk.red(`  ❌ Date parsing error for "${endDate}": ${dateError}`))
              isCurrent = false
            }
          }

          // Log filtering for debugging
          if (!isActive || !isCurrent) {
            console.log(
              chalk.yellow(
                `  ⚠️ Filtered out: "${m.title || m.question}" (active: ${isActive}, current: ${isCurrent}, endDate: ${endDate})`
              )
            )
          }

          return isActive && isCurrent
        } catch (filterError) {
          console.log(chalk.red(`  ❌ Filter error for market: ${filterError}`))
          return false
        }
      })

      console.log(chalk.green(`✅ Found ${activeMarkets.length} ACTIVE current markets`))

      // Clamp and summarize to avoid giant payloads
      const max = Math.min(params.limit || 20, 20)
      return activeMarkets.slice(0, max).map((m) => ({
        id: m.id ?? m.market_id ?? m.condition_id, // never fall back to slug for id
        slug: m.slug,
        title: m.title ?? m.question ?? m.description ?? m.slug,
        tags: (m.tags ?? m.category) ? [m.category] : [],
        volume: m.volume ?? m.liquidity ?? m.volume_24hr ?? undefined,
        endDate: m.end_date ?? m.endDate ?? m.close_time ?? m.end_date_iso,
        active: m.active,
        closed: m.closed,
        enable_order_book: m.enable_order_book,
      }))
    } catch (error) {
      console.log(chalk.red(`❌ CLOB client failed: ${error}`))
      throw new Error(`Failed to get markets: ${error}`)
    }
  }

  /**
   * Get market by ID
   */
  async getMarket(marketId: string): Promise<any> {
    if (!this.isInitialized || !this.clobClient) {
      throw new Error('Polymarket not initialized')
    }

    try {
      return await this.clobClient.getMarket(marketId)
    } catch (error) {
      throw new Error(`Failed to get market ${marketId}: ${error}`)
    }
  }

  /**
   * Get market orderbook
   */
  async getOrderbook(tokenId: string): Promise<any> {
    if (!this.isInitialized || !this.clobClient) {
      throw new Error('Polymarket not initialized')
    }

    try {
      return await this.clobClient.getOrderBook(tokenId)
    } catch (error) {
      throw new Error(`Failed to get orderbook for ${tokenId}: ${error}`)
    }
  }

  /**
   * Place a bet/order on Polymarket
   */
  async placeBet(params: {
    tokenId: string
    side: 'BUY' | 'SELL'
    amount: number
    price?: number
    orderType?: 'MARKET' | 'LIMIT'
  }): Promise<any> {
    if (!this.isInitialized || !this.clobClient) {
      throw new Error('Polymarket not initialized')
    }

    // Validate bet parameters
    if (!params.tokenId || typeof params.tokenId !== 'string') {
      throw new Error('Valid tokenId is required for betting')
    }

    if (!params.side || !['BUY', 'SELL'].includes(params.side)) {
      throw new Error('Valid side (BUY or SELL) is required for betting')
    }

    if (!params.amount || typeof params.amount !== 'number' || params.amount <= 0) {
      throw new Error('Valid positive amount is required for betting')
    }

    if (params.amount < 0.01) {
      throw new Error('Minimum bet amount is 0.01 USDC')
    }

    if (params.amount > 10000) {
      throw new Error('Maximum bet amount is 10,000 USDC for safety')
    }

    try {
      console.log(chalk.blue(`💰 Placing ${params.side} bet: ${params.amount} USDC on token ${params.tokenId}`))

      const orderType = params.orderType || 'MARKET'

      if (orderType === 'MARKET') {
        // Market order
        const orderResult = await Promise.race([
          this.clobClient.postOrder({
            tokenID: params.tokenId,
            side: params.side === 'BUY' ? Side.BUY : Side.SELL,
            size: params.amount.toString(),
            orderType: OrderType.MARKET,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Bet placement timeout after 60 seconds')), 60000)
          ),
        ])

        console.log(chalk.green(`✅ Market order placed successfully`))
        return orderResult
      } else {
        // Limit order
        if (!params.price || typeof params.price !== 'number' || params.price <= 0 || params.price > 1) {
          throw new Error('Valid price between 0 and 1 is required for limit orders')
        }

        const orderResult = await Promise.race([
          this.clobClient.postOrder({
            tokenID: params.tokenId,
            side: params.side === 'BUY' ? Side.BUY : Side.SELL,
            size: params.amount.toString(),
            price: params.price.toString(),
            orderType: OrderType.LIMIT,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Limit order placement timeout after 60 seconds')), 60000)
          ),
        ])

        console.log(chalk.green(`✅ Limit order placed successfully`))
        return orderResult
      }
    } catch (error) {
      throw new Error(`Failed to place bet: ${error}`)
    }
  }

  /**
   * Get user positions
   */
  async getPositions(): Promise<any[]> {
    if (!this.isInitialized || !this.clobClient) {
      throw new Error('Polymarket not initialized')
    }

    try {
      return await this.clobClient.getPositions()
    } catch (error) {
      throw new Error(`Failed to get positions: ${error}`)
    }
  }

  /**
   * Get user orders
   */
  async getOrders(params: { marketId?: string } = {}): Promise<any[]> {
    if (!this.isInitialized || !this.clobClient) {
      throw new Error('Polymarket not initialized')
    }

    try {
      return await this.clobClient.getOrders(params.marketId)
    } catch (error) {
      throw new Error(`Failed to get orders: ${error}`)
    }
  }

  // ===================== GAMMA API (Complete Integration) =====================
  async fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PolymarketBot/1.0)',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      }

      https
        .get(url, options, (res) => {
          let data = ''
          res.on('data', (chunk) => (data += chunk))
          res.on('end', () => {
            try {
              // Log raw response for debugging
              console.log(
                chalk.gray(`🔍 Response status: ${res.statusCode}, first 100 chars: ${data.substring(0, 100)}`)
              )

              // Check if response is HTML (403/404 error)
              if (data.trim().startsWith('<')) {
                reject(
                  new Error(
                    `API returned HTML instead of JSON (status: ${res.statusCode}). Likely blocked or wrong endpoint.`
                  )
                )
                return
              }

              // Check for empty response
              if (!data.trim()) {
                reject(new Error(`Empty response from API (status: ${res.statusCode})`))
                return
              }

              const parsed = JSON.parse(data)
              resolve(parsed)
            } catch (error) {
              reject(
                new Error(`JSON parse error: ${error}. Status: ${res.statusCode}. Raw data: ${data.substring(0, 200)}`)
              )
            }
          })
        })
        .on('error', (error) => {
          reject(new Error(`Network error: ${error.message}`))
        })
    })
  }

  /**
   * Get trending markets from Gamma API
   */
  async getTrendingMarkets(params: { limit?: number; category?: string } = {}): Promise<any[]> {
    try {
      const limit = params.limit || 20
      console.log(chalk.blue(`🔥 Fetching TRENDING active markets...`))

      // Use CLOB client as primary method (correct according to docs)
      if (this.isInitialized && this.clobClient) {
        try {
          console.log(chalk.gray(`📡 Using CLOB client for trending markets...`))

          // Add API-level filters to exclude old markets at the source
          const currentDate = new Date()
          const currentYear = currentDate.getFullYear() // 2025
          const futureDate = new Date(currentYear, 0, 1) // 1 Jan 2025
          const futureTimestamp = Math.floor(futureDate.getTime() / 1000) // UNIX timestamp in seconds

          console.log(
            chalk.gray(
              `📅 Trending markets filter: end_date >= ${futureDate.toISOString()} (timestamp: ${futureTimestamp})`
            )
          )

          const markets = await this.clobClient.getMarkets({
            limit: Math.min(limit * 2, 50),
            ...(params.category && { tags: [params.category] }),
            // API-level filters to exclude old markets at the source (UNIX timestamp format)
            active: true,
            closed: false,
            enable_order_book: true,
            endTs: futureTimestamp, // Only markets ending after 2025 (UNIX timestamp)
          })

          const list: any[] = markets.data || markets

          // Filter for current markets (2025+) and sort by volume/activity
          // currentDate already declared above
          const activeMarkets = list
            .filter((m) => {
              const isActive = m.active !== false && m.closed !== true
              const endDate = m.end_date || m.endDate || m.close_time || m.end_date_iso
              if (endDate) {
                const marketEndDate = new Date(endDate)
                return isActive && marketEndDate > currentDate && marketEndDate.getFullYear() >= 2025
              }
              return isActive
            })
            .sort((a, b) => (b.volume || b.volume_24hr || 0) - (a.volume || a.volume_24hr || 0)) // Sort by volume for "trending"
            .slice(0, limit)

          console.log(chalk.green(`✅ Found ${activeMarkets.length} trending active markets via CLOB client`))
          return activeMarkets
        } catch (clientError) {
          console.log(chalk.yellow(`⚠️ CLOB client failed, trying Gamma fallback: ${clientError}`))
        }
      }

      // Fallback to Gamma API with date filters (UNIX timestamp format)
      const currentYear = new Date().getFullYear() // 2025
      const futureDate = new Date(currentYear, 0, 1) // 1 Jan 2025
      const futureTimestamp = Math.floor(futureDate.getTime() / 1000) // UNIX timestamp in seconds

      console.log(
        chalk.gray(
          `📅 Gamma API fallback filter: end_date >= ${futureDate.toISOString()} (timestamp: ${futureTimestamp})`
        )
      )

      let url = `https://gamma-api.polymarket.com/markets?limit=${limit}&active=true&closed=false&enable_order_book=true&endTs=${futureTimestamp}`
      if (params.category) {
        url += `&tag=${encodeURIComponent(params.category)}`
      }

      const response = await this.fetchJson(url)
      const markets = Array.isArray(response) ? response : response.data || []
      console.log(chalk.yellow(`📊 Gamma API returned ${markets.length} markets (may be older)`))
      return markets
    } catch (error) {
      console.log(chalk.red(`❌ Failed to get trending markets: ${error}`))
      return []
    }
  }

  /**
   * Search markets by category/tags via Gamma API
   */
  async searchMarketsByCategory(category: string, limit: number = 10): Promise<any[]> {
    try {
      const categories = ['sports', 'politics', 'crypto', 'science', 'entertainment']
      const searchCategory =
        categories.find((cat) => category.toLowerCase().includes(cat) || cat.includes(category.toLowerCase())) ||
        category

      // Add date filters to exclude old markets at API level (UNIX timestamp format)
      const currentYear = new Date().getFullYear() // 2025
      const futureDate = new Date(currentYear, 0, 1) // 1 Jan 2025
      const futureTimestamp = Math.floor(futureDate.getTime() / 1000) // UNIX timestamp in seconds

      console.log(
        chalk.gray(`📅 Category search filter: end_date >= ${futureDate.toISOString()} (timestamp: ${futureTimestamp})`)
      )

      const url = `https://gamma-api.polymarket.com/markets?tag=${encodeURIComponent(searchCategory)}&limit=${limit}&active=true&closed=false&enable_order_book=true&endTs=${futureTimestamp}`
      const response = await this.fetchJson(url)
      return Array.isArray(response) ? response : response.data || []
    } catch (error) {
      console.log(`Failed to search markets by category: ${error}`)
      return []
    }
  }

  /**
   * Get real-time market prices via Gamma API
   */
  async getMarketPrices(marketIds: string[]): Promise<Record<string, any>> {
    try {
      const prices: Record<string, any> = {}

      // Batch request for multiple markets
      for (const marketId of marketIds.slice(0, 10)) {
        // Limit to 10 for performance
        try {
          const url = `https://gamma-api.polymarket.com/markets/${marketId}`
          const market = await this.fetchJson(url)
          if (market) {
            prices[marketId] = {
              id: market.id,
              title: market.title || market.question,
              tokens: market.tokens || market.outcomes || [],
              volume: market.volume,
              liquidity: market.liquidity,
              endDate: market.end_date || market.endDate,
            }
          }
        } catch (error) {
          console.log(`Failed to get price for market ${marketId}: ${error}`)
        }
      }

      return prices
    } catch (error) {
      console.log(`Failed to get market prices: ${error}`)
      return {}
    }
  }

  /**
   * Get sports markets specifically
   */
  async getSportsMarkets(sport?: string, limit: number = 10): Promise<any[]> {
    try {
      let url = `https://gamma-api.polymarket.com/markets?tag=sports&limit=${limit}&active=true`

      if (sport) {
        // Add specific sport filter
        url += `&search=${encodeURIComponent(sport)}`
      }

      const response = await this.fetchJson(url)
      return Array.isArray(response) ? response : response.data || []
    } catch (error) {
      console.log(`Failed to get sports markets: ${error}`)
      return []
    }
  }

  /**
   * Fetch event by slug via Gamma API
   */
  async getEventBySlug(slug: string): Promise<any | null> {
    try {
      const url = `https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`
      return await this.fetchJson(url)
    } catch {
      return null
    }
  }

  /**
   * Fetch market by slug via Gamma API
   */
  async getMarketBySlug(slug: string): Promise<any | null> {
    try {
      const url = `https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(slug)}`
      return await this.fetchJson(url)
    } catch {
      return null
    }
  }

  /**
   * Resolve marketId and tokenId from slug and desired outcome
   */
  async resolveFromSlug(
    slug: string,
    outcome: 'YES' | 'NO' = 'YES'
  ): Promise<{ marketId?: string; tokenId?: string } | undefined> {
    // Try direct market slug first
    const market = await this.getMarketBySlug(slug)
    const yesNoKeys = outcome === 'YES' ? ['YES', 'Y', 'TRUE'] : ['NO', 'N', 'FALSE']
    const pickToken = (m: any): string | undefined => {
      try {
        if (Array.isArray(m?.tokens)) {
          for (const t of m.tokens) {
            const name = String(t?.name || t?.outcome || '').toUpperCase()
            if (yesNoKeys.includes(name)) return t?.token_id || t?.tokenId || t?.id
          }
        }
        if (Array.isArray(m?.outcomes)) {
          for (const o of m.outcomes) {
            const name = String(o?.name || o?.outcome || '').toUpperCase()
            if (yesNoKeys.includes(name)) return o?.token_id || o?.tokenId || o?.id
          }
        }
        if (Array.isArray(m?.outcomeTokens)) {
          for (const t of m.outcomeTokens) {
            const name = String(t?.label || t?.name || '').toUpperCase()
            if (yesNoKeys.includes(name)) return t?.token_id || t?.tokenId || t?.id
          }
        }
      } catch {}
      return undefined
    }

    if (market && (market.id || market.market_id)) {
      const marketId = market.id || market.market_id
      const tokenId = pickToken(market)
      return { marketId, tokenId }
    }

    // Fallback: event slug → pick first market
    const event = await this.getEventBySlug(slug)
    if (event && Array.isArray(event.markets) && event.markets.length > 0) {
      const best = event.markets[0]
      const marketId = best.id || best.market_id
      const tokenId = pickToken(best)
      return { marketId, tokenId }
    }

    return undefined
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string): Promise<any> {
    if (!this.isInitialized || !this.clobClient) {
      throw new Error('Polymarket not initialized')
    }

    try {
      return await this.clobClient.cancelOrder(orderId)
    } catch (error) {
      throw new Error(`Failed to cancel order ${orderId}: ${error}`)
    }
  }

  /**
   * Get GOAT SDK tools for AI integration (following viem adapter pattern)
   */
  getTools(): Record<string, CoreTool> {
    if (!this.onChainActions) {
      throw new Error('GOAT SDK not properly initialized. OnChain tools not available.')
    }

    try {
      // getOnChainTools already returns Vercel AI compatible tools
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

    return `You are an AI agent with access to Polymarket tools for real-time prediction market data${networkInfo}.

CRITICAL: You MUST use the available tools to get current, real market data. NEVER make up or hallucinate market information.

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
    this.clobClient = null
    this.goatPlugin = null
    this.isInitialized = false
  }
}

// Legacy compatibility exports
export const PolymarketAgentProvider = PolymarketProvider
