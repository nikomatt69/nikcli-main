/**
 * @bamby/aisdk-polymarket
 *
 * AI SDK provider for Polymarket CLOB trading with Coinbase CDP wallet integration
 *
 * @example
 * ```ts
 * import { createCdpWallet, createPolymarketClient, polymarketTools } from '@bamby/aisdk-polymarket';
 * import { generateText } from 'ai';
 * import { openai } from '@ai-sdk/openai';
 *
 * // 1. Setup CDP wallet
 * const wallet = await createCdpWallet({ network: 'polygon' });
 * const account = await wallet.getOrCreateEvmAccount();
 *
 * // 2. Create Polymarket client
 * const client = createPolymarketClient({
 *   signer: {
 *     type: 'cdp',
 *     signTypedData: wallet.signTypedData.bind(wallet),
 *     address: account.address,
 *   },
 * });
 *
 * // 3. Create Gamma client
 * const gamma = createGammaClient();
 *
 * // 4. Create AI tools
 * const tools = polymarketTools({
 *   clobClient: client,
 *   gammaClient: gamma,
 *   debug: true,
 * });
 *
 * // 5. Use with AI SDK
 * const result = await generateText({
 *   model: openai('gpt-4-turbo'),
 *   tools,
 *   prompt: 'Find markets about Bitcoin and show me the orderbook for the top result',
 * });
 * ```
 */

// Wallet
export { CdpWallet, createCdpWallet } from './wallet/cdp.ts';
export type { CdpWalletConfig } from './wallet/cdp.ts';

// Polymarket CLOB
export {
  PolymarketClient,
  createPolymarketClient,
  ClobErrorCode,
} from './polymarket/clob-client.ts';
export type {
  ClobClientConfig,
  OrderSigner,
} from './polymarket/clob-client.ts';

// Gamma API
export { GammaClient, createGammaClient } from './polymarket/gamma.ts';
export type {
  GammaConfig,
  MarketSearchParams,
} from './polymarket/gamma.ts';

// WebSocket (Real-time)
export {
  PolymarketWebSocket,
  createWebSocketClient,
  MessageType,
} from './polymarket/websocket-client.ts';
export type {
  WebSocketConfig,
  Channel,
  OrderbookUpdate,
  TradeEvent,
  UserOrderUpdate,
  MarketEvent,
} from './polymarket/websocket-client.ts';

// Live Events
export {
  LiveEventsManager,
  createLiveEventsManager,
} from './polymarket/live-events.ts';
export type {
  LiveEventCriteria,
  LiveEvent,
} from './polymarket/live-events.ts';

// Schemas
export {
  OrderArgsSchema,
  RiskConfigSchema,
  TradeIntentSchema,
  MarketSchema,
  OrderbookSchema,
  PlacedOrderSchema,
  CancelOrderResponseSchema,
  Eip712TypedDataSchema,
  OrderSideSchema,
  OrderTypeSchema,
  TickSizeSchema,
  MarketConfigSchema,
  OrderbookLevelSchema,
  validateTickSize,
  validateRisk,
  roundToTickSize,
  calculateEdge,
} from './polymarket/schemas.ts';
export type {
  OrderArgs,
  OrderSide,
  OrderType,
  RiskConfig,
  TradeIntent,
  Market,
  Orderbook,
  PlacedOrder,
  CancelOrderResponse,
  Eip712TypedData,
  TickSize,
  MarketConfig,
  OrderbookLevel,
} from './polymarket/schemas.ts';

// AI Tools
export { polymarketTools } from './ai/tools.ts';
export type { ToolsConfig, PolymarketTools } from './ai/tools.ts';

// Live Trading Tools
export { liveTools } from './ai/live-tools.ts';
export type { LiveToolsConfig, LiveTools } from './ai/live-tools.ts';

// Provider
export {
  createModelProvider,
  setupProvider,
  ModelAliases,
} from './ai/provider.ts';
export type {
  ProviderConfig,
  ModelProvider,
} from './ai/provider.ts';

// Utilities (production features)
export * from './utils/index.ts';

/**
 * Quick setup helper for full stack
 */
export async function setupPolymarket(config: {
  network?: string;
  cdpApiKey?: string;
  cdpApiSecret?: string;
  debug?: boolean;
}) {
  const { createCdpWallet } = await import('./wallet/cdp.ts');
  const { createPolymarketClient } = await import('./polymarket/clob-client.ts');
  const { createGammaClient } = await import('./polymarket/gamma.ts');
  const { polymarketTools } = await import('./ai/tools.ts');

  // 1. Setup CDP wallet
  const wallet = await createCdpWallet({
    network: config.network || 'polygon',
    apiKeyId: config.cdpApiKey,
    apiKeySecret: config.cdpApiSecret,
  });

  const account = await wallet.getOrCreateEvmAccount();

  // 2. Create CLOB client
  const clobClient = createPolymarketClient({
    signer: {
      type: 'cdp',
      signTypedData: wallet.signTypedData.bind(wallet),
      address: account.address,
    },
  });

  // 3. Create Gamma client
  const gammaClient = createGammaClient();

  // 4. Create tools
  const tools = polymarketTools({
    clobClient,
    gammaClient,
    debug: config.debug,
  });

  return {
    wallet,
    account,
    clobClient,
    gammaClient,
    tools,
  };
}

/**
 * Version
 */
export const VERSION = '0.1.0';
