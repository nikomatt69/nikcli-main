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
export { CdpWallet, createCdpWallet } from './wallet/cdp.js';
export type { CdpWalletConfig } from './wallet/cdp.js';

// Polymarket CLOB
export {
  PolymarketClient,
  createPolymarketClient,
  ClobErrorCode,
} from './polymarket/clob-client.js';
export type {
  ClobClientConfig,
  OrderSigner,
} from './polymarket/clob-client.js';

// Gamma API
export { GammaClient, createGammaClient } from './polymarket/gamma.js';
export type {
  GammaConfig,
  MarketSearchParams,
} from './polymarket/gamma.js';

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
} from './polymarket/schemas.js';
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
} from './polymarket/schemas.js';

// AI Tools
export { polymarketTools } from './ai/tools.js';
export type { ToolsConfig, PolymarketTools } from './ai/tools.js';

// Provider
export {
  createModelProvider,
  setupProvider,
  ModelAliases,
} from './ai/provider.js';
export type {
  ProviderConfig,
  ModelProvider,
} from './ai/provider.js';

/**
 * Quick setup helper for full stack
 */
export async function setupPolymarket(config: {
  network?: string;
  cdpApiKey?: string;
  cdpApiSecret?: string;
  debug?: boolean;
}) {
  const { createCdpWallet } = await import('./wallet/cdp.js');
  const { createPolymarketClient } = await import('./polymarket/clob-client.js');
  const { createGammaClient } = await import('./polymarket/gamma.js');
  const { polymarketTools } = await import('./ai/tools.js');

  // 1. Setup CDP wallet
  const wallet = await createCdpWallet({
    network: config.network || 'polygon',
    apiKey: config.cdpApiKey,
    apiSecret: config.cdpApiSecret,
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
