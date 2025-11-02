/*
 * Official GOAT SDK Integration
 *
 * This module provides the official GOAT SDK integration adapted for NikCLI.
 * It uses the same architecture as the Coinbase AgentKit but for GOAT plugins.
 */

// Conditional imports for GOAT SDK (may not be installed)
let getOnChainTools: any = null
let viemWalletProvider: any = null
let polymarketPlugin: any = null
let erc20Plugin: any = null

try {
  const goatAdapter = require('@goat-sdk/adapter-vercel-ai')
  getOnChainTools = goatAdapter.getOnChainTools
} catch (e) {
  console.warn('⚠️ GOAT adapter import failed:', e)
}

try {
  const viemWallet = require('@goat-sdk/wallet-viem')
  viemWalletProvider = viemWallet.viem
} catch (e) {
  console.warn('⚠️ Viem wallet import failed:', e)
}

try {
  const polymarketModule = require('@goat-sdk/plugin-polymarket')
  polymarketPlugin = polymarketModule.polymarket
  // Store the createOrDeriveAPIKey function for later use
  polymarketPlugin.createOrDeriveAPIKey = polymarketModule.createOrDeriveAPIKey
} catch (e) {
  console.warn('⚠️ Polymarket plugin import failed:', e)
}

try {
  const erc20Module = require('@goat-sdk/plugin-erc20')
  erc20Plugin = erc20Module.erc20
  // Store standard tokens for use during initialization
  erc20Plugin.tokens = {
    USDC: erc20Module.USDC,
    WETH: erc20Module.WETH,
    PEPE: erc20Module.PEPE,
    MODE: erc20Module.MODE
  }
} catch (e) {
  console.warn('⚠️ ERC20 plugin import failed:', e)
}

import * as fs from 'node:fs'
import type { CoreTool } from 'ai'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createWalletClient, http } from 'viem'
import { base, polygon } from 'viem/chains'

// Configure file to persist wallet data
const WALLET_DATA_FILE = '.nikcli/nikcli-goat-wallet-data.txt'

type ChainConfig = {
  name: 'polygon' | 'base'
  rpcUrl: string
  chainId: number
}

export interface GoatConfig {
  walletDataPath?: string
  privateKey?: string
  chains?: ('polygon' | 'base')[]
  rpcUrls?: {
    polygon?: string
    base?: string
  }
  plugins?: ('polymarket' | 'erc20')[]
}

/**
 * Official GOAT SDK provider for NikCLI
 * Supports Polymarket and ERC20 operations on Polygon and Base
 */
export class GoatProvider {
  private tools: Record<string, CoreTool> = {}
  private walletProvider: any = null
  private walletDataFile: string
  private supportedChains: ChainConfig[] = []
  private enabledPlugins: string[] = []

  constructor(config: GoatConfig = {}) {
    this.walletDataFile = config.walletDataPath || WALLET_DATA_FILE
  }

  /**
   * Check if GOAT SDK dependencies are installed
   */
  static async isInstalled(): Promise<boolean> {
    try {
      require('@goat-sdk/adapter-vercel-ai')
      require('@goat-sdk/wallet-viem')
      return true
    } catch {
      return false
    }
  }

  /**
   * Validate required environment variables
   */
  static validateEnvironment(): void {
    const privateKey = process.env.GOAT_EVM_PRIVATE_KEY
    if (!privateKey) {
      throw new Error('GOAT_EVM_PRIVATE_KEY is required')
    }

    // Validate private key format - must start with 0x
    if (!privateKey.match(/^0x[0-9a-fA-F]{64}$/)) {
      throw new Error('GOAT_EVM_PRIVATE_KEY must be a hex string with 0x prefix (0x followed by 64 hex characters)')
    }
  }

  /**
   * Initialize GOAT SDK with plugins and chains
   */
  async initialize(config: GoatConfig = {}): Promise<void> {
    // Validate environment
    GoatProvider.validateEnvironment()

    // Check if dependencies are installed
    const isInstalled = await GoatProvider.isInstalled()
    if (!isInstalled) {
      throw new Error('GOAT SDK dependencies not installed. Run: bun add @goat-sdk/adapter-vercel-ai @goat-sdk/wallet-viem @goat-sdk/plugin-polymarket @goat-sdk/plugin-erc20')
    }

    // Setup chains
    await this.setupChains(config)

    // Setup wallet
    await this.setupWallet(config)

    // Setup plugins
    await this.setupPlugins(config)

    // Generate AI SDK tools
    await this.generateTools()

    console.log('✓ GOAT SDK initialized successfully')
    console.log(`✓ Chains: ${this.supportedChains.map(c => c.name).join(', ')}`)
    console.log(`✓ Plugins: ${this.enabledPlugins.join(', ')}`)
  }

  /**
   * Setup blockchain configurations
   */
  private async setupChains(config: GoatConfig): Promise<void> {
    const chains = config.chains || ['polygon', 'base']
    const rpcUrls = config.rpcUrls || {}

    for (const chainName of chains) {
      let chainConfig: ChainConfig

      switch (chainName) {
        case 'polygon':
          chainConfig = {
            name: 'polygon',
            rpcUrl: rpcUrls.polygon || process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
            chainId: 137
          }
          break
        case 'base':
          chainConfig = {
            name: 'base',
            rpcUrl: rpcUrls.base || process.env.BASE_RPC_URL || 'https://mainnet.base.org',
            chainId: 8453
          }
          break
        default:
          chainConfig = {
            name: 'polygon',
            rpcUrl: rpcUrls.polygon || process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
            chainId: 137
          }
          break

      }

      this.supportedChains.push(chainConfig)
    }
  }

  /**
   * Setup wallet provider
   */
  private async setupWallet(config: GoatConfig): Promise<void> {
    if (!viemWalletProvider) {
      throw new Error('Viem wallet provider not available. Ensure @goat-sdk/wallet-viem is installed.')
    }

    const privateKey = (config.privateKey || process.env.GOAT_EVM_PRIVATE_KEY) as Hex
    if (!privateKey.startsWith('0x')) {
      throw new Error('GOAT_EVM_PRIVATE_KEY must start with 0x prefix')
    }

    const account = privateKeyToAccount(privateKey)

    // Create wallet client for the first supported chain (primary)
    const primaryChain = this.supportedChains[0]
    const viemChain = primaryChain.name === 'polygon' ? polygon : base

    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport: http(primaryChain.rpcUrl)
    })

    // Initialize GOAT wallet provider - viem() takes WalletClient directly
    this.walletProvider = viemWalletProvider(walletClient)

    // Save wallet data for persistence
    this.saveWalletData(account.address)
  }

  /**
   * Setup GOAT plugins
   */
  private async setupPlugins(config: GoatConfig): Promise<void> {
    const plugins = config.plugins || ['polymarket', 'erc20']

    for (const pluginName of plugins) {
      switch (pluginName) {
        case 'polymarket':
          if (polymarketPlugin) {
            this.enabledPlugins.push('polymarket')
          } else {
            console.warn('⚠️ Polymarket plugin not available')
          }
          break
        case 'erc20':
          if (erc20Plugin) {
            this.enabledPlugins.push('erc20')
          } else {
            console.warn('⚠️ ERC20 plugin not available')
          }
          break
        default:
          console.warn(`⚠️ Unknown plugin: ${pluginName}`)
      }
    }

    if (this.enabledPlugins.length === 0) {
      throw new Error('No plugins available. Please install GOAT SDK plugin packages.')
    }
  }

  /**
   * Generate AI SDK compatible tools
   */
  private async generateTools(): Promise<void> {
    if (!getOnChainTools) {
      throw new Error('GOAT Vercel AI adapter not available')
    }

    const pluginInstances = []

    // Initialize enabled plugins
    for (const pluginName of this.enabledPlugins) {
      switch (pluginName) {
        case 'polymarket':
          if (polymarketPlugin && polymarketPlugin.createOrDeriveAPIKey) {
            try {
              // Generate or derive API credentials from wallet
              console.log('🔑 Generating Polymarket API credentials...')
              const credentials = await polymarketPlugin.createOrDeriveAPIKey(this.walletProvider)
              pluginInstances.push(polymarketPlugin({ credentials }))
              console.log('✓ Polymarket plugin configured')
            } catch (error: any) {
              console.warn('⚠️ Failed to create Polymarket credentials:', error.message)
              console.log('ℹ️ Polymarket plugin skipped - credentials required')
            }
          }
          break
        case 'erc20':
          if (erc20Plugin && erc20Plugin.tokens) {
            // Use standard tokens for Polygon and Base
            const tokens = [
              erc20Plugin.tokens.USDC,  // Stablecoin principale per pagamenti
              erc20Plugin.tokens.WETH,  // Wrapped ETH per DEX e DeFi
              erc20Plugin.tokens.PEPE,  // Meme coin popolare su Base
            ].filter(Boolean)

            if (tokens.length > 0) {
              pluginInstances.push(erc20Plugin({ tokens }))
              console.log(`✓ ERC20 plugin configured with ${tokens.length} tokens`)
            } else {
              console.warn('⚠️ No ERC20 tokens available for configuration')
            }
          } else {
            console.warn('⚠️ ERC20 plugin not properly initialized')
          }
          break
      }
    }

    if (pluginInstances.length === 0) {
      console.warn('⚠️ No plugins were successfully initialized')
    }

    // Generate tools using GOAT adapter
    this.tools = await getOnChainTools({
      wallet: this.walletProvider,
      plugins: pluginInstances
    })
  }

  /**
   * Get AI SDK compatible tools
   */
  getTools(): Record<string, CoreTool> {
    return this.tools
  }

  /**
   * Get system prompt for GOAT operations
   */
  getSystemPrompt(): string {
    return `You are a GOAT SDK assistant that can perform blockchain operations on Polygon and Base networks.

Available capabilities:
${this.enabledPlugins.includes('polymarket') ? '- Polymarket: Create and interact with prediction markets' : ''}
${this.enabledPlugins.includes('erc20') ? '- ERC20: Transfer and manage ERC20 tokens' : ''}

Supported networks: ${this.supportedChains.map(c => c.name).join(', ')}

IMPORTANT SAFETY RULES:
1. ALWAYS confirm transaction details with the user before executing
2. Show gas estimates and fees before proceeding
3. Never execute transactions without explicit user approval
4. Use read-only operations when possible
5. Validate all addresses and amounts before transactions

For any blockchain transaction, provide a clear summary including:
- Action to be performed
- Network/chain
- Token/asset details
- Amounts and recipients
- Estimated gas fees`
  }

  /**
   * Get supported chains
   */
  getSupportedChains(): ChainConfig[] {
    return this.supportedChains
  }

  /**
   * Get enabled plugins
   */
  getEnabledPlugins(): string[] {
    return this.enabledPlugins
  }

  /**
   * Save wallet data for persistence
   */
  private saveWalletData(address: string): void {
    try {
      const walletData = {
        address,
        chains: this.supportedChains.map(c => c.name),
        plugins: this.enabledPlugins,
        updatedAt: new Date().toISOString()
      }

      // Ensure directory exists
      const dir = this.walletDataFile.split('/').slice(0, -1).join('/')
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(this.walletDataFile, JSON.stringify(walletData, null, 2))
      console.log(`✓ GOAT wallet data saved to ${this.walletDataFile}`)
    } catch (error) {
      console.warn('⚠️ Could not save wallet data:', error)
    }
  }

  /**
   * Get wallet info
   */
  async getWalletInfo(): Promise<any> {
    if (!this.walletProvider) {
      throw new Error('Wallet provider not initialized')
    }

    try {
      const walletData = JSON.parse(fs.readFileSync(this.walletDataFile, 'utf8'))
      return {
        address: walletData.address,
        chains: walletData.chains,
        plugins: walletData.plugins,
        updatedAt: walletData.updatedAt
      }
    } catch {
      return {
        address: 'Unknown',
        chains: this.supportedChains.map(c => c.name),
        plugins: this.enabledPlugins,
        updatedAt: new Date().toISOString()
      }
    }
  }
}
