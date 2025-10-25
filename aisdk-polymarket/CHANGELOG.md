# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-10-25

### Added

**Core Features:**
- Initial release - Production-ready AI SDK for Polymarket trading
- Coinbase CDP wallet integration with EIP-712 signing
- Polymarket CLOB client (place/cancel orders, orderbook, portfolio)
- Gamma API client for market search and data
- AI SDK tools for LLM integration (12 tools: 7 standard + 5 live)
- Multi-provider support (OpenAI, Anthropic, Google, OpenRouter)
- Risk management with configurable limits
- Full TypeScript support with Zod schemas
- Examples for node trading, AI agents, production, and live trading
- Comprehensive documentation with API reference

**🔴 Live Trading Features:**
- WebSocket client for real-time data streaming (orderbook, trades, user orders)
- Live events detection and filtering (finds betting-ready markets)
- Betting score algorithm (ranks markets 0-100 by tradability)
- Automatic event categorization (sports, politics, news, crypto, finance)
- Live sports detection (NFL, NBA, MLB, NHL, Soccer, Tennis, UFC)
- Breaking news event detection
- Top betting opportunities finder
- Real-time market monitoring (combined orderbook + trades)
- 5 new AI tools for live trading

**Production Features:**
- ✅ Retry logic with exponential backoff (handles network errors, rate limits, 5xx)
- ✅ Rate limiting using token bucket algorithm (10 req/s CLOB, 20 req/s Gamma)
- ✅ In-memory caching with TTL (5min markets, 10s orderbooks, 1h configs)
- ✅ Structured logging with automatic secret sanitization
- ✅ Custom error classes with recovery suggestions
- ✅ Comprehensive test suite (80%+ coverage, 50+ tests)
- ✅ GitHub Actions CI/CD pipeline
- ✅ Security scanning and dependency audits (npm audit + Snyk)
- ✅ Pre-commit hooks with Husky and lint-staged
- ✅ TypeDoc API documentation
- ✅ Contributing guidelines, issue templates, Code of Conduct
- ✅ Security policy with best practices

### Core Functions

- `createCdpWallet()` - Coinbase CDP wallet setup
- `createPolymarketClient()` - CLOB trading client
- `createGammaClient()` - Market data client
- `createWebSocketClient()` - 🔴 Real-time WebSocket client
- `createLiveEventsManager()` - 🔴 Live events detection
- `polymarketTools()` - AI SDK tools for LLMs (7 tools)
- `liveTools()` - 🔴 Live trading AI tools (5 tools)
- `createModelProvider()` - Multi-model provider with fallback
- `setupPolymarket()` - Quick setup helper

### Production Utilities

- `retry()` / `retryPolymarketRequest()` - Retry with exponential backoff
- `RateLimiter` / `RateLimiters.*` - Rate limiting
- `Cache` / `Caches.*` - In-memory caching
- `Logger` / `logger` - Structured logging
- `parsePolymarketError()` - Error parsing with recovery suggestions

### AI Tools (Standard)

- `search_markets` - Search markets by natural language query
- `orderbook` - Get real-time orderbook data
- `order_place` - Place limit orders with validation
- `order_cancel` - Cancel active orders
- `order_status` - Check order status
- `portfolio` - Get active orders for wallet
- `market_details` - Get detailed market information

### 🔴 AI Tools (Live Trading)

- `find_live_events` - Find events happening RIGHT NOW you can bet on
- `subscribe_orderbook_stream` - Real-time orderbook updates via WebSocket
- `subscribe_trades_stream` - Real-time trade events via WebSocket
- `get_top_betting_opportunities` - Top ranked live betting opportunities
- `monitor_live_event` - Full event monitoring (orderbook + trades combined)

[0.1.0]: https://github.com/nikomatt69/nikcli-main/releases/tag/aisdk-polymarket-v0.1.0
