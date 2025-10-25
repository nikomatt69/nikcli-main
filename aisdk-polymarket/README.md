# @bamby/aisdk-polymarket

> AI SDK provider for Polymarket CLOB trading with Coinbase CDP wallet integration

[![npm version](https://img.shields.io/npm/v/@bamby/aisdk-polymarket.svg)](https://www.npmjs.com/package/@bamby/aisdk-polymarket)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Build AI agents that can trade on Polymarket using [Vercel AI SDK](https://sdk.vercel.ai/), [Coinbase CDP](https://docs.cdp.coinbase.com/), and [Polymarket CLOB](https://docs.polymarket.com/).

## Features

- 🤖 **AI SDK Integration** - Ready-to-use tools for LLMs (GPT-4, Claude, Gemini, etc.)
- 🔐 **Coinbase CDP Wallet** - Secure EVM wallet with EIP-712 signing (no private key exposure)
- 📊 **Polymarket CLOB** - Full trading support (place/cancel orders, orderbook, portfolio)
- 🛡️ **Risk Management** - Built-in validation (tick size, min size, max notional, slippage)
- 🔍 **Market Search** - Natural language market discovery via Gamma API
- 📦 **Type-Safe** - Full TypeScript support with Zod schemas
- ⚡ **Multi-Provider** - OpenAI, Anthropic, Google, OpenRouter support

### 🔴 Live Trading Features (NEW!)

- **🔴 Live Events Detection** - Automatically find events happening RIGHT NOW you can bet on
- **⚡ WebSocket Streaming** - Real-time orderbook and trade updates via WebSocket
- **📊 Betting Score** - Smart algorithm ranks markets by tradability (volume, liquidity, spread)
- **🏆 Sports Betting** - Specialized detection for live sports events (NFL, NBA, Soccer, etc.)
- **📰 Breaking News** - Find live news and political events as they happen
- **🎯 Top Opportunities** - AI-powered recommendations for best live trades
- **📡 Real-Time Monitoring** - Monitor specific events with live orderbook + trade streams

### 🚀 Production-Ready Features

- **🔄 Retry Logic** - Exponential backoff for network failures and rate limits
- **⏱️ Rate Limiting** - Token bucket algorithm to prevent API abuse
- **💾 Caching** - In-memory cache with TTL for market data and orderbooks
- **📝 Structured Logging** - Configurable log levels with automatic secret sanitization
- **⚠️ Error Recovery** - Detailed error messages with recovery suggestions
- **🧪 Comprehensive Tests** - 80%+ code coverage with unit and integration tests
- **🔒 Security** - Dependency scanning, audit checks, and best practices enforcement
- **📊 Monitoring** - Built-in metrics and health checks
- **🔧 CI/CD** - GitHub Actions for testing, security scans, and auto-publishing

## Installation

```bash
npm install @bamby/aisdk-polymarket ai @ai-sdk/openai zod
npm install @coinbase/cdp-sdk ethers viem dotenv
```

## Quick Start

### 1. Setup Environment

Create a `.env` file:

```bash
# Coinbase CDP (required)
CDP_API_KEY=your_cdp_api_key
CDP_API_SECRET=your_cdp_api_secret
CDP_WALLET_ID=your_wallet_id  # Optional, auto-created if missing

# Polymarket (optional, uses defaults)
POLYMARKET_HOST=https://clob.polymarket.com
POLYMARKET_DATA_API=https://data-api.polymarket.com
POLYMARKET_GAMMA_API=https://gamma-api.polymarket.com

# AI Provider (choose one or more)
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

### 2. Basic Trading Example

```typescript
import { createCdpWallet, createPolymarketClient, createGammaClient } from '@bamby/aisdk-polymarket';

// 1. Setup CDP wallet
const wallet = await createCdpWallet({ network: 'polygon' });
const account = await wallet.getOrCreateEvmAccount();
console.log('Wallet:', account.address);

// 2. Create Polymarket client
const client = createPolymarketClient({
  signer: {
    type: 'cdp',
    signTypedData: wallet.signTypedData.bind(wallet),
    address: account.address,
  },
});

// 3. Search for markets
const gamma = createGammaClient();
const markets = await gamma.searchMarkets({ query: 'Bitcoin', limit: 5 });

// 4. Get orderbook
const market = markets[0];
const yesToken = market.outcomes.find(o => o.name === 'YES');
const orderbook = await client.getOrderbook(yesToken.tokenId);

// 5. Place order
const order = await client.placeOrder({
  tokenId: yesToken.tokenId,
  side: 'BUY',
  price: 0.45,
  size: 10,
  orderType: 'GTC',
});

console.log('Order placed:', order.orderId);
```

### 3. AI Agent Example

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { setupPolymarket } from '@bamby/aisdk-polymarket';

// Setup full stack (wallet + client + tools)
const { tools } = await setupPolymarket({
  network: 'polygon',
  debug: true,
});

// Use with AI SDK
const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools,
  prompt: 'Find Bitcoin markets and show me the top 3 with their current prices',
  maxSteps: 10,
});

console.log(result.text);
```

## API Reference

### Wallet

#### `createCdpWallet(config)`

Create a Coinbase CDP wallet for EVM operations.

```typescript
const wallet = await createCdpWallet({
  network: 'polygon',        // Network: 'polygon', 'base', etc.
  accountLabel: 'my-trader', // Optional label
  apiKey: '...',             // Optional, uses CDP_API_KEY env
  apiSecret: '...',          // Optional, uses CDP_API_SECRET env
});

// Get or create EVM account
const account = await wallet.getOrCreateEvmAccount();
// => { address: '0x...', chainId: 137 }

// Sign EIP-712 typed data
const { signature } = await wallet.signTypedData(typedData);

// Get balance
const balance = await wallet.getBalance(); // Native token (MATIC)
const usdcBalance = await wallet.getBalance('0x...'); // ERC20
```

### Polymarket Client

#### `createPolymarketClient(config)`

Create a Polymarket CLOB client for trading.

```typescript
const client = createPolymarketClient({
  host: 'https://clob.polymarket.com',
  signer: {
    type: 'cdp',
    signTypedData: wallet.signTypedData.bind(wallet),
    address: wallet.getAddress(),
  },
  riskConfig: {
    maxNotional: 1000,        // Max $1000 per order
    maxSizePerMarket: 100,    // Max 100 shares per market
    maxSpreadSlippage: 0.05,  // Max 5% slippage
    minEdge: 0.02,            // Min 2% edge
  },
});

// Place order
const order = await client.placeOrder({
  tokenId: '0x...',
  side: 'BUY',
  price: 0.55,
  size: 10,
  orderType: 'GTC',
});

// Cancel order
await client.cancelOrder(order.orderId);

// Get orderbook
const orderbook = await client.getOrderbook(tokenId);

// Get active orders
const orders = await client.getActiveOrders();
```

### Market Data (Gamma API)

#### `createGammaClient(config)`

Create a Gamma API client for market data.

```typescript
const gamma = createGammaClient();

// Search markets
const markets = await gamma.searchMarkets({
  query: 'Bitcoin',
  limit: 10,
  active: true,
});

// Get market by ID
const market = await gamma.getMarket(marketId);

// Get active markets
const activeMarkets = await gamma.getActiveMarkets();

// Get markets by tag
const tagMarkets = await gamma.getMarketsByTag('crypto');
```

### AI Tools

#### `polymarketTools(config)`

Create AI SDK tools for LLMs.

```typescript
const tools = polymarketTools({
  clobClient: client,
  gammaClient: gamma,
  debug: true,
});

// Available tools:
// - search_markets: Search for markets by query
// - orderbook: Get orderbook for a token
// - order_place: Place a limit order
// - order_cancel: Cancel an order
// - order_status: Get order status
// - portfolio: Get active orders
// - market_details: Get market details
```

Use with AI SDK:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools,
  prompt: 'Find Trump 2024 markets and analyze liquidity',
});
```

### Multi-Provider Support

```typescript
import { createModelProvider, ModelAliases } from '@bamby/aisdk-polymarket';

const provider = createModelProvider({
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  defaultProvider: 'openai',
});

// Get model by ID
const model = provider.getModel('gpt-4-turbo');
const claude = provider.getModel(ModelAliases.CLAUDE_SONNET);

// Use with fallback
const modelWithFallback = provider.withFallback(
  'gpt-4-turbo',
  'claude-3-sonnet',
  'gemini-1.5-pro'
);
```

## Examples

### Example 1: Place Order

```bash
cd examples
npm run example:place-order
```

See [examples/node-place-order.ts](./examples/node-place-order.ts)

### Example 2: AI Trading Agent

```bash
npm run example:agent
```

Or with custom prompt:

```bash
tsx examples/agent-trader.ts "Find Bitcoin markets and show orderbook for the most liquid one"
```

See [examples/agent-trader.ts](./examples/agent-trader.ts)

### Example 3: Production-Ready Trading

```bash
npm run build
tsx examples/advanced-production.ts
```

This example demonstrates all production features:
- Retry logic with exponential backoff
- Rate limiting for API calls
- Caching for market data
- Structured logging
- Error recovery

See [examples/advanced-production.ts](./examples/advanced-production.ts)

### Example 4: Live Trading with WebSocket

```bash
npm run example:live
```

This example demonstrates **real-time live trading**:
- Finding live events you can bet on RIGHT NOW
- WebSocket streaming for orderbook + trades
- Live sports detection (NFL, NBA, Soccer)
- Breaking news events
- AI agent with live tools
- Real-time market monitoring

See [examples/live-trading.ts](./examples/live-trading.ts)

## Live Trading Features

### Finding Live Events

Automatically discover events happening right now where you can place bets:

```typescript
import {
  createLiveEventsManager,
  createGammaClient,
  createPolymarketClient,
} from '@bamby/aisdk-polymarket';

// Create live events manager
const gammaClient = createGammaClient();
const liveManager = createLiveEventsManager(gammaClient, clobClient);

// Find all live events
const liveEvents = await liveManager.findLiveEvents({
  minVolume: 10000,      // Min $10k volume
  minLiquidity: 1000,    // Min $1k liquidity
  maxSpread: 0.05,       // Max 5% spread
  endingWithinHours: 24, // Ending within 24h
  onlyLive: true,        // Only events live NOW
});

// Each event has:
// - bettingScore (0-100) - tradability score
// - isLive - is event happening now
// - category - sports, politics, news, etc.
// - spread - bid/ask spread
// - hoursToClose - time until market closes

// Find live sports
const liveSports = await liveManager.findLiveSports('nba');

// Find breaking news
const breakingNews = await liveManager.findBreakingNews();

// Get top opportunities
const topEvents = await liveManager.findTopLiveEvents(10);
```

### WebSocket Streaming

Real-time orderbook and trade updates:

```typescript
import { createWebSocketClient } from '@bamby/aisdk-polymarket';

// Create WebSocket client
const wsClient = createWebSocketClient({
  url: 'wss://ws-subscriptions-clob.polymarket.com/ws/',
  autoReconnect: true,
  pingInterval: 30000,
});

// Connect
await wsClient.connect();

// Subscribe to orderbook updates
wsClient.subscribeOrderbook('0xtoken123');

wsClient.on('orderbook', (update) => {
  console.log('Best bid:', update.bids[0]?.price);
  console.log('Best ask:', update.asks[0]?.price);
});

// Subscribe to trade stream
wsClient.subscribeTrades('0xtoken123');

wsClient.on('trade', (trade) => {
  console.log(`Trade: ${trade.side} ${trade.size} @ $${trade.price}`);
});

// Subscribe to user orders (your orders)
wsClient.subscribeUserOrders('0xYourAddress');

wsClient.on('user_order', (update) => {
  console.log(`Order ${update.orderId}: ${update.status}`);
});

// Cleanup
wsClient.disconnect();
```

### Live Trading AI Tools

AI SDK tools for live trading:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { liveTools, polymarketTools } from '@bamby/aisdk-polymarket';

const tools = {
  ...polymarketTools({ clobClient, gammaClient }),
  ...liveTools({ wsClient, liveManager }),
};

const result = await generateText({
  model: openai('gpt-4-turbo'),
  tools,
  prompt: `Find the top 3 live betting opportunities right now.
           For the best one, monitor it for 60 seconds and tell me:
           - Current orderbook depth
           - Recent trades
           - Buy/sell pressure
           - Your recommendation`,
});
```

**Live Tools Available:**
- `find_live_events` - Find events live right now
- `subscribe_orderbook_stream` - Real-time orderbook
- `subscribe_trades_stream` - Real-time trades
- `get_top_betting_opportunities` - Best trades now
- `monitor_live_event` - Full monitoring (orderbook + trades)

### Betting Score Algorithm

Markets are scored 0-100 based on:

1. **Volume Score (0-30 points)**
   - \>$100k = 30 pts
   - $50k-100k = 25 pts
   - $20k-50k = 20 pts
   - $10k-20k = 15 pts

2. **Liquidity Score (0-25 points)**
   - \>$10k = 25 pts
   - $5k-10k = 20 pts
   - $2k-5k = 15 pts
   - $1k-2k = 10 pts

3. **Spread Score (0-25 points)**
   - <1% = 25 pts
   - 1-2% = 20 pts
   - 2-3% = 15 pts
   - 3-5% = 10 pts

4. **Time Urgency (0-20 points)**
   - <1h to close = 20 pts
   - 1-4h = 15 pts
   - 4-12h = 10 pts
   - 12-24h = 5 pts

**Total Score >= 80** = Excellent (tight spread, high liquidity)
**Score 60-79** = Good (decent liquidity)
**Score 40-59** = Fair (some slippage possible)
**Score <40** = Caution (low liquidity)

### Live Event Detection

Automatic categorization:

```typescript
// Sports: NFL, NBA, MLB, NHL, Soccer, Tennis, UFC
// - Detects: "game", "match", "season", "playoff"
// - Live indicators: "tonight", "now", "currently"

// Politics: Elections, votes, polls
// - Detects: "election", "president", "senate", "poll"

// News: Breaking events
// - Detects: "breaking", "announce", "report", "today"

// Crypto: Bitcoin, Ethereum, DeFi
// - Detects: "bitcoin", "eth", "defi", "blockchain"

// Finance: Markets, Fed, GDP
// - Detects: "stock", "fed", "interest rate", "gdp"
```

## Production Features

### Retry Logic

Automatic retry with exponential backoff for network errors and rate limits:

```typescript
import { retryPolymarketRequest } from '@bamby/aisdk-polymarket';

// Auto-retry on network errors, 5xx responses, and rate limits
const order = await retryPolymarketRequest(
  () => client.placeOrder({
    tokenId: '0x...',
    side: 'BUY',
    price: 0.55,
    size: 10,
  }),
  {
    maxAttempts: 3,
    initialDelay: 2000, // 2 seconds
  }
);

// Custom retry logic
import { retry } from '@bamby/aisdk-polymarket';

const data = await retry(
  () => fetchSomeData(),
  {
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    isRetryable: (error) => error.status >= 500,
  }
);
```

### Rate Limiting

Built-in rate limiters using token bucket algorithm:

```typescript
import { RateLimiters, withRateLimit } from '@bamby/aisdk-polymarket';

// Use pre-configured rate limiters
await RateLimiters.polymarketCLOB.acquire();
await client.placeOrder(order);

// Check token availability
if (RateLimiters.polymarketGamma.hasTokens()) {
  await gammaClient.searchMarkets({ query: 'Bitcoin' });
}

// Create custom rate limiter
import { RateLimiter } from '@bamby/aisdk-polymarket';

const customLimiter = new RateLimiter({
  maxRequests: 10,
  interval: 1000, // 10 req/s
  throwOnLimit: false, // Wait instead of throwing
});

// Wrap function with rate limiting
const rateLimitedFetch = withRateLimit(fetchData, customLimiter);
```

### Caching

In-memory cache with TTL for market data:

```typescript
import { Caches, withCache, Cache } from '@bamby/aisdk-polymarket';

// Use pre-configured caches
const markets = await Caches.markets.getOrCompute(
  'bitcoin-markets',
  () => gammaClient.searchMarkets({ query: 'Bitcoin' }),
  300000 // 5 minutes
);

// Manual cache operations
Caches.orderbooks.set('0xtoken', orderbook, 10000);
const cached = Caches.orderbooks.get('0xtoken');

// Create custom cache
const myCache = new Cache({
  ttl: 60000, // 1 minute
  maxSize: 1000,
});

// Wrap function with caching
const cachedFetch = withCache(
  fetchMarkets,
  myCache,
  (query) => `markets:${query}` // Key function
);
```

### Structured Logging

Configurable logging with automatic secret sanitization:

```typescript
import { logger, LogLevel } from '@bamby/aisdk-polymarket';

// Set log level
logger.setLevel(LogLevel.DEBUG);

// Log with automatic sanitization
logger.info('Order placed', {
  orderId: '123',
  apiKey: 'secret', // Auto-redacted
});

// Create child logger
const traderLogger = logger.child('trader');
traderLogger.debug('Fetching markets');

// Log levels
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', error);
```

### Error Recovery

Typed errors with recovery suggestions:

```typescript
import {
  parsePolymarketError,
  formatErrorMessage,
  InvalidTickSizeError,
  InsufficientBalanceError,
} from '@bamby/aisdk-polymarket';

try {
  await client.placeOrder(order);
} catch (error) {
  // Parse error
  const polymarketError = parsePolymarketError(error);

  // Format with recovery suggestions
  const message = formatErrorMessage(polymarketError);
  console.error(message);
  // ❌ InvalidTickSizeError: price 0.555 must be multiple of 0.01
  //
  // 💡 Recovery: Use price 0.56 instead (rounded to nearest tick size)
  //
  // ♻️  This error is recoverable. Please try again.

  // Check if recoverable
  if (polymarketError.recoverable) {
    // Implement retry logic
  }
}
```

### Testing

Run the comprehensive test suite:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# UI mode
npm run test -- --ui
```

Coverage thresholds:
- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

## Error Handling

The SDK provides detailed error messages for common issues:

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `INVALID_ORDER_MIN_TICK_SIZE` | Price not a multiple of tick size | Round price using `roundToTickSize()` |
| `INVALID_ORDER_MIN_SIZE` | Order size below minimum | Increase size to meet minimum (usually 1) |
| `NOT_ENOUGH_BALANCE` | Insufficient USDC balance | Fund wallet with USDC on Polygon |
| `FOK_ORDER_NOT_FILLED` | Fill-or-Kill order couldn't fill | Use GTC or adjust price |
| `INVALID_SIGNATURE` | EIP-712 signature invalid | Check wallet setup and signer config |

### Error Handling Example

```typescript
try {
  const order = await client.placeOrder({
    tokenId: '0x...',
    side: 'BUY',
    price: 0.5555, // Invalid tick size
    size: 10,
  });
} catch (error) {
  if (error.message.includes('INVALID_ORDER_MIN_TICK_SIZE')) {
    // Round price to valid tick size
    const rounded = roundToTickSize(0.5555, 0.01);
    console.log(`Try price: ${rounded}`);
  }
}
```

## Risk Management

Built-in risk checks:

```typescript
import { validateRisk, RiskConfig } from '@bamby/aisdk-polymarket';

const riskConfig: RiskConfig = {
  maxNotional: 1000,         // Max $1000 per order
  maxSizePerMarket: 100,     // Max 100 shares per market
  maxSkew: 0.1,              // Max 10% skew
  maxSpreadSlippage: 0.05,   // Max 5% slippage
  minEdge: 0.02,             // Require 2% edge
  allowedMarkets: ['0x...'], // Optional whitelist
  blockedMarkets: ['0x...'], // Optional blacklist
};

const result = validateRisk(orderArgs, riskConfig);
if (!result.valid) {
  console.error('Risk check failed:', result.error);
}
```

## TypeScript Support

Full type definitions included:

```typescript
import type {
  OrderArgs,
  OrderSide,
  OrderType,
  PlacedOrder,
  Market,
  Orderbook,
  RiskConfig,
} from '@bamby/aisdk-polymarket';
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run format

# Test
npm test
```

## Security

- ✅ **No Private Key Exposure**: Uses CDP Server Wallets (v2) with EIP-712 signing
- ✅ **Automatic Sanitization**: Sensitive data redacted from logs
- ✅ **Risk Limits**: Built-in validation prevents oversized orders
- ✅ **Type Safety**: Zod schemas validate all inputs

### Best Practices

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Use CDP Server Wallets** - Preferred over EOA/private keys
3. **Enable risk config** - Always set `maxNotional` and `maxSizePerMarket`
4. **Test on small sizes** - Start with minimum order size (1 share)
5. **Monitor balances** - Check USDC balance before trading

## Resources

### Official Documentation

- **AgentKit Quickstart** (Vercel AI SDK support)
  https://docs.cdp.coinbase.com/agent-kit/getting-started/quickstart

- **CDP SDK (TypeScript)**
  https://github.com/coinbase/cdp-sdk

- **CDP EIP-712 Signing**
  https://docs.cdp.coinbase.com/server-wallets/v2/evm-features/eip-712-signing

- **Polymarket CLOB Endpoints**
  https://docs.polymarket.com/developers/CLOB/endpoints

- **Polymarket Your First Order**
  https://docs.polymarket.com/quickstart/orders/first-order

- **AI SDK Custom Providers**
  https://ai-sdk.dev/providers/community-providers/custom-providers

- **AI SDK Tools & Tool Calling**
  https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling

### Community

- [GitHub Issues](https://github.com/nikomatt69/nikcli-main/issues)
- [Polymarket Discord](https://discord.gg/polymarket)
- [CDP Discord](https://discord.gg/cdp)

## License

MIT © 2024 Bamby (nikomatt69)

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) first.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

---

**⚠️ Disclaimer**: This SDK is for educational and research purposes. Trading prediction markets involves risk. Always test with small amounts first. Not financial advice.
