/**
 * WebSocket client for Polymarket real-time data streaming
 *
 * Supports:
 * - Real-time orderbook updates
 * - Live trades stream
 * - User order updates
 * - Market events
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { retry } from '../utils/retry.js';

export interface WebSocketConfig {
  /**
   * WebSocket URL (default: wss://ws-subscriptions-clob.polymarket.com/ws/)
   */
  url?: string;

  /**
   * Auto-reconnect on disconnect
   */
  autoReconnect?: boolean;

  /**
   * Reconnect delay in ms
   */
  reconnectDelay?: number;

  /**
   * Max reconnect attempts
   */
  maxReconnectAttempts?: number;

  /**
   * Ping interval in ms (keep-alive)
   */
  pingInterval?: number;
}

/**
 * WebSocket message types
 */
export enum MessageType {
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  ORDERBOOK = 'orderbook',
  TRADES = 'trades',
  USER_ORDERS = 'user_orders',
  MARKET = 'market',
  PING = 'ping',
  PONG = 'pong',
}

/**
 * Subscription channel
 */
export interface Channel {
  type: 'orderbook' | 'trades' | 'user' | 'market';
  tokenId?: string;
  marketId?: string;
  address?: string;
}

/**
 * Orderbook update event
 */
export interface OrderbookUpdate {
  tokenId: string;
  bids: Array<{ price: string; size: string }>;
  asks: Array<{ price: string; size: string }>;
  timestamp: number;
}

/**
 * Trade event
 */
export interface TradeEvent {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: string;
  size: string;
  timestamp: number;
  tradeId: string;
}

/**
 * User order update
 */
export interface UserOrderUpdate {
  orderId: string;
  status: string;
  filled: string;
  remaining: string;
  timestamp: number;
}

/**
 * Market event
 */
export interface MarketEvent {
  marketId: string;
  type: 'created' | 'updated' | 'resolved';
  data: any;
  timestamp: number;
}

/**
 * WebSocket client with event emitter
 */
export class PolymarketWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private subscriptions = new Set<string>();
  private reconnectAttempts = 0;
  private pingIntervalId?: NodeJS.Timeout;
  private reconnectTimeoutId?: NodeJS.Timeout;
  private isConnecting = false;

  constructor(config: WebSocketConfig = {}) {
    super();
    this.config = {
      url: config.url || process.env.POLYMARKET_WSS || 'wss://ws-subscriptions-clob.polymarket.com/ws/',
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      pingInterval: config.pingInterval ?? 30000,
    };
  }

  /**
   * Connect to WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      logger.debug('WebSocket already connected');
      return;
    }

    if (this.isConnecting) {
      logger.debug('WebSocket connection in progress');
      return;
    }

    this.isConnecting = true;
    logger.info('Connecting to Polymarket WebSocket', { url: this.config.url });

    try {
      // Node.js doesn't have WebSocket built-in, use ws package
      const { default: WebSocket } = await import('ws');

      this.ws = new WebSocket(this.config.url) as any;

      this.ws.onopen = () => {
        logger.info('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emit('connected');

        // Start ping interval
        this.startPingInterval();

        // Re-subscribe to previous channels
        this.resubscribe();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error: Event) => {
        logger.error('WebSocket error', error);
        this.emit('error', error);
      };

      this.ws.onclose = () => {
        logger.warn('WebSocket disconnected');
        this.isConnecting = false;
        this.stopPingInterval();
        this.emit('disconnected');

        if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      logger.error('Failed to connect WebSocket', error);
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
    }

    this.stopPingInterval();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscriptions.clear();
    logger.info('WebSocket disconnected');
  }

  /**
   * Subscribe to orderbook updates
   */
  subscribeOrderbook(tokenId: string): void {
    const channel = JSON.stringify({ type: 'orderbook', tokenId });
    this.subscribe(channel);
  }

  /**
   * Subscribe to trades
   */
  subscribeTrades(tokenId: string): void {
    const channel = JSON.stringify({ type: 'trades', tokenId });
    this.subscribe(channel);
  }

  /**
   * Subscribe to user orders
   */
  subscribeUserOrders(address: string): void {
    const channel = JSON.stringify({ type: 'user', address });
    this.subscribe(channel);
  }

  /**
   * Subscribe to market events
   */
  subscribeMarket(marketId: string): void {
    const channel = JSON.stringify({ type: 'market', marketId });
    this.subscribe(channel);
  }

  /**
   * Unsubscribe from channel
   */
  unsubscribe(channel: string): void {
    if (!this.subscriptions.has(channel)) {
      return;
    }

    this.subscriptions.delete(channel);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({
        type: MessageType.UNSUBSCRIBE,
        channel: JSON.parse(channel),
      });
    }
  }

  /**
   * Generic subscribe
   */
  private subscribe(channel: string): void {
    this.subscriptions.add(channel);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({
        type: MessageType.SUBSCRIBE,
        channel: JSON.parse(channel),
      });
    }
  }

  /**
   * Re-subscribe to all channels
   */
  private resubscribe(): void {
    for (const channel of this.subscriptions) {
      this.send({
        type: MessageType.SUBSCRIBE,
        channel: JSON.parse(channel),
      });
    }
  }

  /**
   * Send message to WebSocket
   */
  private send(message: any): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send message, WebSocket not open');
      return;
    }

    const payload = JSON.stringify(message);
    this.ws.send(payload);
    logger.debug('Sent WebSocket message', { type: message.type });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case MessageType.ORDERBOOK:
          this.handleOrderbookUpdate(message);
          break;

        case MessageType.TRADES:
          this.handleTradeEvent(message);
          break;

        case MessageType.USER_ORDERS:
          this.handleUserOrderUpdate(message);
          break;

        case MessageType.MARKET:
          this.handleMarketEvent(message);
          break;

        case MessageType.PONG:
          logger.debug('Received pong');
          break;

        default:
          logger.debug('Unknown message type', message);
      }
    } catch (error) {
      logger.error('Failed to parse WebSocket message', error);
    }
  }

  /**
   * Handle orderbook update
   */
  private handleOrderbookUpdate(message: any): void {
    const update: OrderbookUpdate = {
      tokenId: message.tokenId,
      bids: message.bids || [],
      asks: message.asks || [],
      timestamp: message.timestamp || Date.now(),
    };

    logger.debug('Orderbook update', { tokenId: update.tokenId, bids: update.bids.length, asks: update.asks.length });
    this.emit('orderbook', update);
  }

  /**
   * Handle trade event
   */
  private handleTradeEvent(message: any): void {
    const trade: TradeEvent = {
      tokenId: message.tokenId,
      side: message.side,
      price: message.price,
      size: message.size,
      timestamp: message.timestamp || Date.now(),
      tradeId: message.tradeId || message.id,
    };

    logger.info('Trade event', { tokenId: trade.tokenId, side: trade.side, price: trade.price, size: trade.size });
    this.emit('trade', trade);
  }

  /**
   * Handle user order update
   */
  private handleUserOrderUpdate(message: any): void {
    const update: UserOrderUpdate = {
      orderId: message.orderId,
      status: message.status,
      filled: message.filled,
      remaining: message.remaining,
      timestamp: message.timestamp || Date.now(),
    };

    logger.info('User order update', { orderId: update.orderId, status: update.status });
    this.emit('user_order', update);
  }

  /**
   * Handle market event
   */
  private handleMarketEvent(message: any): void {
    const event: MarketEvent = {
      marketId: message.marketId,
      type: message.eventType,
      data: message.data,
      timestamp: message.timestamp || Date.now(),
    };

    logger.info('Market event', { marketId: event.marketId, type: event.type });
    this.emit('market', event);
  }

  /**
   * Start ping interval (keep-alive)
   */
  private startPingInterval(): void {
    this.stopPingInterval();

    this.pingIntervalId = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: MessageType.PING });
      }
    }, this.config.pingInterval);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = undefined;
    }
  }

  /**
   * Schedule reconnect
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    logger.info('Scheduling reconnect', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimeoutId = setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('Reconnect failed', error);
      });
    }, delay);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

/**
 * Create WebSocket client
 */
export function createWebSocketClient(config?: WebSocketConfig): PolymarketWebSocket {
  return new PolymarketWebSocket(config);
}
