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
- AI SDK tools for LLM integration (7 tools)
- Multi-provider support (OpenAI, Anthropic, Google, OpenRouter)
- Risk management with configurable limits
- Full TypeScript support with Zod schemas
- Examples for node trading, AI agents, and production deployments
- Comprehensive documentation with API reference

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
- `polymarketTools()` - AI SDK tools for LLMs
- `createModelProvider()` - Multi-model provider with fallback
- `setupPolymarket()` - Quick setup helper

### Production Utilities

- `retry()` / `retryPolymarketRequest()` - Retry with exponential backoff
- `RateLimiter` / `RateLimiters.*` - Rate limiting
- `Cache` / `Caches.*` - In-memory caching
- `Logger` / `logger` - Structured logging
- `parsePolymarketError()` - Error parsing with recovery suggestions

### AI Tools

- `search_markets` - Search markets by natural language query
- `orderbook` - Get real-time orderbook data
- `order_place` - Place limit orders with validation
- `order_cancel` - Cancel active orders
- `order_status` - Check order status
- `portfolio` - Get active orders for wallet
- `market_details` - Get detailed market information

[0.1.0]: https://github.com/nikomatt69/nikcli-main/releases/tag/aisdk-polymarket-v0.1.0
