/*
 * Polymarket Relayer Client
 *
 * Manages gasless transactions through Polymarket's relayer infrastructure
 * on Polygon. Handles Safe wallet deployment, transaction execution, and monitoring.
 * Uses builder credentials for cost-effective operations.
 */

import { EventEmitter } from 'events'

// ============================================================
// TYPE DEFINITIONS & INTERFACES
// ============================================================

export interface RelayerConfig {
  relayerUrl: string // e.g., https://clob.polymarket.com/relayer
  chainId: number // 137 for Polygon, 8453 for Base
  builderCredentials: {
    apiKey: string
    secret: string
    passphrase: string
  }
}

export interface SafeTransaction {
  to: string
  data: string
  value?: string
}

export interface ExecutionResponse {
  transactionHash: string
  status: 'pending' | 'confirmed' | 'failed'
  timestamp: number
  gasEstimate?: string
}

export interface TransactionStatus {
  transactionHash: string
  status: 'pending' | 'confirmed' | 'failed'
  blockNumber?: number
  confirmations?: number
  gasUsed?: string
  error?: string
}

export interface SafeWalletInfo {
  safeAddress: string
  chainId: number
  deployed: boolean
  deploymentTx?: string
}

// ============================================================
// RELAYER CLIENT
// ============================================================

export class PolymarketRelayerClient extends EventEmitter {
  private config: RelayerConfig
  private safeAddresses: Map<string, SafeWalletInfo> = new Map()
  private transactionHistory: Map<string, TransactionStatus> = new Map()
  private isInitialized: boolean = false

  constructor(config: RelayerConfig) {
    super()
    this.config = config
    this.validateConfig()
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.relayerUrl) {
      throw new Error('Relayer URL is required')
    }
    if (!this.config.chainId) {
      throw new Error('Chain ID is required')
    }
    if (!this.config.builderCredentials?.apiKey) {
      throw new Error('Builder API key is required')
    }
  }

  /**
   * Initialize relayer client
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔌 Initializing Polymarket Relayer Client...')

      // Verify relayer connectivity
      const isHealthy = await this.healthCheck()
      if (!isHealthy) {
        throw new Error('Relayer health check failed')
      }

      this.isInitialized = true
      console.log('✓ Relayer client initialized')
      this.emit('initialized')
    } catch (error: any) {
      console.error('❌ Relayer initialization failed:', error.message)
      throw error
    }
  }

  /**
   * Deploy Safe wallet for user
   * Returns Safe address that will handle gasless transactions
   */
  async deploySafe(userAddress: string): Promise<SafeWalletInfo> {
    this.validateInitialized()

    try {
      console.log(`🔐 Deploying Safe wallet for ${userAddress}...`)

      // In production, this would call the actual relayer API
      // For now, we simulate the deployment
      const safeAddress = await this.callRelayerAPI('POST', '/safe/deploy', {
        owner: userAddress,
        chainId: this.config.chainId,
      })

      const walletInfo: SafeWalletInfo = {
        safeAddress: safeAddress.address,
        chainId: this.config.chainId,
        deployed: true,
        deploymentTx: safeAddress.transactionHash,
      }

      this.safeAddresses.set(userAddress, walletInfo)
      console.log(`✓ Safe wallet deployed: ${safeAddress.address}`)
      this.emit('safeDeployed', walletInfo)

      return walletInfo
    } catch (error: any) {
      throw new Error(`Safe deployment failed: ${error.message}`)
    }
  }

  /**
   * Get Safe wallet for user (deploy if needed)
   */
  async getSafeWallet(userAddress: string): Promise<SafeWalletInfo> {
    this.validateInitialized()

    // Check cache
    const cached = this.safeAddresses.get(userAddress)
    if (cached) {
      return cached
    }

    // Deploy new Safe
    return await this.deploySafe(userAddress)
  }

  /**
   * Execute transactions on Safe wallet
   */
  async executeSafeTransactions(
    userAddress: string,
    transactions: SafeTransaction[]
  ): Promise<ExecutionResponse> {
    this.validateInitialized()

    if (!transactions.length) {
      throw new Error('At least one transaction is required')
    }

    try {
      console.log(`📤 Executing ${transactions.length} transaction(s)...`)

      // Get Safe wallet
      const safeWallet = await this.getSafeWallet(userAddress)

      // Execute transactions
      const result = await this.callRelayerAPI('POST', '/safe/execute', {
        safe: safeWallet.safeAddress,
        transactions: transactions,
        chainId: this.config.chainId,
      })

      const response: ExecutionResponse = {
        transactionHash: result.transactionHash,
        status: 'pending',
        timestamp: Date.now(),
        gasEstimate: result.gasEstimate,
      }

      // Store in history
      this.transactionHistory.set(result.transactionHash, {
        transactionHash: result.transactionHash,
        status: 'pending',
      })

      console.log(`✓ Transaction submitted: ${result.transactionHash}`)
      this.emit('transactionSubmitted', response)

      return response
    } catch (error: any) {
      throw new Error(`Transaction execution failed: ${error.message}`)
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async wait(
    transactionHash: string,
    confirmations: number = 1,
    timeout: number = 300000
  ): Promise<TransactionStatus> {
    this.validateInitialized()

    console.log(`⏳ Waiting for ${confirmations} confirmation(s)...`)

    const startTime = Date.now()
    const pollInterval = 2000 // 2 seconds

    while (Date.now() - startTime < timeout) {
      try {
        const status = await this.getTransactionStatus(transactionHash)

        if (status.status === 'confirmed' && status.confirmations! >= confirmations) {
          console.log(`✓ Transaction confirmed with ${status.confirmations} confirmations`)
          this.emit('transactionConfirmed', status)
          return status
        }

        if (status.status === 'failed') {
          throw new Error(`Transaction failed: ${status.error}`)
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval))
      } catch (error: any) {
        if (error.message.includes('Transaction failed')) {
          throw error
        }
        // Continue polling on temporary errors
      }
    }

    throw new Error(`Transaction confirmation timeout after ${timeout}ms`)
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(transactionHash: string): Promise<TransactionStatus> {
    this.validateInitialized()

    try {
      const result = await this.callRelayerAPI('GET', `/transaction/${transactionHash}`)

      const status: TransactionStatus = {
        transactionHash,
        status: result.status,
        blockNumber: result.blockNumber,
        confirmations: result.confirmations,
        gasUsed: result.gasUsed,
      }

      // Update history
      this.transactionHistory.set(transactionHash, status)

      return status
    } catch (error: any) {
      throw new Error(`Failed to get transaction status: ${error.message}`)
    }
  }

  /**
   * Get Safe wallet address for user
   */
  getSafeAddress(userAddress: string): string | null {
    return this.safeAddresses.get(userAddress)?.safeAddress || null
  }

  /**
   * Health check for relayer
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.callRelayerAPI('GET', '/health')
      return result.status === 'healthy'
    } catch (error) {
      console.error('❌ Relayer health check failed:', error)
      return false
    }
  }

  /**
   * Get relayer status
   */
  async getStatus(): Promise<any> {
    this.validateInitialized()

    try {
      return await this.callRelayerAPI('GET', '/status')
    } catch (error: any) {
      throw new Error(`Failed to get relayer status: ${error.message}`)
    }
  }

  /**
   * Estimate gas for transactions
   */
  async estimateGas(
    userAddress: string,
    transactions: SafeTransaction[]
  ): Promise<string> {
    this.validateInitialized()

    try {
      const safeWallet = await this.getSafeWallet(userAddress)

      const result = await this.callRelayerAPI('POST', '/gas/estimate', {
        safe: safeWallet.safeAddress,
        transactions: transactions,
        chainId: this.config.chainId,
      })

      return result.gasEstimate
    } catch (error: any) {
      throw new Error(`Gas estimation failed: ${error.message}`)
    }
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(limit: number = 100): TransactionStatus[] {
    return Array.from(this.transactionHistory.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Call relayer API with authentication
   */
  private async callRelayerAPI(
    method: string,
    path: string,
    body?: any
  ): Promise<any> {
    const url = `${this.config.relayerUrl}${path}`
    const timestamp = Math.floor(Date.now() / 1000).toString()

    // Create signature
    const message = timestamp + method + path + (body ? JSON.stringify(body) : '')
    const signature = this.createSignature(message)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'POLY_BUILDER_API_KEY': this.config.builderCredentials.apiKey,
      'POLY_BUILDER_TIMESTAMP': timestamp,
      'POLY_BUILDER_PASSPHRASE': this.config.builderCredentials.passphrase,
      'POLY_BUILDER_SIGNATURE': signature,
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || `HTTP ${response.status}`)
      }

      return await response.json()
    } catch (error: any) {
      throw new Error(`Relayer API call failed: ${error.message}`)
    }
  }

  /**
   * Create HMAC-SHA256 signature for builder authentication
   */
  private createSignature(message: string): string {
    const crypto = require('crypto')
    return crypto
      .createHmac('sha256', this.config.builderCredentials.secret)
      .update(message)
      .digest('hex')
  }

  /**
   * Validate client is initialized
   */
  private validateInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Relayer client not initialized. Call initialize() first.')
    }
  }

  /**
   * Get initialization status
   */
  get initialized(): boolean {
    return this.isInitialized
  }
}

export default PolymarketRelayerClient
