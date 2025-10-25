import { Market, MarketSchema } from './schemas.ts';

/**
 * Gamma API client for Polymarket market data
 */
export interface GammaConfig {
  /**
   * Gamma API base URL (default: https://gamma-api.polymarket.com)
   */
  apiUrl?: string;

  /**
   * Data API base URL (default: https://data-api.polymarket.com)
   */
  dataApiUrl?: string;
}

/**
 * Market search parameters
 */
export interface MarketSearchParams {
  query?: string;
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  tag?: string;
  archived?: boolean;
}

/**
 * Gamma API client for fetching market data
 */
export class GammaClient {
  private apiUrl: string;
  private dataApiUrl: string;

  constructor(config: GammaConfig = {}) {
    this.apiUrl = config.apiUrl || process.env.POLYMARKET_GAMMA_API || 'https://gamma-api.polymarket.com';
    this.dataApiUrl = config.dataApiUrl || process.env.POLYMARKET_DATA_API || 'https://data-api.polymarket.com';
  }

  /**
   * Search markets by query
   */
  async searchMarkets(params: MarketSearchParams = {}): Promise<Market[]> {
    try {
      const queryParams = new URLSearchParams();

      if (params.query) queryParams.append('query', params.query);
      if (params.limit) queryParams.append('limit', params.limit.toString());
      if (params.offset) queryParams.append('offset', params.offset.toString());
      if (params.active !== undefined) queryParams.append('active', params.active.toString());
      if (params.closed !== undefined) queryParams.append('closed', params.closed.toString());
      if (params.tag) queryParams.append('tag', params.tag);
      if (params.archived !== undefined) queryParams.append('archived', params.archived.toString());

      const response = await fetch(`${this.apiUrl}/markets?${queryParams.toString()}`);

      if (!response.ok) {
        throw new Error(`Market search failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Transform API response to our Market schema
      const markets = this.transformMarkets(data);

      return markets;
    } catch (error) {
      throw new Error(`Failed to search markets: ${error}`);
    }
  }

  /**
   * Get market by ID
   */
  async getMarket(marketId: string): Promise<Market | null> {
    try {
      const response = await fetch(`${this.apiUrl}/markets/${marketId}`);

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Get market failed: ${response.statusText}`);
      }

      const data = await response.json();

      return this.transformMarket(data);
    } catch (error) {
      throw new Error(`Failed to get market: ${error}`);
    }
  }

  /**
   * Get all active markets
   */
  async getActiveMarkets(limit = 100): Promise<Market[]> {
    return this.searchMarkets({ active: true, limit });
  }

  /**
   * Get markets by tag
   */
  async getMarketsByTag(tag: string, limit = 50): Promise<Market[]> {
    return this.searchMarkets({ tag, limit });
  }

  /**
   * Get market prices from Data API
   */
  async getMarketPrices(marketId: string): Promise<{ tokenId: string; price: number }[]> {
    try {
      const response = await fetch(`${this.dataApiUrl}/prices/${marketId}`);

      if (!response.ok) {
        throw new Error(`Get prices failed: ${response.statusText}`);
      }

      const data = await response.json() as any;

      return data.map((item: any) => ({
        tokenId: item.token_id,
        price: parseFloat(item.price),
      }));
    } catch (error) {
      throw new Error(`Failed to get market prices: ${error}`);
    }
  }

  /**
   * Transform API response to Market schema
   */
  private transformMarkets(data: any): Market[] {
    const markets = Array.isArray(data) ? data : data.data || [];

    return markets.map((item: any) => this.transformMarket(item));
  }

  /**
   * Transform single market response
   */
  private transformMarket(item: any): Market {
    const market: Market = {
      id: item.id || item.condition_id,
      question: item.question || item.title || '',
      description: item.description,
      endDate: item.end_date_iso || item.endDate,
      volume: parseFloat(item.volume || '0'),
      liquidity: parseFloat(item.liquidity || '0'),
      outcomes: [],
      active: item.active !== false,
    };

    // Parse outcomes/tokens
    if (item.tokens) {
      market.outcomes = item.tokens.map((token: any) => ({
        name: token.outcome || token.name,
        tokenId: token.token_id || token.id,
        price: parseFloat(token.price || '0.5'),
      }));
    } else if (item.outcomes) {
      market.outcomes = item.outcomes.map((outcome: any, index: number) => ({
        name: outcome,
        tokenId: item.token_ids?.[index] || '',
        price: parseFloat(item.prices?.[index] || '0.5'),
      }));
    } else {
      // Binary market default: YES/NO
      market.outcomes = [
        {
          name: 'YES',
          tokenId: item.token_id_yes || item.yes_token_id || '',
          price: parseFloat(item.yes_price || '0.5'),
        },
        {
          name: 'NO',
          tokenId: item.token_id_no || item.no_token_id || '',
          price: parseFloat(item.no_price || '0.5'),
        },
      ];
    }

    // Validate with schema
    return MarketSchema.parse(market);
  }

  /**
   * Find best matching market by natural language query
   */
  async findBestMatch(query: string): Promise<Market | null> {
    const markets = await this.searchMarkets({ query, limit: 10 });

    if (markets.length === 0) return null;

    // Return first result (API should sort by relevance)
    return markets[0];
  }
}

/**
 * Create a new Gamma client instance
 */
export function createGammaClient(config: GammaConfig = {}): GammaClient {
  return new GammaClient(config);
}
