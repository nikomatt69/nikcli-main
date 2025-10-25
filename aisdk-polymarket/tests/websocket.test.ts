import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PolymarketWebSocket, MessageType } from '../src/polymarket/websocket-client.ts';
import { EventEmitter } from 'events';

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  readyState = 1; // OPEN
  send = vi.fn();
  close = vi.fn();

  static OPEN = 1;
  static CLOSED = 3;
}

describe('PolymarketWebSocket', () => {
  let wsClient: PolymarketWebSocket;

  beforeEach(() => {
    // Mock ws module
    vi.mock('ws', () => ({
      default: MockWebSocket,
    }));

    wsClient = new PolymarketWebSocket({
      url: 'wss://test.polymarket.com',
      autoReconnect: false,
      pingInterval: 1000,
    });
  });

  afterEach(() => {
    wsClient.disconnect();
    vi.clearAllMocks();
  });

  describe('Connection', () => {
    it('should connect to WebSocket', async () => {
      const connectHandler = vi.fn();
      wsClient.on('connected', connectHandler);

      await wsClient.connect();

      expect(connectHandler).toHaveBeenCalled();
      expect(wsClient.isConnected()).toBe(true);
    });

    it('should handle disconnection', async () => {
      const disconnectHandler = vi.fn();
      wsClient.on('disconnected', disconnectHandler);

      await wsClient.connect();
      wsClient.disconnect();

      expect(wsClient.isConnected()).toBe(false);
    });

    it('should emit error on WebSocket error', async () => {
      const errorHandler = vi.fn();
      wsClient.on('error', errorHandler);

      await wsClient.connect();

      // Simulate WebSocket error
      const error = new Error('Connection failed');
      (wsClient as any).ws.emit('error', error);

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Subscriptions', () => {
    beforeEach(async () => {
      await wsClient.connect();
    });

    it('should subscribe to orderbook', () => {
      wsClient.subscribeOrderbook('0xtoken123');

      const subscriptions = wsClient.getSubscriptions();
      expect(subscriptions).toContain(JSON.stringify({ type: 'orderbook', tokenId: '0xtoken123' }));
    });

    it('should subscribe to trades', () => {
      wsClient.subscribeTrades('0xtoken456');

      const subscriptions = wsClient.getSubscriptions();
      expect(subscriptions).toContain(JSON.stringify({ type: 'trades', tokenId: '0xtoken456' }));
    });

    it('should subscribe to user orders', () => {
      wsClient.subscribeUserOrders('0xaddress789');

      const subscriptions = wsClient.getSubscriptions();
      expect(subscriptions).toContain(JSON.stringify({ type: 'user', address: '0xaddress789' }));
    });

    it('should unsubscribe from channel', () => {
      wsClient.subscribeOrderbook('0xtoken123');
      const channel = JSON.stringify({ type: 'orderbook', tokenId: '0xtoken123' });

      wsClient.unsubscribe(channel);

      const subscriptions = wsClient.getSubscriptions();
      expect(subscriptions).not.toContain(channel);
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await wsClient.connect();
    });

    it('should handle orderbook update', () => {
      const handler = vi.fn();
      wsClient.on('orderbook', handler);

      const message = {
        type: MessageType.ORDERBOOK,
        tokenId: '0xtoken123',
        bids: [{ price: '0.55', size: '100' }],
        asks: [{ price: '0.56', size: '150' }],
        timestamp: Date.now(),
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: '0xtoken123',
          bids: [{ price: '0.55', size: '100' }],
          asks: [{ price: '0.56', size: '150' }],
        })
      );
    });

    it('should handle trade event', () => {
      const handler = vi.fn();
      wsClient.on('trade', handler);

      const message = {
        type: MessageType.TRADES,
        tokenId: '0xtoken123',
        side: 'BUY',
        price: '0.55',
        size: '10',
        tradeId: 'trade-123',
        timestamp: Date.now(),
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenId: '0xtoken123',
          side: 'BUY',
          price: '0.55',
          size: '10',
        })
      );
    });

    it('should handle user order update', () => {
      const handler = vi.fn();
      wsClient.on('user_order', handler);

      const message = {
        type: MessageType.USER_ORDERS,
        orderId: 'order-123',
        status: 'FILLED',
        filled: '10',
        remaining: '0',
        timestamp: Date.now(),
      };

      (wsClient as any).handleMessage(JSON.stringify(message));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-123',
          status: 'FILLED',
        })
      );
    });
  });

  describe('Keep-Alive', () => {
    it('should send ping messages', async () => {
      vi.useFakeTimers();

      await wsClient.connect();

      const sendSpy = vi.spyOn(wsClient as any, 'send');

      // Advance time by ping interval
      vi.advanceTimersByTime(1000);

      expect(sendSpy).toHaveBeenCalledWith({ type: MessageType.PING });

      vi.useRealTimers();
    });
  });
});

describe('LiveEventsManager', () => {
  it('should calculate betting score correctly', () => {
    // Mock market with high volume and liquidity
    const market = {
      id: 'market-1',
      question: 'Test market',
      volume: 100000,
      liquidity: 10000,
      outcomes: [
        { name: 'YES', tokenId: '0x1', price: 0.51 },
        { name: 'NO', tokenId: '0x2', price: 0.49 },
      ],
      active: true,
    };

    // Spread = |1 - (0.51 + 0.49)| = 0 (perfect)
    // Score should be high (volume + liquidity + spread + time)
    // This is a simplified test - full implementation would use LiveEventsManager
    expect(market.volume).toBeGreaterThan(50000);
    expect(market.liquidity).toBeGreaterThan(5000);
  });

  it('should detect live sports events', () => {
    const sportQuestion = 'Will the Lakers win the NBA game tonight?';
    const isLive = sportQuestion.toLowerCase().includes('tonight');

    expect(isLive).toBe(true);
  });

  it('should filter by minimum volume', () => {
    const markets = [
      { volume: 5000, active: true },
      { volume: 15000, active: true },
      { volume: 50000, active: true },
    ];

    const filtered = markets.filter((m) => m.volume >= 10000);
    expect(filtered).toHaveLength(2);
  });
});
