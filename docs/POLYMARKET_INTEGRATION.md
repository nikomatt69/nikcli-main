# Polymarket Enterprise Integration for NikCLI

Complete native integration of Polymarket prediction markets into NikCLI with advanced features for trading, order attribution, and real-time market data.

## 📋 Overview

This integration provides:

- **Dual-mode execution**: GOAT SDK (simple) + Native API (advanced)
- **Builder Program support**: Gas fee coverage and revenue sharing
- **Real-time WebSocket feeds**: Live orderbook and market updates
- **Enterprise-grade reliability**: Rate limiting, error handling, monitoring
- **AI Agent integration**: Specialized Polymarket agent for autonomous trading
- **Zero breaking changes**: Fully backward compatible with existing GOAT SDK

## 🚀 Quick Start

### 1. Configuration

Add to `.env.production`:

```bash
# Core Polymarket
GOAT_EVM_PRIVATE_KEY=0x... # Your EVM private key

# Builder Program (Optional)
POLYMARKET_BUILDER_API_KEY=builder_... # From Polymarket dashboard
POLYMARKET_BUILDER_SECRET=... # Secret key for HMAC
POLYMARKET_BUILDER_PASSPHRASE=... # Passphrase for auth

# RPC Endpoints (Optional - defaults provided)
POLYGON_RPC_URL=https://polygon-rpc.com
BASE_RPC_URL=https://mainnet.base.org
```

### 2. Initialize Agent

```bash
nikcli polymarket init
```

### 3. Basic Operations

```bash
# Check status
nikcli polymarket status

# Get builder metrics
nikcli polymarket builder-metrics

# Connect WebSocket
nikcli polymarket ws-connect

# Subscribe to market
nikcli polymarket ws-subscribe --assetId <token_id>
```

## 📚 Core Components

### Native CLOB Client
**File**: `src/cli/onchain/polymarket-native-client.ts`

Direct integration with Polymarket's CLOB API:
- Order placement (FOK, GTC, GTD)
- Order management and cancellation
- Real-time orderbook data
- Market data retrieval
- Health checks and monitoring

```typescript
const client = goatProvider.getPolymarketNativeClient()
await client.initialize()

// Place order
const order = await client.placeOrder({
  tokenId: '0x...',
  price: 0.55,
  size: 100,
  side: 'BUY',
  orderType: 'GTC'
})

// Get orderbook
const book = await client.getOrderBook(tokenId)

// Check API health
const healthy = await client.healthCheck()
```

### WebSocket Manager
**File**: `src/cli/onchain/polymarket-websocket-manager.ts`

Real-time market data feeds:
- Order book updates (L2)
- Price changes
- Trade executions
- Tick size changes
- Auto-reconnection with exponential backoff
- Max 500 simultaneous subscriptions

```typescript
const wsManager = goatProvider.getWebSocketManager()
await wsManager.connect()

// Subscribe to market updates
wsManager.subscribe(tokenId, (update) => {
  console.log('Market update:', update.event_type)
})

// Monitor connection
const stats = wsManager.getStats()
console.log(`Connected: ${stats.connected}, Uptime: ${stats.uptime}ms`)
```

### Builder Signing Service
**File**: `src/cli/onchain/polymarket-builder-signing.ts`

Order attribution and builder program integration:
- HMAC-SHA256 signature generation
- Builder authentication headers
- Order attribution tracking
- Metrics and performance reporting
- Revenue sharing eligibility

```typescript
const signingService = goatProvider.getBuilderSigningService()

// Sign order with builder attribution
const result = await signingService.signOrder({
  signedOrder: order,
  orderType: 'GTC'
})

// Get metrics
const report = signingService.exportMetricsReport()
console.log(`Success rate: ${(report.metrics.totalOrdersSuccess / report.metrics.totalOrdersSubmitted) * 100}%`)

// Check revenue share eligibility
if (report.metrics.revenueShareEligible) {
  console.log('✅ Eligible for revenue sharing')
}
```

### Specialized Polymarket Agent
**File**: `src/cli/automation/agents/polymarket-agent.ts`

AI-powered trading agent with capabilities:
- Market analysis and sentiment detection
- Order placement with risk assessment
- Position management
- Real-time market monitoring
- Trade recommendations

```typescript
const agent = new PolymarketAgent(goatProvider)
await agent.initialize()

const task = {
  id: 'trade-1',
  description: 'Buy 100 shares at 0.55 on presidential election market',
  priority: 'high',
  status: 'pending'
}

const result = await agent.executeTask(task)
console.log('Order result:', result)

// Get agent metrics
const metrics = agent.getMetrics()
console.log(`Success rate: ${metrics.successRate}%`)
```

## 🛠️ Tool Actions

### Builder Program Actions

```bash
# Get builder program status
nikcli goat builder-status

# Get detailed metrics and recommendations
nikcli goat builder-metrics

# Sign order with attribution
nikcli goat builder-sign-order --signedOrder <order> --orderType GTC

# View attribution log
nikcli goat builder-attribution --limit 50
```

### WebSocket Actions

```bash
# Connect to WebSocket
nikcli goat ws-connect

# Subscribe to market
nikcli goat ws-subscribe --assetId <token_id>

# Get WebSocket statistics
nikcli goat ws-stats

# Disconnect
nikcli goat ws-disconnect
```

### Native API Actions

```bash
# Check native API health
nikcli goat native-health

# Get API status
nikcli goat native-status
```

## 🔐 Authentication

### L1 Authentication (Private Key)
Used for:
- Creating/deriving API credentials
- Critical operations

```typescript
const headers = authenticator.generateL1Headers('POST', '/auth/derive-api-key')
// Returns: POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_NONCE
```

### L2 Authentication (API Key)
Used for:
- Order placement
- Market data queries
- Routine operations

```typescript
const headers = authenticator.generateL2Headers('POST', '/order', orderBody)
// Returns: POLY_ADDRESS, POLY_API_KEY, POLY_PASSPHRASE, POLY_TIMESTAMP, POLY_SIGNATURE
```

### Builder Attribution
Adds builder headers to L2 authenticated requests:

```typescript
const builderHeaders = authenticator.generateBuilderHeaders('POST', '/order', orderBody)
// Returns: POLY_BUILDER_API_KEY, POLY_BUILDER_TIMESTAMP, POLY_BUILDER_PASSPHRASE, POLY_BUILDER_SIGNATURE
```

## 📊 Rate Limiting

Automatic rate limiting for all endpoints:

| Endpoint | Limit | Window |
|----------|-------|--------|
| Order placement | 2,400 | 10s burst, 40/s sustained |
| Market data | 200 | 10s |
| Trades | 75 | 10s |
| GAMMA API | 750 | 10s |

```typescript
// Handled automatically - no action required
await client.placeOrder(params) // Respects rate limits
```

## ⚠️ Error Handling

Polymarket-specific errors are mapped to user-friendly messages:

```typescript
try {
  await client.placeOrder(params)
} catch (error) {
  if (error.code === 'INVALID_ORDER_MIN_SIZE') {
    console.error('Order size below minimum')
  } else if (error.code === 'INSUFFICIENT_LIQUIDITY') {
    console.error('Not enough liquidity at this price')
  }
}
```

## 📈 Monitoring & Observability

### Connection Statistics

```typescript
const stats = wsManager.getStats()
// {
//   connected: true,
//   subscriptions: 10,
//   messageCount: 1523,
//   lastMessageTime: 1234567890,
//   uptime: 3600000,
//   reconnectAttempts: 0
// }
```

### Builder Metrics

```typescript
const metrics = signingService.getMetrics()
// {
//   totalOrdersSubmitted: 100,
//   totalOrdersSuccess: 98,
//   totalOrdersFailed: 2,
//   totalVolume: 50000,
//   attributedOrders: 98,
//   revenueShareEligible: true
// }
```

### Agent Metrics

```typescript
const agentMetrics = agent.getMetrics()
// {
//   tasksCompleted: 50,
//   tasksFailed: 2,
//   avgTaskDuration: 250,
//   successRate: 96.15
// }
```

## 🔄 Workflow Examples

### Example 1: Simple Order with Builder Attribution

```typescript
// 1. Initialize
const goatProvider = new GoatProvider(config)
await goatProvider.initialize()

// 2. Get native client
const client = goatProvider.getPolymarketNativeClient()
await client.initialize()

// 3. Place order
const order = await client.placeOrder({
  tokenId: 'market-token-id',
  price: 0.55,
  size: 100,
  side: 'BUY',
  orderType: 'GTC'
})

// 4. Apply builder attribution
const signingService = goatProvider.getBuilderSigningService()
const result = await signingService.signOrder({
  signedOrder: order,
  orderType: 'GTC'
})

console.log('Order placed with attribution:', result.orderId)
```

### Example 2: Real-Time Market Monitoring

```typescript
// 1. Connect WebSocket
const wsManager = goatProvider.getWebSocketManager()
await wsManager.connect()

// 2. Subscribe to markets
wsManager.subscribe('token-id-1', (update) => {
  if (update.event_type === 'price_change') {
    console.log('Price changed:', update.changes[0].price)
  }
})

// 3. Monitor multiple markets
await Promise.all([
  wsManager.subscribe('token-id-2'),
  wsManager.subscribe('token-id-3'),
  wsManager.subscribe('token-id-4')
])

// 4. Check health
const health = await wsManager.healthCheck()
console.log('WebSocket healthy:', health)
```

### Example 3: Autonomous Trading with Agent

```typescript
// 1. Create agent
const agent = new PolymarketAgent(goatProvider)
await agent.initialize()

// 2. Submit trading task
const task = {
  id: 'task-1',
  description: 'Analyze prediction markets and recommend profitable trades',
  priority: 'high',
  status: 'pending'
}

// 3. Agent executes
const analysis = await agent.executeTask(task)

// 4. Review results
console.log('Market analysis complete')
console.log('Top opportunities:', analysis)

// 5. Check metrics
const metrics = agent.getMetrics()
console.log(`Agent success rate: ${metrics.successRate}%`)
```

## 🚨 Production Considerations

### Security

- Never commit `.env.production` with real credentials
- Rotate builder API keys periodically
- Use environment variables for all secrets
- Implement request signing server for builder operations

### Reliability

- Monitor WebSocket connection health (99.9%+ uptime target)
- Implement circuit breaker for failed endpoints
- Log all orders and execution metrics
- Set up alerting for high-risk trades

### Performance

- Cache market data locally when possible
- Batch orderbook subscriptions
- Use rate limiters to avoid throttling
- Monitor and optimize gas costs with builder program

## 📖 API Reference

### PolymarketNativeClient

**Methods**:
- `initialize()` - Initialize and derive API credentials
- `placeOrder(params)` - Place BUY/SELL orders (FOK, GTC, GTD)
- `cancelOrder(orderId)` - Cancel a specific order
- `getOrderBook(tokenId)` - Get L2 orderbook
- `getMarkets(limit)` - Get available markets
- `getTrades(market, limit)` - Get recent trades
- `healthCheck()` - Check API availability

### PolymarketWebSocketManager

**Methods**:
- `connect()` - Connect to WebSocket
- `disconnect()` - Close connection
- `subscribe(assetId, handler)` - Subscribe to market
- `unsubscribe(assetId)` - Unsubscribe (reconnects)
- `getStats()` - Get connection statistics
- `healthCheck()` - Check WebSocket health
- `isConnected()` - Check connection status

**Events**:
- `connected` - Connection established
- `disconnected` - Connection closed
- `update` - Any market update
- `book` - Orderbook update
- `price_change` - Price changed
- `last_trade_price` - Trade executed
- `tick_size_change` - Tick size adjusted
- `error` - Error occurred
- `maxReconnectAttemptsReached` - Failed to reconnect

### PolymarketBuilderSigningService

**Methods**:
- `generateBuilderHeaders(method, path, body)` - Generate auth headers
- `signOrder(request)` - Sign order with attribution
- `getMetrics()` - Get builder metrics
- `getAttributionLog(limit)` - Get order attribution log
- `exportMetricsReport()` - Export detailed metrics
- `getSummary()` - Get summary statistics
- `reset()` - Clear metrics (testing only)

## 📞 Support & Resources

- **Polymarket Docs**: https://docs.polymarket.com
- **GOAT SDK**: https://github.com/goat-sdk
- **NikCLI Issues**: https://github.com/nikomatt69/nikcli/issues

## 📝 Changelog

### Version 1.0.0 (Current)

- ✅ Native CLOB API client
- ✅ WebSocket real-time feeds
- ✅ Builder program integration
- ✅ Specialized Polymarket agent
- ✅ Comprehensive error handling
- ✅ Rate limiting
- ✅ Full validation schemas

## License

MIT - Same as NikCLI
