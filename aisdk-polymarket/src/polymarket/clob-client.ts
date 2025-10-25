import {
  OrderArgs,
  OrderArgsSchema,
  PlacedOrder,
  PlacedOrderSchema,
  CancelOrderResponse,
  Orderbook,
  OrderbookSchema,
  RiskConfig,
  validateRisk,
  validateTickSize,
  roundToTickSize,
  Eip712TypedData,
  MarketConfig,
} from './schemas.js';

/**
 * Signer interface for EIP-712 signing
 */
export interface OrderSigner {
  type: 'cdp' | 'eoa';
  signTypedData: (typedData: Eip712TypedData) => Promise<{ signature: string }>;
  address: string;
  funder?: string; // Optional funder address for proxy wallets
}

/**
 * Polymarket CLOB client configuration
 */
export interface ClobClientConfig {
  /**
   * CLOB API host (default: https://clob.polymarket.com)
   */
  host?: string;

  /**
   * WebSocket URL (default: wss://ws-subscriptions-clob.polymarket.com/ws/)
   */
  wss?: string;

  /**
   * Order signer (CDP wallet or EOA)
   */
  signer: OrderSigner;

  /**
   * Chain ID (default: 137 for Polygon)
   */
  chainId?: number;

  /**
   * API key (optional, auto-derived if not provided)
   */
  apiKey?: string;

  /**
   * API secret (optional, auto-derived if not provided)
   */
  apiSecret?: string;

  /**
   * Risk configuration (optional)
   */
  riskConfig?: RiskConfig;
}

/**
 * CLOB error codes
 */
export enum ClobErrorCode {
  INVALID_ORDER_MIN_TICK_SIZE = 'INVALID_ORDER_MIN_TICK_SIZE',
  INVALID_ORDER_MIN_SIZE = 'INVALID_ORDER_MIN_SIZE',
  NOT_ENOUGH_BALANCE = 'NOT_ENOUGH_BALANCE',
  FOK_ORDER_NOT_FILLED = 'FOK_ORDER_NOT_FILLED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  MARKET_NOT_FOUND = 'MARKET_NOT_FOUND',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
}

/**
 * Polymarket CLOB client
 */
export class PolymarketClient {
  private host: string;
  private wss: string;
  private signer: OrderSigner;
  private chainId: number;
  private apiKey?: string;
  private apiSecret?: string;
  private riskConfig?: RiskConfig;
  private marketConfigs: Map<string, MarketConfig> = new Map();

  constructor(config: ClobClientConfig) {
    this.host = config.host || process.env.POLYMARKET_HOST || 'https://clob.polymarket.com';
    this.wss = config.wss || process.env.POLYMARKET_WSS || 'wss://ws-subscriptions-clob.polymarket.com/ws/';
    this.signer = config.signer;
    this.chainId = config.chainId || 137;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.riskConfig = config.riskConfig;
  }

  /**
   * Derive API credentials from wallet signature (if not provided)
   */
  private async ensureApiCredentials(): Promise<void> {
    if (this.apiKey && this.apiSecret) return;

    try {
      // Sign a message to derive API credentials
      const message = `Polymarket API credentials for ${this.signer.address}`;
      const { signature } = await this.signer.signTypedData({
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          Message: [{ name: 'message', type: 'string' }],
        },
        domain: {
          name: 'Polymarket',
          version: '1',
          chainId: this.chainId,
          verifyingContract: '0x0000000000000000000000000000000000000000',
        },
        primaryType: 'Message',
        message: { message },
      });

      // Derive credentials from signature (simplified)
      this.apiKey = this.signer.address;
      this.apiSecret = signature;
    } catch (error) {
      console.warn('Failed to derive API credentials:', error);
    }
  }

  /**
   * Build EIP-712 typed data for order
   */
  private buildOrderTypedData(order: OrderArgs): Eip712TypedData {
    const salt = Math.floor(Math.random() * 1e16);
    const expiration = order.expiresAt || Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days default

    return {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        Order: [
          { name: 'salt', type: 'uint256' },
          { name: 'maker', type: 'address' },
          { name: 'signer', type: 'address' },
          { name: 'taker', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
          { name: 'makerAmount', type: 'uint256' },
          { name: 'takerAmount', type: 'uint256' },
          { name: 'expiration', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'feeRateBps', type: 'uint256' },
          { name: 'side', type: 'uint8' },
          { name: 'signatureType', type: 'uint8' },
        ],
      },
      domain: {
        name: 'Polymarket CTF Exchange',
        version: '1',
        chainId: this.chainId,
        verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E', // Polymarket exchange contract
      },
      primaryType: 'Order',
      message: {
        salt: salt.toString(),
        maker: this.signer.address,
        signer: this.signer.address,
        taker: '0x0000000000000000000000000000000000000000',
        tokenId: order.tokenId,
        makerAmount: this.toWei(order.size).toString(),
        takerAmount: this.toWei(order.size * order.price).toString(),
        expiration: expiration.toString(),
        nonce: '0',
        feeRateBps: '0',
        side: order.side === 'BUY' ? '0' : '1',
        signatureType: '0',
      },
    };
  }

  /**
   * Convert to wei (6 decimals for USDC)
   */
  private toWei(amount: number): bigint {
    return BigInt(Math.floor(amount * 1e6));
  }

  /**
   * Get market configuration (tick size, min size)
   */
  private async getMarketConfig(tokenId: string): Promise<MarketConfig> {
    if (this.marketConfigs.has(tokenId)) {
      return this.marketConfigs.get(tokenId)!;
    }

    try {
      const response = await fetch(`${this.host}/markets/${tokenId}`);
      if (!response.ok) {
        throw new Error(`Market not found: ${tokenId}`);
      }

      const data = await response.json();

      const config: MarketConfig = {
        minSize: parseFloat(data.minimum_order_size || '1'),
        tickSize: parseFloat(data.minimum_tick_size || '0.01'),
      };

      this.marketConfigs.set(tokenId, config);
      return config;
    } catch (error) {
      console.warn(`Failed to fetch market config for ${tokenId}, using defaults`);
      return { minSize: 1, tickSize: 0.01 };
    }
  }

  /**
   * Place an order on the CLOB
   */
  async placeOrder(args: OrderArgs): Promise<PlacedOrder> {
    try {
      // Validate order arguments
      const validatedArgs = OrderArgsSchema.parse(args);

      // Get market config
      const marketConfig = await this.getMarketConfig(validatedArgs.tokenId);

      // Validate tick size
      if (!validateTickSize(validatedArgs.price, marketConfig.tickSize)) {
        const roundedPrice = roundToTickSize(validatedArgs.price, marketConfig.tickSize);
        throw new Error(
          `Invalid tick size. Price ${validatedArgs.price} must be multiple of ${marketConfig.tickSize}. Try ${roundedPrice}`
        );
      }

      // Validate min size
      if (validatedArgs.size < marketConfig.minSize) {
        throw new Error(
          `Order size ${validatedArgs.size} is below minimum ${marketConfig.minSize}`
        );
      }

      // Validate against risk config
      if (this.riskConfig) {
        const riskCheck = validateRisk(validatedArgs, this.riskConfig);
        if (!riskCheck.valid) {
          throw new Error(`Risk check failed: ${riskCheck.error}`);
        }
      }

      // Build EIP-712 typed data
      const typedData = this.buildOrderTypedData(validatedArgs);

      // Sign the order
      const { signature } = await this.signer.signTypedData(typedData);

      // Ensure API credentials
      await this.ensureApiCredentials();

      // Submit order to CLOB
      const response = await fetch(`${this.host}/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'X-API-Key': this.apiKey }),
        },
        body: JSON.stringify({
          order: typedData.message,
          signature,
          owner: this.signer.address,
          orderType: validatedArgs.orderType,
          funder: validatedArgs.funder || this.signer.funder,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Order placement failed: ${error.message || response.statusText}`);
      }

      const data = await response.json();

      // Transform response to PlacedOrder
      const placedOrder: PlacedOrder = {
        orderId: data.orderID || data.order_id,
        orderHash: data.orderHash,
        status: data.status || 'PENDING',
        tokenId: validatedArgs.tokenId,
        side: validatedArgs.side,
        price: validatedArgs.price,
        size: validatedArgs.size,
        filled: 0,
        remaining: validatedArgs.size,
        timestamp: Date.now(),
      };

      return PlacedOrderSchema.parse(placedOrder);
    } catch (error) {
      throw new Error(`Failed to place order: ${error}`);
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, orderHash?: string): Promise<CancelOrderResponse> {
    try {
      await this.ensureApiCredentials();

      const response = await fetch(`${this.host}/order`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'X-API-Key': this.apiKey }),
        },
        body: JSON.stringify({
          orderID: orderId,
          orderHash,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          orderId,
          message: error.message || response.statusText,
        };
      }

      return {
        success: true,
        orderId,
        message: 'Order cancelled successfully',
      };
    } catch (error) {
      return {
        success: false,
        orderId,
        message: `Failed to cancel order: ${error}`,
      };
    }
  }

  /**
   * Get orderbook for a token
   */
  async getOrderbook(tokenId: string): Promise<Orderbook> {
    try {
      const response = await fetch(`${this.host}/book?token_id=${tokenId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch orderbook: ${response.statusText}`);
      }

      const data = await response.json();

      const orderbook: Orderbook = {
        tokenId,
        bids: (data.bids || []).map((b: any) => ({
          price: b.price.toString(),
          size: b.size.toString(),
        })),
        asks: (data.asks || []).map((a: any) => ({
          price: a.price.toString(),
          size: a.size.toString(),
        })),
        timestamp: Date.now(),
      };

      return OrderbookSchema.parse(orderbook);
    } catch (error) {
      throw new Error(`Failed to get orderbook: ${error}`);
    }
  }

  /**
   * Get active orders for an address
   */
  async getActiveOrders(owner?: string): Promise<PlacedOrder[]> {
    try {
      const address = owner || this.signer.address;

      await this.ensureApiCredentials();

      const response = await fetch(`${this.host}/orders?owner=${address}&active=true`, {
        headers: {
          ...(this.apiKey && { 'X-API-Key': this.apiKey }),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch orders: ${response.statusText}`);
      }

      const data = await response.json();

      return (data.data || []).map((order: any) =>
        PlacedOrderSchema.parse({
          orderId: order.orderID || order.order_id,
          orderHash: order.orderHash,
          status: order.status,
          tokenId: order.tokenId,
          side: order.side,
          price: parseFloat(order.price),
          size: parseFloat(order.size),
          filled: parseFloat(order.filled || '0'),
          remaining: parseFloat(order.remaining || order.size),
          timestamp: order.timestamp,
        })
      );
    } catch (error) {
      throw new Error(`Failed to get active orders: ${error}`);
    }
  }

  /**
   * Get order status
   */
  async getOrder(orderId: string): Promise<PlacedOrder | null> {
    try {
      await this.ensureApiCredentials();

      const response = await fetch(`${this.host}/order/${orderId}`, {
        headers: {
          ...(this.apiKey && { 'X-API-Key': this.apiKey }),
        },
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to fetch order: ${response.statusText}`);
      }

      const data = await response.json();

      return PlacedOrderSchema.parse({
        orderId: data.orderID || data.order_id,
        orderHash: data.orderHash,
        status: data.status,
        tokenId: data.tokenId,
        side: data.side,
        price: parseFloat(data.price),
        size: parseFloat(data.size),
        filled: parseFloat(data.filled || '0'),
        remaining: parseFloat(data.remaining || data.size),
        timestamp: data.timestamp,
      });
    } catch (error) {
      throw new Error(`Failed to get order: ${error}`);
    }
  }
}

/**
 * Create a new Polymarket CLOB client
 */
export function createPolymarketClient(config: ClobClientConfig): PolymarketClient {
  return new PolymarketClient(config);
}
