import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolymarketClient } from '../src/polymarket/clob-client.ts';
import type { OrderSigner } from '../src/polymarket/clob-client.ts';

describe('PolymarketClient', () => {
  let client: PolymarketClient;
  let mockSigner: OrderSigner;

  beforeEach(() => {
    mockSigner = {
      type: 'cdp',
      address: '0x1234567890abcdef',
      signTypedData: vi.fn().mockResolvedValue({ signature: '0xsignature' }),
    };

    client = new PolymarketClient({
      host: 'https://test.polymarket.com',
      signer: mockSigner,
    });
  });

  describe('placeOrder', () => {
    it('should place a valid order', async () => {
      // Mock market config
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            minimum_order_size: '1',
            minimum_tick_size: '0.01',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            orderID: 'order-123',
            status: 'PENDING',
          }),
        });

      const order = await client.placeOrder({
        tokenId: '0xtoken',
        side: 'BUY',
        price: 0.55,
        size: 10,
        orderType: 'GTC',
      });

      expect(order.orderId).toBe('order-123');
      expect(order.status).toBe('PENDING');
      expect(mockSigner.signTypedData).toHaveBeenCalled();
    });

    it('should reject invalid tick size', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          minimum_order_size: '1',
          minimum_tick_size: '0.01',
        }),
      });

      await expect(
        client.placeOrder({
          tokenId: '0xtoken',
          side: 'BUY',
          price: 0.555, // Invalid tick size
          size: 10,
          orderType: 'GTC',
        })
      ).rejects.toThrow('Invalid tick size');
    });

    it('should reject order below min size', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          minimum_order_size: '10',
          minimum_tick_size: '0.01',
        }),
      });

      await expect(
        client.placeOrder({
          tokenId: '0xtoken',
          side: 'BUY',
          price: 0.55,
          size: 5, // Below min size
          orderType: 'GTC',
        })
      ).rejects.toThrow('below minimum');
    });

    it('should validate against risk config', async () => {
      const clientWithRisk = new PolymarketClient({
        host: 'https://test.polymarket.com',
        signer: mockSigner,
        riskConfig: {
          maxNotional: 100,
          maxSizePerMarket: 50,
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          minimum_order_size: '1',
          minimum_tick_size: '0.01',
        }),
      });

      await expect(
        clientWithRisk.placeOrder({
          tokenId: '0xtoken',
          side: 'BUY',
          price: 0.55,
          size: 200, // Exceeds max notional
          orderType: 'GTC',
        })
      ).rejects.toThrow('Risk check failed');
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an order', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const result = await client.cancelOrder('order-123');

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order-123');
    });

    it('should handle cancel errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'Order not found' }),
      });

      const result = await client.cancelOrder('order-123');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Order not found');
    });
  });

  describe('getOrderbook', () => {
    it('should fetch orderbook', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          bids: [{ price: '0.55', size: '100' }],
          asks: [{ price: '0.56', size: '150' }],
        }),
      });

      const orderbook = await client.getOrderbook('0xtoken');

      expect(orderbook.bids).toHaveLength(1);
      expect(orderbook.asks).toHaveLength(1);
      expect(orderbook.tokenId).toBe('0xtoken');
    });
  });

  describe('getActiveOrders', () => {
    it('should fetch active orders', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              orderID: 'order-1',
              tokenId: '0xtoken',
              side: 'BUY',
              price: '0.55',
              size: '10',
              status: 'PENDING',
              timestamp: Date.now(),
            },
          ],
        }),
      });

      const orders = await client.getActiveOrders();

      expect(orders).toHaveLength(1);
      expect(orders[0].orderId).toBe('order-1');
    });

    it('should use custom owner address', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await client.getActiveOrders('0xcustom');

      const callArgs = (global.fetch as any).mock.calls[0][0];
      expect(callArgs).toContain('owner=0xcustom');
    });
  });

  describe('buildOrderTypedData', () => {
    it('should build valid EIP-712 typed data', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            minimum_order_size: '1',
            minimum_tick_size: '0.01',
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ orderID: 'order-123' }),
        });

      await client.placeOrder({
        tokenId: '0xtoken',
        side: 'BUY',
        price: 0.55,
        size: 10,
        orderType: 'GTC',
      });

      const signCall = (mockSigner.signTypedData as any).mock.calls[0][0];

      expect(signCall.types).toHaveProperty('EIP712Domain');
      expect(signCall.types).toHaveProperty('Order');
      expect(signCall.domain.name).toBe('Polymarket CTF Exchange');
      expect(signCall.domain.chainId).toBe(137);
      expect(signCall.primaryType).toBe('Order');
    });
  });
});
