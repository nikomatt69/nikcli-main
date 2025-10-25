import type { CoreTool } from 'ai'
import { logger } from '../utils/logger'
import { configManager } from '../core/config-manager'
import type { Address } from 'viem'

// Polymarket SDKs (runtime optional - we guard require where needed)
import type { ClobClient } from '@polymarket/clob-client'
import type {
  ApiKeyCreds,
  Chain,
  CreateOrderOptions,
  MarketPrice,
  OpenOrderParams,
  OpenOrdersResponse,
  OrderBookSummary,
  OrderType,
  Side,
  Trade,
  TickSize,
} from '@polymarket/clob-client/dist/types'
import type { SignatureType } from '@polymarket/order-utils/dist/model/signature-types.model'
import { Wallet } from '@ethersproject/wallet'

export type PolymarketSide = 'buy' | 'sell'
export type PolymarketTIF = 'GTC' | 'IOC' | 'FOK'

export interface PolymarketProviderInit {
  host?: string
  chainId?: number
  signatureType?: number
  privateKey?: string
  funderAddress?: string
  geoBlockToken?: string
}

export interface PlaceOrderParams {
  tokenId: string
  side: PolymarketSide
  price?: number // required for limit
  size: number // shares for limit; SELL shares; BUY shares (limit). For market BUY converted to amount
  tif?: PolymarketTIF // GTC -> limit, IOC/FOK -> market
  clientId?: string
}

export class PolymarketProvider {
  private client: ClobClient | null = null
  private creds: ApiKeyCreds | null = null
  private signer: Wallet | null = null
  private chainId: number = 137
  private host: string = 'https://clob.polymarket.com'
  private signatureType: number = 1 // POLY_PROXY
  private funderAddress?: string
  private initialized = false

  static isInstalled(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@polymarket/clob-client')
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@polymarket/order-utils')
      return true
    } catch {
      return false
    }
  }

  static validateEnvironment(): void {
    const pk = process.env.POLYMARKET_PRIVATE_KEY
    if (!pk || !/^0x[a-fA-F0-9]{64}$/.test(pk)) {
      throw new Error('POLYMARKET_PRIVATE_KEY is required (0x-prefixed 32-byte hex)')
    }
  }

  async initialize(params: PolymarketProviderInit = {}): Promise<void> {
    PolymarketProvider.validateEnvironment()

    this.host = params.host || process.env.POLYMARKET_HOST || 'https://clob.polymarket.com'
    this.chainId = Number(params.chainId || process.env.POLYMARKET_CHAIN_ID || 137)
    this.signatureType = Number(params.signatureType || process.env.POLYMARKET_SIGNATURE_TYPE || 1)

    const privateKey = (params.privateKey || process.env.POLYMARKET_PRIVATE_KEY)!.trim()
    this.signer = new Wallet(privateKey)
    this.funderAddress = params.funderAddress || process.env.POLYMARKET_FUNDER || this.signer.address

    // Dynamically import to avoid compile-time coupling
    const { ClobClient } = await import('@polymarket/clob-client')
    const { SignatureType } = await import(
      '@polymarket/order-utils/dist/model/signature-types.model'
    )

    // Create or derive API key deterministically
    const tmp = new ClobClient(this.host, this.chainId as unknown as Chain, this.signer)
    this.creds = await tmp.createOrDeriveApiKey()

    // Create authenticated client (signature_type=1 for proxy)
    this.client = new ClobClient(
      this.host,
      this.chainId as unknown as Chain,
      this.signer,
      this.creds,
      (this.signatureType as unknown as SignatureType) ?? SignatureType.POLY_PROXY,
      this.funderAddress,
    )

    // Basic health check
    await this.client.getOk()

    this.initialized = true
    await logger.info('Polymarket initialized', {
      host: this.host,
      chainId: this.chainId,
      funderAddress: this.funderAddress,
      signatureType: this.signatureType,
      address: this.signer.address,
    })
  }

  isReady(): boolean {
    return this.initialized && !!this.client && !!this.signer
  }

  getStatus() {
    return {
      initialized: this.isReady(),
      host: this.host,
      chainId: this.chainId,
      signatureType: this.signatureType,
      address: this.signer?.address,
    }
  }

  async listMarkets(params: { nextCursor?: string; simplified?: boolean } = {}) {
    this.ensureReady()
    const { nextCursor, simplified } = params
    if (simplified) {
      const res = await this.client!.getSimplifiedMarkets(nextCursor)
      return res
    }
    const res = await this.client!.getMarkets(nextCursor)
    return res
  }

  async getOrderBook(params: { tokenId: string }): Promise<OrderBookSummary> {
    this.ensureReady()
    return await this.client!.getOrderBook(params.tokenId)
  }

  async getBestPrice(params: { tokenId: string; side: PolymarketSide }) {
    this.ensureReady()
    const side = params.side.toLowerCase() === 'buy' ? 'BUY' : 'SELL'
    const orderbook = await this.client!.getOrderBook(params.tokenId)
    const bestBid = orderbook.bids
      ?.map((b) => Number(b.price))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => b - a)[0]
    const bestAsk = orderbook.asks
      ?.map((b) => Number(b.price))
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b)[0]
    const midpoint = bestBid !== undefined && bestAsk !== undefined ? (bestBid + bestAsk) / 2 : undefined
    return {
      side,
      bestBid,
      bestAsk,
      midpoint,
      tickSize: orderbook.tick_size,
      negRisk: orderbook.neg_risk,
    }
  }

  async getMidpoint(tokenId: string) {
    this.ensureReady()
    try {
      return await this.client!.getMidpoint(tokenId)
    } catch {
      const ob = await this.client!.getOrderBook(tokenId)
      const bestBid = ob.bids?.map((b) => Number(b.price)).sort((a, b) => b - a)[0]
      const bestAsk = ob.asks?.map((b) => Number(b.price)).sort((a, b) => a - b)[0]
      return bestBid && bestAsk ? (bestBid + bestAsk) / 2 : undefined
    }
  }

  async getOpenOrders(params: OpenOrderParams = {}): Promise<OpenOrdersResponse> {
    this.ensureReady()
    const res = await this.client!.getOpenOrders(params)
    return res
  }

  async getTrades(params: { after?: string; before?: string; asset_id?: string; market?: string } = {}): Promise<Trade[]> {
    this.ensureReady()
    const res = await this.client!.getTrades(params)
    return res
  }

  async getPositions(): Promise<
    Array<{ asset_id: string; market?: string; netSize: number; avgPrice?: number; lastUpdated?: string }>
  > {
    this.ensureReady()
    // Naive aggregation from historical trades
    const trades = await this.client!.getTrades()
    const byAsset = new Map<string, { totalBuy: number; totalSell: number; market?: string; last?: string }>()

    for (const t of trades) {
      const size = Number(t.size || 0)
      if (!byAsset.has(t.asset_id)) byAsset.set(t.asset_id, { totalBuy: 0, totalSell: 0, market: t.market, last: t.last_update })
      const rec = byAsset.get(t.asset_id)!
      if (t.side === 'BUY' || (t.side as any) === 0) rec.totalBuy += size
      else rec.totalSell += size
      rec.last = t.last_update
    }

    const result: Array<{ asset_id: string; market?: string; netSize: number; avgPrice?: number; lastUpdated?: string }> = []
    for (const [asset_id, r] of byAsset.entries()) {
      result.push({ asset_id, market: r.market, netSize: r.totalBuy - r.totalSell, lastUpdated: r.last })
    }
    return result
  }

  async placeOrder(p: PlaceOrderParams): Promise<any> {
    this.ensureReady()

    const price = p.price !== undefined ? Number(p.price) : undefined
    const size = Number(p.size)
    if (!p.tokenId || !size || Number.isNaN(size) || size <= 0) {
      throw new Error('Invalid order params: tokenId and positive size are required')
    }

    const side = (await this.importTypes()).Side[p.side.toUpperCase() as 'BUY' | 'SELL']

    // Resolve per-market settings
    const tickSize = await this.client!.getTickSize(p.tokenId)
    const negRisk = await this.client!.getNegRisk(p.tokenId)
    const options: Partial<CreateOrderOptions> = { tickSize: tickSize as TickSize, negRisk }

    if (!p.tif || p.tif === 'GTC') {
      if (price === undefined || !(price > 0 && price < 1)) {
        throw new Error('Limit order requires price in (0,1)')
      }
      const order = {
        tokenID: p.tokenId,
        price,
        size,
        side,
      }
      // Limit order (GTC)
      const res = await this.client!.createAndPostOrder(order as any, options, (await this.importTypes()).OrderType.GTC)
      return res
    }

    // Market order path (IOC/FAK or FOK)
    const orderType = p.tif === 'IOC' ? (await this.importTypes()).OrderType.FAK : (await this.importTypes()).OrderType.FOK
    const isBuy = p.side.toLowerCase() === 'buy'
    const marketOrder = {
      tokenID: p.tokenId,
      amount: isBuy && price ? Number((size * price).toFixed(6)) : isBuy ? Number(size.toFixed(6)) : Number(size.toFixed(6)),
      side,
      orderType,
    }
    const res = await this.client!.createAndPostMarketOrder(marketOrder as any, options, orderType)
    return res
  }

  async cancelOrder(params: { orderId: string }): Promise<any> {
    this.ensureReady()
    if (!params.orderId) throw new Error('orderId is required')
    return await this.client!.cancelOrder({ orderID: params.orderId })
  }

  getTools(): Record<string, CoreTool> {
    // Expose minimal tools for AI chat orchestration
    return {
      polymarket_markets: {
        description: 'List markets (paginated) on Polymarket',
        parameters: {
          type: 'object',
          properties: { nextCursor: { type: 'string', description: 'pagination cursor' } },
        },
        execute: async ({ nextCursor }: { nextCursor?: string }) => {
          return await this.listMarkets({ nextCursor })
        },
      },
      polymarket_book: {
        description: 'Get order book for a tokenId',
        parameters: {
          type: 'object',
          properties: { tokenId: { type: 'string' } },
          required: ['tokenId'],
        },
        execute: async ({ tokenId }: { tokenId: string }) => {
          return await this.getOrderBook({ tokenId })
        },
      },
      polymarket_price: {
        description: 'Get best bid/ask and midpoint',
        parameters: {
          type: 'object',
          properties: {
            tokenId: { type: 'string' },
            side: { type: 'string', enum: ['buy', 'sell'] },
          },
          required: ['tokenId', 'side'],
        },
        execute: async ({ tokenId, side }: { tokenId: string; side: PolymarketSide }) => {
          return await this.getBestPrice({ tokenId, side })
        },
      },
      polymarket_orders: {
        description: 'Get open orders',
        parameters: { type: 'object', properties: {} },
        execute: async () => await this.getOpenOrders(),
      },
      polymarket_trades: {
        description: 'Get recent trades',
        parameters: { type: 'object', properties: {} },
        execute: async () => await this.getTrades(),
      },
      polymarket_positions: {
        description: 'Aggregate positions from trade history (approximate)',
        parameters: { type: 'object', properties: {} },
        execute: async () => await this.getPositions(),
      },
    }
  }

  private ensureReady(): void {
    if (!this.isReady()) {
      throw new Error('Polymarket not initialized. Call initialize() first.')
    }
  }

  private async importTypes(): Promise<typeof import('@polymarket/clob-client/dist/types')> {
    return await import('@polymarket/clob-client/dist/types')
  }
}
