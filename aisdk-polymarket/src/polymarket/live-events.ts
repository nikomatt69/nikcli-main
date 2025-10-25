/**
 * Live events detection and filtering
 *
 * Finds active, liquid markets where you can bet RIGHT NOW:
 * - Sports events (in progress)
 * - Breaking news (live)
 * - Political events (ongoing)
 * - High liquidity (can execute trades)
 */

import { GammaClient } from './gamma.ts';
import { PolymarketClient } from './clob-client.ts';
import { Market } from './schemas.ts';
import { logger } from '../utils/logger.ts';
import { Cache } from '../utils/cache.ts';

/**
 * Live event criteria
 */
export interface LiveEventCriteria {
  /**
   * Minimum volume (USD) - default: $10k
   */
  minVolume?: number;

  /**
   * Minimum liquidity - default: $1k
   */
  minLiquidity?: number;

  /**
   * Maximum spread (%) - default: 5%
   */
  maxSpread?: number;

  /**
   * Only events ending soon (hours) - default: 24h
   */
  endingWithinHours?: number;

  /**
   * Event categories to include
   */
  categories?: string[];

  /**
   * Event tags to include
   */
  tags?: string[];

  /**
   * Exclude resolved markets
   */
  excludeResolved?: boolean;
}

/**
 * Live event with betting readiness score
 */
export interface LiveEvent extends Market {
  /**
   * Betting readiness score (0-100)
   * Based on: volume, liquidity, spread, time to close
   */
  bettingScore: number;

  /**
   * Best bid/ask spread (%)
   */
  spread: number;

  /**
   * Time to close (hours)
   */
  hoursToClose: number;

  /**
   * Is event live right now
   */
  isLive: boolean;

  /**
   * Event category (sports, politics, news, etc.)
   */
  category: string;

  /**
   * Live updates available (WebSocket)
   */
  hasLiveUpdates: boolean;
}

/**
 * Live events manager
 */
export class LiveEventsManager {
  private gammaClient: GammaClient;
  private clobClient: PolymarketClient;
  private cache: Cache<LiveEvent[]>;

  constructor(gammaClient: GammaClient, clobClient: PolymarketClient) {
    this.gammaClient = gammaClient;
    this.clobClient = clobClient;
    this.cache = new Cache({ ttl: 30000, maxSize: 100 }); // 30s cache
  }

  /**
   * Find live events matching criteria
   */
  async findLiveEvents(criteria: LiveEventCriteria = {}): Promise<LiveEvent[]> {
    const config = {
      minVolume: criteria.minVolume ?? 10000,
      minLiquidity: criteria.minLiquidity ?? 1000,
      maxSpread: criteria.maxSpread ?? 0.05,
      endingWithinHours: criteria.endingWithinHours ?? 24,
      categories: criteria.categories ?? [],
      tags: criteria.tags ?? [],
      excludeResolved: criteria.excludeResolved ?? true,
    };

    logger.info('Finding live events', config);

    // Check cache
    const cacheKey = JSON.stringify(config);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('Returning cached live events', { count: cached.length });
      return cached;
    }

    // Fetch active markets
    const markets = await this.gammaClient.getActiveMarkets(200);
    logger.debug('Fetched active markets', { count: markets.length });

    // Filter and score
    const liveEvents: LiveEvent[] = [];

    for (const market of markets) {
      // Basic filters
      if (config.excludeResolved && !market.active) continue;
      if (market.volume && market.volume < config.minVolume) continue;
      if (market.liquidity && market.liquidity < config.minLiquidity) continue;

      // Calculate metrics
      const spread = this.calculateSpread(market);
      if (spread > config.maxSpread) continue;

      const hoursToClose = this.calculateHoursToClose(market);
      if (config.endingWithinHours && hoursToClose > config.endingWithinHours) continue;

      // Determine category
      const category = this.detectCategory(market);

      // Check if event is live
      const isLive = this.isEventLive(market, hoursToClose);

      // Calculate betting score
      const bettingScore = this.calculateBettingScore(market, spread, hoursToClose);

      // Create live event
      const liveEvent: LiveEvent = {
        ...market,
        spread,
        hoursToClose,
        isLive,
        category,
        bettingScore,
        hasLiveUpdates: this.hasLiveUpdates(market),
      };

      liveEvents.push(liveEvent);
    }

    // Sort by betting score (descending)
    liveEvents.sort((a, b) => b.bettingScore - a.bettingScore);

    logger.info('Found live events', {
      total: liveEvents.length,
      live: liveEvents.filter((e) => e.isLive).length,
    });

    // Cache results
    this.cache.set(cacheKey, liveEvents);

    return liveEvents;
  }

  /**
   * Find live sports events
   */
  async findLiveSports(sport?: string): Promise<LiveEvent[]> {
    const criteria: LiveEventCriteria = {
      categories: sport ? [sport] : ['sports', 'nfl', 'nba', 'soccer', 'baseball', 'tennis'],
      endingWithinHours: 8, // Sports events end quickly
      minVolume: 5000,
      maxSpread: 0.03, // Tighter spread for sports
    };

    const events = await this.findLiveEvents(criteria);
    return events.filter((e) => e.isLive && e.category.includes('sport'));
  }

  /**
   * Find breaking news events
   */
  async findBreakingNews(): Promise<LiveEvent[]> {
    const criteria: LiveEventCriteria = {
      tags: ['news', 'breaking', 'current'],
      endingWithinHours: 48,
      minVolume: 10000,
    };

    const events = await this.findLiveEvents(criteria);
    return events.filter((e) => e.isLive);
  }

  /**
   * Find highest volume live events
   */
  async findTopLiveEvents(limit = 10): Promise<LiveEvent[]> {
    const events = await this.findLiveEvents({
      minVolume: 20000,
      minLiquidity: 5000,
      maxSpread: 0.04,
    });

    return events.slice(0, limit);
  }

  /**
   * Calculate bid/ask spread
   */
  private calculateSpread(market: Market): number {
    if (!market.outcomes || market.outcomes.length === 0) return 1;

    const yesPrice = market.outcomes.find((o) => o.name === 'YES')?.price ?? 0.5;
    const noPrice = market.outcomes.find((o) => o.name === 'NO')?.price ?? 0.5;

    // Spread should be close to 0 (yes + no ≈ 1)
    return Math.abs(1 - (yesPrice + noPrice));
  }

  /**
   * Calculate hours to close
   */
  private calculateHoursToClose(market: Market): number {
    if (!market.endDate) return Infinity;

    const endTime = new Date(market.endDate).getTime();
    const now = Date.now();
    const diff = endTime - now;

    return diff / (1000 * 60 * 60); // Convert to hours
  }

  /**
   * Detect event category from market data
   */
  private detectCategory(market: Market): string {
    const text = (market.question + ' ' + (market.description || '')).toLowerCase();

    // Sports
    if (text.match(/\b(nfl|nba|mlb|nhl|soccer|football|basketball|baseball|hockey|tennis|ufc|boxing|game|match|season|playoff)\b/)) {
      return 'sports';
    }

    // Politics
    if (text.match(/\b(election|president|senate|congress|vote|poll|biden|trump|political|debate)\b/)) {
      return 'politics';
    }

    // News/Current Events
    if (text.match(/\b(breaking|news|announce|report|happen|occur|today|this week)\b/)) {
      return 'news';
    }

    // Crypto
    if (text.match(/\b(bitcoin|ethereum|crypto|btc|eth|blockchain|defi)\b/)) {
      return 'crypto';
    }

    // Finance
    if (text.match(/\b(stock|market|fed|interest rate|gdp|inflation|recession)\b/)) {
      return 'finance';
    }

    return 'other';
  }

  /**
   * Determine if event is live right now
   */
  private isEventLive(market: Market, hoursToClose: number): boolean {
    const text = (market.question + ' ' + (market.description || '')).toLowerCase();

    // Event ending very soon = likely live
    if (hoursToClose < 2) return true;

    // Sports events with "live", "now", "today"
    if (text.match(/\b(live|now|currently|today|tonight|this hour)\b/)) {
      return true;
    }

    // High volume + tight spread = active betting = live
    if (market.volume && market.volume > 50000 && this.calculateSpread(market) < 0.02) {
      return true;
    }

    return false;
  }

  /**
   * Calculate betting readiness score (0-100)
   */
  private calculateBettingScore(market: Market, spread: number, hoursToClose: number): number {
    let score = 0;

    // Volume score (0-30)
    const volume = market.volume || 0;
    if (volume > 100000) score += 30;
    else if (volume > 50000) score += 25;
    else if (volume > 20000) score += 20;
    else if (volume > 10000) score += 15;
    else if (volume > 5000) score += 10;

    // Liquidity score (0-25)
    const liquidity = market.liquidity || 0;
    if (liquidity > 10000) score += 25;
    else if (liquidity > 5000) score += 20;
    else if (liquidity > 2000) score += 15;
    else if (liquidity > 1000) score += 10;
    else if (liquidity > 500) score += 5;

    // Spread score (0-25)
    if (spread < 0.01) score += 25;
    else if (spread < 0.02) score += 20;
    else if (spread < 0.03) score += 15;
    else if (spread < 0.05) score += 10;
    else if (spread < 0.10) score += 5;

    // Time urgency score (0-20)
    if (hoursToClose < 1) score += 20;
    else if (hoursToClose < 4) score += 15;
    else if (hoursToClose < 12) score += 10;
    else if (hoursToClose < 24) score += 5;

    return Math.min(100, score);
  }

  /**
   * Check if market has live updates (WebSocket support)
   */
  private hasLiveUpdates(market: Market): boolean {
    // Markets with high volume typically have WebSocket streams
    return (market.volume ?? 0) > 10000;
  }

  /**
   * Get detailed orderbook for live event
   */
  async getLiveOrderbook(event: LiveEvent) {
    const yesToken = event.outcomes.find((o) => o.name === 'YES');
    if (!yesToken) return null;

    try {
      const orderbook = await this.clobClient.getOrderbook(yesToken.tokenId);
      return orderbook;
    } catch (error) {
      logger.error('Failed to fetch live orderbook', error);
      return null;
    }
  }
}

/**
 * Create live events manager
 */
export function createLiveEventsManager(
  gammaClient: GammaClient,
  clobClient: PolymarketClient
): LiveEventsManager {
  return new LiveEventsManager(gammaClient, clobClient);
}
