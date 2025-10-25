# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-10-25

### Added

- Initial release
- Coinbase CDP wallet integration with EIP-712 signing
- Polymarket CLOB client (place/cancel orders, orderbook, portfolio)
- Gamma API client for market search and data
- AI SDK tools for LLM integration
- Multi-provider support (OpenAI, Anthropic, Google, OpenRouter)
- Risk management with configurable limits
- Full TypeScript support with Zod schemas
- Examples for node trading and AI agents
- Comprehensive documentation

### Features

- `createCdpWallet()` - Coinbase CDP wallet setup
- `createPolymarketClient()` - CLOB trading client
- `createGammaClient()` - Market data client
- `polymarketTools()` - AI SDK tools
- `createModelProvider()` - Multi-model provider
- `setupPolymarket()` - Quick setup helper

### Tools

- `search_markets` - Search markets by query
- `orderbook` - Get orderbook data
- `order_place` - Place limit orders
- `order_cancel` - Cancel orders
- `order_status` - Check order status
- `portfolio` - Get active orders
- `market_details` - Get market info

[0.1.0]: https://github.com/nikomatt69/nikcli-main/releases/tag/aisdk-polymarket-v0.1.0
