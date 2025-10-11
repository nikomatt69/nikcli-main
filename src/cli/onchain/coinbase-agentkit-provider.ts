/*
 * Official Coinbase AgentKit Integration
 *
 * This module provides the official Coinbase AgentKit integration adapted for NikCLI.
 * It uses the same architecture as the official Coinbase CLI but adapted for our system.
 */

// Conditional imports for Coinbase AgentKit (may not be installed)
let AgentKit: any = null
let cdpApiActionProvider: any = null
let cdpSmartWalletActionProvider: any = null
let erc20ActionProvider: any = null
let pythActionProvider: any = null
let CdpSmartWalletProvider: any = null
let walletActionProvider: any = null
let _WalletProvider: any = null
let wethActionProvider: any = null
let getVercelAITools: any = null
let defillamaActionProvider: any = null

try {
  const agentkit = require('@coinbase/agentkit')
  AgentKit = agentkit.AgentKit
  cdpApiActionProvider = agentkit.cdpApiActionProvider
  cdpSmartWalletActionProvider = agentkit.cdpSmartWalletActionProvider
  erc20ActionProvider = agentkit.erc20ActionProvider
  pythActionProvider = agentkit.pythActionProvider
  CdpSmartWalletProvider = agentkit.CdpSmartWalletProvider
  walletActionProvider = agentkit.walletActionProvider
  _WalletProvider = agentkit.WalletProvider
  wethActionProvider = agentkit.wethActionProvider
  // Optional providers (may not be present in all versions)
  try {
    defillamaActionProvider = (agentkit as any).defillamaActionProvider
  } catch {}
} catch {
  // AgentKit not installed
}

try {
  const vercelSdk = require('@coinbase/agentkit-vercel-ai-sdk')
  getVercelAITools = vercelSdk.getVercelAITools
} catch {
  // Vercel SDK not installed
}

import * as fs from 'fs'
import type { CoreTool } from 'ai'
import type { Address, Hex, LocalAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Configure a file to persist the agent's Smart Wallet + Private Key data
const WALLET_DATA_FILE = '.nikcli/nikcli-wallet-data.txt'
const WALLET_LIST_FILE = '.nikcli/nikcli-wallets.json'

type WalletData = {
  privateKey?: Hex
  smartWalletAddress: Address
  ownerAddress?: Address
}

export interface AgentKitConfig {
  walletDataPath?: string
  walletAddress?: string
  networkId?: string
  paymasterUrl?: string
  rpcUrl?: string
}

/**
 * Official Coinbase AgentKit provider for NikCLI
 * Uses the exact same architecture as the official Coinbase CLI
 */
export class CoinbaseAgentKitProvider {
  private agentkit: any = null
  private walletProvider: any = null
  private walletDataFile: string
  private walletListFile: string = WALLET_LIST_FILE

  constructor(config: AgentKitConfig = {}) {
    this.walletDataFile = config.walletDataPath || WALLET_DATA_FILE
  }

  /**
   * Check if AgentKit dependencies are installed
   */
  static async isInstalled(): Promise<boolean> {
    try {
      require('@coinbase/agentkit')
      require('@coinbase/agentkit-vercel-ai-sdk')
      return true
    } catch {
      return false
    }
  }

  /**
   * Validate required environment variables
   */
  static validateEnvironment(): void {
    if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET || !process.env.CDP_WALLET_SECRET) {
      throw new Error(
        'Missing required environment variables. CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET are required.'
      )
    }
  }

  /**
   * Initialize AgentKit with official Coinbase configuration
   */
  async initialize(config: AgentKitConfig = {}): Promise<void> {
    // Validate environment
    CoinbaseAgentKitProvider.validateEnvironment()

    let walletData: WalletData | null = null
    let owner: Hex | LocalAccount | undefined

    // Read existing wallet data if available
    if (fs.existsSync(this.walletDataFile)) {
      try {
        walletData = JSON.parse(fs.readFileSync(this.walletDataFile, 'utf8')) as WalletData
        if (walletData.ownerAddress) owner = walletData.ownerAddress
        else if (walletData.privateKey) owner = privateKeyToAccount(walletData.privateKey as Hex)
        else
          console.log(
            `No ownerAddress or privateKey found in ${this.walletDataFile}, will create a new CDP server account as owner`
          )
      } catch (error) {
        console.error('Error reading wallet data:', error)
      }
    }

    // Initialize WalletProvider with official Coinbase configuration
    this.walletProvider = await CdpSmartWalletProvider.configureWithWallet({
      apiKeyId: process.env.CDP_API_KEY_ID!,
      apiKeySecret: process.env.CDP_API_KEY_SECRET!,
      walletSecret: process.env.CDP_WALLET_SECRET,
      networkId: process.env.NETWORK_ID || config.networkId || 'base-sepolia',
      owner: owner as any,
      address: config.walletAddress || walletData?.smartWalletAddress,
      paymasterUrl: process.env.PAYMASTER_URL || config.paymasterUrl,
      rpcUrl: process.env.RPC_URL || config.rpcUrl,
      idempotencyKey: process.env.IDEMPOTENCY_KEY,
    })

    // Initialize AgentKit with all official action providers
    this.agentkit = await AgentKit.from({
      walletProvider: this.walletProvider,
      actionProviders: [
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider(),
        cdpSmartWalletActionProvider(),
        // Add DefiLlama provider if available to enable TVL/price lookups
        ...(defillamaActionProvider ? [defillamaActionProvider()] : []),
      ],
    })

    // Save wallet data for persistence and track in wallet list
    if (this.walletProvider && typeof this.walletProvider.exportWallet === 'function') {
      try {
        const exportedWallet = await this.walletProvider.exportWallet()
        if (!walletData) {
          fs.writeFileSync(
            this.walletDataFile,
            JSON.stringify({
              ownerAddress: exportedWallet.ownerAddress,
              smartWalletAddress: exportedWallet.address,
            })
          )
          console.log(`✓ Wallet data saved to ${this.walletDataFile}`)
        }

        // Maintain simple wallet list for quick selection
        this.appendToWalletList({
          address: exportedWallet.address,
          ownerAddress: exportedWallet.ownerAddress,
          networkId: this.walletProvider.getNetwork?.().networkId || config.networkId || 'base-sepolia',
          updatedAt: new Date().toISOString(),
        })
      } catch (error) {
        console.warn('⚠️ Could not save wallet data:', error)
      }
    }

    console.log('✓ Coinbase AgentKit initialized successfully')
  }

  /**
   * Append or upsert an address into the local wallet list file
   */
  private appendToWalletList(entry: {
    address: string
    ownerAddress?: string
    networkId?: string
    updatedAt?: string
  }) {
    try {
      let list: any[] = []
      if (fs.existsSync(this.walletListFile)) {
        try {
          list = JSON.parse(fs.readFileSync(this.walletListFile, 'utf8'))
          if (!Array.isArray(list)) list = []
        } catch {
          list = []
        }
      }
      const idx = list.findIndex((w) => w.address?.toLowerCase() === entry.address.toLowerCase())
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...entry }
      } else {
        list.push(entry)
      }
      fs.writeFileSync(this.walletListFile, JSON.stringify(list, null, 2))
    } catch (_e) {
      // ignore
    }
  }

  /**
   * Return known wallets from local list
   */
  getKnownWallets(): Array<{ address: string; ownerAddress?: string; networkId?: string }> {
    try {
      if (!fs.existsSync(this.walletListFile)) return []
      const list = JSON.parse(fs.readFileSync(this.walletListFile, 'utf8'))
      if (Array.isArray(list)) return list
      return []
    } catch {
      return []
    }
  }

  /**
   * Get the official Vercel AI SDK tools from AgentKit
   */
  getTools(): Record<string, CoreTool> {
    if (!this.agentkit) {
      throw new Error('AgentKit not initialized. Call initialize() first.')
    }

    return getVercelAITools(this.agentkit)
  }

  /**
   * Get AgentKit instance for advanced usage
   */
  getAgentKit(): any {
    if (!this.agentkit) {
      throw new Error('AgentKit not initialized. Call initialize() first.')
    }
    return this.agentkit
  }

  /**
   * Get wallet provider for wallet operations
   */
  getWalletProvider(): any {
    if (!this.walletProvider) {
      throw new Error('WalletProvider not initialized. Call initialize() first.')
    }
    return this.walletProvider
  }

  /**
   * Get wallet information
   */
  async getWalletInfo(): Promise<{
    address: string
    networkId: string
    balance?: string
  }> {
    if (!this.walletProvider) {
      throw new Error('WalletProvider not initialized')
    }

    let address = 'Unknown'
    let networkId = 'Unknown'

    if (typeof this.walletProvider.exportWallet === 'function') {
      try {
        const exportedWallet = await this.walletProvider.exportWallet()
        address = exportedWallet.address
      } catch (error) {
        console.warn('⚠️ Could not get wallet address:', error)
      }
    }

    if (typeof this.walletProvider.getNetwork === 'function') {
      try {
        networkId = this.walletProvider.getNetwork().networkId
      } catch (error) {
        console.warn('⚠️ Could not get network ID:', error)
      }
    }

    return {
      address,
      networkId,
    }
  }

  /**
   * Check if the agent can use faucet (only on testnet)
   */
  canUseFaucet(): boolean {
    if (!this.walletProvider) return false
    return this.walletProvider.getNetwork().networkId === 'base-sepolia'
  }

  /**
   * Get system prompt for the agent
   */
  getSystemPrompt(): string {
    const canUseFaucet = this.canUseFaucet()
    const faucetMessage = `If you ever need funds, you can request them from the faucet.`
    const cantUseFaucetMessage = `If you need funds, you can provide your wallet details and request funds from the user.`

    return `
You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. You are 
empowered to interact onchain using your tools. ${canUseFaucet ? faucetMessage : cantUseFaucetMessage}.
Before executing your first action, get the wallet details to see what network 
you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone 
asks you to do something you can't do with your currently available tools, you must say so, and 
explain that they can add more capabilities by adding more action providers to your AgentKit configuration.
ALWAYS include this link when mentioning missing capabilities: https://github.com/coinbase/agentkit/tree/main/typescript/agentkit#action-providers
If users require more information regarding CDP or AgentKit, recommend they visit docs.cdp.coinbase.com for more information.
Be concise and helpful with your responses. Refrain from restating your tools' descriptions unless it is explicitly requested.
`.trim()
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // AgentKit handles cleanup automatically
    this.agentkit = null
    this.walletProvider = null
  }
}

// Legacy compatibility exports
export const AgentKitProvider = CoinbaseAgentKitProvider
export type { WalletData }
