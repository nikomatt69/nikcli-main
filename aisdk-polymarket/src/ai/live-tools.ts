import { tool } from 'ai';
import { z } from 'zod';
import { PolymarketWebSocket } from '../polymarket/websocket-client.ts';
import { LiveEventsManager, LiveEvent } from '../polymarket/live-events.ts';
import { logger } from '../utils/logger.ts';

/**
 * Live tools configuration
 */
export interface LiveToolsConfig {
  /**
   * WebSocket client
   */
  wsClient: PolymarketWebSocket;

  /**
   * Live events manager
   */
  liveManager: LiveEventsManager;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Create live trading tools for AI SDK
 */
export function liveTools(config: LiveToolsConfig) {
  const { wsClient, liveManager, debug } = config;

  const log = (message: string, data?: any) => {
    if (debug) {
      logger.debug(`[LiveTools] ${message}`, data);
    }
  };

  return {
    /**
     * Find live events you can bet on RIGHT NOW
     */
    find_live_events: tool({
      description:
        'Find live events happening right now where you can place bets. ' +
        'Returns events with high liquidity, tight spreads, and active betting. ' +
        'Perfect for real-time trading opportunities.',
      parameters: z.object({
        category: z
          .enum(['sports', 'politics', 'news', 'crypto', 'finance', 'all'])
          .default('all')
          .describe('Event category to filter'),
        limit: z.number().int().positive().default(10).describe('Maximum number of events to return'),
        minVolume: z.number().positive().optional().describe('Minimum 24h volume (USD)'),
        onlyLive: z.boolean().default(true).describe('Only return events that are live right now'),
      }),
      execute: async ({ category, limit, minVolume, onlyLive }) => {
        log('Finding live events', { category, limit, minVolume, onlyLive });

        try {
          let events: LiveEvent[];

          if (category === 'sports') {
            events = await liveManager.findLiveSports();
          } else if (category === 'news') {
            events = await liveManager.findBreakingNews();
          } else {
            events = await liveManager.findLiveEvents({
              minVolume,
              minLiquidity: 1000,
              maxSpread: 0.05,
            });
          }

          // Filter by category if not 'all'
          if (category !== 'all') {
            events = events.filter((e) => e.category === category);
          }

          // Filter only live if requested
          if (onlyLive) {
            events = events.filter((e) => e.isLive);
          }

          // Limit results
          events = events.slice(0, limit);

          log('Found live events', { count: events.length });

          return {
            success: true,
            events: events.map((e) => ({
              marketId: e.id,
              question: e.question,
              category: e.category,
              isLive: e.isLive,
              bettingScore: e.bettingScore,
              volume: e.volume,
              liquidity: e.liquidity,
              spread: e.spread,
              hoursToClose: e.hoursToClose,
              outcomes: e.outcomes.map((o) => ({
                name: o.name,
                tokenId: o.tokenId,
                price: o.price,
              })),
            })),
            count: events.length,
          };
        } catch (error) {
          log('Failed to find live events', { error });
          return {
            success: false,
            error: String(error),
            events: [],
          };
        }
      },
    }),

    /**
     * Subscribe to real-time orderbook updates
     */
    subscribe_orderbook_stream: tool({
      description:
        'Subscribe to real-time orderbook updates via WebSocket. ' +
        'Get instant notifications when bids/asks change. ' +
        'Use this to monitor live market movements.',
      parameters: z.object({
        tokenId: z.string().describe('Token ID to monitor'),
        duration: z.number().int().positive().default(60).describe('How long to monitor (seconds)'),
      }),
      execute: async ({ tokenId, duration }) => {
        log('Subscribing to orderbook stream', { tokenId, duration });

        try {
          // Connect WebSocket if not connected
          if (!wsClient.isConnected()) {
            await wsClient.connect();
          }

          // Subscribe to orderbook
          wsClient.subscribeOrderbook(tokenId);

          // Collect updates
          const updates: any[] = [];
          let updateCount = 0;

          const handleUpdate = (update: any) => {
            if (update.tokenId === tokenId) {
              updateCount++;
              updates.push({
                timestamp: update.timestamp,
                bestBid: update.bids[0]?.price,
                bestAsk: update.asks[0]?.price,
                bidDepth: update.bids.length,
                askDepth: update.asks.length,
              });

              logger.info('Orderbook update', {
                tokenId,
                bestBid: update.bids[0]?.price,
                bestAsk: update.asks[0]?.price,
              });
            }
          };

          wsClient.on('orderbook', handleUpdate);

          // Wait for duration
          await new Promise((resolve) => setTimeout(resolve, duration * 1000));

          // Cleanup
          wsClient.off('orderbook', handleUpdate);
          wsClient.unsubscribe(JSON.stringify({ type: 'orderbook', tokenId }));

          log('Orderbook stream completed', { updateCount });

          return {
            success: true,
            tokenId,
            duration,
            updateCount,
            lastUpdate: updates[updates.length - 1],
            summary: {
              totalUpdates: updateCount,
              averageSpread:
                updates.length > 0
                  ? updates.reduce((sum, u) => sum + (parseFloat(u.bestAsk) - parseFloat(u.bestBid)), 0) /
                    updates.length
                  : 0,
            },
          };
        } catch (error) {
          log('Failed to subscribe to orderbook', { error });
          return {
            success: false,
            error: String(error),
          };
        }
      },
    }),

    /**
     * Subscribe to real-time trades
     */
    subscribe_trades_stream: tool({
      description:
        'Subscribe to real-time trade events via WebSocket. ' +
        'Get notified every time a trade executes. ' +
        'Use this to see live market activity and price movements.',
      parameters: z.object({
        tokenId: z.string().describe('Token ID to monitor'),
        duration: z.number().int().positive().default(60).describe('How long to monitor (seconds)'),
      }),
      execute: async ({ tokenId, duration }) => {
        log('Subscribing to trades stream', { tokenId, duration });

        try {
          // Connect WebSocket if not connected
          if (!wsClient.isConnected()) {
            await wsClient.connect();
          }

          // Subscribe to trades
          wsClient.subscribeTrades(tokenId);

          // Collect trades
          const trades: any[] = [];

          const handleTrade = (trade: any) => {
            if (trade.tokenId === tokenId) {
              trades.push({
                side: trade.side,
                price: trade.price,
                size: trade.size,
                timestamp: trade.timestamp,
              });

              logger.info('Trade event', {
                tokenId,
                side: trade.side,
                price: trade.price,
                size: trade.size,
              });
            }
          };

          wsClient.on('trade', handleTrade);

          // Wait for duration
          await new Promise((resolve) => setTimeout(resolve, duration * 1000));

          // Cleanup
          wsClient.off('trade', handleTrade);
          wsClient.unsubscribe(JSON.stringify({ type: 'trades', tokenId }));

          log('Trades stream completed', { tradeCount: trades.length });

          // Calculate statistics
          const buyTrades = trades.filter((t) => t.side === 'BUY');
          const sellTrades = trades.filter((t) => t.side === 'SELL');
          const totalVolume = trades.reduce((sum, t) => sum + parseFloat(t.size), 0);

          return {
            success: true,
            tokenId,
            duration,
            tradeCount: trades.length,
            trades: trades.slice(-10), // Last 10 trades
            summary: {
              buyCount: buyTrades.length,
              sellCount: sellTrades.length,
              totalVolume,
              avgPrice: trades.length > 0 ? trades.reduce((sum, t) => sum + parseFloat(t.price), 0) / trades.length : 0,
              priceRange: {
                high: trades.length > 0 ? Math.max(...trades.map((t) => parseFloat(t.price))) : 0,
                low: trades.length > 0 ? Math.min(...trades.map((t) => parseFloat(t.price))) : 0,
              },
            },
          };
        } catch (error) {
          log('Failed to subscribe to trades', { error });
          return {
            success: false,
            error: String(error),
          };
        }
      },
    }),

    /**
     * Get top betting opportunities right now
     */
    get_top_betting_opportunities: tool({
      description:
        'Get the top live betting opportunities ranked by betting score. ' +
        'Score is based on volume, liquidity, spread, and time urgency. ' +
        'Perfect for finding the best markets to trade RIGHT NOW.',
      parameters: z.object({
        limit: z.number().int().positive().default(5).describe('Number of opportunities to return'),
      }),
      execute: async ({ limit }) => {
        log('Getting top betting opportunities', { limit });

        try {
          const events = await liveManager.findTopLiveEvents(limit);

          return {
            success: true,
            opportunities: events.map((e) => ({
              marketId: e.id,
              question: e.question,
              category: e.category,
              bettingScore: e.bettingScore,
              isLive: e.isLive,
              volume: e.volume,
              liquidity: e.liquidity,
              spread: e.spread,
              hoursToClose: e.hoursToClose,
              outcomes: e.outcomes,
              recommendation: getRecommendation(e),
            })),
            count: events.length,
          };
        } catch (error) {
          log('Failed to get betting opportunities', { error });
          return {
            success: false,
            error: String(error),
            opportunities: [],
          };
        }
      },
    }),

    /**
     * Monitor live event with WebSocket
     */
    monitor_live_event: tool({
      description:
        'Monitor a specific live event with real-time updates. ' +
        'Combines orderbook and trade streams for complete market visibility. ' +
        'Use this for active trading on live events.',
      parameters: z.object({
        marketId: z.string().describe('Market ID to monitor'),
        tokenId: z.string().describe('Token ID (YES or NO) to monitor'),
        duration: z.number().int().positive().default(120).describe('Monitoring duration (seconds)'),
      }),
      execute: async ({ marketId, tokenId, duration }) => {
        log('Monitoring live event', { marketId, tokenId, duration });

        try {
          // Connect WebSocket
          if (!wsClient.isConnected()) {
            await wsClient.connect();
          }

          // Subscribe to both orderbook and trades
          wsClient.subscribeOrderbook(tokenId);
          wsClient.subscribeTrades(tokenId);

          const orderbookUpdates: any[] = [];
          const trades: any[] = [];

          const handleOrderbook = (update: any) => {
            if (update.tokenId === tokenId) {
              orderbookUpdates.push(update);
            }
          };

          const handleTrade = (trade: any) => {
            if (trade.tokenId === tokenId) {
              trades.push(trade);
            }
          };

          wsClient.on('orderbook', handleOrderbook);
          wsClient.on('trade', handleTrade);

          // Monitor
          await new Promise((resolve) => setTimeout(resolve, duration * 1000));

          // Cleanup
          wsClient.off('orderbook', handleOrderbook);
          wsClient.off('trade', handleTrade);
          wsClient.unsubscribe(JSON.stringify({ type: 'orderbook', tokenId }));
          wsClient.unsubscribe(JSON.stringify({ type: 'trades', tokenId }));

          log('Monitoring completed', {
            orderbookUpdates: orderbookUpdates.length,
            trades: trades.length,
          });

          return {
            success: true,
            marketId,
            tokenId,
            duration,
            orderbookUpdateCount: orderbookUpdates.length,
            tradeCount: trades.length,
            latestOrderbook: orderbookUpdates[orderbookUpdates.length - 1],
            recentTrades: trades.slice(-5),
            marketActivity: {
              buyPressure: trades.filter((t) => t.side === 'BUY').length,
              sellPressure: trades.filter((t) => t.side === 'SELL').length,
              priceMovement: calculatePriceMovement(trades),
            },
          };
        } catch (error) {
          log('Failed to monitor event', { error });
          return {
            success: false,
            error: String(error),
          };
        }
      },
    }),
  };

  /**
   * Helper: Get betting recommendation
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function getRecommendation(event: LiveEvent): string {
    if (event.bettingScore >= 80) {
      return 'Excellent - High volume, tight spread, very liquid';
    } else if (event.bettingScore >= 60) {
      return 'Good - Decent liquidity and volume';
    } else if (event.bettingScore >= 40) {
      return 'Fair - Some liquidity, wider spread';
    } else {
      return 'Caution - Lower liquidity, may have slippage';
    }
  }

  /**
   * Helper: Calculate price movement from trades
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function calculatePriceMovement(trades: any[]): string {
    if (trades.length < 2) return 'Insufficient data';

    const firstPrice = parseFloat(trades[0].price);
    const lastPrice = parseFloat(trades[trades.length - 1].price);
    const change = ((lastPrice - firstPrice) / firstPrice) * 100;

    if (change > 2) return `Up ${change.toFixed(2)}%`;
    if (change < -2) return `Down ${Math.abs(change).toFixed(2)}%`;
    return `Stable (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`;
  }
}

/**
 * Type helper
 */
export type LiveTools = ReturnType<typeof liveTools>;
