import { tool } from 'ai';
import { z } from 'zod';
import { PolymarketClient } from '../polymarket/clob-client.ts';
import { GammaClient } from '../polymarket/gamma.ts';
import { OrderSideSchema, OrderTypeSchema } from '../polymarket/schemas.ts';

/**
 * AI tools configuration
 */
export interface ToolsConfig {
  /**
   * Polymarket CLOB client
   */
  clobClient: PolymarketClient;

  /**
   * Gamma client for market data
   */
  gammaClient: GammaClient;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Sanitize sensitive data for logging
 */
function sanitize(obj: any): any {
  const sanitized = { ...obj };
  const sensitiveFields = ['signature', 'apiKey', 'apiSecret', 'privateKey'];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Create Polymarket tools for AI SDK
 */
export function polymarketTools(config: ToolsConfig) {
  const { clobClient, gammaClient, debug } = config;

  const log = (message: string, data?: any) => {
    if (debug) {
      console.log(`[PolymarketTools] ${message}`, data ? sanitize(data) : '');
    }
  };

  return {
    /**
     * Search markets by query
     */
    search_markets: tool({
      description:
        'Search Polymarket markets by natural language query. Returns top matching markets with IDs, outcomes, and current prices.',
      parameters: z.object({
        query: z.string().describe('Natural language search query (e.g., "Trump 2024", "Bitcoin price")'),
        limit: z.number().int().positive().default(5).describe('Maximum number of results to return'),
      }),
      execute: async ({ query, limit }) => {
        log('Searching markets', { query, limit });

        try {
          const markets = await gammaClient.searchMarkets({ query, limit });

          const results = markets.map((m) => ({
            marketId: m.id,
            question: m.question,
            description: m.description,
            endDate: m.endDate,
            volume: m.volume,
            liquidity: m.liquidity,
            outcomes: m.outcomes.map((o) => ({
              name: o.name,
              tokenId: o.tokenId,
              price: o.price,
            })),
          }));

          log('Search results', { count: results.length });

          return {
            success: true,
            markets: results,
            count: results.length,
          };
        } catch (error) {
          log('Search failed', { error });
          return {
            success: false,
            error: String(error),
            markets: [],
          };
        }
      },
    }),

    /**
     * Get orderbook for a token
     */
    orderbook: tool({
      description:
        'Get the current orderbook (bids and asks) for a specific token ID. Shows available liquidity and best prices.',
      parameters: z.object({
        tokenId: z.string().describe('Token ID (outcome token from market search)'),
      }),
      execute: async ({ tokenId }) => {
        log('Fetching orderbook', { tokenId });

        try {
          const orderbook = await clobClient.getOrderbook(tokenId);

          const bestBid = orderbook.bids[0];
          const bestAsk = orderbook.asks[0];

          log('Orderbook fetched', {
            bids: orderbook.bids.length,
            asks: orderbook.asks.length,
          });

          return {
            success: true,
            tokenId: orderbook.tokenId,
            bestBid: bestBid ? { price: bestBid.price, size: bestBid.size } : null,
            bestAsk: bestAsk ? { price: bestAsk.price, size: bestAsk.size } : null,
            bids: orderbook.bids.slice(0, 10),
            asks: orderbook.asks.slice(0, 10),
            timestamp: orderbook.timestamp,
          };
        } catch (error) {
          log('Orderbook fetch failed', { error });
          return {
            success: false,
            error: String(error),
          };
        }
      },
    }),

    /**
     * Place an order
     */
    order_place: tool({
      description:
        'Place a limit order on Polymarket. Validates price (tick size), size (min size), and risk limits before execution. Returns order ID if successful.',
      parameters: z.object({
        tokenId: z.string().describe('Token ID to trade'),
        side: OrderSideSchema.describe('BUY or SELL'),
        price: z
          .number()
          .min(0.01)
          .max(0.99)
          .describe('Limit price between 0.01 and 0.99 (represents probability)'),
        size: z.number().positive().describe('Order size (minimum 1 share)'),
        orderType: OrderTypeSchema.default('GTC').describe('Order type: GTC, FAK, FOK, or GTD'),
        expiresAt: z.number().int().positive().optional().describe('Expiration timestamp (required for GTD)'),
        negrisk: z.boolean().default(false).describe('Use negative risk (for sell orders)'),
      }),
      execute: async ({ tokenId, side, price, size, orderType, expiresAt, negrisk }) => {
        log('Placing order', { tokenId, side, price, size, orderType });

        try {
          const order = await clobClient.placeOrder({
            tokenId,
            side,
            price,
            size,
            orderType,
            expiresAt,
            negrisk,
          });

          log('Order placed', { orderId: order.orderId });

          return {
            success: true,
            orderId: order.orderId,
            orderHash: order.orderHash,
            status: order.status,
            tokenId: order.tokenId,
            side: order.side,
            price: order.price,
            size: order.size,
            timestamp: order.timestamp,
          };
        } catch (error) {
          log('Order placement failed', { error });
          return {
            success: false,
            error: String(error),
          };
        }
      },
    }),

    /**
     * Cancel an order
     */
    order_cancel: tool({
      description: 'Cancel an existing order by order ID or order hash.',
      parameters: z.object({
        orderId: z.string().optional().describe('Order ID to cancel'),
        orderHash: z.string().optional().describe('Order hash to cancel'),
      }),
      execute: async ({ orderId, orderHash }) => {
        if (!orderId && !orderHash) {
          return {
            success: false,
            error: 'Either orderId or orderHash must be provided',
          };
        }

        log('Cancelling order', { orderId, orderHash });

        try {
          const result = await clobClient.cancelOrder(orderId || orderHash || '', orderHash);

          log('Order cancelled', { success: result.success });

          return result;
        } catch (error) {
          log('Order cancellation failed', { error });
          return {
            success: false,
            error: String(error),
          };
        }
      },
    }),

    /**
     * Get portfolio (active orders)
     */
    portfolio: tool({
      description: 'Get all active orders for the current wallet or a specific address.',
      parameters: z.object({
        owner: z.string().optional().describe('Wallet address (defaults to current wallet)'),
      }),
      execute: async ({ owner }) => {
        log('Fetching portfolio', { owner });

        try {
          const orders = await clobClient.getActiveOrders(owner);

          log('Portfolio fetched', { orders: orders.length });

          return {
            success: true,
            orders: orders.map((o) => ({
              orderId: o.orderId,
              tokenId: o.tokenId,
              side: o.side,
              price: o.price,
              size: o.size,
              filled: o.filled,
              remaining: o.remaining,
              status: o.status,
              timestamp: o.timestamp,
            })),
            count: orders.length,
          };
        } catch (error) {
          log('Portfolio fetch failed', { error });
          return {
            success: false,
            error: String(error),
            orders: [],
          };
        }
      },
    }),

    /**
     * Get order status
     */
    order_status: tool({
      description: 'Get the current status of a specific order by order ID.',
      parameters: z.object({
        orderId: z.string().describe('Order ID to check'),
      }),
      execute: async ({ orderId }) => {
        log('Fetching order status', { orderId });

        try {
          const order = await clobClient.getOrder(orderId);

          if (!order) {
            return {
              success: false,
              error: 'Order not found',
            };
          }

          log('Order status fetched', { status: order.status });

          return {
            success: true,
            order: {
              orderId: order.orderId,
              tokenId: order.tokenId,
              side: order.side,
              price: order.price,
              size: order.size,
              filled: order.filled,
              remaining: order.remaining,
              status: order.status,
              timestamp: order.timestamp,
            },
          };
        } catch (error) {
          log('Order status fetch failed', { error });
          return {
            success: false,
            error: String(error),
          };
        }
      },
    }),

    /**
     * Get market details
     */
    market_details: tool({
      description: 'Get detailed information about a specific market by market ID.',
      parameters: z.object({
        marketId: z.string().describe('Market ID (condition ID)'),
      }),
      execute: async ({ marketId }) => {
        log('Fetching market details', { marketId });

        try {
          const market = await gammaClient.getMarket(marketId);

          if (!market) {
            return {
              success: false,
              error: 'Market not found',
            };
          }

          log('Market details fetched', { question: market.question });

          return {
            success: true,
            market: {
              id: market.id,
              question: market.question,
              description: market.description,
              endDate: market.endDate,
              volume: market.volume,
              liquidity: market.liquidity,
              outcomes: market.outcomes,
              active: market.active,
            },
          };
        } catch (error) {
          log('Market details fetch failed', { error });
          return {
            success: false,
            error: String(error),
          };
        }
      },
    }),
  };
}

/**
 * Type helper to extract tools object type
 */
export type PolymarketTools = ReturnType<typeof polymarketTools>;
