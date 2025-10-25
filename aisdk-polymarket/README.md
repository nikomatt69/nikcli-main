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
