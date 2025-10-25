# Polymarket CLOB Integration

Official Polymarket CLOB (Central Limit Order Book) integration for NikCLI, enabling prediction market trading operations with enterprise-grade stability and streaming AI assistance.

## Overview

This integration provides:
- **Prediction Market Access**: Browse markets, check order books, get price quotes
- **Trading Operations**: Place orders, cancel orders, manage positions
- **Streaming AI Assistant**: Natural language trading interface with real-time token streaming
- **Enterprise Features**: REST fallbacks, retry logic, comprehensive logging, audit trails

## Quick Start

### 1. Installation

Ensure `@polymarket/clob-client` is installed:

```bash
npm install @polymarket/clob-client@^4.22.8
```

### 2. Environment Setup

Create a `.env` file in your project root with:

```env
POLYMARKET_PRIVATE_KEY=0x...your_private_key...
POLYMARKET_CHAIN_ID=137
POLYMARKET_HOST=https://clob.polymarket.com
POLYMARKET_SIGNATURE_TYPE=1
```

**Required Variables:**
- `POLYMARKET_PRIVATE_KEY` - Your Polygon wallet private key (0x-prefixed hex)

**Optional Variables:**
- `POLYMARKET_CHAIN_ID` - Network ID (default: 137 for Polygon mainnet)
- `POLYMARKET_HOST` - CLOB API endpoint (default: https://clob.polymarket.com)
- `POLYMARKET_SIGNATURE_TYPE` - Signature type (default: 1 for proxy/magic wallet)
- `POLYMARKET_FUNDER_ADDRESS` - Optional funder address for order initialization
- `POLYMARKET_L2_AUTH` - Enable L2 authentication headers (default: false)

### 3. Initialize in NikCLI

```bash
/polymarket init
```

This initializes the CLOB provider and performs a health check against the API.

## CLI Commands

### Market Discovery

**List available markets:**
```bash
/polymarket markets
```

Parameters:
- `search` - Filter by market question/slug
- `active` - Show only active markets (default: true)
- `limit` - Number of markets to return (default: 100)

**Get order book for a token:**
```bash
/polymarket book <tokenID>
```

**Get price quote:**
```bash
/polymarket price <tokenID> <BUY|SELL> <amount>
```

### Trading Operations

**List your open orders:**
```bash
/polymarket orders
```

**List your trade history:**
```bash
/polymarket trades
```

**List your positions:**
```bash
/polymarket positions
```

**Place an order (requires confirmation):**
```bash
/polymarket place-order <tokenID> <BUY|SELL> <price> <size> --confirm
```

Requirements:
- Price must be between 0 and 1
- Size must be positive
- `--confirm` flag required for safety

**Cancel an order (requires confirmation):**
```bash
/polymarket cancel-order <orderID> --confirm
```

**Cancel all open orders (requires confirmation):**
```bash
/polymarket cancel-all --confirm
```

### Information

**Get wallet information:**
```bash
/polymarket wallet
```

**Get tool status:**
```bash
/polymarket status
```

**Reset conversation history:**
```bash
/polymarket reset
```

### Streaming AI Chat

**Query markets with natural language:**
```bash
/polymarket chat "Find markets about the 2024 election with good volume"
```

The response streams token-by-token in real-time, providing contextual analysis and actionable trading insights.

## Architecture

### Provider Pattern

The `PolymarketProvider` class manages all CLOB operations:

```typescript
const provider = new PolymarketProvider()
await provider.initialize({
    privateKey: '0x...',
    chainId: 137,
    host: 'https://clob.polymarket.com'
})

const orders = await provider.getOpenOrders()
```

### Fallback Strategy

Methods automatically fall back to REST endpoints if SDK methods are unavailable:

1. **Positions**: SDK `getPositions()` → REST `/data/positions`
2. **Trades**: SDK `getTrades()` → REST `/data/trades`
3. **Orders**: SDK `getOrders()` → REST `/orders`
4. **Cancel All**: SDK `cancelAll()` → loop and cancel individually

### Signer Adapter

The integration uses a robust signer adapter compatible with ethers.js standards:

```typescript
{
    getAddress: async () => address,
    _signTypedData: async (domain, types, value) => signature,
    signTypedData: async (domain, types, value) => signature
}
```

### Error Handling & Retries

- **Network errors**: Automatic retry with exponential backoff (max 3 attempts)
- **Rate limiting (429)**: Backoff for up to 5 seconds
- **Timeouts**: Retry with adaptive waiting
- **REST failures**: Graceful degradation to empty results

## Testing

### Unit Tests

Run mocked tests (no API calls):

```bash
npm test -- polymarket-provider.test.ts
npm test -- polymarket-tool.test.ts
```

Coverage includes:
- SDK method resolution and fallbacks
- REST endpoint integration
- Signer adapter validation
- Order validation and placement
- Error scenarios and retries

### Integration Tests (Optional)

To run against live CLOB endpoints, set test environment variables:

```bash
POLYMARKET_PRIVATE_KEY=0x... npm test -- --run
```

## Troubleshooting

### "signer.getAddress is not a function"

**Cause**: Signer adapter not properly configured.

**Solution**: Update to latest version of this integration. The signer adapter has been hardened to provide both `getAddress` and `_signTypedData` methods.

### "this.client.getPositions is not a function"

**Cause**: SDK method doesn't exist in this CLOB version, but REST fallback should handle it.

**Solution**: Check that `POLYMARKET_HOST` is correct. REST fallback will automatically use `/data/positions` endpoint.

### "The first argument must be of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received undefined"

**Cause**: REST endpoint not receiving required parameters (maker address).

**Solution**: Ensure `POLYMARKET_PRIVATE_KEY` is set and `initialize()` was called successfully. Verify address derivation:

```bash
/polymarket wallet
```

### Rate Limiting (HTTP 429)

**Solution**: The integration automatically retries with exponential backoff. If you hit persistent rate limits:
1. Reduce call frequency
2. Use batch operations where available
3. Contact Polymarket support for higher rate limits

### Connection Errors

**Solution**: Verify network connectivity and CLOB endpoint availability:

```bash
curl -s https://clob.polymarket.com/markets | head
```

## Advanced Configuration

### L2 Authentication Headers

For enhanced security, enable L2 authentication:

```env
POLYMARKET_L2_AUTH=true
```

This adds `X-POLY-SIGNATURE` headers to REST requests with your address and timestamp.

### Custom Network

To use testnet or custom endpoints:

```env
POLYMARKET_CHAIN_ID=80001
POLYMARKET_HOST=https://testnet-clob.example.com
```

### Logging

The integration uses the NikCLI logger. To see detailed debug logs:

```bash
DEBUG=* /polymarket init
```

Or configure in NikCLI settings:

```bash
/nikcli-config set log-level debug
```

## Security Considerations

1. **Private Key**: Never commit `POLYMARKET_PRIVATE_KEY` to version control
2. **Confirmation Flags**: Always use `--confirm` for trading operations
3. **Audit Logs**: All trades are logged to `audit` level for compliance
4. **Network**: Use HTTPS endpoints only
5. **Nonce Management**: The provider automatically manages order nonces

## Performance Tips

1. **Batch Operations**: Use `/polymarket orders` once instead of multiple individual queries
2. **REST Fallback**: REST queries are generally faster than SDK for read-only operations
3. **Streaming**: Leverage the streaming chat for real-time analysis without waiting for full responses
4. **Caching**: Results are not cached—call multiple times if needed for fresh data

## API Reference

See `src/cli/onchain/polymarket-provider.ts` for complete TypeScript interfaces:

- `PolymarketMarket` - Market data structure
- `PolymarketOrder` - Order structure
- `PolymarketPosition` - User position
- `PolymarketTrade` - Trade history entry
- `PolymarketOrderBook` - Order book snapshots

## Contributing

To report issues or suggest improvements:

1. Check existing issues in the NikCLI repository
2. Include error logs and environment details
3. Provide reproduction steps

## License

Same as NikCLI (see LICENSE file)

## Additional Resources

- [Polymarket Official Docs](https://docs.polymarket.com/)
- [CLOB API Documentation](https://docs.polymarket.com/developers/CLOB/introduction)
- [Polygon Network](https://polygon.technology/)
