/*
 * Polymarket Gamma Markets API Client
 *
 * REST API client for accessing Polymarket market data, metadata, and indexing.
 * Provides read-only access to enriched market information beyond on-chain data.
 */

import { EventEmitter } from 'events'

// ============================================================
// TYPE DEFINITIONS & INTERFACES
// ============================================================

export interface GammaMarket {
  id: string
  conditionId: string
  question: string
  category: string
  endDate: number
  volume: string
  liquidity: string
  outcomes: Array<{
    name: string
    price: number
    probability: number
  }>
  metadata?: {
    createdAt: number
    updatedAt: number
    tags: string[]
  }
}

export interface GammaMarketSearch {
  limit?: number
  offset?: number
  category?: string
  status?: 'active' | 'closed' | 'all'
  sort?: 'volume' | 'liquidity' | 'newest' | 'ending_soon'
}

export interface GammaMarketDetails {
  id: string
  conditionId: string
  question: string
  description?: string
  category: string
  endDate: number
  volume24h: string
  volumeTotal: string
  liquidityTotal: string
  creatorAddress: string
  outcomes: Array<{
    id: string
    name: string
    currentPrice: number
    historicalPrices: Array<{ price: number; timestamp: number }>
  }>
  tokens: Array<{
    tokenId: string
    outcomeSlotCount: number
  }>
}

export interface GammaAssetInfo {
  assetId: string
  tokenId: string
  market: GammaMarket
  price: number
  volume24h: string
}

export interface GammaTradingData {
  assetId: string
  price: number
  volume24h: string
  trades24h: number
  lastTrade: {
    price: number
    timestamp: number
  }
}

export interface GammaOrderbook {
  assetId: string
  bids: Array<{ price: number; size: number }>
  asks: Array<{ price: number; size: number }>
  spread: number
  timestamp: number
}

// ============================================================
// GAMMA MARKETS API CLIENT
// ============================================================

export class PolymarketGammaAPI extends EventEmitter {
  private apiUrl: string = 'https://gamma-api.polymarket.com'
  private isInitialized: boolean = false
  private requestCache: Map<string, { data: any; timestamp: number }> = new Map()
  private cacheExpiry: number = 60000 // 1 minute default
  private rateLimiter: any = null

  constructor(apiUrl?: string) {
    super()
    if (apiUrl) {
      this.apiUrl = apiUrl
    }
  }

  /**
   * Initialize API client
   */
  async initialize(): Promise<void> {
    try {
      console.log('📡 Initializing Gamma Markets API...')

      // Verify API connectivity
      const isHealthy = await this.healthCheck()
      if (!isHealthy) {
        console.warn('⚠︎ Gamma API health check failed, continuing anyway')
      }

      this.isInitialized = true
      console.log('✓ Gamma Markets API initialized')
      this.emit('initialized')
    } catch (error: any) {
      console.error('✖ Gamma API initialization failed:', error.message)
      throw error
    }
  }

  /**
   * Search for markets
   */
  async searchMarkets(query: GammaMarketSearch = {}): Promise<GammaMarket[]> {
    this.validateInitialized()

    try {
      const params = new URLSearchParams()
      if (query.limit) params.append('limit', query.limit.toString())
      if (query.offset) params.append('offset', query.offset.toString())
      if (query.category) params.append('category', query.category)
      if (query.status) params.append('status', query.status)
      if (query.sort) params.append('sort', query.sort)

      const url = `/markets?${params.toString()}`
      const markets = await this.makeRequest('GET', url)

      console.log(`✓ Found ${markets.length} markets`)
      this.emit('marketsSearched', { count: markets.length, query })

      return markets
    } catch (error: any) {
      throw new Error(`Market search failed: ${error.message}`)
    }
  }

  /**
   * Get market details
   */
  async getMarketDetails(marketId: string): Promise<GammaMarketDetails> {
    this.validateInitialized()

    try {
      const market = await this.makeRequest('GET', `/markets/${marketId}`)
      console.log(`✓ Retrieved details for market ${marketId}`)
      return market
    } catch (error: any) {
      throw new Error(`Failed to get market details: ${error.message}`)
    }
  }

  /**
   * Get asset information
   */
  async getAssetInfo(assetId: string): Promise<GammaAssetInfo> {
    this.validateInitialized()

    try {
      const asset = await this.makeRequest('GET', `/assets/${assetId}`)
      console.log(`✓ Retrieved asset info for ${assetId}`)
      return asset
    } catch (error: any) {
      throw new Error(`Failed to get asset info: ${error.message}`)
    }
  }

  /**
   * Get trading data for asset
   */
  async getTradingData(assetId: string): Promise<GammaTradingData> {
    this.validateInitialized()

    try {
      const data = await this.makeRequest('GET', `/assets/${assetId}/trading`)
      console.log(`✓ Retrieved trading data for ${assetId}`)
      return data
    } catch (error: any) {
      throw new Error(`Failed to get trading data: ${error.message}`)
    }
  }

  /**
   * Get orderbook data from Gamma
   */
  async getOrderbook(assetId: string): Promise<GammaOrderbook> {
    this.validateInitialized()

    try {
      const orderbook = await this.makeRequest('GET', `/assets/${assetId}/orderbook`)
      console.log(`✓ Retrieved orderbook for ${assetId}`)
      return orderbook
    } catch (error: any) {
      throw new Error(`Failed to get orderbook: ${error.message}`)
    }
  }

  /**
   * Get markets by category
   */
  async getMarketsByCategory(category: string, limit: number = 50): Promise<GammaMarket[]> {
    return this.searchMarkets({
      category,
      limit,
      sort: 'volume',
    })
  }

  /**
   * Get trending markets (by volume)
   */
  async getTrendingMarkets(limit: number = 20): Promise<GammaMarket[]> {
    return this.searchMarkets({
      limit,
      sort: 'volume',
      status: 'active',
    })
  }

  /**
   * Get markets ending soon
   */
  async getMarketsEndingSoon(limit: number = 20): Promise<GammaMarket[]> {
    return this.searchMarkets({
      limit,
      sort: 'ending_soon',
      status: 'active',
    })
  }

  /**
   * Get popular markets
   */
  async getPopularMarkets(limit: number = 20): Promise<GammaMarket[]> {
    return this.searchMarkets({
      limit,
      sort: 'volume',
      status: 'active',
    })
  }

  /**
   * Get markets by search term
   */
  async searchByTerm(searchTerm: string, limit: number = 20): Promise<GammaMarket[]> {
    this.validateInitialized()

    try {
      const params = new URLSearchParams()
      params.append('search', searchTerm)
      params.append('limit', limit.toString())

      const markets = await this.makeRequest('GET', `/markets/search?${params.toString()}`)
      console.log(`✓ Found ${markets.length} markets matching "${searchTerm}"`)
      return markets
    } catch (error: any) {
      throw new Error(`Search failed: ${error.message}`)
    }
  }

  /**
   * Get market statistics
   */
  async getMarketStats(marketId: string): Promise<any> {
    this.validateInitialized()

    try {
      const stats = await this.makeRequest('GET', `/markets/${marketId}/stats`)
      return stats
    } catch (error: any) {
      throw new Error(`Failed to get market stats: ${error.message}`)
    }
  }

  /**
   * Health check for API
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.makeRequest('GET', '/health', { noCache: true })
      return result.status === 'healthy'
    } catch (error) {
      console.error('✖ Gamma API health check failed:', error)
      return false
    }
  }

  /**
   * Get API status
   */
  async getApiStatus(): Promise<any> {
    this.validateInitialized()

    try {
      return await this.makeRequest('GET', '/status')
    } catch (error: any) {
      throw new Error(`Failed to get API status: ${error.message}`)
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.requestCache.clear()
    console.log('✓ Cache cleared')
  }

  /**
   * Set cache expiry time
   */
  setCacheExpiry(expiryMs: number): void {
    this.cacheExpiry = expiryMs
  }

  /**
   * Make HTTP request with caching
   */
  private async makeRequest(
    method: string,
    path: string,
    options: any = {}
  ): Promise<any> {
    const cacheKey = `${method}:${path}`

    // Check cache
    if (method === 'GET' && !options.noCache) {
      const cached = this.requestCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data
      }
    }

    const url = `${this.apiUrl}${path}`

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 30000,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }))
        throw new Error(error.message || `HTTP ${response.status}`)
      }

      const data = await response.json()

      // Cache successful GET requests
      if (method === 'GET') {
        this.requestCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
        })
      }

      return data
    } catch (error: any) {
      throw new Error(`Gamma API request failed: ${error.message}`)
    }
  }

  /**
   * Validate client is initialized
   */
  private validateInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Gamma API client not initialized. Call initialize() first.')
    }
  }

  /**
   * Get initialization status
   */
  get initialized(): boolean {
    return this.isInitialized
  }
}

export default PolymarketGammaAPI
