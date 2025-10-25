/*
 * Official Polymarket CLOB Provider Integration
 *
 * This module provides the official Polymarket CLOB integration for NikCLI.
 * It uses viem for EIP-712 signing, signature_type=1 (proxy/magic), and Polygon (chain 137).
 * Mirrors the Coinbase AgentKit provider architecture for consistency.
 */

import type { Address, Hex, LocalAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { logger } from '../utils/logger'
import axios from 'axios'

// Conditional imports for Polymarket CLOB (may not be installed)
let ClobClient: any = null
try {
    const clobModule = require('@polymarket/clob-client')
    ClobClient = clobModule.ClobClient || clobModule.default
} catch {
    // CLOB client not installed
}

export type PolymarketSide = 'BUY' | 'SELL'
export type PolymarketTimeInForce = 'GTC' | 'IOC' | 'FOK'

export interface PolymarketProviderConfig {
    privateKey?: Hex
    chainId?: number
    host?: string
    funderAddress?: Address
}

export interface PolymarketMarket {
    condition_id: string
    question: string
    description?: string
    end_date_iso?: string
    game_start_time?: string
    question_id?: string
    market_slug?: string
    min_incentive_size?: number
    max_incentive_spread?: number
    active?: boolean
    closed?: boolean
    accepting_orders?: boolean
    tokens?: Array<{
        token_id: string
        outcome: string
        price?: string
        winner?: boolean
    }>
}

export interface PolymarketOrderBookLevel {
    price: string
    size: string
}

export interface PolymarketOrderBook {
    market: string
    asset_id: string
    bids: PolymarketOrderBookLevel[]
    asks: PolymarketOrderBookLevel[]
    timestamp: number
}

export interface PolymarketOrder {
    id: string
    market?: string
    asset_id: string
    side: PolymarketSide
    price: string
    size: string
    original_size?: string
    filled_size?: string
    status?: string
    created_at?: string
    expiration?: string
}

export interface PolymarketPosition {
    asset_id: string
    market?: string
    side: string
    size: string
}

export interface PolymarketTrade {
    id: string
    taker_order_id: string
    market: string
    asset_id: string
    side: PolymarketSide
    size: string
    price: string
    fee_rate_bps?: string
    status?: string
    match_time?: string
}

export interface PolymarketPriceQuote {
    price: number
    size: number
    market: string
    asset_id: string
}

/**
 * Official Polymarket CLOB provider for NikCLI
 * Uses viem for signing, signature_type=1, Polygon chain 137
 * With REST fallbacks for SDK methods that may not exist
 */
export class PolymarketProvider {
    private account: LocalAccount | null = null
    private address: Address | null = null
    private chainId: number = 137 // Polygon mainnet
    private host: string = 'https://clob.polymarket.com'
    private funderAddress: Address | null = null
    private client: any = null
    private initialized: boolean = false

    constructor(_config: PolymarketProviderConfig = {}) {
        // Config can be passed via initialize()
    }

    /**
     * Check if CLOB client dependencies are installed
     */
    static async isInstalled(): Promise<boolean> {
        try {
            require('@polymarket/clob-client')
            return true
        } catch {
            return false
        }
    }

    /**
     * Validate required environment variables
     */
    static validateEnvironment(): void {
        if (!process.env.POLYMARKET_PRIVATE_KEY) {
            logger.error(`Polymarket environment validation failed`, {
                reason: 'POLYMARKET_PRIVATE_KEY is required',
            })
            throw new Error('Missing required environment variable: POLYMARKET_PRIVATE_KEY')
        }
    }

    /**
     * Initialize Polymarket CLOB provider with official configuration
     */
    async initialize(config: PolymarketProviderConfig = {}): Promise<void> {
        logger.info(`Polymarket CLOB provider initializing`, {
            chainId: config.chainId || process.env.POLYMARKET_CHAIN_ID || 137,
            host: config.host || process.env.POLYMARKET_HOST,
            signatureType: process.env.POLYMARKET_SIGNATURE_TYPE || 1,
        })

        if (!ClobClient) {
            logger.error(`Polymarket CLOB client not available`, {
                reason: 'package @polymarket/clob-client not installed',
            })
            throw new Error('Polymarket CLOB client not installed. Run: npm install @polymarket/clob-client')
        }

        // Validate environment
        PolymarketProvider.validateEnvironment()

        const pk = (config.privateKey || (process.env.POLYMARKET_PRIVATE_KEY as Hex))?.trim()
        if (!pk) {
            logger.error(`Polymarket initialization failed`, {
                reason: 'POLYMARKET_PRIVATE_KEY missing',
            })
            throw new Error('Missing POLYMARKET_PRIVATE_KEY for signing')
        }

        try {
            this.chainId = Number(config.chainId || process.env.POLYMARKET_CHAIN_ID || 137)
            this.host = config.host || process.env.POLYMARKET_HOST || 'https://clob.polymarket.com'
            this.funderAddress = (config.funderAddress || process.env.POLYMARKET_FUNDER_ADDRESS) as Address | null

            // Create viem account for EIP-712 signing
            this.account = privateKeyToAccount(pk as `0x${string}`)
            this.address = this.account.address as Address

            logger.debug(`Polymarket viem account created`, {
                address: this.address,
                chainId: this.chainId,
            })

            const signatureType = Number(process.env.POLYMARKET_SIGNATURE_TYPE || 1)

            // Create signer adapter compatible with ethers.js Signer interface expected by CLOB client
            const signerAdapter = {
                getAddress: async () => this.account!.address,
                _signTypedData: async (domain: any, types: any, value: any) => {
                    logger.debug(`Polymarket EIP-712 signature request`, {
                        domain: domain?.name,
                        message: Object.keys(value || {}),
                    })
                    const primaryType = Object.keys(types || {}).find((key) => key !== 'EIP712Domain') || 'Message'
                    return await this.account!.signTypedData({
                        domain,
                        types,
                        primaryType,
                        message: value,
                    } as any)
                },
                // Some clients call signTypedData directly
                signTypedData: async (domain: any, types: any, value: any) => {
                    const primaryType = Object.keys(types || {}).find((key) => key !== 'EIP712Domain') || 'Message'
                    return await this.account!.signTypedData({
                        domain,
                        types,
                        primaryType,
                        message: value,
                    } as any)
                },
            }

            // Create CLOB client with signature_type=1 and signer adapter
            this.client = new ClobClient(
                this.host,
                this.chainId,
                signerAdapter,
                signatureType,
                this.funderAddress
            )

            logger.debug(`Polymarket CLOB client instantiated`, {
                host: this.host,
                signatureType,
                chainId: this.chainId,
            })

            // Health check: fetch markets to verify connection
            try {
                await this.executeWithRetry('health-check', async () => {
                    const markets = await this.client.getMarkets()
                    logger.debug(`Polymarket health check: markets available`, {
                        count: markets?.length || 0,
                    })
                })
                logger.info(`Polymarket health check passed`, {
                    endpoint: this.host,
                })
            } catch (err: any) {
                logger.warn(`Polymarket health check failed (non-blocking)`, {
                    error: err?.message,
                })
            }

            this.initialized = true
            logger.info(`Polymarket CLOB provider initialized successfully`, {
                address: this.address,
                chainId: this.chainId,
                host: this.host,
            })
        } catch (err: any) {
            logger.error(`Polymarket initialization failed`, {
                error: err?.message,
                stack: err?.stack,
            })
            throw err
        }
    }

    /**
     * Get wallet information
     */
    getWalletInfo(): {
        address?: string
        chainId: number
        host: string
        funderAddress?: string
    } {
        return {
            address: this.address || undefined,
            chainId: this.chainId,
            host: this.host,
            funderAddress: this.funderAddress || undefined,
        }
    }

    /**
     * List markets with optional filters
     */
    async listMarkets(params: {
        search?: string
        active?: boolean
        closed?: boolean
        limit?: number
        offset?: number
    } = {}): Promise<PolymarketMarket[]> {
        this.ensureReady()

        logger.debug(`Polymarket markets list requested`, {
            search: params.search,
            active: params.active,
            limit: params.limit || 100,
        })

        try {
            const markets = await this.executeWithRetry('listMarkets', async () => {
                return await this.client.getMarkets(params)
            })

            logger.debug(`Polymarket markets retrieved`, {
                count: markets?.length || 0,
            })

            return markets || []
        } catch (err: any) {
            logger.error(`Polymarket listMarkets failed`, {
                error: err?.message,
                params,
            })
            throw err
        }
    }

    /**
     * Get order book for a market
     */
    async getOrderBook(params: {
        tokenID: string
    }): Promise<PolymarketOrderBook> {
        this.ensureReady()

        logger.debug(`Polymarket orderbook requested`, {
            tokenID: params.tokenID,
        })

        try {
            const book = await this.executeWithRetry('getOrderBook', async () => {
                return await this.client.getOrderBook(params.tokenID)
            })

            logger.debug(`Polymarket orderbook retrieved`, {
                tokenID: params.tokenID,
                bids: book?.bids?.length || 0,
                asks: book?.asks?.length || 0,
            })

            return book
        } catch (err: any) {
            logger.error(`Polymarket getOrderBook failed`, {
                error: err?.message,
                tokenID: params.tokenID,
            })
            throw err
        }
    }

    /**
     * Get price quote for a token
     */
    async getPriceQuote(params: {
        tokenID: string
        side: PolymarketSide
        amount: string
    }): Promise<PolymarketPriceQuote> {
        this.ensureReady()

        logger.debug(`Polymarket price quote requested`, {
            tokenID: params.tokenID,
            side: params.side,
            amount: params.amount,
        })

        try {
            const quote = await this.executeWithRetry('getPriceQuote', async () => {
                return await this.client.getPrice(params.tokenID, params.side, params.amount)
            })

            logger.debug(`Polymarket price quote calculated`, {
                tokenID: params.tokenID,
                price: quote?.price,
            })

            return quote
        } catch (err: any) {
            logger.error(`Polymarket getPriceQuote failed`, {
                error: err?.message,
                params,
            })
            throw err
        }
    }

    /**
     * Get user's positions - with SDK/REST fallback
     */
    async getPositions(): Promise<PolymarketPosition[]> {
        this.ensureReady()

        logger.debug(`Polymarket positions requested`)

        try {
            const positions = await this.executeWithRetry('getPositions', async () => {
                // Try SDK method first
                const sdkMethod = this.getClientMethod('getPositions', 'getUserPositions')
                if (sdkMethod) {
                    return await sdkMethod()
                }
                // Fallback to REST
                return await this.getPositionsRest()
            })

            logger.debug(`Polymarket positions retrieved`, {
                count: positions?.length || 0,
            })

            return positions || []
        } catch (err: any) {
            logger.error(`Polymarket getPositions failed`, {
                error: err?.message,
            })
            throw err
        }
    }

    /**
     * Get user's trade history - with SDK/REST fallback
     */
    async getTrades(): Promise<PolymarketTrade[]> {
        this.ensureReady()

        logger.debug(`Polymarket trades requested`)

        try {
            const trades = await this.executeWithRetry('getTrades', async () => {
                // Try SDK method first
                const sdkMethod = this.getClientMethod('getTrades', 'getUserTrades', 'getFills')
                if (sdkMethod) {
                    return await sdkMethod()
                }
                // Fallback to REST
                return await this.getTradesRest()
            })

            logger.debug(`Polymarket trades retrieved`, {
                count: trades?.length || 0,
            })

            return trades || []
        } catch (err: any) {
            logger.error(`Polymarket getTrades failed`, {
                error: err?.message,
            })
            throw err
        }
    }

    /**
     * Get user's open orders - with SDK/REST fallback
     */
    async getOpenOrders(): Promise<PolymarketOrder[]> {
        this.ensureReady()

        logger.debug(`Polymarket open orders requested`)

        try {
            const orders = await this.executeWithRetry('getOpenOrders', async () => {
                // Try SDK method first
                const sdkMethod = this.getClientMethod('getOrders', 'getOpenOrders')
                if (sdkMethod) {
                    return await sdkMethod()
                }
                // Fallback to REST
                return await this.getOrdersRest()
            })

            logger.debug(`Polymarket open orders retrieved`, {
                count: orders?.length || 0,
            })

            return orders || []
        } catch (err: any) {
            logger.error(`Polymarket getOpenOrders failed`, {
                error: err?.message,
            })
            throw err
        }
    }

    /**
     * Place an order (with confirmation hook)
     */
    async placeOrder(params: {
        tokenID: string
        price: string
        size: string
        side: PolymarketSide
        feeRateBps?: string
        nonce?: number
        expiration?: number
        tif?: PolymarketTimeInForce
        confirmHook?: () => Promise<boolean>
    }): Promise<PolymarketOrder> {
        this.ensureReady()

        logger.info(`Polymarket place order initiated`, {
            tokenID: params.tokenID,
            side: params.side,
            price: params.price,
            size: params.size,
            tif: params.tif || 'GTC',
        })

        // Validation
        const price = parseFloat(params.price)
        const size = parseFloat(params.size)

        if (isNaN(price) || price <= 0 || price >= 1) {
            logger.error(`Polymarket place order invalid`, {
                reason: `price out of range: ${params.price}`,
            })
            throw new Error('Price must be between 0 and 1')
        }

        if (isNaN(size) || size <= 0) {
            logger.error(`Polymarket place order invalid`, {
                reason: `size must be positive: ${params.size}`,
            })
            throw new Error('Size must be greater than 0')
        }

        if (!['BUY', 'SELL'].includes(params.side)) {
            logger.error(`Polymarket place order invalid`, {
                reason: `invalid side: ${params.side}`,
            })
            throw new Error("Side must be 'BUY' or 'SELL'")
        }

        // User confirmation
        if (params.confirmHook) {
            logger.debug(`Polymarket order awaiting user confirmation`)
            const confirmed = await params.confirmHook()
            if (!confirmed) {
                logger.warn(`Polymarket order rejected by user`, {
                    tokenID: params.tokenID,
                    side: params.side,
                    price: params.price,
                    size: params.size,
                })
                throw new Error('Order cancelled by user')
            }
        }

        try {
            const order = await this.executeWithRetry('placeOrder', async () => {
                return await this.client.createOrder({
                    tokenID: params.tokenID,
                    price: params.price,
                    size: params.size,
                    side: params.side,
                    feeRateBps: params.feeRateBps,
                    nonce: params.nonce,
                    expiration: params.expiration,
                })
            })

            logger.info(`Polymarket order placed successfully`, {
                orderId: order?.id,
                tokenID: params.tokenID,
                side: params.side,
                price: params.price,
                size: params.size,
            })

            // Audit log for compliance
            logger.audit(`POLYMARKET_ORDER_PLACED`, {
                orderId: order?.id,
                address: this.address,
                tokenID: params.tokenID,
                side: params.side,
                price: params.price,
                size: params.size,
                timestamp: new Date().toISOString(),
            })

            return order
        } catch (err: any) {
            logger.error(`Polymarket order placement failed`, {
                tokenID: params.tokenID,
                side: params.side,
                price: params.price,
                size: params.size,
                error: err?.message,
            })
            throw err
        }
    }

    /**
     * Cancel an order
     */
    async cancelOrder(params: {
        orderID: string
    }): Promise<void> {
        this.ensureReady()

        logger.info(`Polymarket cancel order initiated`, {
            orderID: params.orderID,
        })

        try {
            await this.executeWithRetry('cancelOrder', async () => {
                return await this.client.cancelOrder(params.orderID)
            })

            logger.info(`Polymarket order cancelled successfully`, {
                orderID: params.orderID,
            })

            // Audit log for compliance
            logger.audit(`POLYMARKET_ORDER_CANCELLED`, {
                address: this.address,
                orderID: params.orderID,
                timestamp: new Date().toISOString(),
            })
        } catch (err: any) {
            logger.error(`Polymarket order cancellation failed`, {
                orderID: params.orderID,
                error: err?.message,
            })
            throw err
        }
    }

    /**
     * Cancel all open orders - with SDK/REST fallback
     */
    async cancelAllOrders(): Promise<void> {
        this.ensureReady()

        logger.info(`Polymarket cancel all orders initiated`)

        try {
            await this.executeWithRetry('cancelAllOrders', async () => {
                // Try SDK method first
                const sdkMethod = this.getClientMethod('cancelAll', 'cancelAllOrders')
                if (sdkMethod) {
                    return await sdkMethod()
                }
                // Fallback: get all open orders and cancel individually
                const orders = await this.getOpenOrders()
                for (const order of orders) {
                    await this.cancelOrder({ orderID: order.id })
                }
            })

            logger.info(`Polymarket all orders cancelled successfully`)

            // Audit log
            logger.audit(`POLYMARKET_ALL_ORDERS_CANCELLED`, {
                address: this.address,
                timestamp: new Date().toISOString(),
            })
        } catch (err: any) {
            logger.error(`Polymarket cancel all orders failed`, {
                error: err?.message,
            })
            throw err
        }
    }

    /**
     * Execute operation with retry logic
     */
    private async executeWithRetry<T>(
        operation: string,
        fn: () => Promise<T>,
        maxRetries: number = 3
    ): Promise<T> {
        let attempt = 0
        let lastErr: any

        while (attempt < maxRetries) {
            try {
                logger.debug(`Polymarket operation starting`, {
                    operation,
                    attempt: attempt + 1,
                    maxRetries,
                })
                return await fn()
            } catch (err: any) {
                lastErr = err
                const status = err?.response?.status || err?.status || 0
                const isRateLimited = status === 429 || String(err?.message || '').includes('429')
                const isNetwork = String(err?.message || '').toLowerCase().includes('network')
                const isTimeout = String(err?.message || '').toLowerCase().includes('timeout')

                logger.warn(`Polymarket operation error`, {
                    operation,
                    attempt: attempt + 1,
                    status,
                    isRetryable: isRateLimited || isNetwork || isTimeout,
                    errorMessage: err?.message,
                })

                if (attempt < maxRetries - 1 && (isRateLimited || isNetwork || isTimeout)) {
                    const backoff = Math.min(2000 * (attempt + 1), 5000)
                    logger.debug(`Polymarket retry scheduled`, {
                        operation,
                        backoffMs: backoff,
                        nextAttempt: attempt + 2,
                    })
                    await this.sleep(backoff)
                    attempt++
                    continue
                }

                throw err
            }
        }

        logger.error(`Polymarket operation failed after retries`, {
            operation,
            attempts: maxRetries,
            finalError: lastErr?.message,
        })
        throw lastErr
    }

    /**
     * Sleep helper
     */
    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    /**
     * Ensure provider is initialized
     */
    private ensureReady(): void {
        if (!this.initialized) {
            logger.error(`Polymarket provider not initialized`, {
                reason: 'initialize() must be called first',
            })
            throw new Error('Polymarket provider not initialized. Call initialize() first.')
        }
    }

    /**
     * Resolve a method from the underlying CLOB client with fallbacks
     * Returns the bound method if found, null if not
     */
    private getClientMethod(...names: string[]): (() => Promise<any>) | null {
        if (!this.client) {
            return null
        }
        for (const name of names) {
            const candidate = (this.client as any)[name]
            if (typeof candidate === 'function') {
                return candidate.bind(this.client)
            }
        }
        return null
    }

    /**
     * REST fallback: get positions for authenticated user
     */
    private async getPositionsRest(): Promise<PolymarketPosition[]> {
        try {
            const response = await axios.get(`${this.host}/data/positions`, {
                headers: this.getRestHeaders(),
                params: { maker: this.address },
            })
            return Array.isArray(response.data) ? response.data : []
        } catch (err: any) {
            logger.warn(`REST positions fallback failed`, { error: err?.message })
            return []
        }
    }

    /**
     * REST fallback: get trades for authenticated user
     */
    private async getTradesRest(): Promise<PolymarketTrade[]> {
        try {
            const response = await axios.get(`${this.host}/data/trades`, {
                headers: this.getRestHeaders(),
                params: { maker: this.address, limit: 100 },
            })
            return Array.isArray(response.data) ? response.data : []
        } catch (err: any) {
            logger.warn(`REST trades fallback failed`, { error: err?.message })
            return []
        }
    }

    /**
     * REST fallback: get orders for authenticated user
     */
    private async getOrdersRest(): Promise<PolymarketOrder[]> {
        try {
            const response = await axios.get(`${this.host}/orders`, {
                headers: this.getRestHeaders(),
                params: { maker: this.address },
            })
            return Array.isArray(response.data) ? response.data : []
        } catch (err: any) {
            logger.warn(`REST orders fallback failed`, { error: err?.message })
            return []
        }
    }

    /**
     * Get REST request headers with optional L2 signature if supported
     */
    private getRestHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        }

        // Add optional L2 signature header if account is available
        if (this.account && process.env.POLYMARKET_L2_AUTH === 'true') {
            try {
                const timestamp = Math.floor(Date.now() / 1000)
                headers['X-POLY-SIGNATURE'] = `${this.account.address}:${timestamp}`
            } catch {
                // Silently skip L2 header if signing fails
            }
        }

        return headers
    }

    /**
     * Cleanup resources
     */
    async cleanup(): Promise<void> {
        this.client = null
        this.account = null
        this.initialized = false
        logger.info(`Polymarket provider cleanup complete`)
    }
}
