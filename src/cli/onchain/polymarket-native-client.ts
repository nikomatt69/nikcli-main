/*
 * Polymarket Native CLOB Client
 *
 * Enterprise-grade integration with Polymarket's Central Limit Order Book (CLOB)
 * Supports both L1 (private key) and L2 (API key) authentication
 * Includes builder program attribution, rate limiting, and comprehensive error handling
 */

import crypto from 'crypto'
import { EventEmitter } from 'events'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// ============================================================
// TYPE DEFINITIONS & INTERFACES
// ============================================================

export interface PolymarketConfig {
  clobUrl: string
  clobWsUrl: string
  chainId: number
  privateKey: Hex
  relayerAddress?: string // Optional relayer for transaction forwarding
  builderCredentials?: {
    apiKey: string
    secret: string
    passphrase: string
  }
}

export interface OrderParams {
  tokenId: string
  price: number
  size: number
  side: 'BUY' | 'SELL'
  orderType: 'FOK' | 'GTC' | 'GTD'
  expiration?: number
  feeRateBps?: number
  relayerAddress?: string // Optional override relayer for this order
}

export interface OrderBook {
  market: string
  asset_id: string
  timestamp: string
  bids: Array<{ price: string; size: string }>
  asks: Array<{ price: string; size: string }>
  min_order_size: string
  tick_size: string
  neg_risk: boolean
}

export interface Market {
  condition_id: string
  question_id: string
  market_slug: string
  tokens: Array<{ token_id: string; outcome: string }>
  minimum_order_size: string
  minimum_tick_size: string
  active: boolean
  closed: boolean
  category: string
  question: string
  end_date_iso: string
}

export interface OrderResponse {
  success: boolean
  errorMsg?: string
  orderId?: string
  orderHashes?: string[]
  status?: string
}

export interface Trade {
  proxyWallet: string
  side: 'BUY' | 'SELL'
  asset: string
  conditionId: string
  size: string
  price: string
  timestamp: number
  outcome: string
}

export enum OrderStatus {
  LIVE = 'live',
  MATCHED = 'matched',
  FILLED = 'filled',
  CANCELLED = 'cancelled',
  DELAYED = 'delayed',
  UNMATCHED = 'unmatched',
}

// ============================================================
// POLYMARKET ERROR CODES & HANDLING
// ============================================================

const POLYMARKET_ERROR_MAP: Record<string, string> = {
  INVALID_ORDER_MIN_TICK_SIZE: 'Price does not match minimum tick size',
  INVALID_ORDER_MIN_SIZE: 'Order size below minimum',
  INVALID_ORDER_NOT_ENOUGH_BALANCE: 'Insufficient balance for order',
  FOK_ORDER_NOT_FILLED_ERROR: 'Fill-or-kill order could not be fully filled',
  MARKET_NOT_READY: 'Market temporarily unavailable, try again',
  INVALID_SIGNATURE: 'Order signature is invalid',
  INVALID_ORDER_NONCE: 'Order nonce conflict',
  DUPLICATE_ORDER: 'Duplicate order submitted',
  ORDER_NOT_FOUND: 'Order does not exist',
  INSUFFICIENT_LIQUIDITY: 'Not enough liquidity at current price',
}

class PolymarketError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public originalError?: any
  ) {
    super(message)
    this.name = 'PolymarketError'
  }
}

// ============================================================
// RATE LIMITING
// ============================================================

class RateLimiter {
  private requests: number[] = []
  private readonly limit: number
  private readonly windowMs: number

  constructor(limit: number, windowSeconds: number) {
    this.limit = limit
    this.windowMs = windowSeconds * 1000
  }

  async acquire(): Promise<void> {
    const now = Date.now()
    this.requests = this.requests.filter((time) => now - time < this.windowMs)

    if (this.requests.length >= this.limit) {
      const oldestRequest = this.requests[0]
      const waitTime = this.windowMs - (now - oldestRequest)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      return this.acquire()
    }

    this.requests.push(now)
  }

  reset() {
    this.requests = []
  }
}

// ============================================================
// AUTHENTICATION
// ============================================================

class PolymarketAuthenticator {
  private account: any
  private l2Credentials?: { apiKey: string; secret: string; passphrase: string }
  private builderCredentials?: { apiKey: string; secret: string; passphrase: string }

  constructor(
    privateKey: Hex,
    l2Credentials?: { apiKey: string; secret: string; passphrase: string },
    builderCredentials?: { apiKey: string; secret: string; passphrase: string }
  ) {
    this.account = privateKeyToAccount(privateKey)
    this.l2Credentials = l2Credentials
    this.builderCredentials = builderCredentials
  }

  /**
   * Generate L1 (Private Key) Authentication Headers
   * Used for critical operations like creating API keys
   * Uses EIP-191 personal_sign format: \x19Ethereum Signed Message:\n + message
   */
  generateL1Headers(method: string, path: string, body?: any): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000)
    const message = timestamp + method + path + (body ? JSON.stringify(body) : '')

    // Use viem's signMessage which implements EIP-191 personal_sign
    // This is the standard for Polymarket's L1 authentication
    const signature = this.account.signMessage({
      message: message,
    })

    return {
      POLY_ADDRESS: this.account.address,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: timestamp.toString(),
      POLY_NONCE: '0',
    }
  }

  /**
   * Generate L2 (API Key) Authentication Headers
   * Used for routine operations like trading
   */
  generateL2Headers(method: string, path: string, body?: any): Record<string, string> {
    if (!this.l2Credentials) {
      throw new PolymarketError('L2 credentials not configured', 'NO_L2_CREDS')
    }

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const bodyStr = body ? JSON.stringify(body) : ''
    const message = timestamp + method + path + bodyStr

    const signature = crypto.createHmac('sha256', this.l2Credentials.secret).update(message).digest('base64')

    return {
      POLY_ADDRESS: this.account.address,
      POLY_API_KEY: this.l2Credentials.apiKey,
      POLY_PASSPHRASE: this.l2Credentials.passphrase,
      POLY_TIMESTAMP: timestamp,
      POLY_SIGNATURE: signature,
    }
  }

  /**
   * Generate Builder Program Attribution Headers
   * Enables order attribution for gas fee coverage and revenue sharing
   */
  generateBuilderHeaders(method: string, path: string, body?: any): Record<string, string> {
    if (!this.builderCredentials) {
      throw new PolymarketError('Builder credentials not configured', 'NO_BUILDER_CREDS')
    }

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const bodyStr = body ? JSON.stringify(body) : ''
    const message = timestamp + method + path + bodyStr

    const signature = crypto.createHmac('sha256', this.builderCredentials.secret).update(message).digest('base64')

    return {
      POLY_BUILDER_API_KEY: this.builderCredentials.apiKey,
      POLY_BUILDER_TIMESTAMP: timestamp,
      POLY_BUILDER_PASSPHRASE: this.builderCredentials.passphrase,
      POLY_BUILDER_SIGNATURE: signature,
    }
  }

  getAddress(): string {
    return this.account.address
  }
}

// ============================================================
// MAIN POLYMARKET CLIENT
// ============================================================

export class PolymarketNativeClient extends EventEmitter {
  private config: PolymarketConfig
  private authenticator: PolymarketAuthenticator
  private rateLimiters: Map<string, RateLimiter>
  private isInitialized: boolean = false
  private funderAddress: string | null = null

  constructor(config: PolymarketConfig) {
    super()
    this.config = config
    // Load funder address from config or environment
    this.funderAddress = config.relayerAddress || process.env.POLYMARKET_FUNDER_ADDRESS || null
    this.authenticator = new PolymarketAuthenticator(config.privateKey, undefined, config.builderCredentials)

    // Initialize rate limiters for different endpoints
    this.rateLimiters = new Map([
      ['order', new RateLimiter(40, 1)], // 40 req/s sustained
      ['orderBurst', new RateLimiter(2400, 10)], // 2400 req/10s burst
      ['marketData', new RateLimiter(200, 10)], // 200 req/10s
      ['trades', new RateLimiter(75, 10)], // 75 req/10s
      ['gamma', new RateLimiter(750, 10)], // 750 req/10s
    ])
  }

  /**
   * Initialize client and derive/create API credentials
   */
  async initialize(): Promise<void> {
    try {
      console.log('🔐 Initializing Polymarket Native Client...')

      // Create L2 credentials from private key
      const l2Creds = await this.createOrDeriveL2Credentials()
      if (!l2Creds) {
        throw new PolymarketError('Failed to create L2 credentials', 'L2_INIT_FAILED')
      }

      // Update authenticator with L2 credentials
      this.authenticator = new PolymarketAuthenticator(this.config.privateKey, l2Creds, this.config.builderCredentials)

      this.isInitialized = true
      console.log(`✓ Client initialized (${this.authenticator.getAddress()})`)
    } catch (error) {
      throw new PolymarketError('Client initialization failed', 'INIT_FAILED', undefined, error)
    }
  }

  /**
   * Create or derive L2 API credentials
   */
  private async createOrDeriveL2Credentials(): Promise<{
    apiKey: string
    secret: string
    passphrase: string
  } | null> {
    try {
      const path = '/auth/derive-api-key'
      const headers = this.authenticator.generateL1Headers('GET', path)

      const response = await fetch(`${this.config.clobUrl}${path}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      })

      if (!response.ok) {
        throw new PolymarketError(
          `API key derivation failed: ${response.statusText}`,
          'API_KEY_DERIVE_FAILED',
          response.status
        )
      }

      return await response.json()
    } catch (error) {
      console.warn('⚠︎ L2 credential derivation failed:', error)
      return null
    }
  }

  /**
   * Place a limit or market order
   */
  async placeOrder(params: OrderParams): Promise<OrderResponse> {
    this.validateInitialized()
    await this.rateLimiters.get('order')?.acquire()
    await this.rateLimiters.get('orderBurst')?.acquire()

    try {
      // Validate parameters
      this.validateOrderParams(params)

      const path = '/order'
      const body = this.buildOrderPayload(params)
      const headers = {
        'Content-Type': 'application/json',
        ...this.authenticator.generateL2Headers('POST', path, body),
      }

      // Add builder attribution if configured
      if (this.config.builderCredentials) {
        Object.assign(headers, this.authenticator.generateBuilderHeaders('POST', path, body))
      }

      const response = await fetch(`${this.config.clobUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        throw this.parseError(result, response.status)
      }

      this.emit('orderPlaced', result)
      return result
    } catch (error) {
      this.emit('orderError', error)
      throw error
    }
  }

  /**
   * Get order book for a token
   */
  async getOrderBook(tokenId: string): Promise<OrderBook> {
    await this.rateLimiters.get('marketData')?.acquire()

    try {
      const path = `/book?token_id=${encodeURIComponent(tokenId)}`
      const response = await fetch(`${this.config.clobUrl}${path}`)

      if (!response.ok) {
        throw new PolymarketError(
          `Failed to fetch order book: ${response.statusText}`,
          'ORDERBOOK_FETCH_FAILED',
          response.status
        )
      }

      return await response.json()
    } catch (error) {
      throw error instanceof PolymarketError
        ? error
        : new PolymarketError('Order book fetch error', 'ORDERBOOK_ERROR', undefined, error)
    }
  }

  /**
   * Get market data with pagination
   */
  async getMarkets(limit: number = 100): Promise<Market[]> {
    await this.rateLimiters.get('gamma')?.acquire()

    try {
      const path = `/events?limit=${limit}&closed=false`
      const response = await fetch(`https://gamma-api.polymarket.com${path}`)

      if (!response.ok) {
        throw new PolymarketError(
          `Failed to fetch markets: ${response.statusText}`,
          'MARKETS_FETCH_FAILED',
          response.status
        )
      }

      const data = await response.json()
      return data.results || data.data || []
    } catch (error) {
      throw error instanceof PolymarketError
        ? error
        : new PolymarketError('Markets fetch error', 'MARKETS_ERROR', undefined, error)
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<{ canceled: string[]; not_canceled: Record<string, string> }> {
    await this.rateLimiters.get('order')?.acquire()

    try {
      const path = '/order'
      const body = { orderID: orderId }
      const headers = {
        'Content-Type': 'application/json',
        ...this.authenticator.generateL2Headers('DELETE', path, body),
      }

      const response = await fetch(`${this.config.clobUrl}${path}`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify(body),
      })

      const result = await response.json()

      if (!response.ok) {
        throw this.parseError(result, response.status)
      }

      this.emit('orderCancelled', { orderId, result })
      return result
    } catch (error) {
      this.emit('orderError', error)
      throw error
    }
  }

  /**
   * Get recent trades
   */
  async getTrades(market?: string, limit: number = 100): Promise<Trade[]> {
    await this.rateLimiters.get('trades')?.acquire()

    try {
      let path = `/trades?limit=${limit}`
      if (market) {
        path += `&market=${encodeURIComponent(market)}`
      }

      const response = await fetch(`https://data-api.polymarket.com${path}`)

      if (!response.ok) {
        throw new PolymarketError(
          `Failed to fetch trades: ${response.statusText}`,
          'TRADES_FETCH_FAILED',
          response.status
        )
      }

      return await response.json()
    } catch (error) {
      throw error instanceof PolymarketError
        ? error
        : new PolymarketError('Trades fetch error', 'TRADES_ERROR', undefined, error)
    }
  }

  /**
   * Check API health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.clobUrl}/ok`)
      return response.ok
    } catch {
      return false
    }
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  private validateInitialized() {
    if (!this.isInitialized) {
      throw new PolymarketError('Client not initialized. Call initialize() first.', 'NOT_INITIALIZED')
    }
  }

  private validateOrderParams(params: OrderParams) {
    // Validate price is between 0 and 1
    if (params.price < 0 || params.price > 1) {
      throw new PolymarketError('Price must be between 0 and 1', 'INVALID_PRICE')
    }

    // Validate size is positive
    if (params.size <= 0) {
      throw new PolymarketError('Size must be positive', 'INVALID_SIZE')
    }

    // Validate side
    if (!['BUY', 'SELL'].includes(params.side)) {
      throw new PolymarketError('Side must be BUY or SELL', 'INVALID_SIDE')
    }
  }

  private buildOrderPayload(params: OrderParams) {
    return {
      tokenId: params.tokenId,
      price: params.price,
      size: params.size,
      side: params.side,
      orderType: params.orderType,
      expiration: params.expiration || Math.floor(Date.now() / 1000) + 3600,
      feeRateBps: params.feeRateBps || 100,
    }
  }

  private parseError(result: any, statusCode: number): PolymarketError {
    const errorCode = result.errorMsg || result.code || 'UNKNOWN_ERROR'
    const errorMessage = POLYMARKET_ERROR_MAP[errorCode] || result.errorMsg || 'Unknown error'

    return new PolymarketError(errorMessage, errorCode, statusCode, result)
  }

  /**
   * Set the funder address for operations
   * @param address - EVM address to use as funder
   */
  setFunderAddress(address: string): void {
    if (!address.startsWith('0x') || address.length !== 42) {
      throw new Error('Invalid EVM address format. Expected 0x followed by 40 hex characters.')
    }
    this.funderAddress = address
    console.log(`✓ Funder address set to: ${address}`)
    this.emit('funderAddressChanged', { address })
  }

  /**
   * Get the current funder address
   * @returns Current funder address or null if not set
   */
  getFunderAddress(): string | null {
    return this.funderAddress
  }

  /**
   * Clear the funder address
   */
  clearFunderAddress(): void {
    this.funderAddress = null
    console.log('✓ Funder address cleared')
    this.emit('funderAddressCleared')
  }

  /**
   * Check if funder address is configured
   * @returns True if funder address is set
   */
  hasFunderAddress(): boolean {
    return this.funderAddress !== null && this.funderAddress !== undefined
  }
}

export default PolymarketNativeClient
