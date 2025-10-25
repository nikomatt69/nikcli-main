/**
 * Example: Production-ready trading with retry, rate limiting, and caching
 *
 * This example demonstrates:
 * 1. Retry logic for network errors
 * 2. Rate limiting to prevent API abuse
 * 3. Caching for market data
 * 4. Structured logging
 * 5. Error handling with recovery suggestions
 */

import 'dotenv/config';
import {
  createCdpWallet,
  createPolymarketClient,
  createGammaClient,
} from '../src/index.ts';
import {
  retryPolymarketRequest,
  RateLimiters,
  Caches,
  logger,
  LogLevel,
  parsePolymarketError,
  formatErrorMessage,
} from '../src/utils/index.ts';

async function main() {
  // Setup logger
  logger.setLevel(LogLevel.DEBUG);
  logger.info('Starting production trading example');

  try {
    // 1. Setup CDP Wallet with retry
    logger.info('Setting up CDP wallet with retry logic');

    const wallet = await retryPolymarketRequest(
      () => createCdpWallet({ network: 'polygon' }),
      { maxAttempts: 3 }
    );

    const account = await wallet.getOrCreateEvmAccount();
    logger.info('Wallet initialized', { address: account.address });

    // 2. Create clients
    const clobClient = createPolymarketClient({
      signer: {
        type: 'cdp',
        signTypedData: wallet.signTypedData.bind(wallet),
        address: account.address,
      },
      riskConfig: {
        maxNotional: 100,
        maxSizePerMarket: 50,
        minEdge: 0.02,
      },
    });

    const gammaClient = createGammaClient();

    // 3. Search markets with rate limiting and caching
    logger.info('Searching markets with rate limiter and cache');

    const searchMarkets = async (query: string) => {
      // Apply rate limiting
      await RateLimiters.polymarketGamma.acquire();

      // Check cache first
      const cacheKey = `search:${query}`;
      return Caches.markets.getOrCompute(
        cacheKey,
        async () => {
          logger.debug('Cache miss, fetching from API', { query });
          return gammaClient.searchMarkets({ query, limit: 5 });
        },
        60000 // 1 minute TTL
      );
    };

    const markets = await searchMarkets('Bitcoin');
    logger.info('Markets found', { count: markets.length });

    // 4. Get orderbook with rate limiting and caching
    if (markets.length > 0) {
      const market = markets[0];
      const yesToken = market.outcomes.find((o) => o.name === 'YES');

      if (yesToken) {
        logger.info('Fetching orderbook', { tokenId: yesToken.tokenId });

        // Apply rate limiting
        await RateLimiters.polymarketCLOB.acquire();

        // Use cache
        const orderbook = await Caches.orderbooks.getOrCompute(
          yesToken.tokenId,
          () => clobClient.getOrderbook(yesToken.tokenId),
          10000 // 10 seconds TTL
        );

        logger.info('Orderbook fetched', {
          bids: orderbook.bids.length,
          asks: orderbook.asks.length,
        });

        // 5. Place order with retry and error handling
        try {
          logger.info('Placing order with retry logic');

          const bestBidPrice = parseFloat(orderbook.bids[0]?.price || '0.50');
          const orderPrice = Math.max(0.01, bestBidPrice - 0.05);

          const order = await retryPolymarketRequest(
            async () => {
              // Apply rate limiting
              await RateLimiters.polymarketCLOB.acquire();

              return clobClient.placeOrder({
                tokenId: yesToken.tokenId,
                side: 'BUY',
                price: orderPrice,
                size: 1,
                orderType: 'GTC',
              });
            },
            {
              maxAttempts: 3,
              initialDelay: 2000,
            }
          );

          logger.info('Order placed successfully', {
            orderId: order.orderId,
            price: order.price,
            size: order.size,
          });
        } catch (error) {
          // Parse and format error with recovery suggestions
          const polymarketError = parsePolymarketError(error);
          const formattedError = formatErrorMessage(polymarketError);

          logger.error('Order placement failed', formattedError);
          console.error(formattedError);
        }
      }
    }

    // 6. Show cache statistics
    logger.info('Cache statistics', {
      marketsCache: Caches.markets.size(),
      orderbooksCache: Caches.orderbooks.size(),
    });

    // 7. Show rate limiter status
    logger.info('Rate limiter status', {
      clobTokens: RateLimiters.polymarketCLOB.getTokens(),
      gammaTokens: RateLimiters.polymarketGamma.getTokens(),
    });

    logger.info('Production example completed successfully');
  } catch (error) {
    logger.error('Fatal error', error);
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

main();
