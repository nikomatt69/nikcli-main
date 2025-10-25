import { z } from 'zod';

/**
 * Order side: BUY or SELL
 */
export const OrderSideSchema = z.enum(['BUY', 'SELL']);
export type OrderSide = z.infer<typeof OrderSideSchema>;

/**
 * Order type: GTC (Good Till Cancel), FAK (Fill or Kill), FOK (Fill or Kill), GTD (Good Till Date)
 */
export const OrderTypeSchema = z.enum(['GTC', 'FAK', 'FOK', 'GTD']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

/**
 * Market tick size configuration
 */
export const TickSizeSchema = z.object({
  min: z.number().min(0),
  max: z.number().max(1),
  increment: z.number().positive(),
});
export type TickSize = z.infer<typeof TickSizeSchema>;

/**
 * Market configuration with min size and tick size
 */
export const MarketConfigSchema = z.object({
  minSize: z.number().positive().default(1),
  tickSize: z.number().positive().default(0.01),
  maxSize: z.number().positive().optional(),
});
export type MarketConfig = z.infer<typeof MarketConfigSchema>;

/**
 * Order arguments for placing an order
 */
export const OrderArgsSchema = z.object({
  tokenId: z.string().describe('Token ID (YES or NO outcome)'),
  side: OrderSideSchema,
  price: z.number().min(0.01).max(0.99).describe('Price between 0.01 and 0.99'),
  size: z.number().positive().describe('Order size (minimum 1)'),
  orderType: OrderTypeSchema.default('GTC'),
  expiresAt: z.number().int().positive().optional().describe('Expiration timestamp (required for GTD)'),
  negrisk: z.boolean().default(false).describe('Use negative risk (sell orders)'),
  clientOrderId: z.string().optional().describe('Client-provided order ID'),
  funder: z.string().optional().describe('Funder address (for proxy wallets)'),
});
export type OrderArgs = z.infer<typeof OrderArgsSchema>;

/**
 * Risk configuration for order validation
 */
export const RiskConfigSchema = z.object({
  maxNotional: z.number().positive().describe('Maximum notional value per order (USD)'),
  maxSizePerMarket: z.number().positive().describe('Maximum size per market'),
  maxSkew: z.number().min(0).max(1).default(0.1).describe('Maximum skew allowed (0-1)'),
  maxSpreadSlippage: z.number().min(0).max(1).default(0.05).describe('Maximum spread slippage (0-1)'),
  minEdge: z.number().min(0).max(1).default(0.02).describe('Minimum edge required (0-1)'),
  allowedMarkets: z.array(z.string()).optional().describe('Whitelist of allowed market IDs'),
  blockedMarkets: z.array(z.string()).optional().describe('Blacklist of blocked market IDs'),
});
export type RiskConfig = z.infer<typeof RiskConfigSchema>;

/**
 * Trade intent from LLM (natural language input)
 */
export const TradeIntentSchema = z.object({
  query: z.string().describe('Natural language market query (e.g., "Trump wins 2024")'),
  side: OrderSideSchema,
  amount: z.number().positive().describe('Amount in USD or shares'),
  maxSlippage: z.number().min(0).max(1).default(0.05).describe('Maximum slippage tolerance'),
});
export type TradeIntent = z.infer<typeof TradeIntentSchema>;

/**
 * Market search result
 */
export const MarketSchema = z.object({
  id: z.string(),
  question: z.string(),
  description: z.string().optional(),
  endDate: z.string().optional(),
  volume: z.number().optional(),
  liquidity: z.number().optional(),
  outcomes: z.array(z.object({
    name: z.string(),
    tokenId: z.string(),
    price: z.number(),
  })),
  active: z.boolean().default(true),
});
export type Market = z.infer<typeof MarketSchema>;

/**
 * Orderbook level
 */
export const OrderbookLevelSchema = z.object({
  price: z.string(),
  size: z.string(),
});
export type OrderbookLevel = z.infer<typeof OrderbookLevelSchema>;

/**
 * Orderbook snapshot
 */
export const OrderbookSchema = z.object({
  tokenId: z.string(),
  bids: z.array(OrderbookLevelSchema),
  asks: z.array(OrderbookLevelSchema),
  timestamp: z.number(),
});
export type Orderbook = z.infer<typeof OrderbookSchema>;

/**
 * Placed order response
 */
export const PlacedOrderSchema = z.object({
  orderId: z.string(),
  orderHash: z.string().optional(),
  status: z.string(),
  tokenId: z.string(),
  side: OrderSideSchema,
  price: z.number(),
  size: z.number(),
  filled: z.number().default(0),
  remaining: z.number(),
  timestamp: z.number(),
});
export type PlacedOrder = z.infer<typeof PlacedOrderSchema>;

/**
 * Cancel order response
 */
export const CancelOrderResponseSchema = z.object({
  success: z.boolean(),
  orderId: z.string().optional(),
  message: z.string().optional(),
});
export type CancelOrderResponse = z.infer<typeof CancelOrderResponseSchema>;

/**
 * EIP-712 TypedData for order signing
 */
export const Eip712TypedDataSchema = z.object({
  types: z.record(z.array(z.object({
    name: z.string(),
    type: z.string(),
  }))),
  domain: z.object({
    name: z.string(),
    version: z.string(),
    chainId: z.number(),
    verifyingContract: z.string(),
  }),
  primaryType: z.string(),
  message: z.record(z.any()),
});
export type Eip712TypedData = z.infer<typeof Eip712TypedDataSchema>;

/**
 * Validate order price against tick size
 */
export function validateTickSize(price: number, tickSize: number): boolean {
  const priceInTicks = Math.round(price / tickSize);
  const normalizedPrice = priceInTicks * tickSize;
  return Math.abs(normalizedPrice - price) < 1e-8;
}

/**
 * Validate order against risk configuration
 */
export function validateRisk(order: OrderArgs, config: RiskConfig): { valid: boolean; error?: string } {
  const notional = order.price * order.size;

  if (notional > config.maxNotional) {
    return { valid: false, error: `Notional ${notional} exceeds max ${config.maxNotional}` };
  }

  if (order.size > config.maxSizePerMarket) {
    return { valid: false, error: `Size ${order.size} exceeds max ${config.maxSizePerMarket}` };
  }

  if (config.allowedMarkets && !config.allowedMarkets.includes(order.tokenId)) {
    return { valid: false, error: `Market ${order.tokenId} not in allowed list` };
  }

  if (config.blockedMarkets?.includes(order.tokenId)) {
    return { valid: false, error: `Market ${order.tokenId} is blocked` };
  }

  return { valid: true };
}

/**
 * Round price to valid tick size
 */
export function roundToTickSize(price: number, tickSize: number): number {
  const priceInTicks = Math.round(price / tickSize);
  return priceInTicks * tickSize;
}

/**
 * Calculate order edge (distance from current market price)
 */
export function calculateEdge(orderPrice: number, marketPrice: number, side: OrderSide): number {
  if (side === 'BUY') {
    return marketPrice - orderPrice;
  } else {
    return orderPrice - marketPrice;
  }
}
