import { openai } from '@ai-sdk/openai'
import type { CoreMessage } from 'ai'
import { generateText } from 'ai'
import chalk from 'chalk'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { configManager } from '../core/config-manager'
import { approvalSystem } from '../ui/approval-system'
import { PolymarketProvider, type PolymarketSide, type PolymarketTIF } from '../onchain/polymarket-provider'

export class PolymarketTool extends BaseTool {
  private provider: PolymarketProvider | null = null
  private isInitialized = false
  private conversationMessages: CoreMessage[] = []
  private toolHintInjected = false

  constructor(workingDirectory: string) {
    super('polymarket', workingDirectory)
  }

  async execute(action: string, params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    try {
      switch ((action || '').toLowerCase()) {
        case 'init':
        case 'initialize':
          return await this.initialize(params)
        case 'markets':
          return await this.listMarkets(params)
        case 'book':
          return await this.getBook(params)
        case 'price':
          return await this.getPrice(params)
        case 'orders':
          return await this.getOrders(params)
        case 'trades':
          return await this.getTrades(params)
        case 'positions':
          return await this.getPositions(params)
        case 'place-order':
          return await this.placeOrder(params)
        case 'cancel-order':
          return await this.cancelOrder(params)
        case 'status':
          return await this.getStatus(params)
        case 'reset':
          return await this.reset(params)
        default:
          return await this.chat(action, params)
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message || String(error),
        metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: { action, params } },
      }
    }
  }

  private async initialize(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()

    // Check installation
    if (!PolymarketProvider.isInstalled()) {
      return {
        success: false,
        data: null,
        error:
          'Polymarket SDK not installed. Run: npm install @polymarket/clob-client @ethersproject/wallet --save --legacy-peer-deps',
        metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params },
      }
    }

    // Validate env, allow reading from config manager if missing
    try {
      if (!process.env.POLYMARKET_PRIVATE_KEY) {
        const pk = configManager.getApiKey('polymarket_private_key') || configManager.getApiKey('polymarket')
        if (pk) process.env.POLYMARKET_PRIVATE_KEY = pk
      }
      PolymarketProvider.validateEnvironment()
    } catch (envError: any) {
      return {
        success: false,
        data: null,
        error: envError.message,
        metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params },
      }
    }

    this.provider = new PolymarketProvider()
    await this.provider.initialize({
      host: params.host,
      chainId: params.chainId,
      signatureType: params.signatureType,
      privateKey: params.privateKey,
      funderAddress: params.funder,
    })

    this.isInitialized = true
    return {
      success: true,
      data: { message: 'Polymarket initialized', status: this.provider.getStatus() },
      metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params },
    }
  }

  private ensureReady(): void {
    if (!this.isInitialized || !this.provider) throw new Error('Polymarket not initialized. Run action "init" first.')
  }

  private async listMarkets(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.ensureReady()
    const res = await this.provider!.listMarkets({ nextCursor: params.nextCursor, simplified: !!params.simplified })
    return {
      success: true,
      data: res,
      metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params },
    }
  }

  private async getBook(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.ensureReady()
    if (!params.tokenId) throw new Error('tokenId is required')
    const res = await this.provider!.getOrderBook({ tokenId: params.tokenId })
    return { success: true, data: res, metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
  }

  private async getPrice(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.ensureReady()
    if (!params.tokenId || !params.side) throw new Error('tokenId and side are required')
    const side = String(params.side).toLowerCase() as PolymarketSide
    if (side !== 'buy' && side !== 'sell') throw new Error('side must be buy|sell')
    const res = await this.provider!.getBestPrice({ tokenId: params.tokenId, side })
    return { success: true, data: res, metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
  }

  private async getOrders(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.ensureReady()
    const res = await this.provider!.getOpenOrders({})
    return { success: true, data: res, metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
  }

  private async getTrades(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.ensureReady()
    const res = await this.provider!.getTrades({})
    return { success: true, data: res, metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
  }

  private async getPositions(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.ensureReady()
    const res = await this.provider!.getPositions()
    return { success: true, data: res, metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
  }

  private async placeOrder(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.ensureReady()

    const tokenId = String(params.tokenId || params.token_id || '')
    const side = String(params.side || '').toLowerCase() as PolymarketSide
    const size = Number(params.size)
    const price = params.price !== undefined ? Number(params.price) : undefined
    const tif = (params.tif || params.timeInForce || (price ? 'GTC' : 'IOC')) as PolymarketTIF

    if (!tokenId) throw new Error('tokenId is required')
    if (side !== 'buy' && side !== 'sell') throw new Error('side must be buy|sell')
    if (!size || Number.isNaN(size) || size <= 0) throw new Error('size must be a positive number')
    if (price !== undefined && !(price > 0 && price < 1)) throw new Error('price must be in (0,1)')
    if (!['GTC', 'IOC', 'FOK'].includes(tif)) throw new Error('tif must be GTC|IOC|FOK')

    const summary = `Place ${side.toUpperCase()} ${price ? `limit @ ${price}` : 'market'} order: size ${size} on ${tokenId} (${tif})`
    const ok = params.confirm === true
      ? true
      : await approvalSystem.confirm('Confirm Polymarket order?', summary, false)

    if (!ok) {
      return { success: false, data: null, error: 'Order not confirmed', metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
    }

    const res = await this.provider!.placeOrder({ tokenId, side, size, price, tif })
    return { success: true, data: res, metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
  }

  private async cancelOrder(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.ensureReady()
    const orderId = String(params.orderId || params.id || '')
    if (!orderId) throw new Error('orderId is required')

    const ok = params.confirm === true
      ? true
      : await approvalSystem.confirm('Cancel Polymarket order?', `Order: ${orderId}`, false)

    if (!ok) {
      return { success: false, data: null, error: 'Cancellation not confirmed', metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
    }

    const res = await this.provider!.cancelOrder({ orderId })
    return { success: true, data: res, metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params } }
  }

  private async getStatus(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    return {
      success: true,
      data: {
        initialized: this.isInitialized,
        status: this.provider?.getStatus(),
      },
      metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params },
    }
  }

  private async reset(params: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()
    this.conversationMessages = []
    this.toolHintInjected = false
    return {
      success: true,
      data: { conversationLength: 0 },
      metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: params },
    }
  }

  private async chat(message: string, options: any = {}): Promise<ToolExecutionResult> {
    const start = Date.now()

    if (!this.isInitialized || !this.provider) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized. Use action "init" first.',
        metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: { message, options } },
      }
    }

    if (!this.toolHintInjected) {
      this.conversationMessages.push({
        role: 'system',
        content:
          'You are a trading assistant with tools for Polymarket CLOB on Polygon (137). Use the available polymarket_* tools to fetch markets, books, quotes, orders, trades, positions and to place or cancel orders. Do not execute trades without explicit confirmation.',
      })
      this.toolHintInjected = true
    }

    this.conversationMessages.push({ role: 'user', content: message })

    const model = openai(process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'gpt-3.5-turbo')
    const tools = this.provider.getTools()

    const { text, toolCalls, toolResults } = await generateText({
      model,
      tools,
      system:
        'Act as a Polymarket trading assistant. Prefer using tools to gather data and prepare clear, concise responses. For order placement, ensure a confirmation step is performed by the caller before executing.',
      messages: this.conversationMessages,
    })

    this.conversationMessages.push({ role: 'assistant', content: text })

    return {
      success: true,
      data: { response: text, toolCalls: toolCalls.length, toolResults: toolResults.length },
      metadata: { executionTime: Date.now() - start, toolName: this.name, parameters: { message, options } },
    }
  }
}

export const polymarketToolConfig = {
  name: 'polymarket',
  description: 'Polymarket CLOB trading tool for Polygon (137)',
  category: 'blockchain',
  requiredEnv: ['POLYMARKET_PRIVATE_KEY'],
  optionalEnv: ['POLYMARKET_SIGNATURE_TYPE', 'POLYMARKET_CHAIN_ID', 'POLYMARKET_HOST', 'POLYMARKET_FUNDER'],
  actions: [
    'init - Initialize Polymarket client',
    'markets - List markets',
    'book { tokenId } - Get order book',
    'price { tokenId, side } - Get quote',
    'orders - List open orders',
    'trades - List trades',
    'positions - Aggregate positions',
    'place-order { tokenId, side, size, price?, tif? } - Place order',
    'cancel-order { orderId } - Cancel order',
    'status - Tool status',
    'reset - Reset conversation/chat',
  ],
  examples: [
    'secureTools.execute("polymarket", "init")',
    'secureTools.execute("polymarket", "markets")',
    'secureTools.execute("polymarket", "price", { tokenId: "...", side: "buy" })',
  ],
}

export type PolymarketToolAction =
  | 'init'
  | 'initialize'
  | 'markets'
  | 'book'
  | 'price'
  | 'orders'
  | 'trades'
  | 'positions'
  | 'place-order'
  | 'cancel-order'
  | 'status'
  | 'reset'
